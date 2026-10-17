import { paginatedRoute } from "./site-config.mjs";
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
export function externalLink(url, label, target = "", icon = "") {
  const safe = httpUrl(url);
  if (!safe) throw new Error(`Ungültiger externer Link: ${url}`);
  return `<a href="${escapeHtml(safe)}" rel="external"${target ? ` target="${escapeHtml(target)}"` : ""}${icon ? ` class="archive-icon" title="${escapeHtml(label)} (externe Website)"` : ""}>${icon ? `${icon}<span class="visually-hidden">${escapeHtml(label)}</span>` : escapeHtml(label)} ${externalMark}</a>`;
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

function metadata(fields) {
  return `<dl class="detail-meta">${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
}

function magazineLinks(magazine, config) {
  return `<a href="${config.href(magazine.route)}">${escapeHtml(magazine.name)}</a>${magazine.yearRoute
    ? ` · <a href="${config.href(magazine.yearRoute)}">Jahrgang ${magazine.issue.year}</a>` : ""}${magazine.issue
    ? ` · ${magazine.issue.route ? `<a href="${config.href(magazine.issue.route)}">${escapeHtml(magazine.issue.label)}</a>` : escapeHtml(magazine.issue.label)}` : ""}`;
}

function sectionLinks(video, config) {
  return video.sections.length ? `<p class="topics">Bereiche: ${video.sections.map((section) => `<a href="${config.href(section.route)}">${escapeHtml(section.name)}</a>`).join(" · ")}</p>` : "";
}

function topics(video, config) {
  const games = video.games.length ? `<p class="topics">Spiele: ${video.games.map((game) => `<a href="${config.href(game.route)}">${escapeHtml(game.name)}</a>`).join(" · ")}</p>` : "";
  if (!video.blaetterabend) return `${games}${sectionLinks(video, config)}`;
  return `${games}${sectionLinks(video, config)}<p class="topics"><a href="${config.href("zeitschriften/")}">Blätterabend / Zeitschriften</a>: ${video.magazines.length
    ? video.magazines.map((magazine) => magazineLinks(magazine, config)).join(" · ")
    : "Zeitschrift ungeklärt"}</p>`;
}

export function videoHref(video, config, issueRoute) {
  const route = issueRoute ?? video.magazines.find((magazine) => magazine.issue?.route)?.issue.route ?? video.games[0]?.route;
  return route ? `${config.href(route)}#video-${video.id}` : video.url;
}

function videoLink(video, config, label = video.title, issueRoute) {
  const href = videoHref(video, config, issueRoute);
  return httpUrl(href)
    ? externalLink(href, label) : `<a href="${href}">${escapeHtml(label)}</a>`;
}

function videoList(videos, config, entries = new Map(), headingLevel = 2) {
  if (!videos.length) return "<p>Noch keine Videos mit bekanntem Veröffentlichungsdatum.</p>";
  return `<ol class="video-list">${videos.map((video) => {
    const entry = entries.get(video.id);
    return `<li><article>
<h${headingLevel}>${videoLink(video, config)}</h${headingLevel}>
<p class="meta">${videoDate(video)}${video.durationSeconds !== null ? ` · ${durationLabel(video.durationSeconds)}` : ""}</p>
${entry ? `<p class="meta">${entry.people.length ? `Im Gespräch: ${escapeHtml(entry.people.join(", "))} · ` : ""}Thema: ${escapeHtml(entry.topic)}</p>${entry.note ? `<p class="meta">${escapeHtml(entry.note)}</p>` : ""}` : ""}
${topics(video, config)}
${video.description ? `<p>${escapeHtml(excerpt(video.description, 220))}</p>` : ""}
</article></li>`;
  }).join("\n")}</ol>`;
}

function latestPublication(videos) {
  const times = videos.map((video) => video.publishedTime).filter((value) => value !== null);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

function homeOverview(model, config) {
  const number = (value) => new Intl.NumberFormat("de-DE").format(value);
  const dated = model.videos.filter((video) => video.publishedTime !== null);
  const oldest = dated.reduce((first, video) => !first || video.publishedTime < first.publishedTime ? video : first, null);
  const knownDurations = model.videos.filter((video) => video.durationSeconds !== null);
  const hours = Math.floor(knownDurations.reduce((total, video) => total + video.durationSeconds, 0) / 3600);
  const issues = model.magazines.reduce((total, magazine) => total + magazine.issues.size, 0);
  const stats = [
    ["Videos insgesamt", number(model.videos.length), "Öffentliche Videos des Kanals"],
    ["Zeitschriften", number(model.magazines.length), "Unterschiedliche Magazine"],
    ["Heftausgaben", number(issues), "Ausgaben zum Durchblättern"],
    ["Spiele", number(model.games.length), "Retrospiele in Videoreihen"],
    ["Playlists", number(model.playlists.length), "Videos nach Themen und Reihen"],
    ...(knownDurations.length ? [["Stunden Video", number(hours), `${knownDurations.length === model.videos.length ? "Gesamtlaufzeit" : `Bekannte Laufzeiten: ${number(knownDurations.length)} von ${number(model.videos.length)} Videos`}, auf volle Stunden abgerundet`]] : []),
  ];
  const themes = [
    ...(model.magazines.length || model.unresolvedMagazines.length ? [{
      route: "zeitschriften/", name: "Zeitschriften",
      count: model.videos.filter((video) => video.blaetterabend).length,
      description: "Blätterabende durch Magazine, Jahrgänge und Heftausgaben.",
    }] : []),
    ...(model.games.length ? [{
      route: "spiele/", name: "Spiele",
      count: model.videos.filter((video) => video.games.length).length,
      description: "Retrospiele wiederentdecken: vom ersten Start bis zum Fazit.",
    }] : []),
    ...model.sections.map((section) => ({
      ...section, count: section.entries.length,
    })),
  ];
  return `<section class="home-statistics" aria-labelledby="statistik">
<h2 id="statistik">Pretty Old Pixel in Zahlen</h2>
<dl class="stats-grid">${stats.map(([label, value, note]) => `<div><dt>${label}</dt><dd>${value}</dd><dd class="stat-note">${note}</dd></div>`).join("")}</dl>
${oldest ? `<p class="channel-history"><span>Videogeschichte seit</span> <strong><time datetime="${oldest.publishedAt}">${new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "UTC" }).format(new Date(oldest.publishedTime))}</time></strong><small>Datum des ältesten öffentlichen Videos in dieser Übersicht, nicht das Gründungsdatum des Kanals.</small></p>` : '<p class="meta">Der Beginn der Videogeschichte ist ohne bekannte Veröffentlichungsdaten nicht bestimmbar.</p>'}
</section>
<section aria-labelledby="bereiche"><h2 id="bereiche">Die Themen entdecken</h2>
<div class="theme-grid">${themes.map((theme) => `<article><h3><a href="${config.href(theme.route)}">${escapeHtml(theme.name)}</a></h3><p class="theme-count">${number(theme.count)} Videos</p><p>${escapeHtml(theme.description)}</p></article>`).join("")}</div>
<p class="meta">Ein Video kann zu mehreren Themen gehören; die Videozahlen der Themen sind daher nicht addierbar.</p></section>
<p><a href="${config.href("news/")}" role="button" class="outline">Zu den 20 neuesten Videos</a></p>`;
}

function collectionSchema(videos, config, route, issueRoute) {
  return {
    "@type": "CollectionPage",
    "@id": `${config.href(route)}#page`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: videos.map((video, index) => ({
        "@type": "ListItem", position: index + 1, name: video.title,
        url: video.route ? config.href(video.route) : videoHref(video, config, issueRoute),
      })),
    },
  };
}

function breadcrumbsMarkup(crumbs, config) {
  return `<nav aria-label="Brotkrümelnavigation"><ol class="breadcrumbs">${crumbs.map((crumb, index) => `<li>${index === crumbs.length - 1
    ? `<span aria-current="page">${escapeHtml(crumb.name)}</span>`
    : `<a href="${config.href(crumb.route)}">${escapeHtml(crumb.name)}</a>`}</li>`).join("")}</ol></nav>`;
}

function layout({ route, title, description, body, schema, crumbs, image, noindex = false, previous, next, interactive = false }, config, cssHref, hasMagazines, jsHref, hasGames, sections) {
  const canonical = config.href(route);
  const fullTitle = `${title} | ${config.name}`;
  const breadcrumbSchema = {
    "@type": "BreadcrumbList",
    "@id": `${canonical}#breadcrumbs`,
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem", position: index + 1, name: crumb.name, item: config.href(crumb.route),
    })),
  };
  const navigation = [["", "Startseite"], ["news/", "News"], ...(hasMagazines ? [["zeitschriften/", "Zeitschriften"]] : []), ...(hasGames ? [["spiele/", "Spiele"]] : []), ...sections.map((section) => [section.route, section.name])];
  const selected = navigation.map(([target]) => target).find((prefix) => prefix && route.startsWith(prefix)) ?? route;
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
${previous ? `<link rel="prev" href="${config.href(previous)}">` : ""}
${next ? `<link rel="next" href="${config.href(next)}">` : ""}
<link rel="stylesheet" href="${config.href(cssHref)}">
<script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", "@graph": [...(Array.isArray(schema) ? schema : [schema]), breadcrumbSchema] })}</script>
${interactive ? `<script type="module" src="${config.href(jsHref)}"></script>` : ""}
</head>
<body${interactive ? ' class="detail-page"' : ""}>
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
<p>Videos und Vorschaubilder von YouTube.</p></footer>
</body>
</html>
`;
}

function videoSchema(video, config, route) {
  const url = `${config.href(route)}#video-${video.id}`;
  return {
    "@type": "VideoObject", "@id": url,
    name: video.title, url, sameAs: video.url,
    embedUrl: video.embedUrl, thumbnailUrl: [video.thumbnailUrl],
    ...(video.description ? { description: video.description } : {}),
    ...(video.publishedAt ? { uploadDate: video.publishedAt } : {}),
    ...(video.duration ? { duration: video.duration } : {}),
    ...(video.chapters.length ? {
      hasPart: video.chapters.map((chapter, index) => {
        const endOffset = video.chapters[index + 1]?.seconds ?? video.durationSeconds;
        return {
          "@type": "Clip", name: chapter.label, startOffset: chapter.seconds,
          url: `${config.href(route)}?t=${chapter.seconds}#video-${video.id}`,
          ...(endOffset !== null ? { endOffset } : {}),
        };
      }),
    } : {}),
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
  const icon = (path) => `<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const folder = icon('<path d="M3 7V4h6l2 3h10v13H3Z"/>');
  const reader = icon('<path d="M12 5v15M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z"/>');
  const download = icon('<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>');
  return `<ul class="archive-links" aria-label="Archivlinks">${archives.flatMap((archive) => {
    const suffix = archive.match === "issue" ? "Ausgabe" : "Zeitschriftenübersicht";
    return [
      archive.pageUrl ? `<li>${externalLink(archive.pageUrl, `${archive.provider}: ${archive.match === "issue" && archive.provider === "kultmags" ? "Archivordner zur Ausgabe" : suffix}`, "", folder)}</li>` : "",
      archive.match === "issue" && archive.readerUrl ? `<li>${externalLink(archive.readerUrl, `${archive.provider}: Heft lesen`, "", reader)}</li>` : "",
      archive.match === "issue" && archive.downloadUrl ? `<li>${externalLink(archive.downloadUrl, `${archive.provider}: Heft herunterladen`, "", download)}</li>` : "",
    ];
  }).join("")}</ul>`;
}

function magazineDetails(video, config) {
  if (!video.magazines.length) return "";
  return `<section><h3>Zeitschriften und Ausgaben</h3>
${video.magazines.map((magazine) => `<section><h4>${escapeHtml(magazine.name)}${magazine.issue ? ` – ${escapeHtml(magazine.issue.label)}` : ""}</h4>
<p>${magazineLinks(magazine, config)}</p>
${!magazine.issue?.route ? "<p>Die genaue Heftausgabe ist unbekannt.</p>" : ""}
${archiveLinks(magazine.archives)}</section>`).join("")}</section>`;
}

function playerPoster(video) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouTube-Player aktivieren</title>
<style>body{margin:0;background:#171a22;color:#fff;font:1rem system-ui;text-align:center}a{display:grid;place-items:center;position:absolute;inset:0;color:#fff}img{position:absolute;width:100%;height:100%;object-fit:contain;opacity:.5}span{position:relative;padding:1rem;background:#171a22}</style></head>
<body><a href="${video.embedUrl}" rel="external"><img src="${video.thumbnailUrl}" width="320" height="180" alt=""><span>YouTube-Player aktivieren ↗<br>Erst danach wird der externe Player geladen.</span></a></body></html>`;
}

function player(video) {
  return `<section aria-label="Videoplayer">
<iframe class="video-player" name="issue-player" title="${escapeHtml(`YouTube-Video: ${video.title}`)}" srcdoc="${escapeHtml(playerPoster(video))}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>
<p class="meta">Vorschaubild von YouTube · Player erst nach Aktivierung. <a href="#datenschutzhinweis">Datenschutzhinweise</a><span data-player-preference-note hidden> Die Aktivierung wird in diesem Browser gemerkt.</span> <button type="button" class="player-reset" data-player-reset hidden>YouTube-Aktivierung zurücksetzen</button></p>
<p class="meta" data-player-notice role="status" hidden></p>
</section>`;
}

function privacyBody(config) {
  return `<h1>Datenschutz und Hinweise</h1>
<p>Pretty Old Pixel ist ein privates, nicht kommerziell genutztes Projekt zur Übersicht öffentlich verfügbarer Videos.</p>
<h2>Hosting über GitHub Pages</h2>
<p>Diese Website wird bei GitHub Pages gehostet. Beim Besuch können technische Zugriffsdaten wie IP-Adresse, Zeitpunkt und Browserinformationen beim Hosting-Anbieter verarbeitet werden.
${externalLink("https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement", "Datenschutzerklärung von GitHub")}</p>
<h2>Videoinformationen</h2>
<p>Titel, Beschreibungen und Veröffentlichungsdaten stammen aus öffentlichen Angaben auf YouTube; Heftangaben ergänzen Informationen der Zeitschriftenarchive. Wenn Sie diese Texte lesen, wird keine Verbindung zu YouTube oder den Archiven hergestellt.</p>
<h2>YouTube-Vorschaubilder</h2>
<p>Auf Spiel- und Ausgabenseiten wird das Vorschaubild des ausgewählten Videos direkt von i.ytimg.com geladen. Bereits dieser Bildabruf übermittelt insbesondere Ihre IP-Adresse und technische Request-Daten an den Anbieter. Übersichtsseiten enthalten derzeit keine externen Bilder.</p>
<h2>YouTube-Player</h2>
<p>Der eingebettete Player wird erstmals geladen, wenn Sie „YouTube-Player aktivieren“ wählen. Er verwendet youtube-nocookie.com, den erweiterten Datenschutzmodus von YouTube. Das bedeutet nicht, dass keine Daten verarbeitet werden. Nach der Aktivierung kann YouTube/Google weitere Verbindungen aufbauen und Daten im Rahmen der Wiedergabe verarbeiten. Auf einen externen Player können Sie verzichten und stattdessen einen normalen YouTube-Link verwenden.</p>
<p>Diese Website merkt sich die Aktivierung in diesem Browser im Local Storage. Danach wird der Player auch bei weiteren Videos und Seitenbesuchen direkt geladen, ohne automatisch abzuspielen. Die Einstellung bleibt bis zum Zurücksetzen oder Löschen der Browserdaten erhalten. Mit „YouTube-Aktivierung zurücksetzen“ unter dem Player können Sie sie jederzeit löschen und wieder zum Vorschaubild wechseln.</p>
<p>Nach der Aktivierung wird außerdem die offizielle YouTube-IFrame-API von www.youtube.com geladen. Sie ermöglicht Kapitelsprünge im Player und erkennt das Videoende. Dabei wird Ihre IP-Adresse auch an diesen Anbieter übermittelt. Wenn die Steuerung nicht verfügbar ist, bleiben die externen Kapitel-Links und der manuelle Player nutzbar.</p>
<p>„Nächste Folge automatisch“ ist auf Spieleseiten zunächst aus. Wenn Sie die Option einschalten und ein Video starten, kann am Ende die nächste datierte Folge derselben Spielereihe beginnen. Sie können die Option jederzeit ausschalten. Am Reihenende oder vor Videos ohne Datum stoppt die Fortsetzung. Die Option gilt nur auf der aktuellen Seite und wird nicht gespeichert.</p>
<p>Gespeichert wird nur die Player-Aktivierung, kein Wiedergabeverlauf. Das ausgewählte Video bleibt in der Seitenadresse erhalten. Ohne JavaScript wird die Aktivierung nicht gemerkt; Kapitel öffnen YouTube, und die Folgenfortsetzung ist nicht verfügbar. Sie können den Player weiterhin einzeln aktivieren, alle Beschreibungen lesen und den YouTube-Links folgen.</p>
<p>${externalLink("https://policies.google.com/privacy?hl=de", "Datenschutzerklärung von Google")} · ${externalLink("https://www.youtube.com/t/terms", "Nutzungsbedingungen von YouTube")}</p>
<h2>Externe Links und eigene Speicherung</h2>
<p>Externe Links sind mit ↗ und einem zugänglichen Hinweis gekennzeichnet. Erst beim Aufrufen wird das jeweilige Ziel besucht; Vorschaubilder und bereits aktivierte Player sind davon ausgenommen. Diese Website setzt selbst keine Tracking-Cookies ein und verwendet keine Analytics-Dienste. Im Local Storage steht ausschließlich Ihre Player-Aktivierung; Session Storage wird nicht verwendet.</p>
<p><a href="${config.href()}">Zur Startseite und den Themen</a></p>`;
}

function periodicalSchema(magazine, config) {
  return {
    "@type": "Periodical", "@id": `${config.href(magazine.route)}#periodical`,
    name: magazine.name, url: config.href(magazine.route),
  };
}

function issueSchema(magazine, issue, config) {
  return {
    "@type": "PublicationIssue", "@id": `${config.href(issue.route)}#issue`,
    name: `${magazine.name} ${issue.label}`, url: config.href(issue.route),
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
    const archives = mention.issue?.route ? mention.issue.archives : mention.archives;
    return `<li><div class="issue-video-heading">${videoLink(video, config, `${mention.part ? `Teil ${mention.part}: ` : ""}${video.title}`, mention.issue?.route)}
${archives?.length ? archiveLinks(archives) : ""}</div>
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
      : issue ? escapeHtml(`${mention.name} ${issue.label}`) : "Heftausgabe unbekannt"}</h3>
${entryVideoList(group, model, config)}
${!(issue?.route ? issue.archives : mention.archives).length ? archiveLinks([]) : ""}
</section>`;
  }).join("")}</section>`).join("");
}

function renderMagazinePages(model, siteConfig, add) {
  if (!model.magazines.length && !model.unresolvedMagazines.length) return;
  const root = { route: "", name: "Startseite" };
  const index = { route: "zeitschriften/", name: "Zeitschriften" };
  function addPaginated({ route: baseRoute, entries, title, description, crumbs, intro, render, schema = () => [], items }) {
    const pageCount = Math.ceil(entries.length / siteConfig.pageSize);
    for (let page = 1; page <= pageCount; page += 1) {
      const route = paginatedRoute(baseRoute, page);
      const config = siteConfig.forPage(route);
      const pageSchema = schema(config);
      const subset = entries.slice((page - 1) * config.pageSize, page * config.pageSize);
      const videos = [...new Set(subset.flatMap((entry) => entry.videoId
        ? [entry.videoId] : entry.videoIds ?? []))].map((id) => model.videoById.get(id));
      add({
        route, title: `${title}${page > 1 ? ` – Seite ${page}` : ""}`, description: `${description}${page > 1 ? ` Seite ${page} von ${pageCount}.` : ""}`,
        crumbs: page === 1 ? crumbs : [...crumbs, { route, name: `Seite ${page}` }],
        schema: [{
          ...collectionSchema(items ? items(subset) : videos, config, route),
          ...(pageSchema.length ? { about: { "@id": pageSchema.at(-1)["@id"] } } : {}),
        }, ...pageSchema],
        previous: page > 1 ? paginatedRoute(baseRoute, page - 1) : null,
        next: page < pageCount ? paginatedRoute(baseRoute, page + 1) : null,
        body: `<h1>${escapeHtml(title)}${page > 1 ? ` – Seite ${page}` : ""}</h1>${typeof intro === "function" ? intro(config) : intro}${pagination(baseRoute, page, pageCount, config)}${render(subset, config)}${pagination(baseRoute, page, pageCount, config)}`,
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
    render: (entries, config) => {
      const magazines = entries.filter((entry) => entry.magazine).map((entry) => entry.magazine);
      const unresolved = entries.filter((entry) => !entry.magazine);
      return `${magazines.length ? `<ul class="magazine-index">${magazines.map((magazine) => `<li><a href="${config.href(magazine.route)}">${escapeHtml(magazine.name)}</a> · ${magazine.videos.length} Videos · ${magazine.years.length} Jahrgänge</li>`).join("")}</ul>` : ""}
${unresolved.length ? `<section><h2>Weitere Blätterabende</h2><p>Bei diesen Videos ist der Zeitschriftentitel unbekannt.</p>${entryVideoList(unresolved.map((entry) => ({ ...entry, mention: {} })), model, config)}</section>` : ""}`;
    },
  });
  for (const magazine of model.magazines) {
    const magazineCrumb = { route: magazine.route, name: magazine.name };
    const years = (config) => `<nav aria-label="Jahrgänge von ${escapeHtml(magazine.name)}"><ul class="year-list">${magazine.years.map((year) => `<li><a href="${config.href(year.route)}">${year.year}</a> (${year.entries.length} Videos)</li>`).join("")}</ul></nav>`;
    const unknownIndex = magazine.entries.findIndex((entry) => entry.mention.issue?.year === null || !entry.mention.issue);
    const unknownLink = (config) => unknownIndex < 0 ? "" : `<p><a href="${config.href(paginatedRoute(magazine.route, Math.floor(unknownIndex / config.pageSize) + 1))}">Jahrgang unbekannt</a>: ${magazine.entries.filter((entry) => !entry.mention.issue || entry.mention.issue.year === null).length} Videos ohne bekanntes Heftjahr.</p>`;
    addPaginated({
      route: magazine.route, entries: magazine.entries,
      title: `${magazine.name} – Blätterabend-Videos`,
      description: `${magazine.name} im Blätterabend: Jahrgänge, Ausgaben und zugehörige Videos mit Archivverweisen.`,
      crumbs: [root, index, magazineCrumb], schema: (config) => [periodicalSchema(magazine, config)],
      intro: (config) => `<p>${magazine.videos.length} Videos zu ${escapeHtml(magazine.name)}. Wählen Sie einen Jahrgang oder eine Ausgabe.</p>${years(config)}${unknownLink(config)}`,
      render: (entries, config) => groupedEntries(entries, model, config),
    });
    for (const year of magazine.years) {
      addPaginated({
        route: year.route, entries: year.entries,
        title: `${magazine.name} ${year.year} – Ausgaben und Blätterabend-Videos`,
        description: `${magazine.name}, Jahrgang ${year.year}: reguläre Ausgaben und Sonderhefte mit Blätterabend-Videos. Das Jahr bezeichnet das Erscheinen der Zeitschrift.`,
        crumbs: [root, index, magazineCrumb, { route: year.route, name: String(year.year) }],
        schema: (config) => [periodicalSchema(magazine, config)],
        intro: `<p>Die Ausgaben von ${escapeHtml(magazine.name)} aus ${year.year}: Blättern Sie durch die Hefte oder wählen Sie einen Videoteil.</p>`,
        render: (entries, config) => groupedEntries(entries, model, config),
      });
    }
    for (const issue of magazine.issues.values()) {
      const config = siteConfig.forPage(issue.route);
      const videos = issue.videos.map((videoId) => model.videoById.get(videoId));
      const title = `${magazine.name} ${issue.label}`;
      add({
        route: issue.route, title: `${title} – Blätterabend`, interactive: true,
        description: `${title}: Informationen zur Zeitschriftenausgabe, passende Archivlinks und alle zugehörigen Blätterabend-Videos.`,
        crumbs: [root, index, magazineCrumb, { route: issue.route, name: title }],
        schema: [collectionSchema(videos, config, issue.route, issue.route), periodicalSchema(magazine, config),
          issueSchema(magazine, issue, config), ...videos.map((video) => videoSchema(video, config, issue.route))],
        body: `${seriesVideos(videos, title, config, null, metadata([
  ["Zeitschrift", `<a href="${config.href(magazine.route)}">${escapeHtml(magazine.name)}</a>`],
  ["Ausgabe", `${escapeHtml(issue.label)}${issue.special ? " (Sonderheft)" : ""}`],
  ["Erscheinungsjahr", issue.year !== null ? `<a href="${config.href(`${magazine.route}${issue.year}/`)}">${issue.year}</a>` : "Unbekannt"],
  ...(issue.number !== null ? [["Heftnummer", issue.number]] : []),
  ...(issue.months.length ? [["Monat(e)", issue.months.join(" / ")]] : []),
]))}
<section><h2>Archivlinks</h2>${archiveLinks(issue.archives)}</section>
<p><a href="${config.href(magazine.route)}">Weitere Ausgaben von ${escapeHtml(magazine.name)}</a> · <a href="${config.href(index.route)}">Andere Zeitschriften entdecken</a></p>`,
      }, videos);
    }
  }
}

function seriesVideos(videos, title, config, game, introduction = "") {
  const entries = new Map(game?.series.entries.map((entry) => [entry.videoId, entry]) ?? []);
  const runs = new Map(game?.series.runs.map((run) => [run.id, run]) ?? []);
  function context(video) {
    const entry = entries.get(video.id);
    return `${escapeHtml(entry.phase.label)} · ${escapeHtml(runs.get(entry.runId).label)}`;
  }
  const menu = `<details class="episode-menu" open><summary>☰ Videos ${game ? "zu diesem Spiel" : "zu dieser Ausgabe"} (${videos.length})</summary>
<nav aria-label="Videos ${game ? "zum Spiel" : "zur Ausgabe"}" tabindex="0"><ol>${videos.map((video, index) => `<li><a data-video-link href="#video-${video.id}">${index + 1}/${videos.length}: ${escapeHtml(video.title)}</a>
<p class="meta">${video.durationSeconds !== null ? `<span aria-label="Laufzeit">${durationLabel(video.durationSeconds)}</span>` : "Laufzeit unbekannt"} · ${video.publishedAt ? `<time datetime="${video.publishedAt}">${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(new Date(video.publishedAt))}</time>` : "Datum unbekannt"}${game ? `<br>${context(video)}` : ""}</p></li>`).join("")}</ol></nav></details>`;
  const panels = `<div class="video-panels">${videos.map((video, index) => `<article id="video-${video.id}" data-video-panel${video.publishedAt ? ' data-dated="true"' : ""} data-player-url="${video.embedUrl}" data-poster="${escapeHtml(playerPoster(video))}" tabindex="-1">
<h2>Video ${index + 1}/${videos.length}: ${escapeHtml(video.title)}</h2>
${metadata([
  ["Veröffentlicht", videoDate(video)],
  ...(video.durationSeconds !== null ? [["Länge", durationLabel(video.durationSeconds)]] : []),
  ...(game ? [["Abschnitt", escapeHtml(entries.get(video.id).phase.label)], ["Reihe", escapeHtml(runs.get(entries.get(video.id).runId).label)]] : []),
])}
${sectionLinks(video, config)}
${game ? `<p>Spiel: <a href="${config.href(game.route)}">${escapeHtml(game.name)}</a>${game.playlists.filter((playlist) => video.playlists.some((source) => source.id === playlist.id)).map((playlist) => ` · ${externalLink(playlist.url, playlist.title)}`).join("")}</p>` : ""}
<p><span data-player-activate>${externalLink(video.embedUrl, "YouTube-Player hier aktivieren", "issue-player")}</span> · ${externalLink(video.url, "Video auf YouTube ansehen")}</p>
${video.chapters.length ? `<section class="video-chapters"><h3>Kapitel und Zeitmarken</h3><p class="meta" data-chapter-hint>Ohne aktivierte Player-Steuerung öffnen die Links das Video auf YouTube.</p><ol>${video.chapters.map((chapter) => `<li data-chapter-seconds="${chapter.seconds}">${externalLink(chapter.url, `${durationLabel(chapter.seconds)} · ${chapter.label}`)}</li>`).join("")}</ol></section>` : ""}
${video.mentionedChannels.length ? `<section class="mentioned-channels"><h3>Erwähnte Kanäle / Partner</h3><p class="meta">YouTube-Kanäle aus der Videobeschreibung. Eine Erwähnung bedeutet nicht, dass eine bezahlte Zusammenarbeit besteht.</p><ul>${video.mentionedChannels.map((channel) => `<li>${externalLink(channel.url, channel.label)}</li>`).join("")}</ul></section>` : ""}
<section><h3>Videobeschreibung</h3><div class="description">${video.description ? descriptionHtml(video.description) : "<p>Für dieses Video ist keine Beschreibung vorhanden.</p>"}</div></section>
${video.magazines.length > 1 ? magazineDetails(video, config) : ""}
<nav aria-label="Videoteile">${index > 0 ? `<a href="#video-${videos[index - 1].id}">← Vorheriger Teil</a>` : ""}
${index + 1 < videos.length ? `<a href="#video-${videos[index + 1].id}">Nächster Teil →</a>` : ""}</nav></article>`).join("")}</div>`;
  const privacy = `<aside id="datenschutzhinweis"><h2>YouTube-Einbindung</h2><p>Das Vorschaubild kommt direkt von YouTube. Nach Ihrer ersten Aktivierung wird der Player in diesem Browser auch auf weiteren Seiten direkt geladen, ohne automatisch abzuspielen. Unter dem Player können Sie die Aktivierung zurücksetzen.
<a href="${config.href("datenschutz/")}">Datenschutz und Hinweise lesen</a>.</p></aside>`;
  return `<section data-video-series data-title="${escapeHtml(title)}" class="detail-layout">
<div class="detail-main">
<h1 class="detail-heading" title="${escapeHtml(title)}">${escapeHtml(title)}</h1>
<div class="detail-player">${player(videos[0])}<div class="player-controls meta" data-player-controls hidden>
${game ? '<label><input type="checkbox" data-auto-next disabled> Nächste Folge automatisch</label>' : ""}
<button type="button" data-player-play hidden>Video manuell starten</button>
</div></div>
<div class="detail-information">${introduction}<p><a href="#video-${videos[0].id}">Mit Video 1/${videos.length} beginnen</a></p>${game ? gameSeriesGuide(game, videos) : ""}${panels}${privacy}</div>
</div>${menu}
</section>`;
}

function gameSeriesGuide(game, videos) {
  const positions = new Map(videos.map((video, index) => [video.id, index + 1]));
  const links = (ids) => ids.map((id) => `<a href="#video-${id}">Video ${positions.get(id)}/${videos.length}</a>`).join(" · ");
  return `<details class="series-guide"><summary>Abschnitte und Reihen (${game.series.phases.length} ${game.series.phases.length === 1 ? "Abschnitt" : "Abschnitte"}, ${game.series.runs.length} ${game.series.runs.length === 1 ? "Reihe" : "Reihen"})</summary>
<p>Direkt zu Intro, Spielverlauf oder Fazit: Hier finden Sie die Videos nach Abschnitten. Die vollständige Videoliste beginnt mit dem ältesten Video.</p>
<section><h2>Abschnitte der Spielereihe</h2><ul>${game.series.phases.map((phase) => `<li><strong>${escapeHtml(phase.label)}</strong>: ${links(phase.videos)}</li>`).join("")}</ul></section>
<section><h2>Videoreihen und Durchläufe</h2>
<p>Entdecken Sie die verschiedenen Formate und Durchläufe zu diesem Spiel.</p>
<ul>${game.series.runs.map((run) => `<li><strong>${escapeHtml(run.label)}</strong>: ${links(run.videos)}</li>`).join("")}</ul></section>
</details>`;
}

function gameSchema(game, config) {
  return {
    "@type": "VideoGame", "@id": `${config.href(game.route)}#game`,
    name: game.name, url: config.href(game.route),
    ...(game.platforms?.length ? { gamePlatform: game.platforms } : {}),
    ...(game.aliases?.length ? { alternateName: game.aliases } : {}),
  };
}

function renderGamePages(model, siteConfig, add) {
  if (!model.games.length) return;
  const root = { route: "", name: "Startseite" };
  const index = { route: "spiele/", name: "Spiele" };
  const pageCount = Math.ceil(model.games.length / siteConfig.pageSize);
  for (let page = 1; page <= pageCount; page += 1) {
    const route = paginatedRoute(index.route, page);
    const config = siteConfig.forPage(route);
    const games = model.games.slice((page - 1) * config.pageSize, page * config.pageSize);
    const videos = [...new Set(games.flatMap((game) => game.videos))].map((id) => model.videoById.get(id));
    add({
      route, title: `Spiele – Retro-Spielereihen${page > 1 ? ` – Seite ${page}` : ""}`,
      description: `Retrospiele von Pretty Old Pixel: Spielereihen vom Intro bis zum Fazit, alphabetisch geordnet. Seite ${page} von ${pageCount}.`,
      crumbs: page === 1 ? [root, index] : [root, index, { route, name: `Seite ${page}` }],
      schema: collectionSchema(games.map((game) => ({ title: game.name, route: game.route })), config, route),
      previous: page > 1 ? paginatedRoute(index.route, page - 1) : null,
      next: page < pageCount ? paginatedRoute(index.route, page + 1) : null,
      body: `<h1>Spiele${page > 1 ? ` – Seite ${page}` : ""}</h1><p>${model.games.length} Retrospiele, alphabetisch geordnet. Entdecken Sie Spielverläufe, Unboxings und Gespräche rund um die Spiele.</p>
${pagination(index.route, page, pageCount, config)}
<ul>${games.map((game) => `<li><a href="${config.href(game.route)}">${escapeHtml(game.name)}</a>${game.platforms.length ? ` (${escapeHtml(game.platforms.join(", "))})` : ""} · ${game.videos.length} Videos</li>`).join("")}</ul>
${pagination(index.route, page, pageCount, config)}`,
    }, videos);
  }
  for (const game of model.games) {
    const config = siteConfig.forPage(game.route);
    const videos = game.videos.map((id) => model.videoById.get(id));
    const unknown = videos.filter((video) => video.publishedAt === null);
    add({
      route: game.route, title: `${game.name} – Spielinformationen und Videos`, interactive: true,
      description: `${game.name}${game.platforms.length ? ` (${game.platforms.join(", ")})` : ""}: ${videos.length} Videos von Pretty Old Pixel mit vollständigen Beschreibungen, chronologisch von der ersten bis zur neuesten Veröffentlichung.`,
      crumbs: [root, index, { route: game.route, name: game.name }],
      schema: [{ ...collectionSchema(videos, config, game.route, game.route), about: { "@id": `${config.href(game.route)}#game` } },
        gameSchema(game, config), ...videos.map((video) => videoSchema(video, config, game.route))],
      body: `${seriesVideos(videos, game.name, config, game, `<p>${videos.length} Videos rund um ${escapeHtml(game.name)} auf Pretty Old Pixel.</p>
${metadata([
  ["Spieltitel", escapeHtml(game.name)],
  ...(game.platforms.length ? [["Plattform", escapeHtml(game.platforms.join(", "))]] : []),
  ...(game.aliases.length ? [["Weitere Titel", escapeHtml(game.aliases.join(", "))]] : []),
  ["Videos", videos.length],
])}
<p>Die Videos beginnen mit der ältesten Veröffentlichung.</p>
${unknown.length ? `<p>${unknown.length} Videos ohne bekanntes Veröffentlichungsdatum stehen gesondert am Ende der Liste.</p>` : ""}`)}
<section><h2>Playlists auf YouTube</h2><ul>${game.playlists.map((playlist) => `<li>${externalLink(playlist.url, playlist.title)}</li>`).join("")}</ul></section>
<p><a href="${config.href(index.route)}">Weitere Spiele entdecken</a> · <a href="${config.href("news/")}">Neue Videos</a></p>`,
    }, videos);
  }
}

function renderSectionPages(model, siteConfig, add) {
  for (const section of model.sections) {
    const count = Math.ceil(section.entries.length / siteConfig.pageSize);
    for (let page = 1; page <= count; page += 1) {
      const route = paginatedRoute(section.route, page);
      const config = siteConfig.forPage(route);
      const entries = section.entries.slice((page - 1) * config.pageSize, page * config.pageSize);
      const videos = entries.map((entry) => model.videoById.get(entry.videoId));
      const byVideo = new Map(entries.map((entry) => [entry.videoId, entry]));
      let listing;
      if (section.id === "retrospektiven") {
        const groups = new Map();
        for (const entry of entries) {
          if (!groups.has(entry.topic)) groups.set(entry.topic, []);
          groups.get(entry.topic).push(model.videoById.get(entry.videoId));
        }
        listing = [...groups].map(([topic, videos]) => `<section><h2>${escapeHtml(topic)}</h2>${videoList(videos, config, byVideo, 3)}</section>`).join("");
      } else {
        listing = videoList(videos, config, byVideo);
      }
      add({
        route, title: `${section.name}${page > 1 ? ` – Seite ${page}` : ""}`,
        description: `${section.description} Seite ${page} von ${count}.`,
        crumbs: [{ route: "", name: "Startseite" }, { route: section.route, name: section.name },
          ...(page > 1 ? [{ route, name: `Seite ${page}` }] : [])],
        schema: collectionSchema(videos, config, route),
        previous: page > 1 ? paginatedRoute(section.route, page - 1) : null,
        next: page < count ? paginatedRoute(section.route, page + 1) : null,
        body: `<h1>${escapeHtml(section.name)}${page > 1 ? ` – Seite ${page}` : ""}</h1>
<p>${escapeHtml(section.description)}</p><p>${section.entries.length} Videos. ${section.id === "retrospektiven"
  ? "Wählen Sie ein Thema und entdecken Sie die Geschichte der Spiele Folge für Folge."
  : "Entdecken Sie die Beiträge, beginnend mit den neuesten Videos."}</p>
${pagination(section.route, page, count, config)}${listing}${pagination(section.route, page, count, config)}`,
      }, videos);
    }
  }
}

export function renderSite(model, config, cssHref, jsHref = "assets/video-series.js") {
  const pages = new Map();
  const hasMagazines = model.magazines.length > 0 || model.unresolvedMagazines.length > 0;
  function add(options, videos = []) {
    const file = options.file ?? `${options.route}index.html`;
    if (pages.has(file)) throw new Error(`Kollidierender Ausgabepfad: ${file}`);
    pages.set(file, {
      html: layout(options, config.forPage(options.route), cssHref, hasMagazines, jsHref, model.games.length > 0, model.sections),
      route: options.route, indexable: !options.noindex,
      contentPublishedAt: latestPublication(videos),
    });
  }
  const root = { route: "", name: "Startseite" };
  add({
    route: "", title: "Retrospiele, Zeitschriften und Kanalgeschichte",
    description: "Pretty Old Pixel in Zahlen: Videos, Spiele, Zeitschriften, Heftausgaben und Kanalgeschichte. Retro-Themen entdecken und passende Videos finden.",
    crumbs: [root], schema: { "@type": "WebPage", "@id": "./#page", name: "Pretty Old Pixel in Zahlen" },
    body: `<h1>Pretty Old Pixel</h1>
<p class="lead">Retrospiele entdecken, alte Computerzeitschriften durchblättern und Videos wiederfinden.</p>
${homeOverview(model, config)}`,
  }, model.videos);
  const newsConfig = config.forPage("news/");
  add({
    route: "news/", title: "News – die 20 neuesten Videos",
    description: "Die 20 neuesten veröffentlichten Videos von Pretty Old Pixel, chronologisch nach YouTube-Veröffentlichung: Retrospiele, Blätterabend und weitere Themen.",
    crumbs: [root, { route: "news/", name: "News" }],
    schema: collectionSchema(model.news, newsConfig, "news/"),
    body: `<h1>News – die neuesten Videos</h1><p>Die neuesten Veröffentlichungen, neueste zuerst. Maßgeblich ist das Veröffentlichungsdatum des Videos, nicht der Abruf der Daten.</p>${videoList(model.news, newsConfig)}`,
  }, model.news);

  renderMagazinePages(model, config, add);
  renderGamePages(model, config, add);
  renderSectionPages(model, config, add);

  add({
    route: "datenschutz/", title: "Datenschutz und Hinweise",
    description: "Hinweise zu GitHub Pages, öffentlichen Metadaten und der direkten YouTube-Einbindung auf dem privaten, nicht kommerziellen Projekt Pretty Old Pixel.",
    crumbs: [root, { route: "datenschutz/", name: "Datenschutz" }],
    schema: { "@type": "WebPage", "@id": "./#page", name: "Datenschutz und Hinweise" },
    body: privacyBody(config.forPage("datenschutz/")),
  });
  add({
    route: "404.html", file: "404.html", title: "Seite nicht gefunden", noindex: true,
    description: "Diese Seite wurde nicht gefunden. Über die Startseite und die Themenbereiche finden Sie die Videos von Pretty Old Pixel.",
    crumbs: [root, { route: "404.html", name: "Seite nicht gefunden" }],
    schema: { "@type": "WebPage", name: "Seite nicht gefunden" },
    body: `<h1>Seite nicht gefunden</h1><p>Unter dieser Adresse gibt es keine Seite.</p><p><a href="${config.href()}">Zur Startseite und den Themen</a></p>`,
  });
  return pages;
}
