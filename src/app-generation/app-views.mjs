import { escapeHtml as e, externalLink } from "../site-generation/site-html.mjs";
import { descriptionHtml } from "../site-generation/widget/video-panel.mjs";
import { gameDiscussions } from "../site-generation/widget/game-discussions.mjs";
import { archiveLinks } from "../site-generation/widget/archive-links.mjs";
import { dateLabel, durationLabel } from "../site-generation/site-format.mjs";
import { httpUrl } from "../shared/http-url.mjs";
import { projectInfo, projectLinks, externalContentNotice, generalPageAliases } from "../content-data/project-info.mjs";
import { siteProcess } from "../content-data/site-process.mjs";
import { processDiagram, processExplanation } from "../site-generation/widget/process-diagram.mjs";

export const appHref = (route = "", video, seconds) => `#/${route}${video ? `?video=${encodeURIComponent(video)}${seconds === undefined ? "" : `&t=${seconds}`}` : ""}`;
const link = (route, label) => `<a href="${e(appHref(route))}">${e(label)}</a>`;
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const videosCount = (ids) => count(ids.length, "Video", "Videos");
const itemList = (items) => `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
const options = (values, label) => `<option value="">${label}</option>${[...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b, "de"))
  .map((value) => `<option value="${e(value)}">${e(value)}</option>`).join("")}`;
const date = (video) => video.publishedAt ? dateLabel(video.publishedAt) : "Datum unbekannt";
const total = (videos) => {
  const known = videos.filter((video) => video.durationSeconds !== null);
  const minutes = Math.round(known.reduce((sum, video) => sum + video.durationSeconds, 0) / 60);
  const time = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} h`;
  return known.length === videos.length ? time : `Bekannte Laufzeit: ${time} (${known.length} von ${videos.length} Videos)`;
};
const gameData = (game) => game.metadata?.status === "ready" ? game.metadata.data : {};
const platforms = (game) => game.platforms.length ? game.platforms : gameData(game).scope?.platforms ?? [];

export function publicVideoRoute(video) {
  return video.magazines.find((magazine) => magazine.issue?.route)?.issue.route ?? video.games[0]?.route ?? video.detailRoute ?? "news/";
}

export function parseAppRoute(hash) {
  if (hash === "#inhalt") return null;
  const url = new URL((hash.replace(/^#\/?/u, "") || "./"), "https://app.invalid/");
  if (url.origin !== "https://app.invalid") throw new Error("Ungültige App-Route.");
  const seconds = url.searchParams.has("t") ? Number(url.searchParams.get("t")) : undefined;
  if (seconds !== undefined && (!Number.isInteger(seconds) || seconds < 0)) throw new Error("Ungültige Kapitelzeit.");
  const route = url.pathname.slice(1);
  return { route: Object.hasOwn(generalPageAliases, route) ? generalPageAliases[route] : route, videoId: url.searchParams.get("video"), seconds };
}

export function videoList(videos, route) {
  return `<div class="app-videos">${videos.map((video) => {
    const target = route ?? publicVideoRoute(video);
    return `<article><h3><a href="${e(appHref(target, video.id))}">${e(video.title)}</a></h3>
<div class="app-preview"><img data-online-src="${e(video.thumbnailUrl)}" width="320" height="180" alt="${e(`Videovorschau: ${video.title}`)}" loading="lazy">
<div><p>${e(date(video))}${video.durationSeconds === null ? "" : ` · ${durationLabel(video.durationSeconds)}`}</p>
<p>${e(video.description.slice(0, 240))}${video.description.length > 240 ? " …" : ""}</p></div></div></article>`;
  }).join("")}</div>`;
}

function gameRows(games, model) {
  return games.map((game) => {
    const videos = game.videos.map((id) => model.videoById.get(id));
    const first = videos.filter((video) => video.publishedTime !== null).sort((a, b) => a.publishedTime - b.publishedTime)[0];
    return { game, videos, first, time: videos.some((video) => video.durationSeconds === null) ? null : videos.reduce((sum, video) => sum + video.durationSeconds, 0) };
  });
}

export function filterGames(games, { search = "", platform = "", genre = "" }) {
  return games.filter((game) => game.name.toLocaleLowerCase("de").includes(search.trim().toLocaleLowerCase("de"))
    && (!platform || (platform === "__unknown__" ? !platforms(game).length : platforms(game).includes(platform)))
    && (!genre || (genre === "__unknown__" ? !gameData(game).genres?.length : gameData(game).genres?.includes(genre))));
}

export function gameTableBody(games, model, sort = "video", direction = -1) {
  const rows = gameRows(games, model);
  const value = (row) => sort === "title" ? row.game.name : sort === "release" ? row.game.releaseYear
    : sort === "duration" ? row.time : row.first?.publishedTime ?? null;
  rows.sort((a, b) => {
    const av = value(a), bv = value(b);
    if (av === null || bv === null) return av === null ? (bv === null ? a.game.name.localeCompare(b.game.name, "de") : 1) : -1;
    return direction * (typeof av === "string" ? av.localeCompare(bv, "de") : av - bv) || a.game.name.localeCompare(b.game.name, "de");
  });
  return rows.map(({ game, videos, first }) => `<tr><td>${first ? new Date(first.publishedAt).getUTCFullYear() : "Unbekannt"}</td>
<th scope="row">${link(game.route, game.name)}</th><td>${game.releaseYear ?? "Unbekannt"}</td>
<td>${platforms(game).map(e).join("<br>") || "Unbekannt"}</td><td>${(gameData(game).genres ?? []).map(e).join("<br>") || "Unbekannt"}</td>
<td>${first ? `<a href="${e(appHref(game.route, first.id))}"><img data-online-src="${e(first.thumbnailUrl)}" width="128" height="72" alt="${e(`Videovorschau: ${game.name}`)}" loading="lazy"></a>` : "Unbekannt"}</td>
<td>${e(total(videos))}</td><td>${[
    ...game.playlists.map((playlist) => externalLink(playlist.url, playlist.title)),
    ...(gameData(game).evidence?.sourceUrl ? [externalLink(gameData(game).evidence.sourceUrl, "MobyGames")] : []),
    ...game.series.entries.filter((entry) => entry.phase.id === "conclusion").slice(0, 1)
      .map((entry) => `<a href="${e(appHref(game.route, entry.videoId))}">Abschlussgespräch</a>`),
  ].join("<br>")}</td></tr>`).join("");
}

function gamesView(games, model, table = false) {
  return `<form id="app-game-filters"><label>System<select name="platform">${options(games.flatMap(platforms), "Alle Systeme")}<option value="__unknown__">System unbekannt</option></select></label>
<label>Genre<select name="genre">${options(games.flatMap((game) => gameData(game).genres ?? []), "Alle Genres")}<option value="__unknown__">Genre unbekannt</option></select></label>
<label>Spieletitel<input type="search" name="search" placeholder="Spiel suchen"></label><button type="reset" aria-label="Filter zurücksetzen" title="Filter zurücksetzen">↺</button></form>
<p id="app-game-count" role="status">${games.length} von ${count(games.length, "Spiel", "Spielen")}</p>
${table ? `<div class="overflow-auto" role="region" aria-label="Spieletabelle" tabindex="0"><table class="app-game-table"><thead><tr>
${[["video", "Erstvideo"], ["title", "Titel"], ["release", "Jahr"]].map(([key, label]) => `<th scope="col" aria-sort="${key === "video" ? "descending" : "none"}"><button data-sort="${key}">${label} ↕</button></th>`).join("")}
<th scope="col">Plattform</th><th scope="col">Genre</th><th scope="col">Videovorschau</th><th scope="col" aria-sort="none"><button data-sort="duration">Länge ↕</button></th><th scope="col">Weiteres</th></tr></thead><tbody id="app-game-results">${gameTableBody(games, model)}</tbody></table></div>`
    : `<div class="app-grid" id="app-game-results">${gameCards(games, model)}</div>`}`;
}

export function gameCards(games, model) {
  return games.map((game) => `<article><h2>${link(game.route, game.name)}</h2><p>${e(platforms(game).join(", ") || "System unbekannt")}</p>
<p>Erscheinungsjahr: ${game.releaseYear ?? "Unbekannt"}</p><p>${videosCount(game.videos)}</p>
<p>${e(total(game.videos.map((id) => model.videoById.get(id))))}</p></article>`).join("");
}

function gameMetadata(game, model) {
  const data = gameData(game);
  const values = (field, names) => names.map((name) => {
    const filter = model.gameFilters.find((filter) => filter.field === field && filter.name === name);
    return filter ? link(filter.route, name) : e(name);
  }).join(", ") || "Unbekannt";
  // Filter routes carry their field through export, not a second slug algorithm.
  return `<dl class="app-metadata"><dt>System</dt><dd>${values("platform", platforms(game))}</dd>
<dt>Erscheinungsjahr</dt><dd>${game.releaseYear ?? "Unbekannt"}</dd><dt>Genre</dt><dd>${values("genre", data.genres ?? [])}</dd>
<dt>Entwickler</dt><dd>${values("developer", [...new Set((data.releases ?? []).map((release) => release.developer).filter(Boolean))])}</dd>
<dt>Publisher</dt><dd>${values("publisher", [...new Set((data.releases ?? []).map((release) => release.publisher).filter(Boolean))])}</dd></dl>
${data.evidence?.sourceUrl ? `<p>Quelle: ${externalLink(data.evidence.sourceUrl, "Spielemetadaten")}</p>` : ""}
${data.releases?.length ? `<details><summary>Entwickler, Publisher und Veröffentlichungen</summary>${itemList(data.releases.map((release) =>
    e([release.platform, release.year, release.developer, release.publisher, release.countries].filter(Boolean).join(" · "))))}</details>` : ""}
${data.additionalReleases?.length ? `<details><summary>Weitere Veröffentlichungen</summary>${itemList(data.additionalReleases.map((release) =>
    `${externalLink(release.sourceUrl, release.title)}${itemList(release.releases.map((item) => e(Object.values(item).filter(Boolean).join(" · "))))}`))}</details>` : ""}`;
}

function detail(videos, title, route, state, prefix = "", game) {
  const selected = state.videoId ? videos.find((video) => video.id === state.videoId) : videos[0];
  if (!selected) throw new Error("Das ausgewählte Video gehört nicht zu dieser Ansicht.");
  const index = videos.indexOf(selected);
  const entry = game?.series.entries.find((item) => item.videoId === selected.id);
  const run = game?.series.runs.find((item) => item.id === entry?.runId);
  return {
    title, route, selected, videos, seconds: state.seconds,
    body: `${prefix}<p>${videosCount(videos)} · ${e(total(videos))}</p>
<label>Video auswählen<select id="app-video-select">${videos.map((video, i) => `<option value="${e(video.id)}"${video === selected ? " selected" : ""}>${i + 1}. ${e(video.title)}</option>`).join("")}</select></label>
<section aria-label="Videoplayer"><div id="app-player"></div>
<p id="app-player-notice" role="status"></p><div class="app-player-controls"><button id="app-player-enable">YouTube-Player aktivieren</button>
<button id="app-player-reset" hidden>YouTube-Aktivierung zurücksetzen</button>
${videos.length > 1 ? '<label><input type="checkbox" id="app-auto-next"> Nächste Folge automatisch</label>' : ""}
${externalLink(selected.url, "Video auf YouTube ansehen")}</div></section>
<h2>${e(selected.title)}</h2><p>${e(date(selected))}${selected.durationSeconds === null ? "" : ` · ${durationLabel(selected.durationSeconds)}`}</p>
${entry ? `<p>${e(entry.phase.label)}${run ? ` · ${e(run.label)}` : ""}</p>` : ""}
${!game ? gameDiscussions(selected, {
    timestampHref: (seconds) => appHref(route, selected.id, seconds),
    hint: "Zeitmarken öffnen die gewählte Stelle im App-Player. Videos benötigen eine Internetverbindung.",
  }) : ""}
<div class="description">${descriptionHtml(selected.descriptionWithoutChapters || selected.description, selected.playlists)}</div>
${selected.chapters.length ? `<h3>Kapitel und Zeitmarken</h3>${itemList(selected.chapters.map((chapter) =>
    `<a href="${e(appHref(route, selected.id, chapter.seconds))}">${durationLabel(chapter.seconds)} · ${e(chapter.label)}</a> ${externalLink(chapter.url, "YouTube")}`))}` : ""}
${selected.mentionedChannels.length ? `<h3>Erwähnte Kanäle und Partner</h3>${itemList(selected.mentionedChannels.map((channel) => externalLink(channel.url, channel.label)))}` : ""}
${selected.magazines.length ? `<h3>Zeitschriften und Ausgaben</h3>${itemList(selected.magazines.map((magazine) =>
    `${link(magazine.issue?.route ?? magazine.route, `${magazine.name}${magazine.issue ? ` – ${magazine.issue.label}` : ""}`)} ${archiveLinks(magazine.archives)}`))}` : ""}
${selected.games.length ? `<h3>Spiele</h3>${itemList(selected.games.map((game) => link(game.route, game.name)))}` : ""}
<nav aria-label="Videoteile">${index ? `<a href="${e(appHref(route, videos[index - 1].id))}">← Vorheriger Teil</a>` : ""}
${index + 1 < videos.length ? `<a href="${e(appHref(route, videos[index + 1].id))}">Nächster Teil →</a>` : ""}</nav>`,
  };
}

const help = `<p>Diese App erzeugt ihre Ansichten direkt auf deinem Gerät aus gespeicherten Katalogdaten. Die öffentliche Website bleibt dabei unverändert.</p>
<h2>Auf dem iPhone installieren</h2><ol><li>Öffne diese App in Safari.</li><li>Öffne das Teilen-Menü und wähle „Zum Home-Bildschirm“.</li>
<li>Öffne die installierte App mit Internetverbindung und warte auf „Offline bereit“.</li><li>Danach kannst du den Katalog auch im Flugmodus nutzen.</li></ol>
<p>Die App lädt bei der Einrichtung alle Video-Vorschaubilder direkt von YouTube in einen eigenen lokalen Zwischenspeicher (Cache). Den Fortschritt siehst du oben. Fehlende Bilder kannst du mit „Erneut versuchen“ nachladen.
Gespeicherte Vorschaubilder sind offline verfügbar. Videos und externe Quellen benötigen weiterhin eine Internetverbindung. Das Betriebssystem kann gespeicherte Daten entfernen.
Der Speicherstatus gilt jeweils für die geöffnete App. Ein Download in Safari garantiert nicht, dass die Daten auch in der installierten App gespeichert sind.</p>
<h2>Updates und Speicher</h2><p>Die App prüft beim Öffnen auf Updates. Ein vollständig heruntergeladenes Update wird erst nach deiner Bestätigung aktiviert.
Ein abgebrochenes Update ersetzt den bisherigen Offline-Stand nicht. Während eines Updates wird vorübergehend mehr Platz benötigt.</p>
<button id="app-check-update">Auf Updates prüfen</button> <button id="app-request-storage">Dauerhafte Speicherung anfragen</button>
<details><summary>App-Daten entfernen</summary><p>Hier kannst du die Offline-Caches dieser App und ihre Einstellungen löschen. Die öffentliche Website bleibt unverändert.
Anschließend ist eine erneute Einrichtung mit Internetverbindung erforderlich.</p><button id="app-clear">Offline-Daten und App-Einstellungen löschen</button></details>`;

export function renderView(model, state) {
  let { route } = state;
  const originalRoute = route;
  const pageMatch = /(?:^|\/)seite\/(\d+)\/$/u.exec(route);
  const page = pageMatch ? Number(pageMatch[1]) : 1;
  if (pageMatch) route = route.slice(0, pageMatch.index + (pageMatch.index ? 1 : 0));
  const start = (page - 1) * 60;
  const listing = (videos, base) => {
    if (!Number.isSafeInteger(page) || page < 1 || start >= Math.max(1, videos.length)) throw new Error("Diese Seite existiert nicht.");
    const paged = videos.slice(start, start + 60);
    return videoList(paged) + `<nav aria-label="Seiten">${page > 1 ? link(`${base}${page === 2 ? "" : `seite/${page - 1}/`}`, "← Vorherige Seite") : ""}
${start + 60 < videos.length ? link(`${base}seite/${page + 1}/`, "Nächste Seite →") : ""}</nav>`;
  };
  const byIds = (ids) => ids.map((id) => model.videoById.get(id));
  if (route === siteProcess.route) return { title: siteProcess.title, body: `${processDiagram()}${processExplanation()}` };
  const info = projectInfo.find((entry) => entry.route === route);
  if (info) return { title: info.title, body: `${info.paragraphs.map((text) => `<p>${e(text)}</p>`).join("\n")}
<h2>Weiterführende Links</h2>
${itemList([
    ...projectLinks.filter((entry) => !entry.aboutOnly || info.route === "about/")
      .map((entry) => `${externalLink(entry.url, entry.label)}: ${e(entry.description)}`),
    `${link(siteProcess.route, "So entsteht diese Website")}: Das Zusammenspiel von GitHub Actions, GitHub Pages, Cloudflare und YouTube.`,
  ])}` };
  if (route === "") return { title: "Pretty Old Pixel in Zahlen", body: `<p>${videosCount(model.videos)} · ${model.games.length} Spiele · ${model.magazines.length} Zeitschriften</p>
<div class="app-grid">${model.navigation.map((item) => `<article><h2>${link(item.route, item.name)}</h2></article>`).join("")}</div>
<h2>Neueste Videos</h2>${videoList(model.news.slice(0, 10))}` };
  if (route === "hilfe/") return { title: "Installation und Speicher", body: help };
  if (route === "privacy/") return { title: "Datenschutz der Offline-App", body: `<p>Der lokale Speicher enthält veröffentlichte Katalogdaten, App-Code, Logos und Icons.
Zusätzlich lädt die App beim Einrichten und Ergänzen alle Video-Vorschaubilder direkt von i.ytimg.com in einen lokalen Cache. Diese Abrufe und aktivierte Player übertragen insbesondere die IP-Adresse und technische Daten an YouTube/Google.
Die Bildabrufe erfolgen ohne Zugangsdaten und ohne Referrer. Bereits gespeicherte Bilder werden bei Updates wiederverwendet. Videos werden nicht offline gespeichert. Es gibt kein eigenes Tracking.
Die App speichert deine Einstellungen für den Darstellungsmodus, die Player-Aktivierung und die automatische Folgenfortsetzung.</p>
<h2>Externe Inhalte und Logos</h2><p>${e(externalContentNotice)}</p>
<p>Die App wird bei GitHub Pages gehostet und über Cloudflare als vorgeschalteten Proxy und CDN ausgeliefert. Beim Online-Download und bei Update-Abfragen können beide Anbieter technische Zugriffsdaten einschließlich der IP-Adresse verarbeiten; bei Cloudflare ist auch eine Verarbeitung außerhalb der EU beziehungsweise des EWR möglich. Wir setzen keine Cloudflare Web Analytics, kein Turnstile und keine von uns bewusst aktivierten Bot-Challenges ein. Die App lädt Updates beim Öffnen mit Internetverbindung. Der Offline-Start benötigt keine Verbindung.</p>
<p>${link(siteProcess.route, "Zusammenspiel der Dienste")}: GitHub Actions, GitHub Pages, Cloudflare und YouTube.</p>
<p>Das Entfernen des Home-Bildschirm-Icons garantiert nicht das Löschen aller Website-Daten. ${link("hilfe/", "App-Daten gezielt löschen")}.
Weitere Hosting- und Medienhinweise: <a href="../privacy/">Datenschutz der öffentlichen Website</a>.</p>` };
  if (route === "news/") return { title: "News", body: listing(model.videos.filter((video) => video.publishedAt), "news/") };
  if (route === "spiele/" || route === "spiele/uebersicht/") {
    const table = route === "spiele/uebersicht/";
    return { title: table ? "Alle Spiele als Tabelle" : "Spiele", games: model.games, table,
      body: `<p>${link(table ? "spiele/" : "spiele/uebersicht/", table ? "Zur Spiele-Kachelübersicht" : "Alle Spiele als Tabelle")}</p>${gamesView(model.games, model, table)}` };
  }
  const game = model.games.find((game) => game.route === route);
  if (game) return detail(byIds(game.videos), game.name, route, state, gameMetadata(game, model), game);
  if (route === "zeitschriften/") return { title: "Zeitschriften", body: `<div class="app-grid">${model.magazines.map((magazine) => `<article><h2>${link(magazine.route, magazine.name)}</h2>
${magazine.logo ? `<img class="app-logo" data-local-src="${e(magazine.logo.asset)}" alt="${e(magazine.name)}">` : ""}
<p>${videosCount(magazine.videos)} · ${count(magazine.issues.length, "Ausgabe", "Ausgaben")}</p></article>`).join("")}</div>
<h2>Blätterabend mit Gast</h2>${itemList(model.magazineGuests.map((guest) => `${link(guest.route, guest.name)} (${videosCount(guest.videoIds)})`))}
${model.unresolvedMagazines.length ? `<h2>Weitere Blätterabende</h2>${videoList(model.unresolvedMagazines)}` : ""}` };
  const guest = model.magazineGuests.find((guest) => guest.route === route);
  if (guest) return { title: `Blätterabend mit ${guest.name}`, body: `${guest.channelUrl ? externalLink(guest.channelUrl, guest.name) : ""}${listing(byIds(guest.videoIds), route)}` };
  const magazine = model.magazines.find((magazine) => magazine.route === route);
  if (magazine) {
    const years = [...new Set(magazine.issues.map((issue) => issue.year))].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
    const known = years.filter((year) => year !== null);
    const calendar = known.length ? `<div class="overflow-auto" role="region" aria-label="Ausgabenkalender" tabindex="0"><table><caption>Ausgaben nach Jahr und Monat / Nummer</caption>
<thead><tr><th scope="col">Ausgabe</th>${known.map((year) => `<th scope="col">${year}</th>`).join("")}</tr></thead><tbody>
${Array.from({ length: 12 }, (_, index) => `<tr><th scope="row">${index + 1}</th>${known.map((year) => `<td>${magazine.issues.filter((issue) =>
      !issue.special && issue.year === year && (issue.months[0] ?? issue.number) === index + 1).map((issue) => link(issue.route, issue.label)).join(" · ")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : "";
    return { title: magazine.name, body: `${calendar}${years.map((year) => `<section><h2>Jahrgang ${year ?? "unbekannt"} – Ausgaben</h2>${itemList(magazine.issues.filter((issue) => issue.year === year).map((issue) =>
      `${link(issue.route, issue.label)}${issue.special ? " (Sonderheft)" : ""} (${videosCount(issue.videos)}) ${archiveLinks(issue.archives)}`))}</section>`).join("")}<h2>Alle Videos</h2>${listing(byIds(magazine.videos), route)}` };
  }
  for (const magazine of model.magazines) {
    const issue = magazine.issues.find((issue) => issue.route === route);
    if (issue) return detail(byIds(issue.videos), `${magazine.name} ${issue.label}`, route, state, archiveLinks(issue.archives));
  }
  const section = model.sections.find((section) => section.route === route);
  if (section) return { title: section.name, body: `<p>${e(section.description)}</p>${listing(byIds(section.entries.map((entry) => entry.videoId)), route)}` };
  const standalone = model.videos.filter((video) => video.detailRoute === route);
  if (standalone.length) return detail(standalone, standalone[0].title, route, state);
  const filter = model.gameFilters?.find((filter) => filter.route === route);
  if (filter) {
    const games = model.games.filter((game) => filter.games.includes(game.id));
    return { title: `${filter.label}: ${filter.name}`, games, body: gamesView(games, model) };
  }
  return { title: "Seite nicht gefunden", body: `<p>Die App kennt die Adresse „${e(originalRoute)}“ nicht.</p>${link("", "Zur Startseite")}` };
}

export function publicAddress(model, state, view) {
  const address = new URL(state.route === "hilfe/" ? "" : state.route, model.publicUrl);
  if (view.selected) address.hash = `video-${view.selected.id}`;
  if (state.seconds !== undefined) address.searchParams.set("t", state.seconds);
  return httpUrl(address.href);
}
