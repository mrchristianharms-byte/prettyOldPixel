import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gameDefinitions } from "./data-games.mjs";
import { writeJson } from "./archive-cache.mjs";
import { normalizeDumpTitle } from "./game-dump-matching.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
function check(condition, message) {
  if (!condition) throw new Error(`Dump-Prüfung: ${message}`);
}

export async function verifyGameDump({
  cacheDir = path.join(root, "cache/game-metadata"), games = gameDefinitions,
} = {}) {
  const bytes = await readFile(path.join(cacheDir, "local-dump/report.json"));
  const report = JSON.parse(bytes);
  check(report?.version === 1 && report.provider === "mobygames-local-dump"
    && /^[a-f0-9]{64}$/u.test(report.source?.sha256)
    && Number.isFinite(Date.parse(report.importedAt))
    && Array.isArray(report.games), "Ungültiger Report.");
  const catalogue = new Map(games.map((game) => [game.id, game]));
  const ids = new Set();
  check(catalogue.size === games.length, "Doppelte Katalog-ID.");
  for (const entry of report.games) {
    const game = catalogue.get(entry.gameId);
    check(game && !ids.has(entry.gameId) && Array.isArray(entry.candidates),
      `Unbekannter oder doppelter Eintrag: ${entry.gameId}.`);
    ids.add(entry.gameId);
    check(entry.title === game.name && JSON.stringify(entry.platforms) === JSON.stringify(game.platforms),
      `Veralteter Katalogbezug: ${game.id}.`);
    const candidateIds = new Set();
    for (const candidate of entry.candidates) {
      check(Number.isSafeInteger(candidate.mobyid) && candidate.mobyid > 0
        && !candidateIds.has(candidate.mobyid) && typeof candidate.title === "string"
        && Array.isArray(candidate.alternativeTitles) && Array.isArray(candidate.releases)
        && Array.isArray(candidate.genres) && candidate.genres.every((genre) => typeof genre === "string" && genre.trim()),
      `Ungültiger Kandidat: ${game.id}.`);
      candidateIds.add(candidate.mobyid);
      const titles = [candidate.title, ...candidate.alternativeTitles.map((title) => title.title)];
      check(titles.every((title) => typeof title === "string")
        && [game.name, ...(game.aliases ?? [])].some((title) =>
          titles.some((sourceTitle) => normalizeDumpTitle(title) === normalizeDumpTitle(sourceTitle))),
      `Kandidat ohne aktuellen Titel-/Aliasbezug: ${game.id}/${candidate.mobyid}.`);
      const releaseIds = new Set();
      for (const release of candidate.releases) {
        check(release.mobyid === candidate.mobyid && Number.isSafeInteger(release.mobyreleaseid)
          && release.mobyreleaseid > 0 && !releaseIds.has(release.mobyreleaseid)
          && typeof release.platform === "string" && release.platform.trim()
          && (release.year === null || (Number.isInteger(release.year) && release.year >= 1900 && release.year <= 2099))
          && ["developer", "publisher", "countries", "publabel"].every((key) =>
            release[key] === null || typeof release[key] === "string"),
        `Ungültige Releasefelder: ${game.id}.`);
        releaseIds.add(release.mobyreleaseid);
      }
    }
  }
  check(ids.size === catalogue.size, "Report deckt den Katalog nicht vollständig ab.");
  return { report, reportHash: createHash("sha256").update(bytes).digest("hex") };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    check(process.argv.length === 2, "Aufruf ohne Optionen: npm run dev:verify:game-dump");
    const { report, reportHash } = await verifyGameDump();
    const result = { version: 2, provider: "mobygames-local-dump-validation",
      verifiedAt: new Date().toISOString(), reportHash, dumpHash: report.source.sha256,
      games: report.games.length };
    await writeJson(path.join(root, "cache/game-metadata/local-dump/verification.json"), result);
    console.log(`${result.games} Katalogeinträge im lokalen Dump-Report geprüft.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
