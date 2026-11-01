import { escapeHtml } from "../site-html.mjs";
import { metadata } from "./metadata.mjs";

const number = (value) => new Intl.NumberFormat("de-DE").format(value);
const percentage = (value, total) => total ? new Intl.NumberFormat("de-DE", {
  style: "percent", maximumFractionDigits: 1,
}).format(value / total) : "0 %";
const xml = (value) => escapeHtml(String(value));
const chartStyles = `<style>
.chart-background{fill:#fff}.chart-grid{stroke:#c6cdd3;stroke-width:1}.chart-axis{stroke:#35424a;stroke-width:1.5}
.chart-axis-label,.chart-axis-title,.chart-empty{fill:#202a33;font-family:system-ui,sans-serif;font-size:12px}
.chart-axis-title{font-size:13px;font-weight:600}.chart-empty{font-size:15px}.chart-bar{fill:#176b87}
</style>`;

function filterRoute(filters, field, name) {
  if (filters instanceof Map) return filters.get(field)?.get(name)?.route;
  return filters.find((entry) => entry.field === field && entry.name === name)?.route;
}

function categoryLink(entry, field, filters, href) {
  const route = filterRoute(filters, field, entry.name);
  if (route) return `<a href="${href(route)}">${escapeHtml(entry.name)}</a>`;
  if (entry.games.length === 1) {
    const [game] = entry.games;
    return `<a href="${href(game.route)}">${escapeHtml(entry.name)}</a>`;
  }
  return escapeHtml(entry.name);
}

function gameList(games, href) {
  return `<ul>${games.map((game) =>
    `<li><a href="${href(game.route)}">${escapeHtml(game.name)}</a></li>`).join("")}</ul>`;
}

export function gameStatisticsYearSvg(stats) {
  const width = 840;
  const height = 360;
  const left = 58;
  const right = 22;
  const top = 28;
  const bottom = 54;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const entries = stats.visibleYears;
  const years = entries.map((entry) => entry.year);
  const minimumYear = years[0] ?? 0;
  const maximumYear = years.at(-1) ?? minimumYear;
  const domainStart = minimumYear - 1;
  const range = Math.max(1, maximumYear + 1 - domainStart);
  const maximumCount = Math.max(2, Math.ceil(Math.max(0, ...entries.map((entry) => entry.count)) / 2) * 2);
  const x = (year) => years.length === 1 ? left + plotWidth / 2
    : left + ((year - domainStart) / range) * plotWidth;
  const y = (count) => top + plotHeight - (count / maximumCount) * plotHeight;
  const ticks = [...new Set([0, Math.ceil(maximumCount / 2), maximumCount])];
  const yearTicks = [...new Set([
    ...(years.length ? [minimumYear] : []),
    ...Array.from({ length: Math.floor((maximumYear - minimumYear) / 5) }, (_, index) =>
      Math.ceil((minimumYear + 1) / 5) * 5 + index * 5).filter((year) => year < maximumYear),
    ...(years.length ? [maximumYear] : []),
  ])];
  const title = "Spiele nach Erscheinungsjahr";
  const description = entries.length
    ? `Balkendiagramm mit folgenden Werten: ${entries.map((entry) => `${entry.year}: ${entry.count} ${entry.count === 1 ? "Spiel" : "Spiele"}`).join(", ")}. Die horizontale Achse zeigt den tatsächlichen Jahresabstand; die senkrechte Achse beginnt bei null.`
    : "Es gibt keine Erscheinungsjahre mit mindestens zwei Spielen; es werden keine Balken dargestellt.";
  if (!entries.length) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="year-chart-title year-chart-description">
${chartStyles}
<title id="year-chart-title">${title}</title><desc id="year-chart-description">${escapeHtml(description)}</desc>
<rect class="chart-background" width="${width}" height="${height}"/><text class="chart-empty" x="${width / 2}" y="${height / 2}" text-anchor="middle">Keine Jahresgruppen mit mindestens zwei Spielen</text></svg>`;
  const barMarkup = entries.map((entry, index) => {
    const center = x(entry.year);
    const previousGap = index ? center - x(entries[index - 1].year) : Infinity;
    const nextGap = index + 1 < entries.length ? x(entries[index + 1].year) - center : Infinity;
    const widthForBar = entries.length === 1 ? 28 : Math.max(8, Math.min(28, Math.min(previousGap, nextGap) * 0.62));
    const topY = y(entry.count);
    return `<g><title>${entry.year}: ${entry.count} ${entry.count === 1 ? "Spiel" : "Spiele"}</title>
<rect class="chart-bar" x="${(center - widthForBar / 2).toFixed(2)}" y="${topY.toFixed(2)}" width="${widthForBar.toFixed(2)}" height="${(top + plotHeight - topY).toFixed(2)}" rx="2"/></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="year-chart-title year-chart-description">
${chartStyles}
<title id="year-chart-title">${title}</title><desc id="year-chart-description">${escapeHtml(description)}</desc>
<rect class="chart-background" width="${width}" height="${height}"/>
${ticks.map((tick) => `<g><line class="chart-grid" x1="${left}" y1="${y(tick)}" x2="${width - right}" y2="${y(tick)}"/><text class="chart-axis-label" x="${left - 10}" y="${y(tick) + 4}" text-anchor="end">${tick}</text></g>`).join("")}
<line class="chart-axis" x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}"/><line class="chart-axis" x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}"/>
${barMarkup}
${yearTicks.map((year) => `<text class="chart-axis-label" x="${x(year)}" y="${height - 24}" text-anchor="middle">${year}</text>`).join("")}
<text class="chart-axis-title" x="${width / 2}" y="${height - 4}" text-anchor="middle">Erscheinungsjahr</text>
<text class="chart-axis-title" transform="translate(15 ${top + plotHeight / 2}) rotate(-90)" text-anchor="middle">Spiele</text></svg>`;
}

function categoryChartSvg(entries, { idPrefix, title, emptyDescription }) {
  const width = 900;
  const rowHeight = 34;
  const height = Math.max(112, 62 + entries.length * rowHeight);
  const left = 236;
  const right = 70;
  const plotWidth = width - left - right;
  const maximumCount = Math.max(1, ...entries.map((entry) => entry.count));
  const description = entries.length
    ? `Horizontales Balkendiagramm: ${entries.map((entry) => `${entry.name}: ${entry.count}`).join(", ")}.`
    : emptyDescription;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${idPrefix}-chart-title ${idPrefix}-chart-description">
${chartStyles}
<title id="${idPrefix}-chart-title">${title}</title><desc id="${idPrefix}-chart-description">${escapeHtml(description)}</desc>
<rect class="chart-background" width="${width}" height="${height}"/>
${entries.map((entry, index) => {
    const y = 30 + index * rowHeight;
    const barWidth = (entry.count / maximumCount) * plotWidth;
    return `<g><text class="chart-axis-label" x="${left - 10}" y="${y + 17}" text-anchor="end">${xml(entry.name)}</text>
<rect class="chart-bar" x="${left}" y="${y}" width="${barWidth.toFixed(2)}" height="22" rx="2"/>
<text class="chart-axis-label" x="${Math.min(width - 8, left + barWidth + 8)}" y="${y + 17}">${entry.count}</text></g>`;
  }).join("")}</svg>`;
}

export function genreStatisticsSvg(stats) {
  return categoryChartSvg(stats.genres, {
    idPrefix: "genre", title: "Spiele je Genre",
    emptyDescription: "Keine freigegebenen Genreangaben vorhanden.",
  });
}

export function publisherStatisticsSvg(stats) {
  return categoryChartSvg(stats.publishers.slice(0, 10), {
    idPrefix: "publisher", title: "Spiele je Publisher (Top 10)",
    emptyDescription: "Keine freigegebenen Publisherangaben vorhanden.",
  });
}

function categoryTable(entries, field, filters, href, total, rowLimit = entries.length) {
  const visible = entries.slice(0, rowLimit);
  const rows = (items) => items.map((entry) => `<tr><th scope="row">${categoryLink(entry, field, filters, href)}</th>
<td>${number(entry.count)}</td><td>${percentage(entry.count, total)}</td></tr>`).join("");
  return `<div class="statistics-table-scroll"><table class="statistics-table">
<thead><tr><th scope="col">${field === "genre" ? "Genre" : "Publisher"}</th><th scope="col">Spiele</th><th scope="col">Anteil an allen Spielen</th></tr></thead>
<tbody>${rows(visible)}</tbody></table></div>${entries.length > rowLimit
    ? `<details class="statistics-more"><summary>Weitere Publisher (${number(entries.length - rowLimit)})</summary>
<div class="statistics-table-scroll"><table class="statistics-table"><thead><tr><th scope="col">Publisher</th><th scope="col">Spiele</th><th scope="col">Anteil an allen Spielen</th></tr></thead>
<tbody>${rows(entries.slice(rowLimit))}</tbody></table></div></details>` : ""}`;
}

export function gameStatisticsMarkup(stats, { href, filters, svgHref, showHeading = true }) {
  const yearCount = stats.visibleYears.reduce((sum, entry) => sum + entry.count, 0);
  const omittedGameCount = stats.omittedYears.reduce((sum, entry) => sum + entry.count, 0);
  const yearDescription = stats.visibleYears.length
    ? `${number(stats.visibleYears.length)} ${stats.visibleYears.length === 1 ? "Jahresgruppe" : "Jahresgruppen"} mit mindestens zwei Spielen, ${number(yearCount)} ${yearCount === 1 ? "Spiel" : "Spiele"}.`
    : stats.yearEntries.length
      ? "Es gibt nur Erscheinungsjahre mit jeweils einem Spiel; daher werden keine Jahresbalken oder Tabellenzeilen dargestellt."
      : "Für keines der Spiele ist ein Erscheinungsjahr bekannt.";
  return `<nav class="game-page-navigation" aria-label="Spieleübersichten"><ul>
<li><a href="${href("spiele/")}">re.play</a></li>
<li><a href="${href("spiele/uebersicht/")}">Alle Spiele als Tabelle</a></li>
<li><a href="${href("spiele/statistik/")}" aria-current="page">Spielestatistiken</a></li>
</ul></nav>
  ${showHeading ? "<h1>re.play – Spielestatistiken</h1>" : ""}
<section aria-labelledby="statistik-datengrundlage"><h2 id="statistik-datengrundlage">Datengrundlage</h2>
${metadata([
    ["Katalogisierte Spiele", escapeHtml(number(stats.total))],
    ["Erscheinungsjahr bekannt", escapeHtml(`${number(stats.total - stats.unknownYearGames.length)} von ${number(stats.total)}`)],
    ["Genres mit Angaben", escapeHtml(`${number(stats.genreKnown)} von ${number(stats.total)}`)],
    ["Publisher mit Angaben", escapeHtml(`${number(stats.publisherKnown)} von ${number(stats.total)}`)],
  ], "statistics-summary")}
<p>Gezählt werden eindeutige Spiele mit einer veröffentlichten Spieleseite, jeweils einmal pro Spiel-ID. Das belegt weder einen vollständigen Durchlauf noch einen Abschluss. Folgen, wiederholte Durchläufe und bloße Erwähnungen in Blätterabenden erhöhen die Spielzahlen nicht. Mehrfachgenres und mehrere Publisher je Spiel sind möglich; Kategorien und Prozentwerte sind daher nicht addierbar.</p>
<p><a href="${href("spiele/uebersicht/")}">Alle Spiele ansehen</a></p></section>
<section aria-labelledby="statistik-jahre"><h2 id="statistik-jahre">Erscheinungsjahre</h2>
<p>${yearDescription} Die Zeitachse verwendet das freigegebene Erscheinungsjahr des Katalogs; Jahreslücken bleiben proportional erhalten.</p>
${stats.visibleYears.length ? `<figure class="statistics-chart"><img src="${svgHref}" alt="Balkendiagramm der Spiele je Erscheinungsjahr"></figure>
<div class="statistics-table-scroll"><table class="statistics-table year-statistics"><caption>Jahre mit mindestens zwei Spielen</caption>
<thead><tr><th scope="col">Erscheinungsjahr</th><th scope="col">Spiele</th><th scope="col">Spiele aus diesem Jahr</th></tr></thead><tbody>
${stats.visibleYears.map((entry) => `<tr><th scope="row">${entry.year}</th><td>${number(entry.count)}</td><td><details><summary>Spiele aus diesem Jahr</summary>${gameList(entry.games, href)}</details></td></tr>`).join("")}
</tbody></table></div>` : `<p>Ein Diagramm und Jahresgruppen mit mindestens zwei Spielen sind nicht verfügbar, weil es keine entsprechenden Erscheinungsjahre gibt.</p>`}
${omittedGameCount ? `<p>Die Zeitachse lässt ${number(stats.omittedYears.length)} Jahr${stats.omittedYears.length === 1 ? "gang" : "gänge"} mit je einem Spiel aus; diese ${number(omittedGameCount)} ${omittedGameCount === 1 ? "Spiel bleibt" : "Spiele bleiben"} in der Gesamtzahl enthalten.</p>` : ""}
${stats.unknownYearGames.length ? `<p>Erscheinungsjahr unbekannt: ${number(stats.unknownYearGames.length)} ${stats.unknownYearGames.length === 1 ? "Spiel" : "Spiele"} (außerhalb der Zeitachse).</p>
<details class="statistics-more"><summary>Spiele ohne bekanntes Erscheinungsjahr ansehen</summary>${gameList(stats.unknownYearGames, href)}</details>` : ""}</section>
<section aria-labelledby="statistik-genres"><h2 id="statistik-genres">Genres</h2>
<p>${number(stats.genreKnown)} von ${number(stats.total)} Spielen haben Genreangaben; ${number(stats.genreUnknown)} ${stats.genreUnknown === 1 ? "Spiel bleibt" : "Spiele bleiben"} ohne bekannte Genreangabe. Prozentwerte beziehen sich auf alle katalogisierten Spiele. Ein Spiel kann mehreren Genres zugeordnet sein.</p>
<p>Viele Spiele teilen sich Genreangaben mit mindestens einem weiteren Spiel.</p>
${stats.genres.length ? `<figure class="statistics-chart">${genreStatisticsSvg(stats)}<figcaption>Jedes Spiel wird je Genre höchstens einmal gezählt.</figcaption></figure>
${categoryTable(stats.genres, "genre", filters, href, stats.total)}` : "<p>Es liegen keine freigegebenen Genreangaben vor.</p>"}</section>
<section aria-labelledby="statistik-publisher"><h2 id="statistik-publisher">Publisher</h2>
<p>${number(stats.publisherKnown)} von ${number(stats.total)} Spielen haben Publisherangaben; ${number(stats.publisherUnknown)} ${stats.publisherUnknown === 1 ? "Spiel bleibt" : "Spiele bleiben"} ohne bekannte Publisherangabe. Prozentwerte beziehen sich auf alle katalogisierten Spiele.</p>
${stats.publishers.length ? `<figure class="statistics-chart">${publisherStatisticsSvg(stats)}<figcaption>Top 10; je Publisher wird unabhängig von regionalen Doppelungen jedes Spiel nur einmal gezählt.</figcaption></figure>
${categoryTable(stats.publishers, "publisher", filters, href, stats.total, 10)}`
      : "<p>Es liegen keine freigegebenen Publisherangaben vor.</p>"}</section>
<section aria-labelledby="statistik-gemeinsamkeiten"><h2 id="statistik-gemeinsamkeiten">Gemeinsamkeiten zwischen Genre und Publisher</h2>
<p>Die Tabelle zeigt gemeinsame Spiele je Genre-Publisher-Kombination. Die Zuordnung beschreibt den Katalog, nicht eine Ursache oder die Gesamtheit aller Veröffentlichungen eines Unternehmens.</p>
${stats.combinations.length ? `<div class="statistics-table-scroll"><table class="statistics-table combination-statistics">
<thead><tr><th scope="col">Genre</th><th scope="col">Publisher</th><th scope="col">Gemeinsame Spiele</th><th scope="col">Spiele</th></tr></thead><tbody>
${stats.combinations.slice(0, 10).map((entry) => `<tr><th scope="row">${escapeHtml(entry.genre)}</th><td>${escapeHtml(entry.publisher)}</td>
<td>${number(entry.count)}</td>
<td><details><summary>Gemeinsame Spiele ansehen</summary>${gameList(entry.games, href)}</details></td></tr>`).join("")}
</tbody></table></div>` : "<p>Es gibt keine Genre-Publisher-Kombination mit mindestens zwei gemeinsamen Spielen.</p>"}
<p>Die vollständige Spieleübersicht verlinkt auf die vorhandenen Genre- und Publisherlisten; für Einzelzuordnungen führen die Kategorietabellen direkt zur jeweiligen Spieleseite.</p></section>`;
}
