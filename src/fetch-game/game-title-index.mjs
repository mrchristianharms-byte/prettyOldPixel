import { readFile } from "node:fs/promises";
import path from "node:path";
import { titleIndexVersion } from "./build-game-title-index.mjs";

const rebuild = "Neu erstellen: npm run dev:build:game-title-index -- --input gdb.sql";

export const gameTitles = (game) => [...new Set([game.title, ...(game.alternativeTitles ?? []).map((entry) => entry.title)])];

export async function loadTitleIndex(file) {
  const index = JSON.parse(await readFile(file, "utf8"));
  if (index?.version !== titleIndexVersion || !Array.isArray(index.games) || !/^[a-f0-9]{64}$/u.test(index.source?.sha256)) {
    throw new Error(`Titelindex ungültig oder veraltet: ${file}. ${rebuild}`);
  }
  return index;
}

// Platform ids are local to one build; both files must stem from the same dump.
export async function loadPlatformNames(indexFile, index) {
  const file = path.join(path.dirname(indexFile), index.platformIndex ?? "");
  const platformIndex = JSON.parse(await readFile(file, "utf8").catch(() => {
    throw new Error(`Plattformindex fehlt: ${file}. ${rebuild}`);
  }));
  if (platformIndex?.version !== 1 || !Array.isArray(platformIndex.platforms)
    || platformIndex.source?.sha256 !== index.source.sha256) {
    throw new Error(`Plattformindex passt nicht zum Titelindex: ${file}. ${rebuild}`);
  }
  return new Map(platformIndex.platforms.map(({ id, name }) => [id, name]));
}
