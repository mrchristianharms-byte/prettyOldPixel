import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { normalizeDumpTitle } from "../fetch-game/game-dump-matching.mjs";
import { gameCompanies, gameTitles, loadTitleIndex } from "../fetch-game/game-title-index.mjs";

export { loadTitleIndex };

const MAX_NGRAM = 5;
const COMPANY_DISTANCE_MS = 90_000;
const companyNoise = new Set(["inc", "ltd", "gmbh", "corp", "corporation", "co", "kg", "plc", "llc", "limited", "the",
  "software", "games", "game", "entertainment", "productions", "interactive", "studios", "studio", "international",
  "publishing", "group", "company", "design", "u", "s", "a", "uk", "of", "and", "america", "europe"]);

// Kölner Phonetik: German ASR spells English titles phonetically ("Felken" for Falcon), so codes compare sound, not letters.
export function colognePhonetic(text) {
  const letters = text.toLowerCase().replace(/ä/gu, "a").replace(/ö/gu, "o").replace(/ü/gu, "u").replace(/ß/gu, "s")
    .replace(/[^a-z]/gu, "");
  let code = "";
  for (let index = 0; index < letters.length; index += 1) {
    const char = letters[index];
    const previous = letters[index - 1] ?? "";
    const next = letters[index + 1] ?? "";
    let digit;
    if ("aeijouy".includes(char)) digit = "0";
    else if (char === "h") digit = "";
    else if (char === "b") digit = "1";
    else if (char === "p") digit = next === "h" ? "3" : "1";
    else if (char === "d" || char === "t") digit = "csz".includes(next) && next ? "8" : "2";
    else if ("fvw".includes(char)) digit = "3";
    else if ("gkq".includes(char)) digit = "4";
    else if (char === "c") {
      digit = index === 0
        ? ("ahkloqrux".includes(next) && next ? "4" : "8")
        : ("ahkoqux".includes(next) && next && !"sz".includes(previous) ? "4" : "8");
    } else if (char === "x") digit = "ckq".includes(previous) && previous ? "8" : "48";
    else if (char === "l") digit = "5";
    else if (char === "m" || char === "n") digit = "6";
    else if (char === "r") digit = "7";
    else digit = "8";
    code += digit;
  }
  let collapsed = "";
  for (const digit of code) if (digit !== collapsed.at(-1)) collapsed += digit;
  return collapsed ? collapsed[0] + collapsed.slice(1).replaceAll("0", "") : "";
}

function deletions(code) {
  const variants = new Set();
  for (let index = 0; index < code.length; index += 1) variants.add(code.slice(0, index) + code.slice(index + 1));
  return variants;
}

const letters = (text) => normalizeDumpTitle(text).replaceAll(" ", "");

function letterSimilarity(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length, 1);
}

// Words used in many cached transcripts ("Mission", "Power") never form a title mention on their own.
export async function transcriptVocabulary(directory, { commonShare = 0.4 } = {}) {
  const files = (await readdir(directory)).filter((name) => /^[A-Za-z0-9_-]{11}\.json$/u.test(name));
  const counts = new Map();
  let documents = 0;
  for (const name of files) {
    const transcript = JSON.parse(await readFile(path.join(directory, name), "utf8"));
    if (transcript.status !== "available") continue;
    documents += 1;
    const words = new Set(transcript.segments.flatMap((segment) => normalizeDumpTitle(segment.text).split(" ")));
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const minimum = Math.max(3, Math.ceil(documents * commonShare));
  return { documents, common: new Set([...counts].filter(([, count]) => count >= minimum).map(([word]) => word)) };
}

function titleVariants(title) {
  const normalized = normalizeDumpTitle(title);
  const variants = new Set([normalized]);
  const main = normalizeDumpTitle(title.split(/\s*(?::|\s-\s|\s–\s)/u)[0]);
  if (main) variants.add(main);
  for (const value of [...variants]) if (value.startsWith("the ")) variants.add(value.slice(4));
  return [...variants];
}

export function buildCandidateMatcher(index, { fromYear, toYear, vocabulary = { common: new Set() } }) {
  const exact = new Map();
  const sound = new Map();
  const fuzzy = new Map();
  const games = new Map();
  const add = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };
  for (const game of index.games) {
    if (game.firstYear === null || game.firstYear < fromYear || game.firstYear > toYear) continue;
    games.set(game.id, game);
    for (const title of gameTitles(game)) {
      for (const variant of titleVariants(title)) {
        const tokens = variant.split(" ").filter(Boolean);
        if (!tokens.length || tokens.length > MAX_NGRAM || tokens.every((token) => vocabulary.common.has(token))) continue;
        const key = tokens.join("");
        if (key.length < 4 || /^\d+$/u.test(key)) continue;
        const entry = { gameId: game.id, tokens };
        add(exact, key, entry);
        const code = colognePhonetic(key);
        if (key.length < 5 || code.length < 3) continue;
        add(sound, code, entry);
        if (code.length >= 4) for (const variant of deletions(code)) add(fuzzy, variant, entry);
      }
    }
  }
  const companies = new Map();
  for (const game of games.values()) {
    for (const company of gameCompanies(game)) {
      const tokens = normalizeDumpTitle(company).split(" ").filter((token) => token && !companyNoise.has(token));
      const key = tokens.slice(0, 2).join("");
      if (key.length >= 5 && !vocabulary.common.has(tokens[0])) add(companies, key, game.id);
    }
  }
  return { games, exact, sound, fuzzy, companies, vocabulary };
}

const MIN_SOUND_SIMILARITY = 0.5;

function soundHits(matcher, gram, code) {
  // German captions capitalize names and nouns; lower-case verbs and adjectives are ordinary words and must match literally.
  const free = (token) => token.capitalized && !matcher.vocabulary.common.has(token.word);
  if (!gram.some(free) || code.length < 3) return [];
  const aligned = (entry) => entry.tokens.length === gram.length
    && gram.every((token) => free(token) || entry.tokens.includes(token.word));
  const same = (matcher.sound.get(code) ?? []).filter(aligned).map((entry) => ({ ...entry, kind: "sound", score: 2 }));
  if (code.length < 4) return same;
  const near = [...(matcher.fuzzy.get(code) ?? []),
    ...[...deletions(code)].flatMap((variant) => [...(matcher.fuzzy.get(variant) ?? []), ...(matcher.sound.get(variant) ?? [])])]
    .filter(aligned).map((entry) => ({ ...entry, kind: "similar", score: 1 }));
  return [...same, ...near];
}

export function findTitleMentions(segments, matcher) {
  const tokens = segments.flatMap((segment) => segment.text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
    .flatMap((original) => normalizeDumpTitle(original).split(" ").filter(Boolean).map((word) => ({
      word, capitalized: /^\p{Lu}/u.test(original), segmentId: segment.id, startMs: segment.startMs,
    }))));
  const found = new Map();
  const companyHits = [];
  for (let start = 0; start < tokens.length; start += 1) {
    for (let size = 1; size <= MAX_NGRAM && start + size <= tokens.length; size += 1) {
      const gram = tokens.slice(start, start + size);
      const words = gram.map((token) => token.word);
      if (words.every((word) => matcher.vocabulary.common.has(word))) continue;
      const key = words.join("");
      for (const gameId of matcher.companies.get(key) ?? []) companyHits.push({ gameId, startMs: gram[0].startMs });
      const hits = [
        ...(matcher.exact.get(key) ?? []).filter((entry) => Math.abs(entry.tokens.length - size) <= 1)
          .map((entry) => ({ ...entry, kind: "exact", score: 3 })),
        ...(key.length >= 5 ? soundHits(matcher, gram, colognePhonetic(key)) : []),
      ];
      for (const hit of hits) {
        const id = `${hit.gameId}:${gram[0].segmentId}`;
        const score = hit.score + (hit.tokens.length > 1 ? 1 : 0);
        const similarity = letterSimilarity(key, hit.tokens.join(""));
        if (hit.kind !== "exact" && similarity < MIN_SOUND_SIMILARITY) continue;
        const previous = found.get(id);
        if (previous && (previous.score > score || (previous.score === score && previous.similarity >= similarity))) continue;
        const game = matcher.games.get(hit.gameId);
        found.set(id, {
          gameId: hit.gameId, title: game.title, firstYear: game.firstYear, kind: hit.kind, score, similarity,
          segmentId: gram[0].segmentId, startMs: gram[0].startMs, heard: words.join(" "),
        });
      }
    }
  }
  const mentions = [...found.values()];
  for (const mention of mentions) {
    if (companyHits.some((hit) => hit.gameId === mention.gameId
      && Math.abs(hit.startMs - mention.startMs) <= COMPANY_DISTANCE_MS)) mention.companyNearby = true;
  }
  return mentions.sort((a, b) => a.segmentId - b.segmentId || b.score - a.score);
}

// Repeated mentions matter: a discussed game is named several times, a stray sound-alike only once.
const rank = (entry) => entry.best + Math.log2(entry.count) + entry.similarity + (entry.company ? 0.5 : 0);

// Per window, aggregate mentions by game and keep only the strongest few for the model to choose from.
export function windowCandidates(window, mentions, { limit = 10 } = {}) {
  const ids = new Set(window.segments.map((segment) => segment.id));
  const byGame = new Map();
  for (const mention of mentions) {
    if (!ids.has(mention.segmentId)) continue;
    const entry = byGame.get(mention.gameId) ?? {
      title: mention.title, firstYear: mention.firstYear, gameId: mention.gameId, heard: new Set(), segmentIds: [],
    };
    if (mention.score > (entry.best ?? 0) || (mention.score === entry.best && mention.similarity > entry.similarity)) {
      entry.best = mention.score;
      entry.similarity = mention.similarity;
    }
    entry.company ||= Boolean(mention.companyNearby);
    entry.count = (entry.count ?? 0) + 1;
    entry.heard.add(mention.heard);
    entry.segmentIds.push(mention.segmentId);
    byGame.set(mention.gameId, entry);
  }
  const byTitle = new Map();
  for (const entry of [...byGame.values()].sort((a, b) => rank(b) - rank(a) || a.gameId - b.gameId)) {
    const key = normalizeDumpTitle(entry.title);
    if (!byTitle.has(key)) byTitle.set(key, entry);
  }
  return [...byTitle.values()].slice(0, limit).map((entry) => ({
    title: entry.title, year: entry.firstYear, heard: [...entry.heard].slice(0, 3),
    segmentIds: [...new Set(entry.segmentIds)].slice(0, 5),
  }));
}

export function titleIndexLookup(index) {
  const byTitle = new Map();
  const byMainTitle = new Map();
  const add = (map, key, game) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    if (!map.get(key).includes(game)) map.get(key).push(game);
  };
  for (const game of index.games) {
    for (const title of gameTitles(game)) {
      add(byTitle, letters(title), game);
      if (title.includes(":")) add(byMainTitle, letters(title.split(":")[0]), game);
    }
  }
  // "Police Quest" also finds "Police Quest: In Pursuit of the Death Angel".
  return (title) => byTitle.get(letters(title)) ?? byMainTitle.get(letters(title)) ?? [];
}
