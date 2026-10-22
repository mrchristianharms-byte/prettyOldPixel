import { escapeHtml, externalLink } from "../site-html.mjs";
import { videoLink } from "../site-video-links.mjs";

export function gameTable(rows, config) {
  const options = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "de"))
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  const sortableHeading = (label, key, sortLabel) => `<th scope="col"${key === "video" ? ' aria-sort="descending"' : ""}>${label} <button type="button" class="game-table-sort" data-game-sort="${key}" data-sort-label="${sortLabel}" aria-label="${sortLabel}: aufsteigend sortieren" hidden><span aria-hidden="true">↕</span></button></th>`;
  return `<section data-game-table>
<div class="game-table-toolbar">
<p class="game-table-summary" role="status" aria-live="polite"><span data-game-table-count>${rows.length} von ${rows.length} ${rows.length === 1 ? "Spiel" : "Spielen"}</span>
<span data-game-table-filters>Filter: Alle Systeme · Alle Genres</span>
<span data-game-table-sort>Sortierung: Erstes Video: neueste zuerst</span></p>
<div class="game-table-controls" data-game-table-controls hidden>
<fieldset><legend>Filter</legend>
<label for="game-search">Spieletitel<input type="search" id="game-search" data-game-search placeholder="Spiel suchen"></label>
<div class="game-table-control-pair"><label for="game-platform">System<select id="game-platform" data-game-platform>
<option value="">Alle Systeme</option>${options(rows.flatMap((row) => row.platforms))}<option value="__unknown__">System unbekannt</option>
</select></label>
<label for="game-genre">Genre<select id="game-genre" data-game-genre>
<option value="">Alle Genres</option>${options(rows.flatMap((row) => row.genres))}<option value="__unknown__">Genre unbekannt</option>
</select></label></div>
<button type="button" class="secondary" data-game-reset>Filter zurücksetzen</button></fieldset>
</div>
</div>
<div class="overflow-auto" role="region" aria-label="Gesamtübersicht aller Spiele" tabindex="0">
<table class="game-table">
<caption class="visually-hidden">Alle Systeme · Alle Genres · Erstes Video: neueste zuerst</caption>
<thead><tr>${sortableHeading("Erstes Video", "video", "Erstes Video")}${sortableHeading("Titel", "title", "Titel (Alphabet)")}${sortableHeading("Erscheinungsjahr", "release", "Erscheinungsjahr des Spiels")}<th scope="col">Plattform</th><th scope="col">Genre</th><th scope="col">Videovorschau</th>${sortableHeading("Videolaufzeit", "duration", "Videolaufzeit")}<th scope="col">Weiteres</th></tr></thead>
<tbody>${rows.map((row) => `<tr data-video="${row.video.publishedTime ?? ""}" data-release="${row.releaseYear ?? ""}" data-title="${escapeHtml(row.name)}" data-duration="${row.durationSeconds ?? ""}" data-platforms="${escapeHtml(JSON.stringify(row.platforms))}" data-genres="${escapeHtml(JSON.stringify(row.genres))}">
<td>${escapeHtml(row.firstYear ?? "Unbekannt")}</td>
<th scope="row"><a href="${config.href(row.route)}">${escapeHtml(row.name)}</a></th>
<td>${escapeHtml(row.releaseYear ?? "Unbekannt")}</td>
<td>${row.platforms.map((platform) => escapeHtml(platform)).join("<br>") || "Unbekannt"}</td>
<td>${row.genres.map((genre) => escapeHtml(genre)).join("<br>") || "Unbekannt"}</td>
<td><a href="${config.href(row.route)}"><img src="${escapeHtml(row.video.thumbnailUrl)}" alt="${escapeHtml(`Videovorschau zu ${row.name}: ${row.video.title}`)}" width="320" height="180" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a></td>
<td>${escapeHtml(row.duration)}</td>
<td class="game-table-links">${[
    ...row.playlists.map((playlist, index) => externalLink(playlist.url, row.playlists.length === 1 ? "Playlist" : `Playlist ${index + 1}`)),
    ...(row.mobyGamesUrl ? [externalLink(row.mobyGamesUrl, "Moby")] : []),
    ...(row.conclusionVideo ? [videoLink(row.conclusionVideo, config, "Abschlußgespräch", row.route)] : []),
  ].join("<br>") || "Nicht verfügbar"}</td>
</tr>`).join("")}</tbody>
</table></div>
<p data-game-table-empty hidden>Keine Spiele für diese Suche und Filter gefunden.</p>
</section>`;
}
