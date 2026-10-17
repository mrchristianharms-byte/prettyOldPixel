import { catalogRoute, paginatedRoute } from "./site-config.mjs";
import { httpUrl } from "./site-data.mjs";

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function jsonLd(value) {
  return JSON.stringify(value).replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e")
    .replace(/&/gu, "\\u0026").replace(/\u2028/gu, "\\u2028").replace(/\u2029/gu, "\\u2029");
}

const externalMark = '<span aria-hidden="true">↗</span><span class="visually-hidden"> (externe Website)</span>';
export function externalLink(url, label, target = "") {
  const safe = httpUrl(url);
  if (!safe) throw new Error(`Ungültiger externer Link: ${url}`);
  return `<a href="${escapeHtml(safe)}" rel="external"${target ? ` target="${escapeHtml(target)}"` : ""}>${escapeHtml(label)} ${externalMark}</a>`;
}

export function descriptionHtml(description) {
  return description.split(/\n{2,}/u).map((paragraph) => {
    let result = "";
    let offset = 0;
    for (const match of paragraph.matchAll(/https?:\/\/[^\s<>"']+/gu)) {
      const url = match[0].replace(/[.,;!?)\]]+$/u, "");
      result += escapeHtml(paragraph.slice(offset, match.index));
      result += httpUrl(url) ? externalLink(url, url) : escapeHtml(url);
      offset = match.index + url.length;
    }
    return `<p>${result}${escapeHtml(paragraph.slice(offset))}</p>`;
  }).join("\n");
}

function excerpt(text, length = 160) {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 1).trimEnd()}…` : normalized;
}

function dateLabel(iso) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(iso));
}

function videoDate(video) {
  return video.publishedAt
    ? `<time datetime="${video.publishedAt}">${dateLabel(video.publishedAt)} Uhr (Europe/Berlin)</time>`
    : "Veröffentlichungsdatum unbekannt";
}

function durationLabel(seconds) {
  if (seconds === null) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours ? `${hours}:` : ""}${hours ? String(minutes).padStart(2, "0") : minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function magazineLinks(magazine, config) {
  return `<a href="${config.href(magazine.route)}">${escapeHtml(magazine.name)}</a>${magazine.yearRoute
    ? ` · <a href="${config.href(magazine.yearRoute)}">Jahrgang ${magazine.issue.year}</a>` : ""}${magazine.issue
    ? ` · ${magazine.issue.route ? `<a href="${config.href(magazine.issue.route)}">${escapeHtml(magazine.issue.label)}</a>` : escapeHtml(magazine.issue.label)}` : ""}`;
}

function topics(video, config) {
  const games = video.games.length ? `<p class="topics">Spiele: ${video.games.map((game) => `<a href="${config.href(game.route)}">${escapeHtml(game.name)}</a>`).join(" · ")}</p>` : "";
  if (!video.blaetterabend) return games;
  return `${games}<p class="topics"><a href="${config.href("zeitschriften/")}">Blätterabend / Zeitschriften</a>: ${video.magazines.length
    ? video.magazines.map((magazine) => magazineLinks(magazine, config)).join(" · ")
    : "Zeitschrift ungeklärt"}</p>`;
}

export function videoHref(video, config, issueRoute) {
  const route = issueRoute ?? video.magazines.find((magazine) => magazine.issue?.route)?.issue.route ?? video.games[0]?.route;
  return route ? `${config.href(route)}#video-${video.id}` : video.url;
}

function videoLink(video, config, label = video.title, issueRoute) {
  const href = videoHref(video, config, issueRoute);
  return href.startsWith(config.basePath)
    ? `<a href="${href}">${escapeHtml(label)}</a>` : externalLink(href, label);
}

function videoList(videos, config) {
  if (!videos.length) return "<p>Noch keine Videos mit bekanntem Veröffentlichungsdatum.</p>";
  return `<ol class="video-list">${videos.map((video) => `<li><article>
<h2>${videoLink(video, config)}</h2>
<p class="meta">${videoDate(video)}${video.durationSeconds !== null ? ` · ${durationLabel(video.durationSeconds)}` : ""}</p>
${topics(video, config)}
${video.description ? `<p>${escapeHtml(excerpt(video.description, 220))}</p>` : ""}
</article></li>`).join("\n")}</ol>`;
}

function latestPublication(videos) {
  const times = videos.map((video) => video.publishedTime).filter((value) => value !== null);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

function collectionSchema(videos, config, route, issueRoute) {
  return {
    "@type": "CollectionPage",
    "@id": `${config.absolute(route)}#page`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: videos.map((video, index) => ({
        "@type": "ListItem", position: index + 1, name: video.title,
        url: video.route ? config.absolute(video.route) : new URL(videoHref(video, config, issueRoute), config.baseUrl).href,
      })),
    },
  };
}

function breadcrumbsMarkup(crumbs, config) {
  return `<nav aria-label="Brotkrümelnavigation"><ol class="breadcrumbs">${crumbs.map((crumb, index) => `<li>${index === crumbs.length - 1
    ? `<span aria-current="page">${escapeHtml(crumb.name)}</span>`
    : `<a href="${config.href(crumb.route)}">${escapeHtml(crumb.name)}</a>`}</li>`).join("")}</ol></nav>`;
}

function layout({ route, title, description, body, schema, crumbs, image, noindex = false, previous, next, interactive = false }, config, cssHref, hasMagazines, jsHref, hasGames) {
  const canonical = config.absolute(route);
  const fullTitle = `${title} | ${config.name}`;
  const breadcrumbSchema = {
    "@type": "BreadcrumbList",
    "@id": `${canonical}#breadcrumbs`,
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem", position: index + 1, name: crumb.name, item: config.absolute(crumb.route),
    })),
  };
  const navigation = [["", "Startseite"], ["news/", "News"], ...(hasMagazines ? [["zeitschriften/", "Zeitschriften"]] : []), ...(hasGames ? [["spiele/", "Spiele"]] : []), ["videos/", "Alle Videos"]];
  const selected = ["videos/", "zeitschriften/", "spiele/"].find((prefix) => route.startsWith(prefix)) ?? route;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description)}">
${noindex ? '<meta name="robots" content="noindex, follow">' : ""}
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${escapeHtml(fullTitle)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="${image ? "video.other" : "website"}">
<meta property="og:locale" content="de_DE">
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${escapeHtml(fullTitle)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}"><meta name="twitter:image" content="${escapeHtml(image)}">` : ""}
${previous ? `<link rel="prev" href="${config.absolute(previous)}">` : ""}
${next ? `<link rel="next" href="${config.absolute(next)}">` : ""}
<link rel="stylesheet" href="${cssHref}">
<script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", "@graph": [...(Array.isArray(schema) ? schema : [schema]), breadcrumbSchema] })}</script>
${interactive ? `<script type="module" src="${jsHref}"></script>` : ""}
</head>
<body>
<a class="skip-link" href="#inhalt">Zum Inhalt</a>
<header class="container site-header">
<a class="brand" href="${config.href()}">${config.name}</a>
<nav aria-label="Hauptnavigation"><ul>${navigation.map(([target, name]) => `<li><a href="${config.href(target)}"${selected === target ? ' aria-current="page"' : ""}>${name}</a></li>`).join("")}</ul></nav>
</header>
<main id="inhalt" class="container">
${breadcrumbsMarkup(crumbs, config)}
${body}
</main>
<footer class="container site-footer"><p>${config.name} · Privates, nicht kommerzielles Projekt.
<a href="${config.href("datenschutz/")}">Datenschutz und Hinweise</a></p>
<p>Öffentliche Metadaten lokal aufbereitet. Videos und Vorschaubilder werden direkt von YouTube geladen.</p></footer>
</body>
</html>
`;
}

function videoSchema(video, config, route) {
  const url = `${config.absolute(route)}#video-${video.id}`;
  return {
    "@type": "VideoObject", "@id": url,
    name: video.title, url, sameAs: video.url,
    embedUrl: video.embedUrl, thumbnailUrl: [video.thumbnailUrl],
    ...(video.description ? { description: video.description } : {}),
    ...(video.publishedAt ? { uploadDate: video.publishedAt } : {}),
    ...(video.duration ? { duration: video.duration } : {}),
    ...(video.magazines.length || video.games.length ? {
      about: [
        ...video.magazines.map((magazine) => magazine.issue?.route
          ? issueSchema(magazine, magazine.issue, config) : periodicalSchema(magazine, config)),
        ...video.games.map((game) => gameSchema(game, config)),
      ],
      keywords: [...new Set([...video.magazines, ...video.games].map((entity) => entity.name))],
    } : {}),
  };
}

function archiveLinks(archives) {
  if (!archives.length) return "<p>Kein passender Archivlink vorhanden.</p>";
  return `<ul>${archives.flatMap((archive) => {
    const suffix = archive.match === "issue" ? "Ausgabe" : "Übersichtsseite (kein eindeutiger Hefttreffer)";
    return [
      archive.pageUrl ? `<li>${externalLink(archive.pageUrl, `${archive.provider}: ${archive.match === "issue" && archive.provider === "kultmags" ? "Archivordner zur Ausgabe" : suffix}`)}</li>` : "",
      archive.match === "issue" && archive.readerUrl ? `<li>${externalLink(archive.readerUrl, `${archive.provider}: Heft lesen`)}</li>` : "",
      archive.match === "issue" && archive.downloadUrl ? `<li>${externalLink(archive.downloadUrl, `${archive.provider}: Heft herunterladen`)}</li>` : "",
    ];
  }).join("")}</ul>`;
}

function magazineDetails(video, config) {
  if (!video.magazines.length) return "";
  return `<section><h3>Zeitschriften und Ausgaben</h3>
${video.magazines.map((magazine) => `<section><h4>${escapeHtml(magazine.name)}${magazine.issue ? ` – ${escapeHtml(magazine.issue.label)}` : ""}</h4>
<p>${magazineLinks(magazine, config)}</p>
${!magazine.issue?.route ? "<p>Ausgabe noch nicht eindeutig erkannt; keine eigene Ausgabenseite.</p>" : ""}
${archiveLinks(magazine.archives)}</section>`).join("")}</section>`;
}

function playerPoster(video) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouTube-Player aktivieren</title>
<style>body{margin:0;background:#171a22;color:#fff;font:1rem system-ui;text-align:center}a{display:grid;place-items:center;position:absolute;inset:0;color:#fff}img{position:absolute;width:100%;height:100%;object-fit:contain;opacity:.5}span{position:relative;padding:1rem;background:#171a22}</style></head>
<body><a href="${video.embedUrl}" rel="external"><img src="${video.thumbnailUrl}" width="320" height="180" alt=""><span>YouTube-Player aktivieren ↗<br>Erst danach wird der externe Player geladen.</span></a></body></html>`;
}

function player(video) {
  return `<section aria-label="Videoplayer">
<iframe class="video-player" name="issue-player" title="${escapeHtml(`YouTube-Video: ${video.title}`)}" srcdoc="${escapeHtml(playerPoster(video))}" allow="encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>
<p class="meta">Das Vorschaubild kommt direkt von YouTube. Erst „YouTube-Player aktivieren“ lädt den externen Player. <a href="#datenschutzhinweis">Hinweise zur Einbindung</a></p>
</section>`;
}

function privacyBody(config) {
  return `<h1>Datenschutz und Hinweise</h1>
<p>Pretty Old Pixel ist ein privates, nicht kommerziell genutztes Projekt zur Übersicht öffentlich verfügbarer Videos. Diese Seite enthält keine Anschrift.</p>
<h2>Hosting über GitHub Pages</h2>
<p>Die statischen Seiten werden von GitHub Pages ausgeliefert. Beim Abruf können technische Zugriffsdaten wie IP-Adresse, Zeitpunkt und Browserinformationen beim Hosting-Anbieter verarbeitet werden.
${externalLink("https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement", "Datenschutzerklärung von GitHub")}</p>
<h2>Lokal aufbereitete Metadaten</h2>
<p>Titel, Beschreibungen, Veröffentlichungsdaten und Zeitschriftenangaben stammen aus zuvor separat abgerufenen öffentlichen Metadaten. Diese Texte sind Teil des statischen HTML. Ihr Lesen löst keinen Metadatenabruf bei YouTube oder einem Zeitschriftenarchiv aus.</p>
<h2>YouTube-Vorschaubilder</h2>
<p>Auf Spiel- und Ausgabenseiten wird das Vorschaubild des ausgewählten Videos direkt von i.ytimg.com geladen, nicht lokal kopiert. Bereits dieser Bildabruf übermittelt insbesondere Ihre IP-Adresse und technische Request-Daten an den Anbieter. Übersichtsseiten enthalten derzeit keine externen Bilder.</p>
<h2>YouTube-Player</h2>
<p>Der eingebettete Player wird erst geladen, wenn Sie „YouTube-Player aktivieren“ wählen. Er verwendet youtube-nocookie.com, den erweiterten Datenschutzmodus von YouTube. Das bedeutet nicht, dass keine Daten verarbeitet werden. Nach der Aktivierung kann YouTube/Google weitere Verbindungen aufbauen und Daten im Rahmen der Wiedergabe verarbeiten. Auf einen externen Player können Sie verzichten und stattdessen einen normalen YouTube-Link verwenden.</p>
<p>Die Seite lädt derzeit keine YouTube-IFrame-API im Hauptdokument, nutzt keine automatische Folgenfortsetzung und speichert dafür auch keine Sitzungsmarkierung. Bei einer späteren Einführung werden diese Hinweise entsprechend angepasst.</p>
<p>Ein kleines lokal ausgeliefertes JavaScript wechselt auf der Spiel-/Ausgabenseite das ausgewählte Video und seine Beschreibung. Die Auswahl steht im URL-Fragment, wird nicht in einem eigenen Speicher abgelegt und startet keine Wiedergabe. Ohne JavaScript bleiben alle Beschreibungen, Abschnittslinks und YouTube-Links nutzbar.</p>
<p>${externalLink("https://policies.google.com/privacy?hl=de", "Datenschutzerklärung von Google")} · ${externalLink("https://www.youtube.com/t/terms", "Nutzungsbedingungen von YouTube")}</p>
<h2>Externe Links und eigene Speicherung</h2>
<p>Externe Links sind mit ↗ und einem zugänglichen Hinweis gekennzeichnet. Erst beim Aufrufen wird das jeweilige Ziel besucht; die direkte Vorschaubild-Einbindung ist davon ausgenommen. Diese Website setzt selbst keine Tracking-Cookies ein, verwendet keine Analytics-Dienste und schreibt keine Daten in Local Storage oder Session Storage.</p>
<h2>Hinweise vor Veröffentlichung</h2>
<p>Der private, nicht kommerzielle Betrieb allein befreit nicht automatisch von gesetzlichen Informations- oder Einwilligungspflichten. Die rechtliche Prüfung einschließlich eventuell erforderlicher weiterer Angaben steht vor der öffentlichen Freigabe aus. Diese Hinweise sind keine Rechtsberatung.</p>
<p><a href="${config.href("videos/")}">Zum Videokatalog</a></p>`;
}

function periodicalSchema(magazine, config) {
  return {
    "@type": "Periodical", "@id": `${config.absolute(magazine.route)}#periodical`,
    name: magazine.name, url: config.absolute(magazine.route),
  };
}

function issueSchema(magazine, issue, config) {
  return {
    "@type": "PublicationIssue", "@id": `${config.absolute(issue.route)}#issue`,
    name: `${magazine.name} ${issue.label}`, url: config.absolute(issue.route),
    isPartOf: periodicalSchema(magazine, config),
    ...(issue.number !== null ? { issueNumber: issue.number } : {}),
    ...(issue.year !== null ? { temporalCoverage: String(issue.year) } : {}),
  };
}

function pagination(baseRoute, page, pageCount, config) {
  if (pageCount < 2) return "";
  return `<nav class="pagination" aria-label="Übersichtsseiten">
${page > 1 ? `<a href="${config.href(paginatedRoute(baseRoute, page - 1))}" rel="prev">← Vorherige Seite</a>` : ""}
<span aria-current="page">Seite ${page} von ${pageCount}</span>
${page < pageCount ? `<a href="${config.href(paginatedRoute(baseRoute, page + 1))}" rel="next">Nächste Seite →</a>` : ""}
</nav><details><summary>Alle Übersichtsseiten</summary><ol class="page-list">${Array.from({ length: pageCount }, (_, index) => `<li><a href="${config.href(paginatedRoute(baseRoute, index + 1))}"${page === index + 1 ? ' aria-current="page"' : ""}>Seite ${index + 1}</a></li>`).join("")}</ol></details>`;
}

function entryVideoList(entries, model, config) {
  return `<ol class="issue-videos">${entries.map(({ videoId, mention }) => {
    const video = model.videoById.get(videoId);
    return `<li>${videoLink(video, config, `${mention.part ? `Teil ${mention.part}: ` : ""}${video.title}`, mention.issue?.route)}
<p class="meta">${videoDate(video)}${video.durationSeconds !== null ? ` · ${durationLabel(video.durationSeconds)}` : ""}</p></li>`;
  }).join("")}</ol>`;
}

function groupedEntries(entries, model, config) {
  const sections = new Map();
  for (const entry of entries) {
    const issue = entry.mention.issue;
    const year = issue?.year ?? null;
    const title = `${year === null ? "Jahrgang unbekannt" : `Jahrgang ${year}`} – ${issue?.special ? "Sonderhefte" : "Reguläre und ungeklärte Ausgaben"}`;
    if (!sections.has(title)) sections.set(title, new Map());
    const groups = sections.get(title);
    const key = issue?.id ?? entry.videoId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...sections].map(([title, groups]) => `<section><h2>${title}</h2>${[...groups.values()].map((group) => {
    const mention = group[0].mention;
    const issue = mention.issue;
    return `<section class="issue-group"><h3>${issue?.route
      ? `<a href="${config.href(issue.route)}">${escapeHtml(`${mention.name} ${issue.label}`)}</a>`
      : `Ausgabe nicht eindeutig${issue ? `: ${escapeHtml(issue.label)}` : ""}`}</h3>
${entryVideoList(group, model, config)}
${archiveLinks(issue?.route ? issue.archives : mention.archives)}
</section>`;
  }).join("")}</section>`).join("");
}

function renderMagazinePages(model, config, add) {
  if (!model.magazines.length && !model.unresolvedMagazines.length) return;
  const root = { route: "", name: "Startseite" };
  const index = { route: "zeitschriften/", name: "Zeitschriften" };
  function addPaginated({ route: baseRoute, entries, title, description, crumbs, intro, render, schema = [], items }) {
    const pageCount = Math.ceil(entries.length / config.pageSize);
    for (let page = 1; page <= pageCount; page += 1) {
      const route = paginatedRoute(baseRoute, page);
      const subset = entries.slice((page - 1) * config.pageSize, page * config.pageSize);
      const videos = [...new Set(subset.flatMap((entry) => entry.videoId
        ? [entry.videoId] : entry.videoIds ?? []))].map((id) => model.videoById.get(id));
      add({
        route, title: `${title}${page > 1 ? ` – Seite ${page}` : ""}`, description: `${description}${page > 1 ? ` Seite ${page} von ${pageCount}.` : ""}`,
        crumbs: page === 1 ? crumbs : [...crumbs, { route, name: `Seite ${page}` }],
        schema: [{
          ...collectionSchema(items ? items(subset) : videos, config, route),
          ...(schema.length ? { about: { "@id": schema.at(-1)["@id"] } } : {}),
        }, ...schema],
        previous: page > 1 ? paginatedRoute(baseRoute, page - 1) : null,
        next: page < pageCount ? paginatedRoute(baseRoute, page + 1) : null,
        body: `<h1>${escapeHtml(title)}${page > 1 ? ` – Seite ${page}` : ""}</h1>${intro}${pagination(baseRoute, page, pageCount, config)}${render(subset)}${pagination(baseRoute, page, pageCount, config)}`,
      }, videos);
    }
  }
  const indexEntries = [
    ...model.magazines.map((magazine) => ({ magazine, videoIds: magazine.videos })),
    ...model.unresolvedMagazines.map((video) => ({ videoId: video.id })),
  ];
  addPaginated({
    route: index.route, entries: indexEntries, title: "Blätterabend – Zeitschriften",
    description: "Klassische Computerzeitschriften im Blätterabend: Zeitschriften, Jahrgänge und Ausgaben mit Videos und passenden Archivlinks.",
    crumbs: [root, index],
    items: (entries) => entries.map((entry) => entry.magazine
      ? { title: entry.magazine.name, route: entry.magazine.route }
      : model.videoById.get(entry.videoId)),
    intro: `<p>${model.magazines.length} Zeitschriften, alphabetisch geordnet. Jahrgänge beziehen sich auf das Erscheinungsjahr der Hefte, nicht auf das Datum der Videos.</p>`,
    render: (entries) => {
      const magazines = entries.filter((entry) => entry.magazine).map((entry) => entry.magazine);
      const unresolved = entries.filter((entry) => !entry.magazine);
      return `${magazines.length ? `<ul class="magazine-index">${magazines.map((magazine) => `<li><a href="${config.href(magazine.route)}">${escapeHtml(magazine.name)}</a> · ${magazine.videos.length} Videos · ${magazine.years.length} Jahrgänge</li>`).join("")}</ul>` : ""}
${unresolved.length ? `<section><h2>Zeitschrift ungeklärt</h2><p>Diese Blätterabend-Videos bleiben erreichbar, auch wenn noch keine Zeitschrift sicher erkannt wurde.</p>${entryVideoList(unresolved.map((entry) => ({ ...entry, mention: {} })), model, config)}</section>` : ""}`;
    },
  });
  for (const magazine of model.magazines) {
    const magazineCrumb = { route: magazine.route, name: magazine.name };
    const years = `<nav aria-label="Jahrgänge von ${escapeHtml(magazine.name)}"><ul class="year-list">${magazine.years.map((year) => `<li><a href="${config.href(year.route)}">${year.year}</a> (${year.entries.length} Videos)</li>`).join("")}</ul></nav>`;
    const unknownIndex = magazine.entries.findIndex((entry) => entry.mention.issue?.year === null || !entry.mention.issue);
    const unknownLink = unknownIndex < 0 ? "" : `<p><a href="${config.href(paginatedRoute(magazine.route, Math.floor(unknownIndex / config.pageSize) + 1))}">Jahrgang unbekannt</a>: ${magazine.entries.filter((entry) => !entry.mention.issue || entry.mention.issue.year === null).length} Videos ohne gesichertes Erscheinungsjahr.</p>`;
    addPaginated({
      route: magazine.route, entries: magazine.entries,
      title: `${magazine.name} – Blätterabend-Videos`,
      description: `${magazine.name} im Blätterabend: Jahrgänge, Ausgaben und zugehörige Videos mit Archivverweisen.`,
      crumbs: [root, index, magazineCrumb], schema: [periodicalSchema(magazine, config)],
      intro: `<p>${magazine.videos.length} Videos zu ${escapeHtml(magazine.name)}. Wählen Sie einen Jahrgang oder eine Ausgabe.</p>${years}${unknownLink}`,
      render: (entries) => groupedEntries(entries, model, config),
    });
    for (const year of magazine.years) {
      addPaginated({
        route: year.route, entries: year.entries,
        title: `${magazine.name} ${year.year} – Ausgaben und Blätterabend-Videos`,
        description: `${magazine.name}, Jahrgang ${year.year}: reguläre Ausgaben und Sonderhefte mit Blätterabend-Videos. Das Jahr bezeichnet das Erscheinen der Zeitschrift.`,
        crumbs: [root, index, magazineCrumb, { route: year.route, name: String(year.year) }],
        schema: [periodicalSchema(magazine, config)],
        intro: `<p>Erscheinungsjahr der Zeitschrift: ${year.year}. Ausgaben sind nach Monat bzw. Heftnummer geordnet, Videoteile zusammengehöriger Hefte nach Teilnummer. Sonderhefte stehen separat.</p>`,
        render: (entries) => groupedEntries(entries, model, config),
      });
    }
    for (const issue of magazine.issues.values()) {
      const videos = issue.videos.map((videoId) => model.videoById.get(videoId));
      const title = `${magazine.name} ${issue.label}`;
      add({
        route: issue.route, title: `${title} – Blätterabend`, interactive: true,
        description: `${title}: Informationen zur Zeitschriftenausgabe, passende Archivlinks und alle zugehörigen Blätterabend-Videos.`,
        crumbs: [root, index, magazineCrumb, { route: issue.route, name: title }],
        schema: [collectionSchema(videos, config, issue.route, issue.route), periodicalSchema(magazine, config),
          issueSchema(magazine, issue, config), ...videos.map((video) => videoSchema(video, config, issue.route))],
        body: `<h1>${escapeHtml(title)} – Blätterabend</h1>
<dl><dt>Zeitschrift</dt><dd><a href="${config.href(magazine.route)}">${escapeHtml(magazine.name)}</a></dd>
<dt>Ausgabe</dt><dd>${escapeHtml(issue.label)}${issue.special ? " (Sonderheft)" : ""}</dd>
<dt>Erscheinungsjahr</dt><dd>${issue.year !== null ? `<a href="${config.href(`${magazine.route}${issue.year}/`)}">${issue.year}</a>` : "Unbekannt"}</dd>
${issue.number !== null ? `<dt>Heftnummer</dt><dd>${issue.number}</dd>` : ""}
${issue.months.length ? `<dt>Monat(e)</dt><dd>${issue.months.join(" / ")}</dd>` : ""}</dl>
<p><a href="#video-${videos[0].id}">Mit Video 1/${videos.length} beginnen</a></p>
${seriesVideos(videos, title, config)}
<section><h2>Archivlinks</h2>${archiveLinks(issue.archives)}</section>
<p><a href="${config.href(magazine.route)}">Weitere Ausgaben von ${escapeHtml(magazine.name)}</a> · <a href="${config.href(index.route)}">Andere Zeitschriften entdecken</a></p>`,
      }, videos);
    }
  }
}

function seriesVideos(videos, title, config, game) {
  return `<section data-video-series data-title="${escapeHtml(title)}">
${player(videos[0])}
<div class="series-layout">
<details class="episode-menu" open><summary>☰ Videos ${game ? "zu diesem Spiel" : "zu dieser Ausgabe"} (${videos.length})</summary>
<nav aria-label="Videos ${game ? "zum Spiel" : "zur Ausgabe"}"><ol>${videos.map((video, index) => `<li><a data-video-link href="#video-${video.id}">Video ${index + 1}/${videos.length}: ${escapeHtml(video.title)}${video.publishedAt ? "" : " (Datum unbekannt)"}</a></li>`).join("")}</ol></nav></details>
<div class="video-panels">${videos.map((video, index) => `<article id="video-${video.id}" data-video-panel data-poster="${escapeHtml(playerPoster(video))}" tabindex="-1">
<h2>Video ${index + 1}/${videos.length}: ${escapeHtml(video.title)}</h2>
<p class="meta">${videoDate(video)}${video.durationSeconds !== null ? ` · Länge: ${durationLabel(video.durationSeconds)}` : ""}</p>
${game ? `<p>Spiel: <a href="${config.href(game.route)}">${escapeHtml(game.name)}</a>${game.playlists.filter((playlist) => video.playlists.some((source) => source.id === playlist.id)).map((playlist) => ` · ${externalLink(playlist.url, playlist.title)}`).join("")}</p>` : ""}
<p>${externalLink(video.embedUrl, "YouTube-Player hier aktivieren", "issue-player")} · ${externalLink(video.url, "Video auf YouTube ansehen")}</p>
<section><h3>Videobeschreibung</h3><div class="description">${video.description ? descriptionHtml(video.description) : "<p>Für dieses Video ist keine Beschreibung vorhanden.</p>"}</div></section>
${video.magazines.length > 1 ? magazineDetails(video, config) : ""}
<nav aria-label="Videoteile">${index > 0 ? `<a href="#video-${videos[index - 1].id}">← Vorheriger Teil</a>` : ""}
${index + 1 < videos.length ? `<a href="#video-${videos[index + 1].id}">Nächster Teil →</a>` : ""}</nav></article>`).join("")}</div></div>
<aside id="datenschutzhinweis"><h2>YouTube-Einbindung</h2><p>Das Vorschaubild kommt direkt von YouTube. Der Player lädt erst nach Aktivierung und startet beim Wechsel des Videos nicht automatisch.
<a href="${config.href("datenschutz/")}">Datenschutz und Hinweise lesen</a>.</p></aside>
</section>`;
}

function gameSchema(game, config) {
  return {
    "@type": "VideoGame", "@id": `${config.absolute(game.route)}#game`,
    name: game.name, url: config.absolute(game.route),
    ...(game.platforms?.length ? { gamePlatform: game.platforms } : {}),
    ...(game.aliases?.length ? { alternateName: game.aliases } : {}),
  };
}

function renderGamePages(model, config, add) {
  if (!model.games.length) return;
  const root = { route: "", name: "Startseite" };
  const index = { route: "spiele/", name: "Spiele" };
  const pageCount = Math.ceil(model.games.length / config.pageSize);
  for (let page = 1; page <= pageCount; page += 1) {
    const route = paginatedRoute(index.route, page);
    const games = model.games.slice((page - 1) * config.pageSize, page * config.pageSize);
    const videos = [...new Set(games.flatMap((game) => game.videos))].map((id) => model.videoById.get(id));
    add({
      route, title: `Spiele – Retro-Spielereihen${page > 1 ? ` – Seite ${page}` : ""}`,
      description: `Spiele von Pretty Old Pixel: bestätigte Retro-Spielereihen mit mindestens zwei Videos pro Spiel, alphabetisch geordnet. Seite ${page} von ${pageCount}.`,
      crumbs: page === 1 ? [root, index] : [root, index, { route, name: `Seite ${page}` }],
      schema: collectionSchema(games.map((game) => ({ title: game.name, route: game.route })), config, route),
      previous: page > 1 ? paginatedRoute(index.route, page - 1) : null,
      next: page < pageCount ? paginatedRoute(index.route, page + 1) : null,
      body: `<h1>Spiele${page > 1 ? ` – Seite ${page}` : ""}</h1><p>${model.games.length} bestätigte Spielereihen, alphabetisch geordnet. Jedes Spiel hat mindestens zwei unterschiedliche öffentliche Videos.</p>
${pagination(index.route, page, pageCount, config)}
<ul>${games.map((game) => `<li><a href="${config.href(game.route)}">${escapeHtml(game.name)}</a>${game.platforms.length ? ` (${escapeHtml(game.platforms.join(", "))})` : ""} · ${game.videos.length} Videos</li>`).join("")}</ul>
${pagination(index.route, page, pageCount, config)}`,
    }, videos);
  }
  for (const game of model.games) {
    const videos = game.videos.map((id) => model.videoById.get(id));
    const unknown = videos.filter((video) => video.publishedAt === null);
    add({
      route: game.route, title: `${game.name} – Spielinformationen und Videos`, interactive: true,
      description: `${game.name}${game.platforms.length ? ` (${game.platforms.join(", ")})` : ""}: ${videos.length} Videos von Pretty Old Pixel mit vollständigen Beschreibungen, chronologisch von der ersten bis zur neuesten Veröffentlichung.`,
      crumbs: [root, index, { route: game.route, name: game.name }],
      schema: [{ ...collectionSchema(videos, config, game.route, game.route), about: { "@id": `${config.absolute(game.route)}#game` } },
        gameSchema(game, config), ...videos.map((video) => videoSchema(video, config, game.route))],
      body: `<h1>${escapeHtml(game.name)} – Spielinformationen und Videos</h1>
<p>Die Spielereihe zu ${escapeHtml(game.name)} auf Pretty Old Pixel: alle bestätigten Videos und ihre vollständigen Beschreibungen an einem Ort.</p>
<dl><dt>Spieltitel</dt><dd>${escapeHtml(game.name)}</dd>${game.platforms.length ? `<dt>Hauptplattform laut Quellplaylist</dt><dd>${escapeHtml(game.platforms.join(", "))}</dd>` : ""}
${game.aliases.length ? `<dt>Weitere Schreibweisen in den Quellen</dt><dd>${escapeHtml(game.aliases.join(", "))}</dd>` : ""}
<dt>Videos</dt><dd>${videos.length}</dd></dl>
<p>Die Zuordnung von Spieltitel und Hauptplattform wurde anhand der lokal gespeicherten Playlist- und Videometadaten geprüft. Entwickler, Publisher, Erscheinungsjahr und Genre sind noch nicht belegt und werden nicht ergänzt.</p>
<p>Reihenfolge: älteste Veröffentlichung zuerst. Originale Folgenummern bleiben im Videotitel erhalten.</p>
${unknown.length ? `<p>Datum unbekannt: ${unknown.length} Videos stehen gesondert am Ende der Liste; für sie wird keine chronologische Einordnung behauptet.</p>` : ""}
<p><a href="#video-${videos[0].id}">Mit Video 1/${videos.length} beginnen</a></p>
${seriesVideos(videos, game.name, config, game)}
<section><h2>Quellen der Spielzuordnung</h2><ul>${game.playlists.map((playlist) => `<li>${externalLink(playlist.url, playlist.title)}</li>`).join("")}</ul><p>Diese Links belegen die Zuordnung. Die Wiedergabereihenfolge wird aus dem Veröffentlichungsdatum berechnet, nicht aus der Playlistposition.</p></section>
<p><a href="${config.href(index.route)}">Weitere Spiele entdecken</a> · <a href="${config.href("news/")}">Neue Videos</a></p>`,
    }, videos);
  }
}

export function renderSite(model, config, cssHref, jsHref = config.href("assets/video-series.js")) {
  const pages = new Map();
  const hasMagazines = model.magazines.length > 0 || model.unresolvedMagazines.length > 0;
  function add(options, videos = []) {
    const file = options.file ?? `${options.route}index.html`;
    if (pages.has(file)) throw new Error(`Kollidierender Ausgabepfad: ${file}`);
    pages.set(file, {
      html: layout(options, config, cssHref, hasMagazines, jsHref, model.games.length > 0),
      route: options.route, indexable: !options.noindex,
      contentPublishedAt: latestPublication(videos),
    });
  }
  const root = { route: "", name: "Startseite" };
  add({
    route: "", title: "Retrospiele, Blätterabend und neue Videos",
    description: "Pretty Old Pixel: neue Videos, Retrospiele und Blätterabend mit klassischen Computerzeitschriften. Ein statischer Katalog mit direkten Videolinks.",
    crumbs: [root], schema: collectionSchema(model.news.slice(0, 5), config, ""),
    body: `<h1>Pretty Old Pixel</h1>
<p class="lead">Retrospiele entdecken, alte Computerzeitschriften durchblättern und Videos wiederfinden.</p>
<p><a href="${config.href("news/")}">Die 20 neuesten Videos</a> · <a href="${config.href("videos/")}">Alle ${model.videos.length} Videos durchsuchen</a></p>
<section aria-labelledby="bereiche"><h2 id="bereiche">Die Themen</h2>
${hasMagazines ? `<p><a href="${config.href("zeitschriften/")}">Blätterabend: Zeitschriften, Jahrgänge und Ausgaben entdecken</a></p>` : ""}
${model.games.length ? `<p><a href="${config.href("spiele/")}">Spiele: ${model.games.length} Spielereihen entdecken</a></p>` : ""}
<p>Hardware, Retrospektiven sowie Interviews und Gespräche werden schrittweise als eigene Bereiche erschlossen. Alle veröffentlichten Videos sind über den Gesamtkatalog erreichbar.</p></section>
<section aria-labelledby="neu"><h2 id="neu">Neu auf dem Kanal</h2>
${videoList(model.news.slice(0, 5), config)}
<p><a href="${config.href("news/")}">Weitere neue Videos ansehen</a></p></section>`,
  }, model.news.slice(0, 5));
  add({
    route: "news/", title: "News – die 20 neuesten Videos",
    description: "Die 20 neuesten veröffentlichten Videos von Pretty Old Pixel, chronologisch nach YouTube-Veröffentlichung: Retrospiele, Blätterabend und weitere Themen.",
    crumbs: [root, { route: "news/", name: "News" }],
    schema: collectionSchema(model.news, config, "news/"),
    body: `<h1>News – die neuesten Videos</h1><p>Die neuesten Veröffentlichungen, neueste zuerst. Maßgeblich ist das Veröffentlichungsdatum des Videos, nicht der Abruf der Daten.</p>${videoList(model.news, config)}<p><a href="${config.href("videos/")}">Alle Videos im Katalog</a></p>`,
  }, model.news);

  renderMagazinePages(model, config, add);
  renderGamePages(model, config, add);

  const pageCount = Math.ceil(model.videos.length / config.pageSize);
  for (let page = 1; page <= pageCount; page += 1) {
    const route = catalogRoute(page);
    const videos = model.videos.slice((page - 1) * config.pageSize, page * config.pageSize);
    const previous = page > 1 ? catalogRoute(page - 1) : null;
    const next = page < pageCount ? catalogRoute(page + 1) : null;
    const pagination = `<nav class="pagination" aria-label="Videokatalog-Seiten">${previous ? `<a href="${config.href(previous)}" rel="prev">← Vorherige Seite</a>` : ""}
<span aria-current="page">Seite ${page} von ${pageCount}</span>
${next ? `<a href="${config.href(next)}" rel="next">Nächste Seite →</a>` : ""}</nav>
<details><summary>Alle Katalogseiten</summary><ol class="page-list">${Array.from({ length: pageCount }, (_, index) => `<li><a href="${config.href(catalogRoute(index + 1))}"${index + 1 === page ? ' aria-current="page"' : ""}>Seite ${index + 1}</a></li>`).join("")}</ol></details>`;
    add({
      route, title: `Alle Videos – Seite ${page} von ${pageCount}`,
      description: `Videokatalog von Pretty Old Pixel, Seite ${page} von ${pageCount}: Retrospiele, Blätterabend und weitere Videos mit Veröffentlichungsdatum und Beschreibung.`,
      crumbs: page === 1 ? [root, { route, name: "Alle Videos" }] : [root, { route: "videos/", name: "Alle Videos" }, { route, name: `Seite ${page}` }],
      schema: collectionSchema(videos, config, route), previous, next,
      body: `<h1>Alle Videos – Seite ${page}</h1><p>${model.videos.length} Videos, neueste zuerst. Videos ohne belastbares Datum stehen am Ende und sind entsprechend gekennzeichnet.</p>${pagination}${videoList(videos, config)}${pagination.replace('aria-label="Videokatalog-Seiten"', 'aria-label="Weitere Katalogseiten"')}`,
    }, videos);
  }
  add({
    route: "datenschutz/", title: "Datenschutz und Hinweise",
    description: "Hinweise zu GitHub Pages, öffentlichen Metadaten und der direkten YouTube-Einbindung auf dem privaten, nicht kommerziellen Projekt Pretty Old Pixel.",
    crumbs: [root, { route: "datenschutz/", name: "Datenschutz" }],
    schema: { "@type": "WebPage", "@id": `${config.absolute("datenschutz/")}#page`, name: "Datenschutz und Hinweise" },
    body: privacyBody(config),
  });
  add({
    route: "404.html", file: "404.html", title: "Seite nicht gefunden", noindex: true,
    description: "Diese Seite wurde nicht gefunden. Über Startseite, News und Videokatalog finden Sie die Videos von Pretty Old Pixel.",
    crumbs: [root, { route: "404.html", name: "Seite nicht gefunden" }],
    schema: { "@type": "WebPage", name: "Seite nicht gefunden" },
    body: `<h1>Seite nicht gefunden</h1><p>Unter dieser Adresse gibt es keine Seite.</p><p><a href="${config.href()}">Zur Startseite</a> · <a href="${config.href("videos/")}">Zum Videokatalog</a></p>`,
  });
  return pages;
}
