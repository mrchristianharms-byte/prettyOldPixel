import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, lstat, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gameDefinitions } from "./data-games.mjs";
import { writeJson } from "./archive-cache.mjs";
import { escapeHtml } from "./site-html.mjs";
import { normalizeDumpTitle, platformMatches } from "./game-dump-matching.mjs";
import { normalizeReleaseCompanies } from "./game-company-names.mjs";
export { normalizeDumpTitle } from "./game-dump-matching.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const fields = {
  mobygames: ["mobyid", "title", "mobylink", "genre", "perspective", "gameplay", "interface", "setting", "sport", "misc"],
  mobygames_alttitles: ["mobyid", "title", "info"],
  mobygames_releases: ["mobyid", "mobyreleaseid", "year", "platform", "publisher", "developer", "countries", "publabel"],
};

function requireValue(condition, message) {
  if (!condition) throw new Error(`Spieledump: ${message}`);
}

// SQL is parsed as data, never executed. Comments and quoted semicolons may span lines.
export async function* readSqlStatements(file) {
  const input = createReadStream(file);
  const lines = createInterface({ input, crlfDelay: Infinity });
  let quote = null;
  let blockComment = false;
  let escaped = false;
  let parts = [];
  let length = 0;
  try {
    for await (const line of lines) {
      let start = 0;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];
        if (blockComment) {
          if (char === "*" && next === "/") { blockComment = false; i += 1; }
          start = i + 1;
        } else if (quote) {
          if (escaped) escaped = false;
          else if (char === "\\" && quote !== "`") escaped = true;
          else if (char === quote) {
            if (next === quote) i += 1;
            else quote = null;
          }
        } else if (char === "'" || char === '"' || char === "`") quote = char;
        else if ((char === "-" && next === "-" && /\s/u.test(line[i + 2] ?? " "))
          || char === "#") {
          parts.push(line.slice(start, i));
          start = line.length;
          break;
        } else if (char === "/" && next === "*") {
          parts.push(`${line.slice(start, i)} `);
          blockComment = true;
          i += 1;
          start = i + 1;
        } else if (char === ";") {
          parts.push(line.slice(start, i));
          const statement = parts.join("").trim();
          if (statement) yield statement;
          parts = [];
          length = 0;
          start = i + 1;
        }
      }
      parts.push(`${line.slice(start)}\n`);
      length += line.length;
      requireValue(length <= 32 * 1024 * 1024, "SQL-Anweisung größer als 32 MiB.");
      escaped = false;
    }
    requireValue(!quote && !blockComment, "Unvollständiger String oder Kommentar im Dump.");
    requireValue(!parts.join("").trim(), "SQL-Anweisung ohne abschließendes Semikolon.");
  } finally {
    lines.close();
    input.destroy();
  }
}

export function* parseSqlValues(text, width) {
  let i = 0;
  const space = () => { while (/\s/u.test(text[i] ?? "") && i < text.length) i += 1; };
  const escapes = { "0": "\0", b: "\b", n: "\n", r: "\r", t: "\t", Z: "\x1a" };
  while (i < text.length) {
    space();
    requireValue(text[i++] === "(", "Erwartete Wertetupel.");
    const row = [];
    for (;;) {
      space();
      if (text[i] === "'") {
        i += 1;
        let value = "";
        let closed = false;
        while (i < text.length) {
          const char = text[i++];
          if (char === "\\") {
            requireValue(i < text.length, "Unvollständiges SQL-Escaping.");
            const next = text[i++];
            value += escapes[next] ?? (next === "%" || next === "_" ? `\\${next}` : next);
          } else if (char === "'") {
            if (text[i] === "'") { value += "'"; i += 1; }
            else { closed = true; break; }
          } else value += char;
        }
        requireValue(closed, "Nicht abgeschlossener SQL-String.");
        row.push(value);
      } else {
        const start = i;
        while (i < text.length && ![",", ")"].includes(text[i])) i += 1;
        const value = text.slice(start, i).trim();
        requireValue(value === "NULL" || /^-?\d+$/u.test(value), `Nicht unterstützter SQL-Wert: ${value.slice(0, 60)}`);
        const number = value === "NULL" ? null : Number(value);
        requireValue(number === null || Number.isSafeInteger(number), "Ungültiger Integer.");
        row.push(number);
      }
      space();
      const separator = text[i++];
      if (separator === ")") break;
      requireValue(separator === ",", "Ungültiger Wertetrenner.");
    }
    requireValue(row.length === width, `Spaltenzahl ${row.length} statt ${width}.`);
    yield row;
    space();
    if (i === text.length) return;
    requireValue(text[i++] === ",", "Ungültiger Tupeltrenner.");
    space();
    requireValue(i < text.length, "Wertetupel nach Komma fehlt.");
  }
}

async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export function renderDumpReport(report) {
  const text = (value) => escapeHtml(String(value ?? "").replace(/\s+/gu, " ").trim());
  const cards = report.games.map((game) => {
    const candidates = game.candidates.map((candidate) => {
      const scoped = candidate.releases.filter((release) => candidate.matchingReleaseIds.includes(release.mobyreleaseid));
      const releases = game.platforms.length ? scoped : candidate.releases;
      return `<section><h3><a href="${candidate.sourceUrl}">${text(candidate.title)}</a> · MobyGames ${candidate.mobyid}</h3>
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

export async function importGameDump({
  input, output = path.join(root, "cache/game-metadata/local-dump/report.json"),
  games = gameDefinitions, deleteInput = false,
}) {
  input = path.resolve(input);
  output = path.resolve(output);
  requireValue(input !== output, "Eingabe und Ausgabe dürfen nicht identisch sein.");
  requireValue(output.endsWith(".json"), "Ausgabe muss eine JSON-Datei sein.");
  const htmlOutput = output.slice(0, -5) + ".html";
  requireValue(input !== htmlOutput, "HTML-Ausgabe darf nicht die Eingabe ersetzen.");
  const before = await lstat(input);
  requireValue(before.isFile() && !before.isSymbolicLink(), "Eingabe muss eine reguläre Datei sein.");
  const sourceHash = await hashFile(input);
  const directory = await mkdtemp(path.join(tmpdir(), "pixel-game-dump-"));
  let db;
  try {
    db = new DatabaseSync(path.join(directory, "import.sqlite"));
    const inserts = {};
    const counts = {};
    for (const [table, columns] of Object.entries(fields)) {
      db.exec(`CREATE TABLE ${table} (${columns.map((column) => `${column} ${["mobyid", "mobyreleaseid", "year"].includes(column) ? "INTEGER" : "TEXT"}`).join(", ")})`);
      inserts[table] = db.prepare(`INSERT INTO ${table} VALUES (${columns.map(() => "?").join(", ")})`);
      counts[table] = 0;
    }
    db.exec("BEGIN");
    for await (const statement of readSqlStatements(input)) {
      if (!/^INSERT\b/iu.test(statement)) continue;
      const header = /^INSERT INTO `([^`]+)`\s*\(([^)]+)\)\s*VALUES\s*/iu.exec(statement);
      requireValue(header, "Nicht unterstützte INSERT-Syntax.");
      const table = header[1];
      if (!Object.hasOwn(fields, table)) continue;
      const columns = header[2].split(",").map((column) => {
        const match = /^\s*`([a-zA-Z0-9_]+)`\s*$/u.exec(column);
        requireValue(match, "Ungültiger Spaltenname.");
        return match[1];
      });
      const positions = fields[table].map((column) => {
        requireValue(columns.includes(column), `Spalte ${table}.${column} fehlt.`);
        return columns.indexOf(column);
      });
      for (const row of parseSqlValues(statement.slice(header[0].length), columns.length)) {
        const values = positions.map((position) => row[position]);
        requireValue(Number.isSafeInteger(values[0]) && values[0] > 0, `Ungültige MobyGames-ID in ${table}.`);
        inserts[table].run(...values);
        counts[table] += 1;
      }
    }
    for (const [table, count] of Object.entries(counts)) requireValue(count > 0, `Keine Daten für ${table}.`);
    db.exec("CREATE UNIQUE INDEX games_id ON mobygames(mobyid); CREATE INDEX alttitles_id ON mobygames_alttitles(mobyid); CREATE INDEX releases_id ON mobygames_releases(mobyid); COMMIT");
    const titleIndex = new Map();
    for (const row of db.prepare("SELECT mobyid, title FROM mobygames UNION ALL SELECT mobyid, title FROM mobygames_alttitles").iterate()) {
      if (!row.title) continue;
      const key = normalizeDumpTitle(row.title);
      if (!titleIndex.has(key)) titleIndex.set(key, new Set());
      titleIndex.get(key).add(row.mobyid);
    }
    const getGame = db.prepare("SELECT * FROM mobygames WHERE mobyid = ?");
    const getTitles = db.prepare("SELECT title, info FROM mobygames_alttitles WHERE mobyid = ? ORDER BY title, info");
    const getReleases = db.prepare("SELECT * FROM mobygames_releases WHERE mobyid = ? ORDER BY platform, year, mobyreleaseid");
    const entries = games.map((game) => {
      const ids = new Set([game.name, ...(game.aliases ?? [])].flatMap((title) => [...(titleIndex.get(normalizeDumpTitle(title)) ?? [])]));
      const candidates = [...ids].sort((a, b) => a - b).map((id) => {
        const source = getGame.get(id);
        requireValue(source, `Alternativtitel ohne Spiel: ${id}.`);
        const releases = getReleases.all(id).map(normalizeReleaseCompanies);
        const matchedReleases = releases.filter((release) => platformMatches(game.platforms, release.platform));
        return {
          ...source,
          sourceUrl: `https://www.mobygames.com/game/${id}/`,
          genres: (source.genre ?? "").split(";").map((value) => value.trim()).filter(Boolean),
          alternativeTitles: getTitles.all(id).map((title) => ({ ...title })),
          platformMatch: game.platforms.length ? matchedReleases.length > 0 : null,
          matchingReleaseIds: matchedReleases.map((release) => release.mobyreleaseid),
          releases,
        };
      });
      return {
        gameId: game.id, title: game.name, platforms: game.platforms,
        status: candidates.length ? "needs-identity-review" : "no-exact-title-match",
        candidates,
      };
    });
    const report = {
      version: 1, provider: "mobygames-local-dump", importedAt: new Date().toISOString(),
      source: { fileName: path.basename(input), sha256: sourceHash, bytes: before.size,
        note: "Lokaler SQL-Dump; Importdatum ist kein Abrufdatum bei MobyGames. Keine automatische Faktenfreigabe." },
      importedRows: counts,
      summary: {
        games: entries.length, withCandidates: entries.filter((entry) => entry.candidates.length).length,
        withoutExactMatch: entries.filter((entry) => !entry.candidates.length).length,
        ambiguous: entries.filter((entry) => entry.candidates.length > 1).length,
      },
      games: entries,
    };
    const after = await lstat(input);
    requireValue(before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs
      && await hashFile(input) === sourceHash, "Eingabe wurde während des Imports verändert.");
    await writeJson(output, report);
    requireValue(await readFile(output, "utf8") === `${JSON.stringify(report, null, 2)}\n`, "Exportprüfung fehlgeschlagen.");
    const html = renderDumpReport(report);
    await writeFile(`${htmlOutput}.tmp`, html);
    await rename(`${htmlOutput}.tmp`, htmlOutput);
    requireValue(await readFile(htmlOutput, "utf8") === html, "HTML-Exportprüfung fehlgeschlagen.");
    if (deleteInput) {
      const current = await lstat(input);
      requireValue(current.ino === before.ino && current.size === before.size && current.mtimeMs === before.mtimeMs,
        "Eingabe vor Löschung verändert; Datei bleibt erhalten.");
      await rm(input);
    }
    return report;
  } finally {
    db?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

export function parseDumpArguments(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const option = args[i];
    if (option === "--delete-input") {
      requireValue(!options.deleteInput, "Doppelte Option --delete-input.");
      options.deleteInput = true;
    } else {
      const key = { "--input": "input", "--output": "output" }[option];
      requireValue(key && !options[key], `Unbekannte oder doppelte Option: ${option}`);
      requireValue(args[i + 1] && !args[i + 1].startsWith("--"), `Pfad fehlt für ${option}.`);
      options[key] = path.resolve(args[++i]);
    }
  }
  requireValue(options.input, "--input ist erforderlich.");
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseDumpArguments(process.argv.slice(2));
    const report = await importGameDump(options);
    console.log(`${report.summary.withCandidates}/${report.summary.games} Spiele mit Treffern; ${report.summary.ambiguous} mehrdeutig; ${report.summary.withoutExactMatch} ohne exakten Treffer.`);
    console.log(`Export: ${options.output ?? path.join(root, "cache/game-metadata/local-dump/report.json")}`);
    if (options.deleteInput) console.log("SQL-Eingabe nach erfolgreicher Exportprüfung gelöscht.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
