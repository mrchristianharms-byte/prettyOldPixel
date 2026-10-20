import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gameDefinitions } from "../data/data-games.mjs";
import { loadReadyGameMetadata } from "./game-metadata-ready.mjs";
import { escapeHtml } from "../site-generation/site-html.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
export function renderGameMetadataReview(reader, games = gameDefinitions) {
  const cards = games.map((game) => {
    const record = reader.get(game.id);
    const data = record.data;
    const selection = record.selection;
    return `<details class="game" data-search="${escapeHtml([game.name, game.id, ...game.platforms].join(" "))}">
<summary>${escapeHtml(game.name)} · ${record.status === "ready" ? "nutzbar" : "unverifiziert"}</summary>
<p>${escapeHtml(record.reason)} · Plattform: ${escapeHtml(selection.platforms.join(", ") || "offen")}
· Kandidaten: ${escapeHtml(selection.consideredIds.join(", ") || "keine")}</p>
${data ? `<p><a href="${data.evidence.sourceUrl}">MobyGames ${data.identity.id}</a> · Genre: ${escapeHtml(data.genres.join(", ") || "keine Angabe")}
· Jahr im Plattformumfang: ${data.releaseYear ?? "unbekannt"} · ${data.releases.length} Veröffentlichungen</p>` : ""}
${(data?.additionalReleases ?? []).map((entry) => `<p>Zusätzliche Veröffentlichung:
<a href="${entry.sourceUrl}">${escapeHtml(entry.title)}</a> · ${escapeHtml(entry.platforms.join(", "))}
· ${entry.releases.length} Veröffentlichungen</p>`).join("")}
</details>`;
  }).join("\n");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spielmetadaten: Dump-Prüfung</title><style>body{font:16px system-ui;max-width:1100px;margin:2rem auto;padding:0 1rem}
details{border:1px solid #aaa;padding:1rem;margin:.5rem 0}summary{cursor:pointer}[hidden]{display:none}</style></head>
<body><h1>Spielmetadaten: Dump-Prüfung</h1>
<p>${reader.summary.games} Spiele · ${reader.summary.ready} nutzbar · ${reader.summary.blocked} unverifiziert.</p>
<p>Einzige Metadatenquelle: lokaler Games-Dump. Bekannte Plattformen bleiben erhalten; sonst DOS, Amiga, C64, NES, SNES. Mehrdeutige Titel bleiben gesperrt.</p>
<label>Suche <input id="search" type="search"></label>${cards}
<script>document.querySelector("#search").addEventListener("input",event=>{const query=event.target.value.toLocaleLowerCase("de");
for(const game of document.querySelectorAll(".game"))game.hidden=!game.dataset.search.toLocaleLowerCase("de").includes(query);});</script>
</body></html>`;
}

export function parseReviewArguments(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = { "--cache-dir": "cacheDir", "--output": "output" }[args[i]];
    if (!key || options[key] || !args[i + 1] || args[i + 1].startsWith("--")) {
      throw new Error("Aufruf: npm run dev:review:games -- [--cache-dir <pfad>] [--output <html-pfad>]");
    }
    options[key] = path.resolve(args[++i]);
  }
  return options;
}

export async function generateGameMetadataReview({
  cacheDir = path.join(root, "cache/game-metadata"), output = path.join(cacheDir, "identity-review.html"),
} = {}) {
  if (path.extname(output) !== ".html") throw new Error("Prüfübersicht: HTML-Ausgabe erforderlich.");
  const reader = await loadReadyGameMetadata({ cacheDir });
  const html = renderGameMetadataReview(reader);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(`${output}.tmp`, html);
  await rename(`${output}.tmp`, output);
  return { output, gameCount: reader.summary.games };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await generateGameMetadataReview(parseReviewArguments(process.argv.slice(2)));
    console.log(`${result.gameCount} Spiele: ${result.output}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
