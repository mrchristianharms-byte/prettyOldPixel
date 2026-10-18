import { paginatedRoute } from "./site-config.mjs";
import { escapeHtml, externalLink } from "./site-html.mjs";
import { videoHref } from "./site-video-links.mjs";
import { videoWidget } from "./widget/video.mjs";
import { episodeList } from "./widget/episode-list.mjs";
import { catalogGrid } from "./widget/catalog-grid.mjs";
import { metadata } from "./widget/metadata.mjs";
import { videoList, videoListEntry } from "./widget/video-entry.mjs";
import { pagination } from "./widget/pagination.mjs";
import { archiveLinks } from "./widget/archive-links.mjs";
import { magazineLogo } from "./widget/magazine-logo.mjs";
import { videoPanel } from "./widget/video-panel.mjs";
import { navigation } from "./widget/navigation.mjs";

export { escapeHtml, externalLink } from "./site-html.mjs";
export { videoHref } from "./site-video-links.mjs";
export { descriptionHtml } from "./widget/video-panel.mjs";

export function jsonLd(value) {
  return JSON.stringify(value).replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e")
    .replace(/&/gu, "\\u0026").replace(/\u2028/gu, "\\u2028").replace(/\u2029/gu, "\\u2029");
}

function countLabel(count, singular, plural) {
  return `${new Intl.NumberFormat("de-DE").format(count)} ${count === 1 ? singular : plural}`;
}

function videoCount(count) {
  return countLabel(count, "Video", "Videos");
}

function latestPublication(videos) {
  const times = videos.map((video) => video.publishedTime).filter((value) => value !== null);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

function catalogDuration(videoIds, model) {
  const durations = videoIds.map((id) => model.videoById.get(id).durationSeconds).filter((seconds) => seconds !== null);
  if (!durations.length) return "Gesamtlaufzeit unbekannt";
  const minutes = Math.round(durations.reduce((sum, seconds) => sum + seconds, 0) / 60);
  const hours = Math.floor(minutes / 60);
  const total = `${hours}:${String(minutes % 60).padStart(2, "0")} h`;
  return durations.length === videoIds.length
    ? `Gesamtlaufzeit: ${total}`
    : `Bekannte Laufzeit: ${total} (${durations.length} von ${videoCount(videoIds.length)})`;
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
    ...(knownDurations.length ? [["Stunden Video", number(hours), `${knownDurations.length === model.videos.length ? "Gesamtlaufzeit" : `Bekannte Laufzeiten: ${number(knownDurations.length)} von ${videoCount(model.videos.length)}`}, auf volle Stunden abgerundet`]] : []),
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
<div class="theme-grid">${themes.map((theme) => `<article><h3><a href="${config.href(theme.route)}">${escapeHtml(theme.name)}</a></h3><p class="theme-count">${videoCount(theme.count)}</p><p>${escapeHtml(theme.description)}</p></article>`).join("")}</div>
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
  const legacySections = ["hardware", "retrospektiven", "interviews", "sonstiges"]
    .flatMap((id) => sections.filter((section) => section.id === id));
  const navigationEntries = [
    ["news/", "News"],
    ...(hasMagazines ? [["zeitschriften/", "Blätterabend"]] : []),
    ...(hasGames ? [["spiele/", "re.play"]] : []),
    ...sections.filter((section) => !legacySections.includes(section)).map((section) => [section.route, section.name]),
    ...legacySections.map((section, index) => [
      section.route, { hardware: "re.ware", retrospektiven: "projects", interviews: "Interviews" }[section.id] ?? section.name,
      index === 0,
    ]),
  ];
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
${navigation(navigationEntries, route, config)}
</header>
<main id="inhalt" class="container">
${breadcrumbsMarkup(crumbs, config)}
${body}
</main>
<footer class="container site-footer"><p>${config.name} · Privates, nicht kommerzielles Projekt.
<a href="${config.href("datenschutz/")}">${interactive ? "YouTube-Einbindung und Datenschutz" : "Datenschutz und Hinweise"}</a></p>
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

function privacyBody(config) {
  return `<h1>Datenschutz und Hinweise</h1>
<p>Pretty Old Pixel ist ein privates, nicht kommerziell genutztes Projekt zur Übersicht öffentlich verfügbarer Videos.</p>
<h2>Hosting über GitHub Pages</h2>
<p>Diese Website wird bei GitHub Pages gehostet. Beim Besuch können technische Zugriffsdaten wie IP-Adresse, Zeitpunkt und Browserinformationen beim Hosting-Anbieter verarbeitet werden.
${externalLink("https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement", "Datenschutzerklärung von GitHub")}</p>
<h2>Videoinformationen</h2>
<p>Titel, Beschreibungen und Veröffentlichungsdaten stammen aus öffentlichen Angaben auf YouTube; Heftangaben ergänzen Informationen der Zeitschriftenarchive. Wenn Sie diese Texte lesen, wird keine Verbindung zu YouTube oder den Archiven hergestellt.</p>
<h2>YouTube-Vorschaubilder</h2>
<p>Auf Spiel- und Ausgabenseiten sowie in den Videolisten von News, Zeitschriften und Jahrgängen, Hardware, Retrospektiven, Interviews, re.consider und Sonstiges werden Vorschaubilder direkt von i.ytimg.com geladen. Bereits dieser Bildabruf übermittelt insbesondere Ihre IP-Adresse und technische Request-Daten an den Anbieter. Die kleinen Listenvorschauen werden beim Annähern an den sichtbaren Bereich geladen, unabhängig von der Player-Aktivierung. Die Spiele- und Zeitschriftenkacheln enthalten keine externen Bilder.</p>
<h2>YouTube-Player</h2>
<p>Der eingebettete Player wird erstmals geladen, wenn Sie „YouTube-Player aktivieren“ wählen. Er verwendet youtube-nocookie.com, den erweiterten Datenschutzmodus von YouTube. Das bedeutet nicht, dass keine Daten verarbeitet werden. Nach der Aktivierung kann YouTube/Google weitere Verbindungen aufbauen und Daten im Rahmen der Wiedergabe verarbeiten. Auf einen externen Player können Sie verzichten und stattdessen einen normalen YouTube-Link verwenden.</p>
<p>Diese Website merkt sich die Aktivierung in diesem Browser im Local Storage. Danach wird der Player auch bei weiteren Videos und Seitenbesuchen direkt geladen, ohne automatisch abzuspielen. Die Einstellung bleibt bis zum Zurücksetzen oder Löschen der Browserdaten erhalten. Mit „YouTube-Aktivierung zurücksetzen“ unter dem Player können Sie sie jederzeit löschen und wieder zum Vorschaubild wechseln.</p>
<p>Nach der Aktivierung wird außerdem die offizielle YouTube-IFrame-API von www.youtube.com geladen. Sie ermöglicht Kapitelsprünge im Player und erkennt das Videoende. Dabei wird Ihre IP-Adresse auch an diesen Anbieter übermittelt. Wenn die Steuerung nicht verfügbar ist, bleiben die externen Kapitel-Links und der manuelle Player nutzbar.</p>
<p>„Nächste Folge automatisch“ ist ohne bisherige Auswahl zunächst aus. Ihre Auswahl wird als eigener Ein-/Aus-Wert in diesem Browser im Local Storage gespeichert und auf weiteren Spiel- und Ausgabenseiten wiederhergestellt. Wenn Sie die Option einschalten und ein Video starten, kann am Ende die nächste datierte Folge desselben Spiels bzw. derselben Heftausgabe beginnen. Sie können die Option jederzeit ausschalten. Am Reihenende, vor Videos ohne Datum oder bei Wiedergabeproblemen stoppt die Fortsetzung, ohne Ihre gespeicherte Auswahl zu ändern. Neue Seiten starten kein Video automatisch. Das Zurücksetzen der YouTube-Aktivierung löscht nicht diese Auswahl; ausschalten können Sie sie am Kontrollkästchen oder durch Löschen der Browserdaten.</p>
<p>Gespeichert werden nur die Player-Aktivierung und die Einstellung zur automatischen Folgenfortsetzung, kein Wiedergabeverlauf. Das ausgewählte Video bleibt in der Seitenadresse erhalten. Ohne JavaScript werden die Einstellungen nicht gemerkt; Kapitel öffnen YouTube, und die Folgenfortsetzung ist nicht verfügbar. Sie können den Player weiterhin einzeln aktivieren, alle Beschreibungen lesen und den YouTube-Links folgen.</p>
<p>${externalLink("https://policies.google.com/privacy?hl=de", "Datenschutzerklärung von Google")} · ${externalLink("https://www.youtube.com/t/terms", "Nutzungsbedingungen von YouTube")}</p>
<h2>Externe Links und eigene Speicherung</h2>
<p>Externe Links sind mit ↗ und einem zugänglichen Hinweis gekennzeichnet. Erst beim Aufrufen wird das jeweilige Ziel besucht; Vorschaubilder und bereits aktivierte Player sind davon ausgenommen. Diese Website setzt selbst keine Tracking-Cookies ein und verwendet keine Analytics-Dienste. Im Local Storage stehen ausschließlich Ihre Player-Aktivierung und die Einstellung zur automatischen Folgenfortsetzung; Session Storage wird nicht verwendet.</p>
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

function entryVideoList(entries, model, config, headingLevel = 4) {
  return `<ol class="video-list">${entries.map(({ videoId, mention }) => {
    const video = model.videoById.get(videoId);
    return videoListEntry(video, config, undefined, headingLevel, {
      label: `${mention.part ? `Teil ${mention.part}: ` : ""}${video.title}`,
      issueRoute: mention.issue?.route,
    });
  }).join("")}</ol>`;
}

function groupedEntries(entries, model, config) {
  const sections = new Map();
  for (const entry of entries) {
    const issue = entry.mention.issue;
    const year = issue?.year ?? null;
    const title = `${year === null ? "Jahrgang unbekannt" : `Jahrgang ${year}`} – ${issue?.special ? "Sonderhefte" : "Ausgaben"}`;
    if (!sections.has(title)) sections.set(title, new Map());
    const groups = sections.get(title);
    const key = issue?.id ?? entry.videoId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...sections].map(([title, groups]) => `<section><h2>${title}</h2>${[...groups.values()].map((group) => {
    const mention = group[0].mention;
    const issue = mention.issue;
    const archives = issue?.route ? issue.archives : mention.archives;
    return `<section class="issue-group"><h3>${issue?.route
      ? `<a href="${config.href(issue.route)}">${escapeHtml(`${mention.name} ${issue.label}`)}</a>`
      : issue ? escapeHtml(`${mention.name} ${issue.label}`) : `${escapeHtml(mention.name)} – Heftausgabe unbekannt`}${archives.length ? ` ${archiveLinks(archives, true)}` : ""}</h3>
${entryVideoList(group, model, config)}
${!archives.length ? archiveLinks([]) : ""}
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
      return `${magazines.length ? catalogGrid(magazines.map((magazine) => ({
        ...magazine, facts: [
          ...(magazine.years.length ? [countLabel(magazine.years.length, "Jahrgang", "Jahrgänge")] : []),
          videoCount(magazine.videos.length), catalogDuration(magazine.videos, model),
        ],
      })), config) : ""}
${unresolved.length ? `<section><h2>Weitere Blätterabende</h2><p>Bei diesen Videos ist der Zeitschriftentitel unbekannt.</p>${entryVideoList(unresolved.map((entry) => ({ ...entry, mention: {} })), model, config, 3)}</section>` : ""}`;
    },
  });
  for (const magazine of model.magazines) {
    const magazineCrumb = { route: magazine.route, name: magazine.name };
    const years = (config) => magazine.years.length > 1 ? `<nav aria-label="Jahrgänge von ${escapeHtml(magazine.name)}"><ul class="year-list">${magazine.years.map((year) => `<li><a href="${config.href(year.route)}">${year.year}</a> (${videoCount(year.entries.length)})</li>`).join("")}</ul></nav>` : "";
    const unknownIndex = magazine.entries.findIndex((entry) => entry.mention.issue?.year === null || !entry.mention.issue);
    const unknownLink = (config) => unknownIndex < 0 ? "" : `<p><a href="${config.href(paginatedRoute(magazine.route, Math.floor(unknownIndex / config.pageSize) + 1))}">Jahrgang unbekannt</a>: ${videoCount(magazine.entries.filter((entry) => !entry.mention.issue || entry.mention.issue.year === null).length)} ohne bekanntes Heftjahr.</p>`;
    addPaginated({
      route: magazine.route, entries: magazine.entries,
      title: `${magazine.name} – Blätterabend-Videos`,
      description: `${magazine.name} im Blätterabend: Jahrgänge, Ausgaben und zugehörige Videos mit Archivverweisen.`,
      crumbs: [root, index, magazineCrumb], schema: (config) => [periodicalSchema(magazine, config)],
      intro: (config) => `${magazineLogo(magazine, config)}<p>${videoCount(magazine.videos.length)} zu ${escapeHtml(magazine.name)}. ${magazine.years.length > 1 ? "Wählen Sie einen Jahrgang oder eine Ausgabe." : "Wählen Sie eine Ausgabe."}</p>${years(config)}${unknownLink(config)}`,
      render: (entries, config) => groupedEntries(entries, model, config),
    });
    for (const year of magazine.years.length > 1 ? magazine.years : []) {
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
  ["Archivlinks", archiveLinks(issue.archives, false, { visibleLabel: true })],
]))}
<p><a href="${config.href(magazine.route)}">Weitere Ausgaben von ${escapeHtml(magazine.name)}</a> · <a href="${config.href(index.route)}">Andere Zeitschriften entdecken</a></p>`,
      }, videos);
    }
  }
}

function seriesVideos(videos, title, config, game, introduction = "") {
  const entries = new Map(game?.series.entries.map((entry) => [entry.videoId, entry]) ?? []);
  const runs = new Map(game?.series.runs.map((run) => [run.id, run]) ?? []);
  const menu = episodeList(videos, game);
  const panels = `<div class="video-panels">${videos.map((video, index) => videoPanel(video, config, {
    index, total: videos.length, previous: videos[index - 1], next: videos[index + 1],
    game, entry: entries.get(video.id), run: runs.get(entries.get(video.id)?.runId),
  })).join("")}</div>`;
  return `<section data-video-series data-title="${escapeHtml(title)}" class="detail-layout">
<div class="detail-main">
<h1 class="detail-heading" title="${escapeHtml(title)}">${escapeHtml(title)}</h1>
${videoWidget(videos[0])}
<div class="detail-information">${introduction}<hr>${panels}</div>
</div>${menu}
</section>`;
}

function gameSchema(game, config) {
  return {
    "@type": "VideoGame", "@id": `${config.href(game.route)}#game`,
    name: game.name, url: config.href(game.route),
    ...(game.platforms?.length ? { gamePlatform: game.platforms } : {}),
    ...(game.aliases?.length ? { alternateName: game.aliases } : {}),
  };
}

function gameReleaseSource(url, iconOnly = false) {
  const hostname = new URL(url).hostname;
  const label = hostname === "www.mobygames.com" ? "MobyGames" : hostname;
  return iconOnly
    ? `<a href="${escapeHtml(new URL(url).href)}" rel="external" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)} (externe Website)"><span aria-hidden="true">↗</span></a>`
    : externalLink(url, label);
}

function renderGameMetadata(game) {
  const record = game.metadata;
  const data = record?.status === "ready" ? record.data : null;
  const { evidence, scope, genres = [], releases = [] } = data ?? {};
  const groups = new Map();
  for (const release of releases) {
    const key = JSON.stringify([release.platform, release.year, release.developer,
      release.publisher, release.publisherLabel]);
    if (!groups.has(key)) groups.set(key, { ...release, countries: new Set() });
    const countries = release.countries?.split(",").map((country) => country.trim()).filter(Boolean) ?? [];
    for (const country of countries) {
      groups.get(key).countries.add(country);
    }
  }
  const fields = ["platform", "year", "developer", "publisher", "publisherLabel"];
  const groupedReleases = [...groups.values()];
  const displayedReleases = groupedReleases.filter((release) => !groupedReleases.some((other) =>
    other !== release
    && fields.every((field) => release[field] === null || release[field] === undefined
      || release[field] === "" || release[field] === other[field])
    && fields.some((field) => !release[field] && Boolean(other[field]))
    && [...release.countries].every((country) => other.countries.has(country))))
    .sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity)
      || fields.filter((field) => Boolean(b[field])).length - fields.filter((field) => Boolean(a[field])).length
      || JSON.stringify(fields.map((field) => a[field])).localeCompare(JSON.stringify(fields.map((field) => b[field])), "de"));
  const missing = (value) => value ? escapeHtml(String(value)) : "Keine Angabe";
  const primary = displayedReleases[0];
  const additional = displayedReleases.slice(1);
  const countries = (release) => release.countries.size
    ? escapeHtml([...release.countries].sort((a, b) => a.localeCompare(b, "de")).join(", ")) : "Keine Angabe";
  const platforms = game.platforms.length ? game.platforms : scope?.platforms ?? [];
  const sources = [...new Set([
    ...(game.releaseYearSource ? [gameReleaseSource(game.releaseYearSource, true)] : []),
    ...(evidence ? [gameReleaseSource(evidence.sourceUrl, true)] : []),
  ])];
  const yearLines = [];
  if (game.releaseYear !== null) yearLines.push(
    `${game.releaseYear} ${gameReleaseSource(game.releaseYearSource, true)}`);
  if (primary) {
    const releaseText = `${missing(primary.year)} · ${missing(primary.platform)} · ${countries(primary)}`;
    if (primary.year === game.releaseYear && yearLines.length) {
      yearLines[0] = `${releaseText} ${sources.join(" ")}`;
    } else yearLines.push(`${releaseText} ${gameReleaseSource(evidence.sourceUrl, true)}`);
  }
  return `<section aria-label="Zusätzliche Spielinformationen"><h2>Spielinformationen</h2>
${metadata([
    ...(platforms.length ? [["Plattform", escapeHtml(platforms.join(", "))]] : []),
    ...(data ? [
      ["Genre", genres.length ? escapeHtml(genres.join(", ")) : "Keine Angabe"],
      ["Entwickler", missing(primary?.developer)],
      ["Publisher", `${missing(primary?.publisher)}${primary?.publisherLabel ? ` (${escapeHtml(primary.publisherLabel)})` : ""}`],
    ] : []),
    ["Erscheinungsjahr", yearLines.length ? yearLines.join("<br>") : "Unbekannt"],
    ...(game.aliases.length ? [["Weitere Titel", escapeHtml(game.aliases.join(", "))]] : []),
  ])}
${!data ? "<p>Für dieses Spiel liegen noch keine eindeutig zugeordneten zusätzlichen Metadaten vor.</p>" : ""}
${additional.length ? `<details><summary>Weitere Veröffentlichungen (${additional.length})</summary>
<div class="overflow-auto"><table><caption>Veröffentlichungen für ${escapeHtml(scope.platforms.join(", "))}</caption>
<thead><tr><th scope="col">Plattform</th><th scope="col">Jahr</th><th scope="col">Entwickler</th><th scope="col">Publisher</th><th scope="col">Länder</th></tr></thead>
<tbody>${additional.map((release) => `<tr><td>${missing(release.platform)}</td><td>${missing(release.year)}</td><td>${missing(release.developer)}</td><td>${missing(release.publisher)}${release.publisherLabel ? ` (${escapeHtml(release.publisherLabel)})` : ""}</td><td>${countries(release)}</td></tr>`).join("")}</tbody>
</table></div></details>` : ""}</section>`;
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
<div class="game-catalog">${catalogGrid(games.map((game) => ({
        ...game, facts: [
          game.platforms.join(", "), `Erscheinungsjahr: ${game.releaseYear ?? "unbekannt"}`,
          videoCount(game.videos.length), catalogDuration(game.videos, model),
        ].filter(Boolean),
      })), config)}</div>
${pagination(index.route, page, pageCount, config)}`,
    }, videos);
  }
  for (const game of model.games) {
    const config = siteConfig.forPage(game.route);
    const videos = game.videos.map((id) => model.videoById.get(id));
    const unknown = videos.filter((video) => video.publishedAt === null);
    add({
      route: game.route, title: `${game.name} – Spielinformationen und Videos`, interactive: true,
      description: `${game.name}${game.platforms.length ? ` (${game.platforms.join(", ")})` : ""}: ${videoCount(videos.length)} von Pretty Old Pixel mit vollständigen Beschreibungen, chronologisch von der ersten bis zur neuesten Veröffentlichung.`,
      crumbs: [root, index, { route: game.route, name: game.name }],
      schema: [{ ...collectionSchema(videos, config, game.route, game.route), about: { "@id": `${config.href(game.route)}#game` } },
        gameSchema(game, config), ...videos.map((video) => videoSchema(video, config, game.route))],
      body: `${seriesVideos(videos, game.name, config, game, `<p>${videoCount(videos.length)} rund um ${escapeHtml(game.name)} auf Pretty Old Pixel.</p>
${renderGameMetadata(game)}
${unknown.length ? `<p>${videoCount(unknown.length)} ohne bekanntes Veröffentlichungsdatum ${unknown.length === 1 ? "steht" : "stehen"} gesondert am Ende der Liste.</p>` : ""}`)}`,
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
      const byVideo = new Map(entries.filter((entry) => entry.topic !== undefined).map((entry) => [entry.videoId, entry]));
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
<p>${escapeHtml(section.description)}</p><p>${videoCount(section.entries.length)}. ${section.id === "retrospektiven"
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
    body: `<h1 class="visually-hidden">Pretty Old Pixel</h1>
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
  for (const video of model.videos.filter((video) => video.detailRoute)) {
    const pageConfig = config.forPage(video.detailRoute);
    const section = video.blaetterabend
      ? { route: "zeitschriften/", name: "Zeitschriften" }
      : video.sections.find((section) => video.detailRoute.startsWith(section.route));
    add({
      route: video.detailRoute, title: `${video.title} – ${video.blaetterabend ? "Blätterabend" : "Videoinformationen"}`, interactive: true,
      description: video.blaetterabend
        ? `${video.title}: Blätterabend mit unbekannter oder nicht eindeutig bestimmbarer Heftausgabe.`
        : `${video.title}: Video, Beschreibung und Zeitmarken von Pretty Old Pixel.`,
      crumbs: [root, section, { route: video.detailRoute, name: video.title }],
      schema: videoSchema(video, pageConfig, video.detailRoute),
      body: seriesVideos([video], video.title, pageConfig, null,
        video.blaetterabend ? "<p>Die genaue Heftausgabe ist unbekannt oder nicht eindeutig bestimmbar.</p>" : ""),
    }, [video]);
  }
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
