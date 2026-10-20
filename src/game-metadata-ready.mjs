import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gameDefinitions } from "./data-games.mjs";
import decisions from "./data-game-dump-decisions.json" with { type: "json" };
import policy from "./data-game-dump-policy.json" with { type: "json" };
import { verifyGameDump } from "./verify-game-dump.mjs";
import { writeJson } from "./archive-cache.mjs";
import { platformMatches, selectDumpCandidate } from "./game-dump-matching.mjs";
import { companyNamesHash, normalizeReleaseCompanies } from "./game-company-names.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const defaultCacheDir = path.join(root, "cache/game-metadata");
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const catalogueHash = (games) => hash(games.map(({ id, name, platforms, aliases }) => ({
  id, name, platforms, aliases: aliases ?? [],
})));
function check(condition, message) {
  if (!condition) throw new Error(`Nutzbare Spielemetadaten: ${message}`);
}

export async function buildReadyGameMetadata({
  cacheDir = defaultCacheDir, games = gameDefinitions,
  reviewedDecisions = decisions, selectionPolicy = policy,
} = {}) {
  const { report, reportHash } = await verifyGameDump({ cacheDir, games });
  const ids = new Set(games.map((game) => game.id));
  check(Object.keys(reviewedDecisions).every((id) => ids.has(id)), "Entscheidung für unbekanntes Spiel.");
  const records = games.map((game) => {
    const candidates = report.games.find((entry) => entry.gameId === game.id).candidates;
    const decision = reviewedDecisions[game.id];
    let selection = selectDumpCandidate(game, candidates, selectionPolicy);
    if (decision) {
      check(Number.isSafeInteger(decision.mobyid) && /^\d{4}-\d{2}-\d{2}$/u.test(decision.reviewedAt)
        && typeof decision.note === "string" && decision.note.trim(), `Ungültige Entscheidung: ${game.id}.`);
      const candidate = candidates.find((entry) => entry.mobyid === decision.mobyid);
      check(candidate && game.platforms.length > 0
        && game.platforms.every((platform) => candidate.releases.some((release) => platformMatches([platform], release.platform))),
      `Geprüfte Dump-Zuordnung/Plattform nicht mehr belegt: ${game.id}.`);
      selection = { status: "selected", reason: "reviewed-dump-decision", mobyid: candidate.mobyid,
        platforms: [...game.platforms], platformBasis: "catalogue", consideredIds: [candidate.mobyid],
        identityBasis: "reviewed-dump-decision",
        matchingReleaseIds: candidate.releases.filter((release) => platformMatches(game.platforms, release.platform))
          .map((release) => release.mobyreleaseid) };
    }
    const base = { gameId: game.id, title: game.name, platforms: game.platforms, selection };
    if (selection.status !== "selected") return {
      ...base, status: "blocked", reason: selection.reason, data: null,
    };
    const candidate = candidates.find((entry) => entry.mobyid === selection.mobyid);
    const releases = candidate.releases.filter((release) => selection.matchingReleaseIds.includes(release.mobyreleaseid))
      .map((release) => normalizeReleaseCompanies({
        sourceReleaseId: release.mobyreleaseid, platform: release.platform, year: release.year,
        developer: release.developer, publisher: release.publisher,
        ...(release.sourceDeveloper !== undefined ? { sourceDeveloper: release.sourceDeveloper } : {}),
        ...(release.sourcePublisher !== undefined ? { sourcePublisher: release.sourcePublisher } : {}),
        countries: release.countries?.trim() || null, publisherLabel: release.publabel?.trim() || null,
      }));
    const years = releases.map((release) => release.year);
    // Missing dates or a multi-platform scope must not manufacture a game-wide first year.
    const year = selection.platforms.length === 1 && years.length > 0 && years.every((value) => value !== null)
      ? Math.min(...years) : null;
    return {
      ...base, status: "ready", reason: decision ? "reviewed-source-scoped-data" : "policy-selected-source-scoped-data",
      data: {
        identity: { provider: "mobygames", id: candidate.mobyid, basis: selection.identityBasis,
          scope: "game", reviewedAt: decision?.reviewedAt ?? selectionPolicy.approvedAt,
          note: decision?.note ?? selectionPolicy.note },
        scope: { platforms: selection.platforms, platformBasis: selection.platformBasis },
        evidence: { sourceUrl: `https://www.mobygames.com/game/${candidate.mobyid}/`,
          dumpHash: report.source.sha256, reportHash, importedAt: report.importedAt },
        quality: { basis: "single-source", usage: "attributed-source-data",
          companyIdentities: "reviewed-display-aliases", credits: "not-available" },
        releaseYear: year,
        genres: [...new Set(candidate.genres)], releases,
      },
    };
  });
  const payload = {
    version: 3, generatedAt: new Date().toISOString(), catalogueHash: catalogueHash(games),
    decisionsHash: hash(reviewedDecisions), selectionPolicyHash: hash(selectionPolicy), companyNamesHash,
    summary: { games: records.length, ready: records.filter((record) => record.status === "ready").length,
      blocked: records.filter((record) => record.status === "blocked").length },
    games: records,
  };
  const cache = { ...payload, contentHash: hash(payload) };
  validateReadyCache(cache, games, reviewedDecisions, selectionPolicy);
  await writeJson(path.join(cacheDir, "ready.json"), cache);
  await loadReadyGameMetadata({ cacheDir, games, reviewedDecisions, selectionPolicy });
  return cache;
}

function validateReadyCache(cache, games, reviewedDecisions, selectionPolicy) {
  check(cache && typeof cache === "object", "Cache fehlt.");
  const { contentHash, ...payload } = cache;
  check(cache.version === 3 && contentHash === hash(payload)
    && cache.catalogueHash === catalogueHash(games) && cache.decisionsHash === hash(reviewedDecisions)
    && cache.selectionPolicyHash === hash(selectionPolicy)
    && cache.companyNamesHash === companyNamesHash
    && Array.isArray(cache.games) && cache.games.length === games.length,
  "Cache beschädigt oder veraltet; dev:prepare:game-metadata ausführen.");
  const seen = new Set();
  for (const record of cache.games) {
    const game = games.find((entry) => entry.id === record.gameId);
    check(game && !seen.has(record.gameId) && record.title === game.name
      && JSON.stringify(record.platforms) === JSON.stringify(game.platforms),
    "Ungültiger Katalogbezug im Cache.");
    seen.add(record.gameId);
    if (record.status === "blocked") {
      check(record.data === null && typeof record.reason === "string" && record.reason
        && !reviewedDecisions[record.gameId] && record.selection?.status === "blocked",
      `Ungültige Sperre: ${record.gameId}.`);
      continue;
    }
    const data = record.data;
    const decision = reviewedDecisions[record.gameId];
    const selection = record.selection;
    const platforms = data?.scope?.platforms;
    check(record.status === "ready" && data && selection?.status === "selected"
      && Number.isSafeInteger(data.identity?.id) && data.identity.id > 0
      && data.identity.id === (decision?.mobyid ?? selection.mobyid)
      && data.identity.basis === (decision ? "reviewed-dump-decision" : "dump-title-and-platform")
      && data.identity.provider === "mobygames" && data.identity.scope === "game"
      && !("wikidataId" in data.identity)
      && JSON.stringify(selection.consideredIds) === JSON.stringify([data.identity.id])
      && Array.isArray(platforms) && platforms.length > 0
      && JSON.stringify(platforms) === JSON.stringify(game.platforms.length ? game.platforms : selection.platforms)
      && data.scope.platformBasis === (game.platforms.length ? "catalogue" : "dos-amiga-c64-priority")
      && (game.platforms.length || (platforms.length === 1 && selectionPolicy.openPlatformPriority.includes(platforms[0])))
      && data.evidence?.sourceUrl === `https://www.mobygames.com/game/${data.identity.id}/`
      && /^[a-f0-9]{64}$/u.test(data.evidence.reportHash) && /^[a-f0-9]{64}$/u.test(data.evidence.dumpHash)
      && Number.isFinite(Date.parse(data.evidence.importedAt))
      && data.quality?.usage === "attributed-source-data" && data.quality.basis === "single-source"
      && Array.isArray(data.genres) && data.genres.every((genre) => typeof genre === "string" && genre.trim())
      && Array.isArray(data.releases) && data.releases.length > 0
      && new Set(data.releases.map((release) => release.sourceReleaseId)).size === data.releases.length
      && platforms.every((platform) => data.releases.some((release) => platformMatches([platform], release.platform)))
      && data.releases.every((release) => Number.isSafeInteger(release.sourceReleaseId)
        && release.sourceReleaseId > 0 && typeof release.platform === "string" && platformMatches(platforms, release.platform)
        && (release.year === null || (Number.isInteger(release.year) && release.year >= 1900 && release.year <= 2099))
        && ["developer", "publisher", "countries", "publisherLabel"].every((key) =>
          release[key] === null || typeof release[key] === "string")
        && ["sourceDeveloper", "sourcePublisher"].every((key) =>
          release[key] === undefined || typeof release[key] === "string")),
    `Ungültige nutzbare Daten: ${record.gameId}.`);
    const years = data.releases.map((release) => release.year);
    check(data.releaseYear === (platforms.length === 1 && years.every((year) => year !== null) ? Math.min(...years) : null),
      `Ungültige Jahresauswahl: ${record.gameId}.`);
  }
  check(cache.summary?.games === cache.games.length
    && cache.summary.ready === cache.games.filter((record) => record.status === "ready").length
    && cache.summary.blocked === cache.games.filter((record) => record.status === "blocked").length,
  "Ungültige Cache-Zusammenfassung.");
}

export async function loadReadyGameMetadata({
  cacheDir = defaultCacheDir, games = gameDefinitions, reviewedDecisions = decisions, selectionPolicy = policy,
} = {}) {
  const cache = JSON.parse(await readFile(path.join(cacheDir, "ready.json"), "utf8"));
  validateReadyCache(cache, games, reviewedDecisions, selectionPolicy);
  const records = new Map(cache.games.map((record) => [record.gameId, record]));
  return {
    summary: { ...cache.summary },
    get(gameId) {
      check(records.has(gameId), `Unbekannte Spiel-ID: ${gameId}.`);
      return structuredClone(records.get(gameId));
    },
    listReady() { return structuredClone(cache.games.filter((record) => record.status === "ready")); },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    check(process.argv.length === 2, "Aufruf ohne Optionen: npm run dev:prepare:game-metadata");
    console.log(JSON.stringify((await buildReadyGameMetadata()).summary, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
