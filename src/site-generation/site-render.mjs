import { gameMetadataFilters } from "../content-data/game-filters.mjs";
import { readFile } from "node:fs/promises";
import { minify } from "terser";
import { paginatedRoute, slugify, yearAnchor } from "./site-config.mjs";
import { escapeHtml, externalLink } from "./site-html.mjs";
import { videoHref } from "./site-video-links.mjs";
import { videoWidget } from "./widget/video.mjs";
import { episodeList } from "./widget/episode-list.mjs";
import { catalogGrid } from "./widget/catalog-grid.mjs";
import { gameTable } from "./widget/game-table.mjs";
import { dateLabel } from "./site-format.mjs";
import { metadata } from "./widget/metadata.mjs";
import { videoList, videoListEntry } from "./widget/video-entry.mjs";
import { pagination } from "./widget/pagination.mjs";
import { archiveLinks } from "./widget/archive-links.mjs";
import { magazineLogo } from "./widget/magazine-logo.mjs";
import { videoPanel } from "./widget/video-panel.mjs";
import { navigation } from "./widget/navigation.mjs";
import { themeToggle } from "./widget/theme-toggle.mjs";

const { code: themeScript } = await minify(await readFile(new URL("./theme.js", import.meta.url), "utf8"));
if (!themeScript) throw new Error("Minifiziertes Darstellungs-Skript ist leer.");

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

function previewList(values, limit = 2) {
  const unique = [...new Set(values.filter(Boolean))];
  const visible = unique.slice(0, limit);
  if (visible.length < 2) return visible[0] ?? "";
  if (unique.length > limit) return `${visible.join(", ")} und mehr`;
  return `${visible.slice(0, -1).join(", ")} und ${visible.at(-1)}`;
}

function previewDescription(value, maximum = 180) {
  const characters = [...value];
  if (characters.length <= maximum) return value;
  const prefix = characters.slice(0, maximum - 1).join("");
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > maximum * 0.65 ? boundary : maximum - 1).trimEnd()}…`;
}

function latestPublication(videos) {
  const times = videos.map((video) => video.publishedTime).filter((value) => value !== null);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

function catalogDuration(videoIds, model, compact = false) {
  const durations = videoIds.map((id) => model.videoById.get(id).durationSeconds).filter((seconds) => seconds !== null);
  if (!durations.length) return compact ? "Videolaufzeit unbekannt" : "Gesamtlaufzeit unbekannt";
  const minutes = Math.round(durations.reduce((sum, seconds) => sum + seconds, 0) / 60);
  const hours = Math.floor(minutes / 60);
  const total = `${hours}:${String(minutes % 60).padStart(2, "0")}${compact ? "" : " "}h`;
  return durations.length === videoIds.length
    ? compact ? total : `Gesamtlaufzeit: ${total}`
    : `Bekannte ${compact ? "Videolaufzeit" : "Laufzeit"}: ${total} (${durations.length} von ${videoCount(videoIds.length)})`;
}

function homeOverview(model, config, filters) {
  const number = (value) => new Intl.NumberFormat("de-DE").format(value);
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
      count: countLabel(model.magazines.length, "Zeitschrift", "Zeitschriften"),
      description: "Blätterabende durch Magazine, Jahrgänge und Heftausgaben.",
    }] : []),
    ...(model.games.length ? [{
      route: "spiele/", name: "Spiele",
      count: videoCount(model.videos.filter((video) => video.games.length).length),
      description: `${countLabel(model.games.length, "Retrospiel", "Retrospiele")} wiederentdecken: vom ersten Start bis zum Fazit.`,
    }] : []),
    ...model.sections.map((section) => ({
      ...section, count: videoCount(section.entries.length),
    })),
  ];
  const topFilters = [...filters.values()].map((entries) => [...entries.values()]
    .sort((a, b) => b.games.length - a.games.length
      || a.name.localeCompare(b.name, "de") || a.name.localeCompare(b.name, "en"))
    .slice(0, 5)).filter((entries) => entries.length);
  return `<section class="home-statistics" aria-labelledby="statistik">
<h2 id="statistik">Pretty Old Pixel in Zahlen</h2>
<dl class="stats-grid">${stats.map(([label, value, note]) => `<div><dt>${label}</dt><dd>${value}</dd><dd class="stat-note">${note}</dd></div>`).join("")}</dl>
</section>
<section aria-labelledby="bereiche"><h2 id="bereiche">Die Themen entdecken</h2>
<div class="theme-grid">${themes.map((theme) => `<article><h3><a href="${config.href(theme.route)}">${escapeHtml(theme.name)}</a></h3><p class="theme-count">${escapeHtml(theme.count)}</p><p>${escapeHtml(theme.description)}</p></article>`).join("")}
${topFilters.map((entries) => `<article><h3>${escapeHtml(entries[0].label)}</h3><ol class="theme-ranking">${entries.map((entry) => `<li><span class="theme-ranking-entry"><a href="${config.href(entry.route)}" title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</a><span class="meta">${countLabel(entry.games.length, "Spiel", "Spiele")}</span></span></li>`).join("")}</ol></article>`).join("")}</div>
<p class="meta">Ein Video kann zu mehreren Themen gehören; die Videozahlen der Themen sind daher nicht addierbar.</p></section>`;
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
  return `<nav aria-label="Brotkrümelnavigation"><ol class="breadcrumbs">${crumbs.map((crumb, index) => `<li>${index > 0 ? '<span class="breadcrumb-separator" aria-hidden="true"> → </span>' : ""}${index === crumbs.length - 1
    ? `<span aria-current="page">${escapeHtml(crumb.name)}</span>`
    : `<a href="${config.href(crumb.route)}">${escapeHtml(crumb.name)}</a>`}</li>`).join("")}</ol></nav>`;
}

function layout({ route, title, description, body, schema, crumbs, image, imageAlt, noindex = false, previous, next, interactive = false, sortableGames = false }, config, cssHref, jsHref, navigationEntries, tableHref) {
  const canonical = config.absolute(route);
  const fullTitle = `${title} | ${config.name}`;
  const breadcrumbSchema = {
    "@type": "BreadcrumbList",
    "@id": `${config.href(route)}#breadcrumbs`,
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem", position: index + 1, name: crumb.name, item: config.href(crumb.route),
    })),
  };
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="icon" type="image/webp" href="${config.href("favicon.webp")}">
<link rel="apple-touch-icon" sizes="180x180" href="${config.href("apple-touch-icon.png")}">
${noindex ? '<meta name="robots" content="noindex, follow">' : ""}
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${escapeHtml(fullTitle)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${escapeHtml(fullTitle)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}"><meta property="og:image:alt" content="${escapeHtml(imageAlt ?? title)}"><meta name="twitter:image" content="${escapeHtml(image)}"><meta name="twitter:image:alt" content="${escapeHtml(imageAlt ?? title)}">` : ""}
${previous ? `<link rel="prev" href="${config.href(previous)}">` : ""}
${next ? `<link rel="next" href="${config.href(next)}">` : ""}
<script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", "@graph": [...(Array.isArray(schema) ? schema : [schema]), breadcrumbSchema] })}</script>
<script>${themeScript}</script>
<link rel="stylesheet" href="${config.href(cssHref)}">
${interactive ? `<script type="module" src="${config.href(jsHref)}"></script>` : ""}
${sortableGames ? `<script defer src="${config.href(tableHref)}"></script>` : ""}
</head>
<body${interactive ? ' class="detail-page"' : ""}>
<a class="skip-link" href="#inhalt">Zum Inhalt</a>
<header class="container site-header">
<a class="brand" href="${config.href()}"><img class="brand-logo" src="${config.href("favicon.webp")}" alt="Pretty Old Pixel – Logo" width="40" height="40">${config.name}</a>
${navigation(navigationEntries, route, config, themeToggle())}
</header>
<main id="inhalt" class="container">
${breadcrumbsMarkup(crumbs, config)}
${body}
</main>
<footer class="container site-footer"><p>${config.name} · Privates, nicht kommerzielles Projekt. · <a href="${config.href("datenschutz/")}">${interactive ? "YouTube-Einbindung und Datenschutz" : "Datenschutz und Hinweise"}</a>${config.offlineApp ? ` · <a href="${config.href("app/")}">Offline-App</a>` : ""} · Videos und Vorschaubilder von YouTube. · ${externalLink("https://www.youtube.com/prettyoldpixel", "YouTube")} · ${externalLink("https://www.twitch.tv/prettyoldpixel", "Twitch")}</p></footer>
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
<p>Auf Spiel- und Ausgabenseiten, in der tabellarischen Spiele-Gesamtübersicht sowie in den Videolisten von News, Zeitschriften und Jahrgängen, Hardware, Retrospektiven, Interviews, re.consider und Sonstiges werden Vorschaubilder direkt von i.ytimg.com geladen. Seiten mit Videobezug verweisen außerdem in ihren Metadaten auf ein YouTube-Vorschaubild für Linkvorschauen; soziale Netzwerke können dieses Bild beim Teilen direkt von YouTube abrufen. Bereits solche Bildabrufe übermitteln insbesondere Ihre IP-Adresse und technische Request-Daten an den Anbieter. Die kleinen Listen- und Tabellenvorschauen werden beim Annähern an den sichtbaren Bereich geladen, unabhängig von der Player-Aktivierung. Die Spiele- und Zeitschriftenkacheln enthalten keine externen Bilder.</p>
<h2>YouTube-Player</h2>
<p>Der eingebettete Player wird erstmals geladen, wenn Sie „YouTube-Player aktivieren“ wählen. Er verwendet youtube-nocookie.com, den erweiterten Datenschutzmodus von YouTube. Das bedeutet nicht, dass keine Daten verarbeitet werden. Nach der Aktivierung kann YouTube/Google weitere Verbindungen aufbauen und Daten im Rahmen der Wiedergabe verarbeiten. Auf einen externen Player können Sie verzichten und stattdessen einen normalen YouTube-Link verwenden.</p>
<p>Diese Website merkt sich die Aktivierung in diesem Browser im Local Storage. Danach wird der Player auch bei weiteren Videos und Seitenbesuchen direkt geladen, ohne automatisch abzuspielen. Die Einstellung bleibt bis zum Zurücksetzen oder Löschen der Browserdaten erhalten. Mit „YouTube-Aktivierung zurücksetzen“ unter dem Player können Sie sie jederzeit löschen und wieder zum Vorschaubild wechseln.</p>
<p>Nach der Aktivierung wird außerdem die offizielle YouTube-IFrame-API von www.youtube.com geladen. Sie ermöglicht Kapitelsprünge im Player und erkennt das Videoende. Dabei wird Ihre IP-Adresse auch an diesen Anbieter übermittelt. Wenn die Steuerung nicht verfügbar ist, bleiben die externen Kapitel-Links und der manuelle Player nutzbar.</p>
<p>„Nächste Folge automatisch“ ist ohne bisherige Auswahl zunächst aus. Ihre Auswahl wird als eigener Ein-/Aus-Wert in diesem Browser im Local Storage gespeichert und auf weiteren Spiel- und Ausgabenseiten wiederhergestellt. Wenn Sie die Option einschalten und ein Video starten, kann am Ende die nächste datierte Folge desselben Spiels bzw. derselben Heftausgabe beginnen. Sie können die Option jederzeit ausschalten. Am Reihenende, vor Videos ohne Datum oder bei Wiedergabeproblemen stoppt die Fortsetzung, ohne Ihre gespeicherte Auswahl zu ändern. Neue Seiten starten kein Video automatisch. Das Zurücksetzen der YouTube-Aktivierung löscht nicht diese Auswahl; ausschalten können Sie sie am Kontrollkästchen oder durch Löschen der Browserdaten.</p>
<p>Gespeichert werden nur die Player-Aktivierung und die Einstellung zur automatischen Folgenfortsetzung, kein Wiedergabeverlauf. Das ausgewählte Video bleibt in der Seitenadresse erhalten. Ohne JavaScript werden die Einstellungen nicht gemerkt; Kapitel öffnen YouTube, und die Folgenfortsetzung ist nicht verfügbar. Sie können den Player weiterhin einzeln aktivieren, alle Beschreibungen lesen und den YouTube-Links folgen.</p>
<p>${externalLink("https://policies.google.com/privacy?hl=de", "Datenschutzerklärung von Google")} · ${externalLink("https://www.youtube.com/t/terms", "Nutzungsbedingungen von YouTube")}</p>
<h2>Externe Links und eigene Speicherung</h2>
${config.offlineApp ? `<h3>Separate Offline-App</h3><p>Die <a href="${config.href("app/")}">Offline-App</a> lädt erst beim bewussten Öffnen ihren Katalog und einen eigenen Service Worker. Sie speichert öffentliche Katalogdaten, App-Code, Logos und Icons lokal im Cache Storage. „Offline bereit“ bestätigt den vollständigen Katalog; der zusätzliche Bildzähler zeigt die gespeicherten Vorschaubilder. Die App lädt alle Video-Vorschaubilder beim Einrichten und Ergänzen direkt von i.ytimg.com ohne Zugangsdaten und Referrer in einen lokalen Cache. Dabei werden insbesondere Ihre IP-Adresse und technische Request-Daten an YouTube/Google übertragen. Gespeicherte Bilder sind danach offline verfügbar und bleiben bei App-Updates erhalten. Videos bleiben onlineabhängig und werden nicht im App-Cache gespeichert. Beim Öffnen mit Internet kann die App auf Updates prüfen; es gibt kein eigenes Tracking.</p><p>App-Einstellungen für Darstellung, Player und Folgenfortsetzung liegen getrennt unter „pretty-old-pixel:app:*“. Die App-Hilfe erklärt Installation und gezieltes Löschen ihrer Daten einschließlich der Vorschaubilder. Das Entfernen des Home-Bildschirm-Icons garantiert nicht, dass alle Website-Daten gelöscht werden. Das Betriebssystem kann gespeicherte Daten entfernen; eine erneute Einrichtung braucht Internet.</p>` : ""}
<p>Die Darstellung folgt zunächst dem im Browser eingestellten hellen oder dunklen Modus. Mit dem Symbol im Seitenkopf können Sie umschalten. Ihre manuelle Auswahl wird als „light“ oder „dark“ unter „pretty-old-pixel:theme“ im Local Storage gespeichert. Nach Löschen dieser Browserdaten gilt wieder die Browsereinstellung. Ohne JavaScript folgt die Darstellung weiterhin dem Browsermodus.</p>
<p>Externe Links sind mit ↗ und einem zugänglichen Hinweis gekennzeichnet. Erst beim Aufrufen wird das jeweilige Ziel besucht; Vorschaubilder und bereits aktivierte Player sind davon ausgenommen. Diese Website setzt selbst keine Tracking-Cookies ein und verwendet keine Analytics-Dienste. Im Local Storage stehen ausschließlich Ihre Player-Aktivierung, die Einstellung zur automatischen Folgenfortsetzung und eine manuelle Auswahl des Darstellungsmodus; Session Storage wird nicht verwendet.</p>
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
      showMagazineLinks: false,
    });
  }).join("")}</ol>`;
}

function groupedEntries(entries, model, config) {
  const sections = new Map();
  for (const entry of entries) {
    const issue = entry.mention.issue;
    const year = issue?.year ?? null;
    const title = `${year === null ? "Jahrgang unbekannt" : `Jahrgang ${year}`} – ${issue?.special ? "Sonderhefte" : "Ausgaben"}`;
    if (!sections.has(title)) sections.set(title, Object.assign(new Map(), { year }));
    const groups = sections.get(title);
    const key = `${entry.mention.id ?? ""}/${issue?.id ?? entry.videoId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const anchored = new Set();
  return [...sections].map(([title, groups]) => {
    const anchor = yearAnchor(groups.year);
    const id = anchored.has(anchor) ? "" : ` id="${anchor}"`;
    anchored.add(anchor);
    return `<section${id}><h2>${title}</h2>${[...groups.values()].map((group) => {
    const mention = group[0].mention;
    const issue = mention.issue;
    const archives = issue?.route ? issue.archives : mention.archives;
    return `<section class="issue-group"><h3>${issue?.route
      ? `<a href="${config.href(issue.route)}">${escapeHtml(`${mention.name} ${issue.label}`)}</a>`
      : issue ? escapeHtml(`${mention.name} ${issue.label}`) : `${escapeHtml(mention.name)} – Heftausgabe unbekannt`}${archives.length ? ` ${archiveLinks(archives, true)}` : ""}</h3>
${entryVideoList(group, model, config)}
${!archives.length ? archiveLinks([]) : ""}
</section>`;
  }).join("")}</section>`;
  }).join("");
}

function magazineEntryHighlights(entries, model) {
  return entries.map((entry) => {
    if (entry.magazine) return entry.magazine.name;
    if (entry.guest) return `Blätterabend mit ${entry.guest.name}`;
    if (entry.videoId) return model.videoById.get(entry.videoId)?.title;
    const issue = entry.mention?.issue;
    return issue ? `${entry.mention.name} ${issue.label}` : null;
  });
}

function renderMagazinePages(model, siteConfig, add) {
  if (!model.magazines.length && !model.unresolvedMagazines.length) return;
  const root = { route: "", name: "Startseite" };
  const index = { route: "zeitschriften/", name: "Zeitschriften" };
  function magazineCalendar(magazine, config) {
    const yearHref = (year) => `#${year.anchor}`;
    const cells = new Map();
    for (const issue of magazine.issues.values()) {
      if (issue.year === null || issue.special || !issue.videos.length) continue;
      const month = issue.months[0] ?? (issue.number >= 1 && issue.number <= 12 ? issue.number : null);
      if (month === null) continue;
      const key = `${issue.year}:${month}`;
      if (!cells.has(key)) cells.set(key, []);
      const issueNumber = issue.number === null ? issue.months.join("+") : `#${issue.number}`;
      const videoId = issue.videos[0];
      cells.get(key).push(`<a href="${escapeHtml(`${config.href(issue.route)}#video-${videoId}`)}" aria-label="${escapeHtml(`${magazine.name} ${issue.label}: Video ansehen`)}">${escapeHtml(issueNumber)}</a>`);
    }
    return `<div class="magazine-calendar-scroll"><table class="magazine-calendar">
<caption>Ausgaben nach Jahr und Nummer; Jahreszahlen springen zum jeweiligen Jahrgang.</caption>
<thead><tr><th scope="col">Ausgabe</th>${magazine.years.map((year) => `<th scope="col"><a href="${escapeHtml(yearHref(year))}">${year.year}</a></th>`).join("")}</tr></thead>
<tbody>${Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      return `<tr><th scope="row">${month}</th>${magazine.years.map((year) => {
        const links = cells.get(`${year.year}:${month}`) ?? [];
        return `<td>${links.join(" · ")}</td>`;
      }).join("")}</tr>`;
    }).join("")}</tbody>
</table></div><nav class="magazine-calendar-mobile" aria-label="Jahrgänge von ${escapeHtml(magazine.name)}"><ul class="year-list">${magazine.years.map((year) => `<li><a href="${escapeHtml(yearHref(year))}">${year.year}</a></li>`).join("")}</ul></nav>`;
  }
  function addPaginated({ route: baseRoute, entries, title, headingHtml, description, crumbs, intro, render, schema = () => [], items, pageSize = siteConfig.pageSize }) {
    const pageCount = entries.length ? Math.max(1, Math.ceil(entries.length / pageSize)) : 0;
    for (let page = 1; page <= pageCount; page += 1) {
      const route = paginatedRoute(baseRoute, page);
      const config = siteConfig.forPage(route);
      const pageSchema = schema(config);
      const subset = entries.slice((page - 1) * pageSize, page * pageSize);
      const videos = [...new Set(subset.flatMap((entry) => entry.videoId
        ? [entry.videoId] : entry.videoIds ?? []))].map((id) => model.videoById.get(id));
      const pageTitle = `${title}${page > 1 ? ` – Seite ${page}` : ""}`;
      add({
        route, title: pageTitle,
        description: previewDescription(`${pageTitle}: ${typeof description === "function" ? description(subset) : description}`),
        crumbs: page === 1 ? crumbs : [...crumbs, { route, name: `Seite ${page}` }],
        schema: [{
          ...collectionSchema(items ? items(subset) : videos, config, route),
          ...(pageSchema.length ? { about: { "@id": pageSchema.at(-1)["@id"] } } : {}),
        }, ...pageSchema],
        previous: page > 1 ? paginatedRoute(baseRoute, page - 1) : null,
        next: page < pageCount ? paginatedRoute(baseRoute, page + 1) : null,
        body: `<h1>${typeof headingHtml === "function" ? headingHtml(config) : headingHtml ?? escapeHtml(title)}${page > 1 ? ` – Seite ${page}` : ""}</h1>${typeof intro === "function" ? intro(config) : intro}${page > 1 ? `<p>Seite ${page} von ${pageCount}: weitere Einträge zu ${escapeHtml(title)}.</p>` : ""}${pagination(baseRoute, page, pageCount, config)}${render(subset, config)}${pagination(baseRoute, page, pageCount, config)}`,
      }, videos);
    }
  }
  const indexEntries = [
    ...model.magazines.map((magazine) => ({ magazine, videoIds: magazine.videos })),
    ...model.magazineGuests.map((guest) => ({ guest, videoIds: guest.videoIds })),
    ...model.unresolvedMagazines.map((video) => ({ videoId: video.id })),
  ];
  addPaginated({
    route: index.route, entries: indexEntries, title: "Blätterabend – Zeitschriften und Gäste",
    headingHtml: (config) => `Blätterabend – Zeitschriften und ${model.magazineGuests.length ? `<a href="${config.href(paginatedRoute(index.route, Math.floor(model.magazines.length / config.pageSize) + 1))}#gaeste">Gäste</a>` : "Gäste"}`,
    description: (entries) => `Entdecke ${previewList(magazineEntryHighlights(entries, model))} – mit Videos zu klassischen Computerzeitschriften und ihren Ausgaben.`,
    crumbs: [root, index],
    items: (entries) => entries.map((entry) => entry.magazine
      ? { title: entry.magazine.name, route: entry.magazine.route }
      : entry.guest ? { title: entry.guest.name, route: entry.guest.route } : model.videoById.get(entry.videoId)),
    intro: `<p>${countLabel(model.magazines.length, "Computerzeitschrift", "Computerzeitschriften")} im Blätterabend: Zeitschriften, Gäste, Heftausgaben und Jahrgänge mit Videos und Archivlinks.</p>`,
    render: (entries, config) => {
      const magazines = entries.filter((entry) => entry.magazine).map((entry) => entry.magazine);
      const guests = entries.filter((entry) => entry.guest).map((entry) => entry.guest);
      const unresolved = entries.filter((entry) => entry.videoId);
      return `${magazines.length ? `<section aria-labelledby="zeitschriften"><h2 id="zeitschriften">Zeitschriften</h2>${catalogGrid(magazines.map((magazine) => ({
        ...magazine, facts: [
          ...(magazine.years.length ? [countLabel(magazine.years.length, "Jahrgang", "Jahrgänge")] : []),
          videoCount(magazine.videos.length), catalogDuration(magazine.videos, model),
        ],
      })), config)}</section>` : ""}
${guests.length ? `<section aria-labelledby="gaeste"><h2 id="gaeste">Blätterabend mit Gast</h2>${catalogGrid(guests.map((guest) => ({
        ...guest, facts: [
          ...(guest.issueCount ? [countLabel(guest.issueCount, "bekannte Ausgabe", "bekannte Ausgaben")] : ["Ausgabe ungeklärt"]),
          videoCount(guest.videoIds.length),
        ],
      })), config)}</section>` : ""}
${unresolved.length ? `<section><h2>Weitere Blätterabende</h2><p>Weitere Streifzüge durch klassische Computer- und Spielezeitschriften.</p>${entryVideoList(unresolved.map((entry) => ({ ...entry, mention: {} })), model, config, 3)}</section>` : ""}`;
    },
  });
  for (const guest of model.magazineGuests) {
    const handleIndex = guest.name.lastIndexOf("@");
    addPaginated({
      route: guest.route, entries: guest.entries, title: `Blätterabend mit ${guest.name}`,
      headingHtml: guest.channelUrl
        ? `Blätterabend mit ${escapeHtml(guest.name.slice(0, handleIndex))}${externalLink(guest.channelUrl, guest.name.slice(handleIndex))}`
        : undefined,
      description: (entries) => {
        const issues = previewList(entries.flatMap((entry) => entry.mention.issue
          ? [`${entry.mention.name} ${entry.mention.issue.label}`] : []));
        return issues
          ? `Blättere in ${issues} und entdecke klassische Computerzeitschriften gemeinsam im Video.`
          : "Entdecke klassische Computerzeitschriften und ihre Geschichten im Video.";
      },
      crumbs: [root, index, { route: guest.route, name: guest.name }],
      intro: `<p>Blätterabend mit ${escapeHtml(guest.name)}: ${videoCount(guest.videoIds.length)}, ${countLabel(guest.issueCount, "bekannte Ausgabe", "bekannte Ausgaben")}.</p>`,
      render: (entries, config) => groupedEntries(entries, model, config),
    });
  }
  for (const magazine of model.magazines) {
    const magazineCrumb = { route: magazine.route, name: magazine.name };
    const years = (config) => new Set(magazine.videos).size > 30
      ? magazineCalendar(magazine, config)
      : magazine.years.length > 1
        ? `<nav aria-label="Jahrgänge von ${escapeHtml(magazine.name)}"><ul class="year-list">${magazine.years.map((year) => `<li><a href="#${year.anchor}">${year.year}</a> (${videoCount(year.entries.length)})</li>`).join("")}</ul></nav>`
        : "";
    const unknownIndex = magazine.entries.findIndex((entry) => entry.mention.issue?.year === null || !entry.mention.issue);
    const unknownLink = () => unknownIndex < 0 ? "" : `<p><a href="#${yearAnchor(null)}">Jahrgang unbekannt</a>: ${videoCount(magazine.entries.filter((entry) => !entry.mention.issue || entry.mention.issue.year === null).length)} ohne bekanntes Heftjahr.</p>`;
    addPaginated({
      route: magazine.route, entries: magazine.entries,
      title: `${magazine.name} – Blätterabend-Videos`,
      description: (entries) => `Entdecke ${previewList(magazineEntryHighlights(entries, model))} – historische Ausgaben im Video.`,
      crumbs: [root, index, magazineCrumb], schema: (config) => [periodicalSchema(magazine, config)],
      intro: (config) => `${magazineLogo(magazine, config)}<p>Blätterabend-Videos zu ${escapeHtml(magazine.name)}: ${videoCount(magazine.videos.length)}.</p>${years(config)}${unknownLink()}`,
      // One page per magazine so that year links stay same-page anchors.
      pageSize: Infinity,
      render: (entries, config) => `<div id="ausgaben">${groupedEntries(entries, model, config)}</div>`,
    });
    for (const issue of magazine.issues.values()) {
      const config = siteConfig.forPage(issue.route);
      const videos = issue.videos.map((videoId) => model.videoById.get(videoId));
      const title = `${magazine.name} ${issue.label}`;
      add({
        route: issue.route, title: `${title} – Blätterabend`, interactive: true,
        description: previewDescription(`Blätterabend zu ${title}: Blättere gemeinsam durch die historische Ausgabe und entdecke verfügbare Archivlinks zum Heft.`),
        crumbs: [root, index, magazineCrumb, { route: issue.route, name: title }],
        schema: [collectionSchema(videos, config, issue.route, issue.route), periodicalSchema(magazine, config),
          issueSchema(magazine, issue, config), ...videos.map((video) => videoSchema(video, config, issue.route))],
        body: `${seriesVideos(videos, title, config, null, `<p>Blätterabend zu ${escapeHtml(title)}: ${videoCount(videos.length)} zur Zeitschriftenausgabe mit passenden Archivlinks.</p>${metadata([
  ["Zeitschrift", `<a href="${config.href(magazine.route)}">${escapeHtml(magazine.name)}</a>`],
  ["Ausgabe", `${escapeHtml(issue.label)}${issue.special ? " (Sonderheft)" : ""}`],
  ["Archivlinks", archiveLinks(issue.archives, false, { visibleLabel: true })],
])}`)}
<p><a href="${config.href(magazine.route)}">Weitere Ausgaben von ${escapeHtml(magazine.name)}</a> · <a href="${config.href(index.route)}">Andere Zeitschriften entdecken</a></p>`,
      }, videos);
    }
  }
}

function seriesVideos(videos, title, config, game, introduction = "") {
  const platforms = game?.platforms.length ? game.platforms
    : game?.metadata?.status === "ready" ? game.metadata.data.scope?.platforms ?? [] : [];
  const platform = platforms[0] === "MS-DOS" ? "DOS" : platforms[0];
  let heading = game && [...title].length < 20 && platforms.length === 1
    && !title.toLowerCase().endsWith(platform.toLowerCase()) ? `${title} - ${platform}` : title;
  if (game && [...heading].length < 20) heading += " - Spielinformationen und Videos";
  const entries = new Map(game?.series.entries.map((entry) => [entry.videoId, entry]) ?? []);
  const runs = new Map(game?.series.runs.map((run) => [run.id, run]) ?? []);
  const menu = episodeList(videos, game);
  const panels = `<div class="video-panels">${videos.map((video, index) => videoPanel(video, config, {
    index, total: videos.length, previous: videos[index - 1], next: videos[index + 1],
    game, entry: entries.get(video.id), run: runs.get(entries.get(video.id)?.runId),
  })).join("")}</div>`;
  return `<section data-video-series data-title="${escapeHtml(title)}" class="detail-layout">
<div class="detail-main">
<h1 class="detail-heading" title="${escapeHtml(heading)}">${escapeHtml(heading)}</h1>
${videoWidget(videos[0], videos.length)}
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


function renderGameMetadata(game, config, filters) {
  const record = game.metadata;
  const data = record?.status === "ready" ? record.data : null;
  const { evidence, scope, genres = [], releases = [], additionalReleases = [] } = data ?? {};
  const supplementary = additionalReleases.flatMap((entry) => entry.releases.map((release) => ({
    ...release, sourceTitle: entry.title, sourceUrl: entry.sourceUrl,
  })));
  const groups = new Map();
  for (const release of [...releases, ...supplementary]) {
    const key = JSON.stringify([release.platform, release.year, release.developer,
      release.publisher, release.publisherLabel, release.sourceTitle]);
    if (!groups.has(key)) groups.set(key, { ...release, countries: new Set() });
    const countries = release.countries?.split(",").map((country) => country.trim()).filter(Boolean) ?? [];
    for (const country of countries) {
      groups.get(key).countries.add(country);
    }
  }
  const fields = ["platform", "year", "developer", "publisher", "publisherLabel", "sourceTitle"];
  const groupedReleases = [...groups.values()];
  const displayedReleases = groupedReleases.filter((release) => !groupedReleases.some((other) =>
    other !== release
    && release.sourceTitle === other.sourceTitle
    && fields.every((field) => release[field] === null || release[field] === undefined
      || release[field] === "" || release[field] === other[field])
    && fields.some((field) => !release[field] && Boolean(other[field]))
    && [...release.countries].every((country) => other.countries.has(country))))
    .sort((a, b) => Number(Boolean(a.sourceTitle)) - Number(Boolean(b.sourceTitle))
      || (a.year ?? Infinity) - (b.year ?? Infinity)
      || fields.filter((field) => Boolean(b[field])).length - fields.filter((field) => Boolean(a[field])).length
      || JSON.stringify(fields.map((field) => a[field])).localeCompare(JSON.stringify(fields.map((field) => b[field])), "de"));
  const missing = (value) => value ? escapeHtml(String(value)) : "Keine Angabe";
  const linked = (field, value) => {
    const filter = filters.get(field).get(value);
    return filter ? `<a href="${config.href(filter.route)}">${escapeHtml(value)}</a>` : missing(value);
  };
  const primary = displayedReleases[0];
  const additional = displayedReleases.slice(1);
  const countries = (release, multiline = false) => {
    const names = [...release.countries].sort((a, b) => a.localeCompare(b, "de"));
    return names.length ? (multiline
      ? names.map((name) => `<span class="release-country">${escapeHtml(name)}</span>`).join("")
      : escapeHtml(names.join(", "))) : "Keine Angabe";
  };
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
      ["Genre", genres.length ? genres.map((genre) => linked("genre", genre)).join(", ") : "Keine Angabe"],
      ["Entwickler", linked("developer", primary?.developer)],
      ["Publisher", `${linked("publisher", primary?.publisher)}${primary?.publisherLabel ? ` (${escapeHtml(primary.publisherLabel)})` : ""}`],
    ] : []),
    ["Erscheinungsjahr", yearLines.length ? yearLines.join("<br>") : "Unbekannt"],
    ...(game.aliases.length ? [["Weitere Titel", escapeHtml(game.aliases.join(", "))]] : []),
  ])}
${!data ? "<p>Weitere Spielinformationen sind derzeit nicht verfügbar.</p>" : ""}
${additional.length ? `<details><summary>Weitere Veröffentlichungen (${additional.length})</summary>
<div class="overflow-auto"><table class="release-table"><caption>Veröffentlichungen für ${escapeHtml([...new Set([...scope.platforms, ...additionalReleases.flatMap((entry) => entry.platforms)])].join(", "))}</caption>
<thead><tr>${supplementary.length ? '<th scope="col">Veröffentlichung</th>' : ""}<th scope="col">Plattform</th><th scope="col">Jahr</th><th scope="col">Entwickler</th><th scope="col">Publisher</th><th scope="col">Länder</th></tr></thead>
<tbody>${additional.map((release) => `<tr>${supplementary.length ? `<td>${release.sourceTitle ? `${escapeHtml(release.sourceTitle)} ${gameReleaseSource(release.sourceUrl, true)}` : escapeHtml(game.name)}</td>` : ""}<td>${missing(release.platform)}</td><td>${missing(release.year)}</td><td>${linked("developer", release.developer)}</td><td>${linked("publisher", release.publisher)}${release.publisherLabel ? ` (${escapeHtml(release.publisherLabel)})` : ""}</td><td>${countries(release, true)}</td></tr>`).join("")}</tbody>
</table></div></details>` : ""}</section>`;
}

function renderGamePages(model, siteConfig, add, filters) {
  if (!model.games.length) return;
  const root = { route: "", name: "Startseite" };
  const index = { route: "spiele/", name: "Spiele" };
  const overview = { route: "spiele/uebersicht/", name: "Alle Spiele als Tabelle" };
  const overviewConfig = siteConfig.forPage(overview.route);
  const rows = model.games.map((game) => {
    const videos = game.videos.map((id) => model.videoById.get(id));
    const firstVideo = [...videos].sort((a, b) =>
      (a.publishedTime ?? Infinity) - (b.publishedTime ?? Infinity) || a.id.localeCompare(b.id, "en"))[0];
    const data = game.metadata?.status === "ready" ? game.metadata.data : null;
    const source = data?.evidence?.sourceUrl ?? game.releaseYearSource;
    return {
      ...game,
      firstYear: firstVideo.publishedAt ? Number(dateLabel(firstVideo.publishedAt, false).slice(-4)) : null,
      platforms: game.platforms.length ? game.platforms
        : game.metadata?.status === "ready" ? game.metadata.data.scope?.platforms ?? [] : [],
      genres: data?.genres ?? [],
      durationSeconds: videos.every((video) => video.durationSeconds !== null)
        ? videos.reduce((total, video) => total + video.durationSeconds, 0) : null,
      mobyGamesUrl: source && ["www.mobygames.com", "mobygames.com"].includes(new URL(source).hostname) ? source : null,
      conclusionVideo: model.videoById.get(game.series.entries.find((entry) => entry.phase.id === "conclusion")?.videoId),
      video: firstVideo, duration: catalogDuration(game.videos, model, true),
    };
  }).sort((a, b) => (b.video.publishedTime ?? -Infinity) - (a.video.publishedTime ?? -Infinity)
    || a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id, "en"));
  add({
    route: overview.route, title: overview.name, sortableGames: true,
    description: "Alle Retrospiele von Pretty Old Pixel als Tabelle: erstes Videojahr, Titel, Erscheinungsjahr, Plattform, Videovorschau und gesamte Videolaufzeit.",
    crumbs: [root, index, overview],
    schema: collectionSchema(rows.map((game) => ({ title: game.name, route: game.route })), overviewConfig, overview.route),
    body: `<h1>${overview.name}</h1>
${gameTable(rows, overviewConfig, `<p><a href="${overviewConfig.href(index.route)}">Zur Spiele-Kachelübersicht</a></p>`)}`,
  }, [...new Set(rows.flatMap((game) => game.videos))].map((id) => model.videoById.get(id)));
  const listings = [
    { ...index, games: model.games },
    ...[...filters].flatMap(([field, entries]) => [...entries.values()].map((entry) => {
      const name = `${entry.label}: ${entry.name}`;
      const prefixes = {
        genre: "Spiele im Genre",
        developer: "Spiele des Entwicklers",
        publisher: "Spiele des Publishers",
        platform: "Spiele für die Plattform",
      };
      let heading = [...name].length < 20 ? `${prefixes[field]} ${entry.name}` : name;
      if ([...heading].length < 20) heading += " – Retrospiele und Videos";
      return { ...entry, name, heading };
    })),
  ];
  for (const listing of listings) {
    const filtered = listing.route !== index.route;
    const heading = filtered ? listing.heading : listing.name;
    const crumbs = filtered ? [root, index, { route: listing.route, name: listing.name }] : [root, index];
    const pageCount = Math.ceil(listing.games.length / siteConfig.pageSize);
    for (let page = 1; page <= pageCount; page += 1) {
      const route = paginatedRoute(listing.route, page);
      const config = siteConfig.forPage(route);
      const games = listing.games.slice((page - 1) * config.pageSize, page * config.pageSize);
      const videos = [...new Set(games.flatMap((game) => game.videos))].map((id) => model.videoById.get(id));
      const gameHighlights = previewList(games.map((game) => game.name));
      add({
        route, title: `${filtered ? heading : "Spiele – Retro-Spielereihen"}${page > 1 ? ` – Seite ${page}` : ""}`,
        description: previewDescription(filtered
          ? `${heading}: Entdecke ${gameHighlights} mit Spielreihen, Unboxings und Hintergrundwissen zu Retro-Klassikern.`
          : `Retrospiele von Pretty Old Pixel: ${gameHighlights} und mehr – Spielreihen vom Intro bis zum Fazit, Unboxings und Hintergrundgeschichten.`),
        crumbs: page === 1 ? crumbs : [...crumbs, { route, name: `Seite ${page}` }],
        schema: collectionSchema(games.map((game) => ({ title: game.name, route: game.route })), config, route),
        previous: page > 1 ? paginatedRoute(listing.route, page - 1) : null,
        next: page < pageCount ? paginatedRoute(listing.route, page + 1) : null,
        body: `<h1>${escapeHtml(heading)}${page > 1 ? ` – Seite ${page}` : ""}</h1><p>${filtered ? `${escapeHtml(heading)}: ` : ""}${countLabel(listing.games.length, "Retrospiel", "Retrospiele")}, alphabetisch geordnet. Entdecken Sie Spielverläufe, Unboxings und Gespräche rund um die Spiele.</p>
${filtered ? `<p><a href="${config.href(index.route)}">Alle Spiele anzeigen</a></p>` : ""}<p><a href="${config.href(overview.route)}">Spiele suchen und filtern</a></p>
${pagination(listing.route, page, pageCount, config)}
<div class="game-catalog">${catalogGrid(games.map((game) => ({
          ...game, facts: [
            game.platforms.join(", "), `Erscheinungsjahr: ${game.releaseYear ?? "unbekannt"}`,
            videoCount(game.videos.length), catalogDuration(game.videos, model),
          ].filter(Boolean),
        })), config)}</div>
${pagination(listing.route, page, pageCount, config)}`,
      }, videos);
    }
  }
  for (const game of model.games) {
    const config = siteConfig.forPage(game.route);
    const videos = game.videos.map((id) => model.videoById.get(id));
    add({
      route: game.route, title: `${game.name} – Spielinformationen und Videos`, interactive: true,
      description: `${game.name}${game.platforms.length ? ` (${game.platforms.join(", ")})` : ""}: ${videoCount(videos.length)} von Pretty Old Pixel. Gameplay, Hintergründe und Spielinformationen zu Genre, Entwicklung und Veröffentlichung.`,
      crumbs: [root, index, { route: game.route, name: game.name }],
      schema: [{ ...collectionSchema(videos, config, game.route, game.route), about: { "@id": `${config.href(game.route)}#game` } },
        gameSchema(game, config), ...videos.map((video) => videoSchema(video, config, game.route))],
      body: `${seriesVideos(videos, game.name, config, game, `<p>${videoCount(videos.length)} rund um ${escapeHtml(game.name)} auf Pretty Old Pixel.</p>
${renderGameMetadata(game, config, filters)}`)}`,
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
      const highlights = previewList(section.id === "retrospektiven"
        ? entries.map((entry) => entry.topic)
        : videos.map((video) => video.title));
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
        description: previewDescription(section.id === "retrospektiven"
          ? `re.trospektive: ${highlights} – entdecke die Geschichte klassischer Video- und Computerspiele Folge für Folge.`
          : `${section.name}: ${highlights} – neue Beiträge zu Retro-Hardware, Technik und Computerkultur.`),
        crumbs: [{ route: "", name: "Startseite" }, { route: section.route, name: section.name },
          ...(page > 1 ? [{ route, name: `Seite ${page}` }] : [])],
        schema: collectionSchema(videos, config, route),
        previous: page > 1 ? paginatedRoute(section.route, page - 1) : null,
        next: page < count ? paginatedRoute(section.route, page + 1) : null,
        body: `<h1>${escapeHtml(section.name)}${page > 1 ? ` – Seite ${page}` : ""}</h1>
<p>${escapeHtml(section.description)}</p><p>${videoCount(section.entries.length)}. ${section.id === "retrospektiven"
  ? "Wählen Sie ein Thema und entdecken Sie die Geschichte der Spiele Folge für Folge."
  : "Entdecken Sie die Beiträge, beginnend mit den neuesten Videos."}</p>
${section.id === "sonstiges" ? "" : pagination(section.route, page, count, config)}${listing}${pagination(section.route, page, count, config)}`,
      }, videos);
    }
  }
}

export function renderSite(model, config, cssHref, jsHref = "assets/video-series.js", tableHref = "assets/game-table.js") {
  const pages = new Map();
  const filters = gameMetadataFilters(model.games);
  function add(options, videos = []) {
    const file = options.file ?? `${options.route}index.html`;
    if (pages.has(file)) throw new Error(`Kollidierender Ausgabepfad: ${file}`);
    const previewVideo = videos.find((video) => video?.thumbnailUrl);
    const pageOptions = previewVideo ? {
      ...options,
      image: options.image ?? previewVideo.thumbnailUrl,
      imageAlt: options.imageAlt ?? `Vorschaubild: ${previewVideo.title}`,
    } : options;
    pages.set(file, {
      html: layout(pageOptions, config.forPage(options.route), cssHref, jsHref, model.navigation, tableHref),
      route: options.route, indexable: !options.noindex,
      contentPublishedAt: latestPublication(videos),
    });
  }
  const root = { route: "", name: "Startseite" };
  add({
    route: "", title: "Retrospiele, Computerzeitschriften und Retro-Hardware",
    description: "Retrospiele, klassische Computerzeitschriften und Retro-Hardware bei Pretty Old Pixel: Let's Plays, Blätterabende, Retrospektiven und Interviews entdecken.",
    crumbs: [root], schema: { "@type": "WebPage", "@id": "./#page", name: "Pretty Old Pixel in Zahlen" },
    body: `<h1 class="visually-hidden">Pretty Old Pixel</h1>
<p class="lead">Retrospiele entdecken, alte Computerzeitschriften durchblättern und Videos wiederfinden.</p>
${homeOverview(model, config, filters)}`,
  }, model.videos);
  const newsConfig = config.forPage("news/");
  add({
    route: "news/", title: "News – die 20 neuesten Videos",
    description: previewDescription(`Neue Videos von Pretty Old Pixel: ${previewList(model.news.slice(0, 2).map((video) => video.title))} – Retrospiele, Blätterabende, Hardware und Gespräche aus der Computerkultur.`),
    crumbs: [root, { route: "news/", name: "News" }],
    schema: collectionSchema(model.news, newsConfig, "news/"),
    body: `<h1>News – die neuesten Videos</h1><p>Neue Videos von Pretty Old Pixel: Retrospiele, Blätterabende, Hardware und Gespräche aus der Welt der Computer- und Videospiele.</p>${videoList(model.news, newsConfig)}`,
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
        ? `${video.title}: klassische Computer- und Spielezeitschriften im Blätterabend von Pretty Old Pixel.`
        : `${video.title}: ${section.name} bei Pretty Old Pixel.`,
      crumbs: [root, section, { route: video.detailRoute, name: video.title }],
      schema: videoSchema(video, pageConfig, video.detailRoute),
      body: seriesVideos([video], video.title, pageConfig, null,
        video.blaetterabend ? `<p>${escapeHtml(video.title)}: klassische Computer- und Spielezeitschriften im Blätterabend von Pretty Old Pixel.</p>` : ""),
    }, [video]);
  }
  renderGamePages(model, config, add, filters);
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
