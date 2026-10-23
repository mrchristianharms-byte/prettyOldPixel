import { createWriteStream } from "node:fs";
import { lstat, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { writeJson } from "../shared/archive-cache.mjs";
import { hashFile, parseSqlValues, readSqlStatements } from "./sql-dump-reader.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const defaultTitleIndexFile = path.join(root, "cache/game-title-index.json.gz");
export const titleIndexVersion = 4;
// Retro scope: later games are dropped to keep the index small (see doc/README.md, Titelindex).
export const defaultMaxFirstYear = 2005;
export const releaseColumns = ["mobyreleaseid", "year", "platform", "publisher", "developer", "countries", "publabel"];
const platformIndexName = "game-platform-index.json";
const columns = {
  mobygames: ["mobyid", "title", "genre"],
  mobygames_alttitles: ["mobyid", "title", "info"],
  mobygames_releases: ["mobyid", ...releaseColumns],
};
const usage = "Aufruf: node src/fetch-game/build-game-title-index.mjs --input gdb.sql [--output datei.json] [--platform-output datei.json] [--max-year 2005] [--delete-input]";

function requireValue(condition, message) {
  if (!condition) throw new Error(`Titelindex: ${message}`);
}

export function parseIndexArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--delete-input") {
      requireValue(!options.deleteInput, `${usage}; doppelte Option --delete-input.`);
      options.deleteInput = true;
      continue;
    }
    const key = { "--input": "input", "--output": "output", "--platform-output": "platformOutput",
      "--max-year": "maxFirstYear" }[args[index]];
    requireValue(key && !options[key], `${usage}; unbekannte oder doppelte Option ${args[index]}.`);
    requireValue(args[index + 1] && !args[index + 1].startsWith("--"), `Aufruf: Wert fehlt für ${args[index]}.`);
    const value = args[++index];
    if (key === "maxFirstYear") {
      requireValue(/^\d{4}$/u.test(value), `${usage}; --max-year braucht eine Jahreszahl.`);
      options[key] = Number(value);
    } else options[key] = path.resolve(value);
  }
  requireValue(options.input, "Aufruf: --input ist erforderlich.");
  return options;
}

// SQLite ORDER BY semantics of the former import: NULL first, then binary text/number order.
const compareNullable = (a, b) => (a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1);

// Gzip with one game per line: small on disk and still searchable with zgrep.
async function writeIndex(file, index) {
  const { games, ...header } = index;
  const head = JSON.stringify(header);
  function* lines() {
    yield `${head.slice(0, -1)},"games":[\n`;
    for (const [position, game] of games.entries()) yield `${position ? ",\n" : ""}${JSON.stringify(game)}`;
    yield "\n]}\n";
  }
  await mkdir(path.dirname(file), { recursive: true });
  await pipeline(Readable.from(lines()), createGzip({ level: 9 }), createWriteStream(`${file}.tmp`));
  await rename(`${file}.tmp`, file);
}

// Local MobyGames index for transcript candidates and catalogue matching; the SQL dump itself is never committed.
// Game ids are MobyGames ids (mobyid); platform ids are local numbers from the platform index.
export async function buildGameTitleIndex({
  input, output = defaultTitleIndexFile, platformOutput = path.join(path.dirname(output), platformIndexName),
  maxFirstYear = defaultMaxFirstYear, deleteInput = false,
}) {
  requireValue(Number.isInteger(maxFirstYear), "Grenzjahr muss eine ganze Zahl sein.");
  input = path.resolve(input);
  requireValue(![output, platformOutput].map((file) => path.resolve(file)).includes(input),
    "Eingabe und Ausgabe dürfen nicht identisch sein.");
  requireValue(path.resolve(output) !== path.resolve(platformOutput),
    "Titelindex und Plattformindex brauchen verschiedene Ausgabedateien.");
  const before = await lstat(input);
  requireValue(before.isFile() && !before.isSymbolicLink(), "Eingabe muss eine reguläre Datei sein.");
  const sha256 = await hashFile(input);
  const games = new Map();
  const game = (id) => {
    if (!games.has(id)) games.set(id, { id, title: null, genre: null, alternativeTitles: [], releases: [] });
    return games.get(id);
  };
  const counts = Object.fromEntries(Object.keys(columns).map((table) => [table, 0]));
  for await (const statement of readSqlStatements(input)) {
    if (!/^INSERT\b/iu.test(statement)) continue;
    const header = /^INSERT INTO `([^`]+)`\s*\(([^)]+)\)\s*VALUES\s*/iu.exec(statement);
    requireValue(header, "Nicht unterstützte INSERT-Syntax.");
    if (!Object.hasOwn(columns, header[1])) continue;
    const names = header[2].split(",").map((name) => {
      const match = /^\s*`([a-zA-Z0-9_]+)`\s*$/u.exec(name);
      requireValue(match, "Ungültiger Spaltenname.");
      return match[1];
    });
    const positions = columns[header[1]].map((name) => {
      requireValue(names.includes(name), `Spalte ${header[1]}.${name} fehlt.`);
      return names.indexOf(name);
    });
    for (const row of parseSqlValues(statement.slice(header[0].length), names.length)) {
      const [id, ...values] = positions.map((position) => row[position]);
      requireValue(Number.isSafeInteger(id) && id > 0, `Ungültige MobyGames-ID in ${header[1]}.`);
      counts[header[1]] += 1;
      const entry = game(id);
      if (header[1] === "mobygames") [entry.title, entry.genre] = values;
      else if (header[1] === "mobygames_alttitles") {
        if (typeof values[0] === "string") entry.alternativeTitles.push({ title: values[0], info: values[1] });
      } else entry.releases.push(values);
    }
  }
  for (const [table, count] of Object.entries(counts)) requireValue(count > 0, `Keine Daten für ${table}.`);
  const listed = [...games.values()].filter((entry) => entry.title?.trim()).sort((a, b) => a.id - b.id);
  const platformNames = [...new Set(listed.flatMap((entry) =>
    entry.releases.map((release) => release[2]?.trim()).filter(Boolean)))]
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }) || a.localeCompare(b));
  const platformIds = new Map(platformNames.map((name, index) => [name, index + 1]));
  const source = { fileName: path.basename(input), sha256, bytes: before.size };
  const platformIndex = {
    version: 1, provider: "mobygames-local-dump", source,
    platforms: platformNames.map((name) => ({ id: platformIds.get(name), name })),
  };
  const index = {
    version: titleIndexVersion, provider: "mobygames-local-dump", source,
    platformIndex: path.basename(platformOutput),
    importedRows: counts,
    maxFirstYear,
    releaseColumns,
    games: listed.map((entry) => {
      const releases = entry.releases.sort((a, b) =>
        compareNullable(a[2], b[2]) || compareNullable(a[1], b[1]) || a[0] - b[0]);
      const years = releases.map((release) => release[1]).filter((year) => Number.isInteger(year) && year > 1950);
      return {
        id: entry.id, title: entry.title,
        ...(entry.alternativeTitles.length ? {
          alternativeTitles: entry.alternativeTitles.sort((a, b) =>
            compareNullable(a.title, b.title) || compareNullable(a.info, b.info)),
        } : {}),
        genres: (entry.genre ?? "").split(";").map((value) => value.trim()).filter(Boolean),
        firstYear: years.length ? Math.min(...years) : null,
        releases: releases.map(([id, year, platform, ...rest]) => [id, year, platformIds.get(platform?.trim()) ?? null, ...rest]),
      };
    }).filter((entry) => entry.firstYear === null || entry.firstYear <= maxFirstYear),
  };
  await writeJson(platformOutput, platformIndex);
  await writeIndex(output, index);
  const after = await lstat(input);
  requireValue(before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs
    && await hashFile(input) === sha256, "Eingabe wurde während des Indexbaus verändert.");
  if (deleteInput) await rm(input);
  return { index, platformIndex };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseIndexArguments(process.argv.slice(2));
    const { index, platformIndex } = await buildGameTitleIndex(options);
    const output = options.output ?? defaultTitleIndexFile;
    console.log(`Titelindex mit ${index.games.length} Spielen (Erstjahr bis ${index.maxFirstYear} oder unbekannt) erstellt: ${output}`);
    console.log(`Plattformindex mit ${platformIndex.platforms.length} Plattformen erstellt: ${options.platformOutput ?? path.join(path.dirname(output), platformIndexName)}`);
    if (options.deleteInput) console.log("SQL-Eingabe nach erfolgreichem Indexbau gelöscht.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
