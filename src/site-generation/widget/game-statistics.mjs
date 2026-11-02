import { escapeHtml } from "../site-html.mjs";

const FIRST_CHART_YEAR = 1980;
const LAST_CHART_YEAR = 1999;
const MINIMUM_GAMES_PER_YEAR = 2;
const YEAR_RANGE_LABEL = `${FIRST_CHART_YEAR}–${LAST_CHART_YEAR}`;
const CHART_YEARS = Array.from(
  { length: LAST_CHART_YEAR - FIRST_CHART_YEAR + 1 },
  (_, index) => FIRST_CHART_YEAR + index,
);
const number = (value) => new Intl.NumberFormat("de-DE").format(value);
const xml = (value) => escapeHtml(String(value));
const chartStyles = `<style>
.chart-background{fill:#fff}.chart-grid{stroke:#c6cdd3;stroke-width:1}.chart-axis{stroke:#35424a;stroke-width:1.5}
.chart-axis-label,.chart-axis-title,.chart-empty{fill:#202a33;font-family:system-ui,sans-serif;font-size:12px}
.chart-axis-title{font-size:13px;font-weight:600}.chart-empty{font-size:15px}.chart-bar{fill:#176b87}
a>.chart-axis-label{text-decoration:underline;cursor:pointer}
.year-chart-link{cursor:pointer}.year-chart-link:hover .chart-bar,.year-chart-link:focus .chart-bar{fill:#0f4d63;stroke:#0b2733;stroke-width:2}
.year-chart-link .chart-axis-label{font-size:10px}.year-chart-link:focus .chart-axis-label{font-weight:700}
</style>`;

function filterRoute(filters, field, name) {
  if (filters instanceof Map) return filters.get(field)?.get(name)?.route;
  return filters.find((entry) => entry.field === field && entry.name === name)?.route;
}

function categoryHref(entry, field, filters, href) {
  const route = filterRoute(filters, field, entry.name);
  if (route) return href(route);
  if (entry.games.length === 1) return href(entry.games[0].route);
  return null;
}

function gameList(games, href) {
  return `<ul>${games.map((game) =>
    `<li><a href="${href(game.route)}">${escapeHtml(game.name)}</a></li>`).join("")}</ul>`;
}

function yearChartHref(route) {
  if (route.startsWith("spiele/")) return `../${route.slice("spiele/".length)}`;
  return route;
}

function yearChartEntries(stats) {
  return stats.yearEntries.filter(({ year, count }) =>
    year >= FIRST_CHART_YEAR && year <= LAST_CHART_YEAR && count >= MINIMUM_GAMES_PER_YEAR);
}

export function gameStatisticsYearSvg(stats, { href = yearChartHref } = {}) {
  const width = 840;
  const height = 420;
  const left = 58;
  const right = 22;
  const top = 28;
  const bottom = 118;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const entries = yearChartEntries(stats);
  const labelRow = 14;
  const labelBaseline = height - bottom + 20;
  const maximumCount = Math.max(2, Math.ceil(Math.max(0, ...entries.map((entry) => entry.count)) / 2) * 2);
  const yearSpacing = plotWidth / (CHART_YEARS.length + 1);
  const x = (year) => left + (year - FIRST_CHART_YEAR + 1) * yearSpacing;
  const y = (count) => top + plotHeight - (count / maximumCount) * plotHeight;
  const ticks = [...new Set([0, Math.ceil(maximumCount / 2), maximumCount])];
  const yearEntriesByYear = new Map(entries.map((entry) => [entry.year, entry]));
  const labelRows = Math.min(5, Math.max(2, Math.ceil(CHART_YEARS.length / 14)));
  const yearTicks = CHART_YEARS.map((year, index) => ({ year, row: index % labelRows }));
  const title = `Erscheinungsjahre ${YEAR_RANGE_LABEL} – Jahre mit mindestens zwei Spielen`;
  const description = entries.length
    ? `Balkendiagramm für ${YEAR_RANGE_LABEL}, Jahre mit mindestens zwei Spielen: ${entries.map((entry) => `${entry.year}: ${entry.count} Spiele`).join(", ")}. Die Jahreszahlen und Balken sind anklickbar. Die senkrechte Achse beginnt bei null.`
    : `Für ${YEAR_RANGE_LABEL} gibt es keine Jahre mit mindestens zwei Spielen; es werden keine Balken dargestellt.`;
  if (!entries.length) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="year-chart-title year-chart-description">
${chartStyles}
<title id="year-chart-title">${title}</title><desc id="year-chart-description">${escapeHtml(description)}</desc>
<rect class="chart-background" width="${width}" height="${height}"/><text class="chart-empty" x="${width / 2}" y="${height / 2}" text-anchor="middle">Keine Jahre mit mindestens zwei Spielen</text></svg>`;
  const barMarkup = entries.map((entry, index) => {
    const center = x(entry.year);
    const previousGap = index ? center - x(entries[index - 1].year) : Infinity;
    const nextGap = index + 1 < entries.length ? x(entries[index + 1].year) - center : Infinity;
    const widthForBar = Math.max(8, Math.min(28, Math.min(previousGap, nextGap) * 0.62));
    const topY = y(entry.count);
    const target = escapeHtml(href(`spiele/jahr/${entry.year}/`));
    return `<a class="year-chart-link" href="${target}" aria-label="${entry.year}: ${entry.count} ${entry.count === 1 ? "Spiel" : "Spiele"} anzeigen">
<title>${entry.year}: ${entry.count} ${entry.count === 1 ? "Spiel" : "Spiele"} — Spiele dieses Jahres anzeigen</title>
<rect class="chart-bar" x="${(center - widthForBar / 2).toFixed(2)}" y="${topY.toFixed(2)}" width="${widthForBar.toFixed(2)}" height="${(top + plotHeight - topY).toFixed(2)}" rx="2"/></a>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="year-chart-title year-chart-description">
${chartStyles}
<title id="year-chart-title">${title}</title><desc id="year-chart-description">${escapeHtml(description)}</desc>
<rect class="chart-background" width="${width}" height="${height}"/>
${ticks.map((tick) => `<g><line class="chart-grid" x1="${left}" y1="${y(tick)}" x2="${width - right}" y2="${y(tick)}"/><text class="chart-axis-label" x="${left - 10}" y="${y(tick) + 4}" text-anchor="end">${tick}</text></g>`).join("")}
<line class="chart-axis" x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}"/><line class="chart-axis" x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}"/>
${barMarkup}
${yearTicks.map(({ year, row }) => {
  const label = `<text class="chart-axis-label" x="${x(year).toFixed(2)}" y="${labelBaseline + row * labelRow}" text-anchor="middle">${year}</text>`;
  if (!yearEntriesByYear.has(year)) return label;
  return `<a class="year-chart-link" href="${escapeHtml(href(`spiele/jahr/${year}/`))}" aria-label="Spiele aus dem Erscheinungsjahr ${year} anzeigen">${label}</a>`;
}).join("")}
<text class="chart-axis-title" x="${width / 2}" y="${height - 4}" text-anchor="middle">Erscheinungsjahr</text>
<text class="chart-axis-title" transform="translate(15 ${top + plotHeight / 2}) rotate(-90)" text-anchor="middle">Spiele</text></svg>`;
}

function categoryChartSvg(entries, { idPrefix, title, emptyDescription, field, filters, href }) {
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
  const label = (entry, y) => {
    const text = `<text class="chart-axis-label" x="${left - 10}" y="${y + 17}" text-anchor="end">${xml(entry.name)}</text>`;
    const target = field && filters && href ? categoryHref(entry, field, filters, href) : null;
    return target ? `<a href="${target}">${text}</a>` : text;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${idPrefix}-chart-title ${idPrefix}-chart-description">
${chartStyles}
<title id="${idPrefix}-chart-title">${title}</title><desc id="${idPrefix}-chart-description">${escapeHtml(description)}</desc>
<rect class="chart-background" width="${width}" height="${height}"/>
${entries.map((entry, index) => {
    const y = 30 + index * rowHeight;
    const barWidth = (entry.count / maximumCount) * plotWidth;
    return `<g>${label(entry, y)}
<rect class="chart-bar" x="${left}" y="${y}" width="${barWidth.toFixed(2)}" height="22" rx="2"/>
<text class="chart-axis-label" x="${Math.min(width - 8, left + barWidth + 8)}" y="${y + 17}">${entry.count}</text></g>`;
  }).join("")}</svg>`;
}

export function genreStatisticsSvg(stats, { filters, href } = {}) {
  return categoryChartSvg(stats.genres, {
    idPrefix: "genre", title: "Spiele je Genre", field: "genre", filters, href,
    emptyDescription: "Keine freigegebenen Genreangaben vorhanden.",
  });
}

export function publisherStatisticsSvg(stats, { filters, href } = {}) {
  return categoryChartSvg(stats.publishers.slice(0, 10), {
    idPrefix: "publisher", title: "Spiele je Publisher (Top 10)", field: "publisher", filters, href,
    emptyDescription: "Keine freigegebenen Publisherangaben vorhanden.",
  });
}

export function gameStatisticsMarkup(stats, { href, filters, yearChartHref, showHeading = true }) {
  const chartEntries = yearChartEntries(stats);
  const chartGameCount = chartEntries.reduce((sum, entry) => sum + entry.count, 0);
  const yearCountLabel = `${number(chartEntries.length)} ${chartEntries.length === 1 ? "Jahr" : "Jahre"}`;
  const yearDescription = chartEntries.length
    ? `Im Diagramm für ${YEAR_RANGE_LABEL} werden ${yearCountLabel} mit mindestens zwei Spielen gezeigt: ${number(chartGameCount)} ${chartGameCount === 1 ? "Spiel" : "Spiele"}.`
    : `Für ${YEAR_RANGE_LABEL} gibt es keine Jahre mit mindestens zwei Spielen.`;
  const yearChartContext = `Die Zeitachse zeigt ${YEAR_RANGE_LABEL}; Jahreslücken bleiben proportional erhalten. Jahreszahlen und Balken der dargestellten Jahre verlinken auf die gefilterte Spieleübersicht.`;
  const yearChart = gameStatisticsYearSvg(stats, { href: yearChartHref ?? href });
  return `<nav class="game-page-navigation" aria-label="Spieleübersichten"><ul>
<li><a href="${href("spiele/")}">re.play</a></li>
<li><a href="${href("spiele/uebersicht/")}">Alle Spiele als Tabelle</a></li>
<li><a href="${href("spiele/statistik/")}" aria-current="page">Spielestatistiken</a></li>
</ul></nav>
  ${showHeading ? "<h1>re.play – Spielestatistiken</h1>" : ""}

<section aria-labelledby="statistik-jahre"><h2 id="statistik-jahre">Erscheinungsjahre</h2>
<p>${yearDescription} ${yearChartContext}</p>
<figure class="statistics-chart"><div class="statistics-chart-scroll" role="region" aria-label="Erscheinungsjahre-Grafik von ${FIRST_CHART_YEAR} bis ${LAST_CHART_YEAR}; zum Erkunden horizontal verschiebbar" tabindex="0">${yearChart}</div></figure>
${stats.unknownYearGames.length ? `<p>Erscheinungsjahr unbekannt: ${number(stats.unknownYearGames.length)} ${stats.unknownYearGames.length === 1 ? "Spiel" : "Spiele"} (außerhalb der Zeitachse).</p>
<details class="statistics-more"><summary>Spiele ohne bekanntes Erscheinungsjahr ansehen</summary>${gameList(stats.unknownYearGames, href)}</details>` : ""}</section>
<section aria-labelledby="statistik-genres"><h2 id="statistik-genres">Genres</h2>
<p>${number(stats.genreKnown)} von ${number(stats.total)} Spielen haben Genreangaben; ${number(stats.genreUnknown)} ${stats.genreUnknown === 1 ? "Spiel bleibt" : "Spiele bleiben"} ohne bekannte Genreangabe. Ein Spiel kann mehreren Genres zugeordnet sein.</p>
<p>Viele Spiele teilen sich Genreangaben mit mindestens einem weiteren Spiel.</p>
${stats.genres.length ? `<figure class="statistics-chart">${genreStatisticsSvg(stats, { filters, href })}<figcaption>Jedes Spiel wird je Genre höchstens einmal gezählt.</figcaption></figure>` : "<p>Es liegen keine freigegebenen Genreangaben vor.</p>"}</section>
<section aria-labelledby="statistik-publisher"><h2 id="statistik-publisher">Publisher</h2>
<p>${number(stats.publisherKnown)} von ${number(stats.total)} Spielen haben Publisherangaben; ${number(stats.publisherUnknown)} ${stats.publisherUnknown === 1 ? "Spiel bleibt" : "Spiele bleiben"} ohne bekannte Publisherangabe.</p>
${stats.publishers.length ? `<figure class="statistics-chart">${publisherStatisticsSvg(stats, { filters, href })}<figcaption>Top 10; je Publisher wird unabhängig von regionalen Doppelungen jedes Spiel nur einmal gezählt.</figcaption></figure>`
      : "<p>Es liegen keine freigegebenen Publisherangaben vor.</p>"}</section>
<section aria-labelledby="statistik-gemeinsamkeiten"><h2 id="statistik-gemeinsamkeiten">Gemeinsamkeiten zwischen Genre und Publisher</h2>
<p>Die Tabelle zeigt gemeinsame Spiele je Genre-Publisher-Kombination. Die Zuordnung beschreibt den Katalog, nicht eine Ursache oder die Gesamtheit aller Veröffentlichungen eines Unternehmens.</p>
${stats.combinations.length ? `<div class="statistics-table-scroll"><table class="statistics-table combination-statistics">
<thead><tr><th scope="col">Genre</th><th scope="col">Publisher</th><th scope="col">Gemeinsame Spiele</th><th scope="col">Spiele</th></tr></thead><tbody>
${stats.combinations.slice(0, 10).map((entry) => `<tr><th scope="row">${escapeHtml(entry.genre)}</th><td>${escapeHtml(entry.publisher)}</td>
<td>${number(entry.count)}</td>
<td><details><summary>Gemeinsame Spiele ansehen</summary>${gameList(entry.games, href)}</details></td></tr>`).join("")}
</tbody></table></div>` : "<p>Es gibt keine Genre-Publisher-Kombination mit mindestens zwei gemeinsamen Spielen.</p>"}
<p>Die vollständige Spieleübersicht verlinkt auf die vorhandenen Genre- und Publisherlisten; die Beschriftungen der Genre- und Publisher-Diagramme führen direkt zu diesen Listen bzw. bei Einzelzuordnungen zur Spieleseite.</p></section>`;
}
