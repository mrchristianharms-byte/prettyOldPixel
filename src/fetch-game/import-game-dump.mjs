import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gameDefinitions } from "../data/data-games.mjs";
import manualDumpData from "../data/data-game-dump-manual.json" with { type: "json" };
import { writeJson } from "../shared/archive-cache.mjs";
import { escapeHtml } from "../site-generation/site-html.mjs";
import { defaultTitleIndexFile, releaseColumns } from "./build-game-title-index.mjs";
import { normalizeDumpTitle, platformMatches } from "./game-dump-matching.mjs";
import { normalizeReleaseCompanies } from "./game-company-names.mjs";
import { gameTitles, loadPlatformNames, loadTitleIndex } from "./game-title-index.mjs";
export { normalizeDumpTitle } from "./game-dump-matching.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

function requireValue(condition, message) {
  if (!condition) throw new Error(`Spieledump: ${message}`);
}

const normalizeGenre = (genre) => genre === "Strategy / tactics" ? "Strategie" : genre;

export function renderDumpReport(report) {
  const text = (value) => escapeHtml(String(value ?? "").replace(/\s+/gu, " ").trim());
  const cards = report.games.map((game) => {
    const candidates = game.candidates.map((candidate) => {
      const scoped = candidate.releases.filter((release) => candidate.matchingReleaseIds.includes(release.mobyreleaseid));
      const releases = game.platforms.length ? scoped : candidate.releases;
      return `<section><h3><a href="${candidate.sourceUrl}">${text(candidate.title)}</a> · MobyGames ${candidate.mobyid}${candidate.manual ? " · manuell gepflegt" : ""}</h3>
<p>Genre: ${candidate.genres.map(text).join(", ") || "keine Angabe"}<br>
Plattformabgleich: ${candidate.platformMatch === null ? "lokale Plattform offen" : candidate.platformMatch ? "passende Veröffentlichung vorhanden" : "keine passende Veröffentlichung im Dump"}</p>
<table><thead><tr><th>Plattform</th><th>Jahr</th><th>Entwickler</th><th>Publisher</th><th>Länder</th></tr></thead>
<tbody>${releases.map((release) => `<tr><td>${text(release.platform)}</td><td>${text(release.year)}</td><td>${text(release.developer)}</td><td>${text(release.publisher)}</td><td>${text(release.countries)}</td></tr>`).join("")}</tbody></table>
<p>${candidate.releases.length} Veröffentlichungen insgesamt im JSON-Export; ${releases.length} hier angezeigt.</p></section>`;
    }).join("\n");
    return `<details><summary>${text(game.title)} · ${text(game.platforms.join(", ") || "Plattform offen")} · ${game.candidates.length} Kandidaten</summary>
<p>Lokale ID: ${text(game.gameId)} · ${game.candidates.length ? "Identität und Metadaten ungeprüft." : "Kein exakter Treffer über Titel oder lokale Aliasse; kein Beleg für Fehlen in der Datenbank."}</p>${candidates}</details>`;
  }).join("\n");
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lokaler Spieledump: Trefferprüfung</title><style>
body{font:16px system-ui;max-width:1200px;margin:2rem auto;padding:0 1rem;color:#222;background:#fff}
details{border:1px solid #aaa;padding:1rem;margin:.5rem 0}summary{cursor:pointer}table{border-collapse:collapse;width:100%}
th,td{padding:.4rem;border:1px solid #ccc;text-align:left;overflow-wrap:anywhere}section{overflow-x:auto}code{overflow-wrap:anywhere}
</style></head><body><h1>Lokaler Spieledump: Trefferprüfung</h1>
<p>${report.summary.withCandidates}/${report.summary.games} Spiele mit Kandidaten · ${report.summary.ambiguous} mehrdeutig · ${report.summary.withoutExactMatch} ohne exakten Treffer.</p>
<p>Nur Titel-/Aliasabgleich; keine bestätigten Identitäten oder freigegebenen Website-Fakten.
Teilnummern werden nicht gleichgesetzt. Veröffentlichungen bleiben nach Plattform und Land getrennt.
Bei bekannter lokaler Plattform zeigt die Tabelle nur passende Veröffentlichungen, sonst alle ohne Plattformfreigabe.</p>
<p>Quelle: lokaler MobyGames-basierter Dump, kein neuer Webabruf. Import: ${text(report.importedAt)}<br>
SHA-256: <code>${text(report.source.sha256)}</code></p>${cards}</body></html>\n`;
}

// Builds the catalogue report solely from the local title index; gdb.sql is only read by build-game-title-index.
export async function importGameDump({
  index: indexFile = defaultTitleIndexFile,
  output = path.join(root, "cache/game-metadata/local-dump/report.json"),
  games = gameDefinitions, manual = manualDumpData.games,
}) {
  indexFile = path.resolve(indexFile);
  output = path.resolve(output);
  requireValue(indexFile !== output, "Index und Ausgabe dürfen nicht identisch sein.");
  requireValue(output.endsWith(".json"), "Ausgabe muss eine JSON-Datei sein.");
  const htmlOutput = output.slice(0, -5) + ".html";
  const index = await loadTitleIndex(indexFile);
  const platformNames = await loadPlatformNames(indexFile, index);
  requireValue(JSON.stringify(index.releaseColumns) === JSON.stringify(releaseColumns), "Unbekannte Releasespalten im Titelindex.");
  const byId = new Map(index.games.map((game) => [game.id, game]));
  const titleLookup = new Map();
  for (const game of index.games) {
    for (const title of gameTitles(game)) {
      if (!title) continue;
      const key = normalizeDumpTitle(title);
      if (!titleLookup.has(key)) titleLookup.set(key, new Set());
      titleLookup.get(key).add(game.id);
    }
  }
  const releasesOf = (game) => game.releases.map((values) => {
    const release = Object.fromEntries(releaseColumns.map((column, position) => [column, values[position]]));
    if (release.platform !== null) {
      release.platform = platformNames.get(release.platform);
      requireValue(release.platform, `Plattform-ID fehlt im Plattformindex: ${game.id}.`);
    }
    return normalizeReleaseCompanies({ mobyid: game.id, ...release });
  });
  function additionalRelease(reference) {
    requireValue(Number.isSafeInteger(reference.mobyid) && reference.mobyid > 0
      && typeof reference.title === "string" && Array.isArray(reference.platforms)
      && reference.platforms.length > 0 && reference.platforms.every((platform) => typeof platform === "string"),
    "Ungültige zusätzliche Veröffentlichung.");
    const source = byId.get(reference.mobyid);
    requireValue(source && normalizeDumpTitle(source.title) === normalizeDumpTitle(reference.title),
      `Zusätzliche Veröffentlichung fehlt oder Titel geändert: ${reference.title}.`);
    const releases = releasesOf(source).filter((release) => platformMatches(reference.platforms, release.platform));
    requireValue(reference.platforms.every((platform) =>
      releases.some((release) => platformMatches([platform], release.platform))),
    `Plattform der zusätzlichen Veröffentlichung fehlt: ${reference.title}.`);
    return { ...reference, releases };
  }
  const catalogueIds = new Set(games.map((game) => game.id));
  requireValue(manual && typeof manual === "object"
    && Object.keys(manual).every((id) => catalogueIds.has(id)), "Manuelle Dump-Daten für unbekanntes Spiel.");
  // Hand-maintained entries for catalogue games beyond the title index year limit; the index wins if it has the game.
  function manualSource(gameId) {
    const entry = manual[gameId];
    if (!entry) return null;
    requireValue(Number.isSafeInteger(entry.mobyid) && entry.mobyid > 0 && typeof entry.title === "string"
      && Array.isArray(entry.genres) && Array.isArray(entry.alternativeTitles)
      && Array.isArray(entry.releases) && entry.releases.length > 0,
    `Ungültige manuelle Dump-Daten: ${gameId}.`);
    if (byId.has(entry.mobyid)) return null;
    return { ...entry, manual: true, releases: entry.releases.map((release) => {
      requireValue(releaseColumns.every((column) => Object.hasOwn(release, column)),
        `Unvollständige manuelle Veröffentlichung: ${gameId}.`);
      return normalizeReleaseCompanies({ mobyid: entry.mobyid,
        ...Object.fromEntries(releaseColumns.map((column) => [column, release[column]])) });
    }) };
  }
  const entries = games.map((game) => {
    const ids = new Set([game.name, ...(game.aliases ?? [])].flatMap((title) => [...(titleLookup.get(normalizeDumpTitle(title)) ?? [])]));
    const sources = [...ids].map((id) => ({ ...byId.get(id), mobyid: id, releases: releasesOf(byId.get(id)) }));
    const extra = manualSource(game.id);
    if (extra) sources.push(extra);
    const candidates = sources.sort((a, b) => a.mobyid - b.mobyid).map((source) => {
      const { releases } = source;
      const matchedReleases = releases.filter((release) => platformMatches(game.platforms, release.platform));
      return {
        mobyid: source.mobyid, title: source.title,
        sourceUrl: `https://www.mobygames.com/game/${source.mobyid}/`,
        genres: [...new Set(source.genres.map(normalizeGenre))],
        alternativeTitles: (source.alternativeTitles ?? []).map((title) => ({ ...title })),
        ...(source.manual ? { manual: true } : {}),
        platformMatch: game.platforms.length ? matchedReleases.length > 0 : null,
        matchingReleaseIds: matchedReleases.map((release) => release.mobyreleaseid),
        releases,
      };
    });
    return {
      gameId: game.id, title: game.name, platforms: game.platforms,
      status: candidates.length ? "needs-identity-review" : "no-exact-title-match",
      candidates,
      ...(game.additionalReleases?.length
        ? { additionalReleases: game.additionalReleases.map(additionalRelease) } : {}),
    };
  });
  const report = {
    version: 1, provider: "mobygames-local-dump", importedAt: new Date().toISOString(),
    source: { ...index.source, titleIndex: path.basename(indexFile),
      note: "Lokaler SQL-Dump über den Titelindex; Importdatum ist kein Abrufdatum bei MobyGames. Keine automatische Faktenfreigabe." },
    importedRows: index.importedRows,
    summary: {
      games: entries.length, withCandidates: entries.filter((entry) => entry.candidates.length).length,
      withoutExactMatch: entries.filter((entry) => !entry.candidates.length).length,
      ambiguous: entries.filter((entry) => entry.candidates.length > 1).length,
    },
    games: entries,
  };
  await writeJson(output, report);
  requireValue(await readFile(output, "utf8") === `${JSON.stringify(report, null, 2)}\n`, "Exportprüfung fehlgeschlagen.");
  const html = renderDumpReport(report);
  await writeFile(`${htmlOutput}.tmp`, html);
  await rename(`${htmlOutput}.tmp`, htmlOutput);
  requireValue(await readFile(htmlOutput, "utf8") === html, "HTML-Exportprüfung fehlgeschlagen.");
  return report;
}

export function parseDumpArguments(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const option = args[i];
    const key = { "--index": "index", "--output": "output" }[option];
    requireValue(key && !options[key], `Unbekannte oder doppelte Option: ${option}`);
    requireValue(args[i + 1] && !args[i + 1].startsWith("--"), `Pfad fehlt für ${option}.`);
    options[key] = path.resolve(args[++i]);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseDumpArguments(process.argv.slice(2));
    const report = await importGameDump(options);
    console.log(`${report.summary.withCandidates}/${report.summary.games} Spiele mit Treffern; ${report.summary.ambiguous} mehrdeutig; ${report.summary.withoutExactMatch} ohne exakten Treffer.`);
    console.log(`Export: ${options.output ?? path.join(root, "cache/game-metadata/local-dump/report.json")}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
