import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gameDefinitions } from "../data/data-games.mjs";
import { writeJson } from "../shared/archive-cache.mjs";
import { titleIndexLookup } from "../extra-data/transcript-game-candidates.mjs";
import { normalizeDumpTitle } from "./game-dump-matching.mjs";
import { defaultTitleIndexFile } from "./build-game-title-index.mjs";
import { gameTitles, loadTitleIndex } from "./game-title-index.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

export function extractGameTitle(description = "") {
  if (typeof description !== "string") return null;
  const lines = description.split(/\r?\n/u).filter((line) => /^\s*Spiel\s*:/iu.test(line));
  if (lines.length !== 1) return null;
  return lines[0].replace(/^\s*Spiel\s*:\s*/iu, "").trim() || null;
}

// The transcript lookup also accepts main titles; discovery requires a complete title or alias.
export function findGameCandidates(index) {
  const lookup = titleIndexLookup(index);
  const key = (title) => normalizeDumpTitle(title).replaceAll(" ", "");
  return (title) => [...new Set(lookup(title)
    .filter((game) => gameTitles(game).some((name) => key(name) === key(title)))
    .map((game) => game.id))].sort((a, b) => a - b);
}

function assignedVideoIds(games, playlists) {
  const playlistIds = new Set(games.flatMap((game) => game.playlistIds ?? []));
  return new Set([
    ...games.flatMap((game) => [...(game.videoIds ?? []), ...(game.excludedVideoIds ?? [])]),
    ...playlists.filter((playlist) => playlistIds.has(playlist.id))
      .flatMap((playlist) => playlist.videos.map((member) => member.videoId)),
  ]);
}

async function readPrevious(file, channelId) {
  const previous = await readJson(file).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return { version: 1, channelId, candidates: [] };
  });
  if (previous.version !== 1 || !Array.isArray(previous.candidates) || previous.channelId !== channelId) {
    throw new Error("Kandidatendatei ungültig oder für einen anderen Kanal; Ausgabe unverändert.");
  }
  return previous;
}

function collectVideos(videos, { assigned, lookup, byId, candidates, indexHash, log }) {
  const unresolved = [];
  for (const video of videos) {
    if (assigned.has(video.id)) continue;
    const title = extractGameTitle(video.description);
    const ids = title ? lookup(title) : [];
    if (ids.length !== 1) {
      const reason = !title ? "no-title" : ids.length ? "ambiguous" : "no-match";
      unresolved.push({ videoId: video.id, title, reason, candidateIds: ids });
      log(`${video.id}: ${reason} (${ids.join(", ")})`);
      continue;
    }
    const game = byId.get(ids[0]);
    const candidate = candidates.get(game.id) ?? {
      mobyid: game.id, title: game.title, firstYear: game.firstYear, evidence: [],
    };
    if (!candidate.evidence.some((entry) => entry.videoId === video.id)) {
      candidate.evidence.push({ videoId: video.id, title, indexHash });
    }
    candidates.set(game.id, candidate);
  }
  return unresolved;
}

export async function collectNewGameCandidates({
  cacheDirectory = path.join(root, "cache"), titleIndexFile = defaultTitleIndexFile,
  games = gameDefinitions, log = console.log,
} = {}) {
  const videos = await readJson(path.join(cacheDirectory, "youtube-videos.json"));
  if (videos.complete !== true || !videos.channel?.id || !Array.isArray(videos.videos)) {
    throw new Error("Video-Cache muss vollständig sein und eine Kanal-ID enthalten.");
  }
  const playlists = await readJson(path.join(cacheDirectory, "youtube-playlists.json"));
  const index = await loadTitleIndex(titleIndexFile);
  const output = path.join(cacheDirectory, "game-metadata/new-candidates.json");
  const previous = await readPrevious(output, videos.channel.id);
  const candidates = new Map(previous.candidates.map((candidate) => [candidate.mobyid, candidate]));
  const unresolved = collectVideos(videos.videos, {
    assigned: assignedVideoIds(games, playlists.playlists), lookup: findGameCandidates(index),
    byId: new Map(index.games.map((game) => [game.id, game])), candidates, indexHash: index.source.sha256, log,
  });
  const result = { version: 1, channelId: videos.channel.id,
    candidates: [...candidates.values()].sort((a, b) => a.mobyid - b.mobyid), unresolved };
  await writeJson(output, result);
  log(`${result.candidates.length} Spielkandidaten; ${unresolved.length} Videos ohne eindeutigen Treffer.`);
  return result;
}

export async function runCli(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { index: { type: "string" }, "cache-dir": { type: "string" } } });
  await collectNewGameCandidates({ titleIndexFile: values.index, cacheDirectory: values["cache-dir"] });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(`Spielkandidaten fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
  });
}
