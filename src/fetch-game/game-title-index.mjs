import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { titleIndexVersion } from "./build-game-title-index.mjs";
import { normalizeCompanyName } from "./game-company-names.mjs";

const rebuild = "Neu erstellen: npm run dev:build:game-title-index -- --input gdb.sql";

export const gameTitles = (game) => [...new Set([game.title, ...(game.alternativeTitles ?? []).map((entry) => entry.title)])];

// Publishers before developers, normalized and deduplicated; derived on demand instead of stored in the index.
export function gameCompanies(game, limit = 8) {
  const names = (column) => (game.releases ?? []).flatMap((release) =>
    (release[column]?.split(/,\s*\r?\n\s*/u) ?? []).map(normalizeCompanyName).filter(Boolean));
  return [...new Set([...names(3), ...names(4)])].slice(0, limit);
}

export async function loadTitleIndex(file) {
  const index = await readFile(file)
    .then((data) => data[0] === 0x1f && data[1] === 0x8b ? promisify(gunzip)(data) : data)
    .then((data) => JSON.parse(data.toString("utf8")))
    .catch((error) => {
      if (error.code === "ENOENT") throw error;
      throw new Error(`Titelindex unlesbar: ${file}. ${rebuild}`);
    });
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
