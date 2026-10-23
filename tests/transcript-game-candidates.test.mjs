import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { buildGameTitleIndex, parseIndexArguments } from "../src/fetch-game/build-game-title-index.mjs";
import { gameCompanies, loadTitleIndex } from "../src/fetch-game/game-title-index.mjs";
import {
  buildCandidateMatcher, colognePhonetic, findTitleMentions, titleIndexLookup, transcriptVocabulary, windowCandidates,
} from "../src/extra-data/transcript-game-candidates.mjs";
import {
  analyzeWindow, checkReleaseYears, releaseCompanies, validateDiscussions, generateGamesFromTranscript, llmConfiguration, prepareSegments,
} from "../src/extra-data/generate-games-from-transcript.mjs";

const game = (id, title, firstYear, extra = {}) => ({ id, title, firstYear, releases: [], ...extra });
const index = {
  version: 3, source: { sha256: "abc" },
  games: [
    game(1, "Falcon", 1987, { releases: [[1, 1987, 1, null, "Spectrum HoloByte", null, null]], alternativeTitles: [{ title: "Falcon F-16", info: "US" }] }),
    game(2, "Gunship", 1986),
    game(3, "Stealth Mission", 1988),
    game(4, "Wasteland 3", 2020),
    game(5, "Mission", 1987),
    game(6, "Police Quest: In Pursuit of the Death Angel", 1987),
    game(7, "Falcon", 1992),
  ],
};
const transcript = (texts) => prepareSegments({
  status: "available", segments: texts.map((text, index) => ({ startMs: index * 10_000, durationMs: 10_000, text })),
});
const vocabulary = { common: new Set(["mission", "und", "das", "ist"]) };

test("Kölner Phonetik gleicht ASR-Schreibweisen englischer Titel an", () => {
  assert.equal(colognePhonetic("Felken"), colognePhonetic("Falcon"));
  assert.equal(colognePhonetic("Slagon"), colognePhonetic("Slaygon"));
  assert.notEqual(colognePhonetic("Gunchip"), colognePhonetic("Tetris"));
  assert.equal(colognePhonetic(""), "");
});

test("Kandidatensuche findet exakte und lautähnliche Titel im Heftzeitraum", () => {
  const matcher = buildCandidateMatcher(index, { fromYear: 1985, toYear: 1989, vocabulary });
  const segments = transcript([
    "Felken für MS 1988 von Spectrum Holobyte",
    "Stunden lang Gunchip auf dem Atari ST",
    "Stells Mission ist das",
    "die Mission war schwer",
    "Wasteland 3 spiele ich gerade",
    "Police Quest von Sierra",
  ]);
  const mentions = findTitleMentions(segments, matcher);
  const byTitle = (title) => mentions.filter((mention) => mention.title === title);
  assert.deepEqual(byTitle("Falcon").map((mention) => [mention.gameId, mention.kind, mention.companyNearby]),
    [[1, "sound", true]]);
  assert.equal(byTitle("Gunship")[0].kind, "similar");
  assert.equal(byTitle("Stealth Mission")[0].segmentId, 2);
  assert.deepEqual(byTitle("Mission"), [], "Allerweltswörter allein ergeben keinen Titel");
  assert.deepEqual(byTitle("Wasteland 3"), [], "Spiele außerhalb des Heftzeitraums sind keine Kandidaten");
  assert.equal(byTitle("Police Quest: In Pursuit of the Death Angel")[0].kind, "exact");

  const [first] = windowCandidates({ segments: segments.slice(0, 2) }, mentions);
  assert.deepEqual(Object.keys(first).sort(), ["heard", "segmentIds", "title", "year"]);
  assert.equal(windowCandidates({ segments: segments.slice(0, 2) }, mentions, { limit: 1 }).length, 1);
});

test("Kandidatensuche erfasst Titel mit genau fünf Wörtern", () => {
  const five = { ...index, games: [game(8, "Lords of the Rising Sun", 1989)] };
  const matcher = buildCandidateMatcher(five, { fromYear: 1985, toYear: 1989, vocabulary });
  assert.deepEqual(findTitleMentions(transcript(["Lords of the Rising Sun von Cinemaware"]), matcher)
    .map((mention) => [mention.gameId, mention.kind]), [[8, "exact"]]);
});

test("Kleingeschriebene Alltagswörter werden nicht über den Klang einem Titel zugeordnet", () => {
  const matcher = buildCandidateMatcher(index, { fromYear: 1985, toYear: 1989, vocabulary });
  assert.deepEqual(findTitleMentions(transcript(["wir haben fälken gesehen"]), matcher), []);
});

test("Jahresprüfung verwirft später erschienene Spiele und ordnet Katalog-IDs zu", () => {
  const lookup = titleIndexLookup(index);
  const item = (title) => ({ title, startMs: 0, issues: [] });
  const { kept, discarded } = checkReleaseYears([item("Falcon"), item("Wasteland 3"), item("Unbekannt"), item("Police Quest")], lookup, 1988);
  assert.deepEqual(kept.map((entry) => [entry.title, entry.titleIndexId ?? null, entry.issues]),
    [["Falcon", 1, []], ["Unbekannt", null, ["not-in-title-index"]], ["Police Quest", 6, []]]);
  assert.deepEqual(discarded, [{ title: "Wasteland 3", startMs: 0, reason: "released-after-issue", firstYear: 2020 }]);
  for (const entry of kept.filter((item) => item.titleIndexId)) {
    assert.ok(Array.isArray(entry.developers) && Array.isArray(entry.publishers), entry.title);
  }
});

test("Firmenangaben stammen aus dem Erstveröffentlichungsjahr und werden bereinigt", () => {
  assert.deepEqual(releaseCompanies({ firstYear: 1994, releases: [
    [1, 1994, 1, "Absolute Entertainment, Inc.", "Instinct Design, \n          Mirage Technologies (Multimedia) Ltd.", "US", ""],
    [2, 1994, 2, "Absolute Entertainment, Inc.", "Mirage Technologies (Multimedia) Ltd., \n   Instinct Design", "UK", ""],
    [3, 2022, 1, "Späterer Re-Release GmbH", "Instinct Design", "World", ""],
    [4, 1994, 3, "", null, "DE", ""],
  ] }), {
    developers: ["Instinct Design", "Mirage Technologies (Multimedia) Ltd."],
    publishers: ["Absolute Entertainment, Inc."],
  });
  assert.deepEqual(releaseCompanies({ firstYear: null, releases: [] }), { developers: [], publishers: [] });
});

test("Titelindex entsteht aus dem SQL-Dump mit Alternativtiteln, Releases, Erstjahr und Firmen", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "pixel-title-index-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = path.join(directory, "gdb.sql");
  await writeFile(input, `-- Testdump
INSERT INTO \`mobygames\` (\`mobyid\`, \`title\`, \`genre\`) VALUES (1,'Falcon','Simulation'),(2,'Gunship',NULL),(3,'Modern',NULL);
INSERT INTO \`mobygames_alttitles\` (\`mobyid\`, \`title\`, \`info\`) VALUES (1,'Falcon F-16','US');
INSERT INTO \`mobygames_releases\` (\`mobyid\`, \`mobyreleaseid\`, \`year\`, \`platform\`, \`publisher\`, \`developer\`, \`countries\`, \`publabel\`) VALUES
(1,11,1987,'DOS','Accolade, Inc.',NULL,'United States',NULL),(1,10,1988,'Amiga','Mirrorsoft Ltd.','Spectrum HoloByte','Germany','Image Works'),(2,20,NULL,'C64',NULL,NULL,NULL,NULL),(3,30,2006,'Windows','Neu GmbH',NULL,NULL,NULL);
`);
  const output = path.join(directory, "index.json");
  const { index: result, platformIndex } = await buildGameTitleIndex({ input, output });
  const stored = gunzipSync(await readFile(output)).toString("utf8");
  assert.deepEqual(JSON.parse(stored), result);
  assert.deepEqual(await loadTitleIndex(output), result);
  const platformFile = path.join(directory, "game-platform-index.json");
  assert.deepEqual(JSON.parse(await readFile(platformFile, "utf8")), platformIndex);
  assert.equal(result.version, 4);
  assert.equal(result.maxFirstYear, 2005);
  assert.deepEqual(result.importedRows, { mobygames: 3, mobygames_alttitles: 1, mobygames_releases: 4 });
  assert.deepEqual(result.releaseColumns, ["mobyreleaseid", "year", "platform", "publisher", "developer", "countries", "publabel"]);
  assert.equal(result.platformIndex, "game-platform-index.json");
  assert.deepEqual(platformIndex.source, result.source);
  assert.deepEqual(platformIndex.platforms,
    [{ id: 1, name: "Amiga" }, { id: 2, name: "C64" }, { id: 3, name: "DOS" }, { id: 4, name: "Windows" }]);
  assert.deepEqual(result.games, [
    { id: 1, title: "Falcon", alternativeTitles: [{ title: "Falcon F-16", info: "US" }], genres: ["Simulation"],
      firstYear: 1987,
      releases: [[10, 1988, 1, "Mirrorsoft Ltd.", "Spectrum HoloByte", "Germany", "Image Works"],
        [11, 1987, 3, "Accolade, Inc.", null, "United States", null]] },
    { id: 2, title: "Gunship", genres: [], firstYear: null, releases: [[20, null, 2, null, null, null, null]] },
  ], "Spiele nach dem Grenzjahr fehlen, Spiele ohne Jahr bleiben");
  assert.deepEqual(gameCompanies(result.games[0]), ["Mirrorsoft Ltd.", "Accolade, Inc.", "Spectrum HoloByte"]);
  assert.deepEqual((await buildGameTitleIndex({ input, output, maxFirstYear: 2006 })).index.games.map((entry) => entry.id), [1, 2, 3]);
  assert.equal(parseIndexArguments(["--input", input, "--max-year", "1999"]).maxFirstYear, 1999);
  assert.throws(() => parseIndexArguments(["--input", input, "--max-year", "neu"]), /Jahreszahl/u);
  assert.equal(stored.split("\n").length, 5, "Kopf, eine Zeile je Spiel, Abschluss");
  const custom = path.join(directory, "platforms.json");
  await buildGameTitleIndex({ input, output, platformOutput: custom });
  assert.equal((await loadTitleIndex(output)).platformIndex, "platforms.json");
  assert.deepEqual(parseIndexArguments(["--input", input, "--platform-output", custom]).platformOutput, custom);
  assert.throws(() => parseIndexArguments(["--invalid"]), /Aufruf/u);
  assert.equal(parseIndexArguments(["--input", input, "--delete-input"]).deleteInput, true);
  await assert.rejects(buildGameTitleIndex({ input, output: input }), /identisch/u);
  await assert.rejects(buildGameTitleIndex({ input, output, platformOutput: output }), /verschiedene Ausgabedateien/u);
  const broken = path.join(directory, "broken.sql");
  await writeFile(broken, "SET x=1;");
  await assert.rejects(buildGameTitleIndex({ input: broken, output, deleteInput: true }), /Keine Daten/u);
  await access(broken);
  await buildGameTitleIndex({ input, output, deleteInput: true });
  await assert.rejects(access(input), { code: "ENOENT" });
});

test("Vokabular markiert Wörter aus vielen Transkripten als häufig", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "pixel-vocabulary-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [index, text] of ["Mission Felken", "Mission", "Mission", "Tetris"].entries()) {
    await writeFile(path.join(directory, `a000000000${index}.json`),
      JSON.stringify({ status: "available", segments: [{ startMs: 0, durationMs: 1, text }] }));
  }
  const result = await transcriptVocabulary(directory);
  assert.equal(result.documents, 4);
  assert.deepEqual([...result.common], ["mission"]);
});

test("Analyse übergibt Katalogkandidaten an das Modell und verwirft später erschienene Spiele", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "pixel-candidates-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, "youtube-transcripts"));
  const videoId = "a0000000000";
  const texts = ["Felken für MS 1988", "Simulator mit F-16", "sehr gute Grafik", "und Wasteland 3 spiele ich gerade",
    "das ist modern", "wirklich lange", "ganz anders"];
  await writeFile(path.join(directory, "youtube-transcripts", `${videoId}.json`), JSON.stringify({
    videoId, status: "available", segments: texts.map((text, index) => ({ startMs: index * 10_000, durationMs: 10_000, text })),
  }));
  const contexts = [];
  const result = await generateGamesFromTranscript(videoId, {
    cacheDirectory: directory, log() {},
    config: llmConfiguration({ OPENAI_BASE_URL: "http://127.0.0.1:11434/v1", OPENAI_MODEL: "qwen3:14b" }),
    candidateSearch: { index, issueYear: 1988, fromYear: 1985, toYear: 1989, vocabulary },
    analyzeWindowImpl: async (window) => {
      contexts.push(window.catalogCandidates);
      const item = (title, first, last) => ({ title, firstSegmentId: first, lastSegmentId: last, evidenceSegmentId: first,
        confidence: "high", endReason: "topic-change", continuesBefore: false, continuesAfter: false });
      return [item("Falcon", 0, 2), item("Wasteland 3", 3, 6)];
    },
  });
  assert.deepEqual(contexts[0].map((entry) => entry.title), ["Falcon"]);
  assert.equal(result.candidateSource, "abc:1985-1989");
  assert.deepEqual(result.discussions.map((entry) => [entry.title, entry.titleIndexId]), [["Falcon", 1]]);
  assert.deepEqual(result.discarded.map((entry) => entry.title), ["Wasteland 3"]);

  const file = path.join(directory, "game-discussions", `${videoId}.json`);
  const stored = JSON.parse(await readFile(file, "utf8"));
  delete stored.discussions[0].developers;
  stored.discussions[0].publishers = ["Manuell geprüft"];
  stored.status = "reviewed";
  await writeFile(file, JSON.stringify(stored));
  const releases = [[11, 1987, 3, "Spectrum HoloByte", "Sphere, Inc.", null, null]];
  const enriched = await generateGamesFromTranscript(videoId, {
    cacheDirectory: directory, log() {},
    config: llmConfiguration({ OPENAI_BASE_URL: "http://127.0.0.1:11434/v1", OPENAI_MODEL: "qwen3:14b" }),
    candidateSearch: { index: { ...index, games: index.games.map((entry) => entry.id === 1 ? { ...entry, releases } : entry) },
      issueYear: 1988, fromYear: 1985, toYear: 1989, vocabulary },
    analyzeWindowImpl: async () => assert.fail("Vorhandene Analyse darf kein Modell aufrufen"),
  });
  assert.equal(enriched.status, "reviewed");
  assert.deepEqual([enriched.discussions[0].developers, enriched.discussions[0].publishers],
    [["Sphere, Inc."], ["Manuell geprüft"]]);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), enriched);
});

test("Modellanfrage enthält Katalogkandidaten und die Regeln dazu", async () => {
  const segments = transcript(["Felken für MS 1988"]);
  const window = { index: 0, coreFirstId: 0, coreLastId: 0, segments,
    catalogCandidates: [{ title: "Falcon", year: 1987, heard: ["felken"], segmentIds: [0] }] };
  let body;
  await analyzeWindow(window, llmConfiguration({ OPENAI_BASE_URL: "http://127.0.0.1:11434/v1", OPENAI_MODEL: "m" }), {
    log() {}, fetchImpl: async (_url, request) => {
      body = JSON.parse(request.body);
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: "{\"discussions\":[]}" } }] });
    },
  });
  assert.match(body.messages[0].content, /catalogCandidates/u);
  assert.deepEqual(JSON.parse(body.messages[1].content.replace(/\n\/no_think$/u, "")).catalogCandidates,
    window.catalogCandidates);
});

test("Kontextprüfung erhält nummerierte Vorschläge und nennt fehlende Entscheidungen", async () => {
  const segments = transcript(["Ports of Call", "Schiffe handeln", "Hafen", "Titanic", "Eisberg", "Untergang"]);
  const window = { index: 0, coreFirstId: 0, coreLastId: 5, segments };
  const proposal = (title, first, last) => ({ title, firstSegmentId: first, lastSegmentId: last, evidenceSegmentId: first,
    confidence: "high", endReason: "topic-change", continuesBefore: false, continuesAfter: false });
  const bodies = [];
  const reply = { decisions: [{ candidateIndex: 0, kind: "comparison", evidenceSegmentId: 0 }] };
  await assert.rejects(analyzeWindow(window, llmConfiguration({ OPENAI_BASE_URL: "http://127.0.0.1:11434/v1", OPENAI_MODEL: "m" }), {
    log() {}, sleep: async () => {}, candidates: [proposal("Ports of Call", 0, 2), proposal("Titanic", 3, 5)],
    fetchImpl: async (_url, request) => {
      bodies.push(JSON.parse(request.body));
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply) } }] });
    },
  }), /Entscheidungen fehlen \(2 Vorschläge, 1 Entscheidungen; fehlender candidateIndex: 1\)/u);
  const context = JSON.parse(bodies[0].messages[1].content.replace(/\n\/no_think$/u, ""));
  assert.deepEqual(context.proposals.map((entry) => [entry.candidateIndex, entry.title]), [[0, "Ports of Call"], [1, "Titanic"]]);
  assert.equal(context.candidates, undefined);
});

test("Segmentprüfung sortiert Abschnitte und benennt Überschneidungen konkret", () => {
  const window = { index: 0, coreFirstId: 0, coreLastId: 9, segments: transcript(Array.from({ length: 10 }, (_, i) => `T${i}`)) };
  const item = (title, first, last) => ({ title, firstSegmentId: first, lastSegmentId: last, evidenceSegmentId: first,
    confidence: "high", endReason: "topic-change", continuesBefore: false, continuesAfter: false });
  assert.deepEqual(validateDiscussions({ discussions: [item("B", 6, 9), item("A", 0, 4)] }, window).map((entry) => entry.title),
    ["A", "B"]);
  assert.throws(() => validateDiscussions({ discussions: [item("Xenon", 0, 8), item("Morpheus", 9, 9), item("Nightgames", 5, 7)] }, window),
    /"Nightgames" \(5–7\) überschneidet "Xenon" \(0–8\)/u);
});

test("Erkennung verwirft vollständig verschachtelte Nebentreffer mit Protokoll", async () => {
  const segments = transcript(Array.from({ length: 10 }, (_, i) => `Xenon ${i}`));
  const window = { index: 0, coreFirstId: 0, coreLastId: 9, segments };
  const item = (title, first, last) => ({ title, firstSegmentId: first, lastSegmentId: last, evidenceSegmentId: first,
    confidence: "high", endReason: "topic-change", continuesBefore: false, continuesAfter: false });
  const responses = [
    { discussions: [item("Xenon", 0, 8), item("Morpheus", 9, 9), item("Nightgames", 5, 7)] },
    { decisions: [{ candidateIndex: 0, kind: "review", evidenceSegmentId: 0, discussions: [item("Xenon", 0, 8)] },
      { candidateIndex: 1, kind: "uncertain", evidenceSegmentId: 9 }] },
  ];
  const logs = [];
  const result = await analyzeWindow(window, llmConfiguration({ OPENAI_BASE_URL: "http://127.0.0.1:11434/v1", OPENAI_MODEL: "m" }), {
    log: (line) => logs.push(line), sleep: async () => {},
    fetchImpl: async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(responses.shift()) } }] }),
  });
  assert.deepEqual(result.map((entry) => entry.title), ["Xenon"]);
  assert.ok(logs.some((line) => /"Nightgames" \(5–7\) liegt vollständig in "Xenon" \(0–8\)/u.test(line)));
  assert.throws(() => validateDiscussions({ discussions: [item("Xenon", 0, 6), item("Nightgames", 5, 7)] }, window), /überschneidet/u);
  const trimmed = [];
  const resolved = validateDiscussions({ discussions: [item("Thrust", 0, 6), { ...item("Breakout", 5, 9), endReason: "window-end", continuesAfter: true }] },
    window, { onTrimmed: (entry) => trimmed.push(entry.title) });
  assert.deepEqual(resolved.map((entry) => [entry.title, entry.firstSegmentId, entry.lastSegmentId, entry.endReason]),
    [["Thrust", 0, 4, "next-game"], ["Breakout", 5, 9, "window-end"]]);
  assert.deepEqual(trimmed, ["Thrust"]);
  assert.throws(() => validateDiscussions({ discussions: [{ ...item("Thrust", 0, 6), evidenceSegmentId: 6 }, item("Breakout", 5, 9)] },
    window, { onTrimmed() {} }), /überschneidet/u, "Belegstelle darf nicht abgeschnitten werden");
});

test("Erkennung erweitert Abschnitte um ein direkt angrenzendes Belegsegment statt die Antwort zu verwerfen", () => {
  const segments = transcript(Array.from({ length: 10 }, (_, i) => `Alone in the Dark ${i}`));
  const window = { index: 0, coreFirstId: 0, coreLastId: 9, segments };
  const item = (title, first, last, evidence) => ({ title, firstSegmentId: first, lastSegmentId: last, evidenceSegmentId: evidence,
    confidence: "high", endReason: "topic-change", continuesBefore: false, continuesAfter: false });
  // Beobachtete Antwort aus _Lf38M5wWAw: Beleg ein Segment hinter dem Ende, dazu Varianten mit identischem Bereich.
  const data = { discussions: [item("Alone in the Dark", 2, 6, 7), item("Alone in the Dark 2", 2, 6, 7), item("Morpheus", 9, 9, 8)] };
  assert.throws(() => validateDiscussions(data, window), /firstSegmentId <= evidenceSegmentId <= lastSegmentId/u, "ohne Korrektur bleibt die Prüfung strikt");
  const extended = [];
  const nested = [];
  const result = validateDiscussions(data, window, {
    onExtended: (entry, original) => extended.push([entry.title, original.lastSegmentId, entry.firstSegmentId, entry.lastSegmentId]),
    onNested: (entry) => nested.push(entry.title), onTrimmed() {},
  });
  assert.deepEqual(result.map((entry) => [entry.title, entry.firstSegmentId, entry.lastSegmentId]),
    [["Alone in the Dark", 2, 7], ["Morpheus", 8, 9]]);
  assert.deepEqual(extended, [["Alone in the Dark", 6, 2, 7], ["Alone in the Dark 2", 6, 2, 7], ["Morpheus", 9, 8, 9]]);
  assert.deepEqual(nested, ["Alone in the Dark 2"]);
  assert.throws(() => validateDiscussions({ discussions: [item("Alone in the Dark", 2, 6, 8)] }, window, { onExtended() {} }),
    /firstSegmentId <= evidenceSegmentId <= lastSegmentId/u, "entfernte Belege werden nicht übernommen");
});
