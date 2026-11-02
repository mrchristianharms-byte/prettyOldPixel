import assert from "node:assert/strict";
import test from "node:test";
import { gameStatistics } from "../../src/content-data/game-statistics.mjs";
import {
  gameStatisticsMarkup, gameStatisticsYearSvg, genreStatisticsSvg,
  publisherStatisticsSvg,
} from "../../src/site-generation/widget/game-statistics.mjs";

const game = (id, name, releaseYear, genres, publishers, status = "ready") => ({
  id, name, route: `spiele/${id}/`, releaseYear,
  metadata: status === "ready" ? {
    status, data: {
      genres,
      releases: publishers.map((publisher) => ({ publisher })),
    },
  } : { status, data: null },
});

const games = [
  game("a", "Alpha", 1980, ["Action", "Action", "Simulation"], ["Acme", "Acme"]),
  game("b", "Beta", 1980, ["Action"], ["Acme", "Rival"]),
  game("c", "Gamma", 1982, ["Action"], ["Rival"]),
  game("d", "Delta", 1984, ["Puzzle", "Simulation"], []),
  game("e", "Epsilon", null, [], [], "blocked"),
];

test("aggregates each game and metadata value once, preserving unknown and singleton groups", () => {
  const statistics = gameStatistics([...games, games[0]]);
  assert.equal(statistics.total, 5);
  assert.deepEqual(statistics.yearEntries.map(({ year, count }) => [year, count]), [
    [1980, 2], [1982, 1], [1984, 1],
  ]);
  assert.deepEqual(statistics.visibleYears.map(({ year, count }) => [year, count]), [[1980, 2]]);
  assert.deepEqual(statistics.omittedYears.map(({ year }) => year), [1982, 1984]);
  assert.deepEqual(statistics.unknownYearGames.map(({ id }) => id), ["e"]);
  assert.equal(statistics.visibleYears.reduce((sum, entry) => sum + entry.count, 0)
    + statistics.omittedYears.reduce((sum, entry) => sum + entry.count, 0)
    + statistics.unknownYearGames.length, statistics.total);
  assert.deepEqual(statistics.genres.map(({ name, count }) => [name, count]), [
    ["Action", 3], ["Simulation", 2], ["Puzzle", 1],
  ]);
  assert.deepEqual([statistics.genreKnown, statistics.genreUnknown], [4, 1]);
  assert.deepEqual(statistics.publishers.map(({ name, count }) => [name, count]), [
    ["Acme", 2], ["Rival", 2],
  ]);
  assert.deepEqual([statistics.publisherKnown, statistics.publisherUnknown], [3, 2]);
  assert.deepEqual(statistics.genreConnections, { connectedGames: 4, sharedPairs: 4 });
  assert.deepEqual(statistics.publisherConnections, { connectedGames: 3, sharedPairs: 2 });
  assert.deepEqual(statistics.combinations.map(({ genre, publisher, count }) => [genre, publisher, count]), [
    ["Action", "Acme", 2], ["Action", "Rival", 2],
  ]);
});

test("renders explored groups as linked HTML and SVG with accessible zero-based axes", () => {
  const statistics = gameStatistics(games);
  const filters = new Map([
    ["genre", new Map([["Action", { route: "spiele/genre/action/" }]])],
    ["publisher", new Map([["Acme", { route: "spiele/publisher/acme/" }]])],
  ]);
  const href = (route) => `/${route}`;
  const html = gameStatisticsMarkup(statistics, {
    href, filters, yearChartHref: href,
  });
  assert.match(html, /aria-current="page">Spielestatistiken/u);
  assert.match(html, /<a href="\/spiele\/genre\/action\/"><text class="chart-axis-label"[^>]*>Action<\/text><\/a>/u);
  assert.match(html, /<a href="\/spiele\/d\/"><text class="chart-axis-label"[^>]*>Puzzle<\/text><\/a>/u);
  assert.doesNotMatch(html, /<a href=[^>]*><text class="chart-axis-label"[^>]*>Simulation<\/text>/u);
  assert.match(html, /<a href="\/spiele\/publisher\/acme\/"><text class="chart-axis-label"[^>]*>Acme<\/text><\/a>/u);
  assert.doesNotMatch(html, /Anteil an allen Spielen/u);
  assert.match(html, /Gemeinsame Spiele ansehen/u);
  assert.doesNotMatch(html, /Anteil innerhalb des Publishers/u);
  assert.doesNotMatch(html, /SVG direkt öffnen|Spielpaare/u);
  assert.match(html, /<title id="publisher-chart-title">Spiele je Publisher \(Top 10\)<\/title>/u);
  assert.match(html, /<figcaption>Top 10; je Publisher wird unabhängig von regionalen Doppelungen/u);
  assert.match(html, /spiele\/jahr\/1980\//u);
  assert.match(html, /Im Diagramm für 1980–1999 werden 1 Jahr mit mindestens zwei Spielen gezeigt: 2 Spiele/u);
  assert.doesNotMatch(html, /year-statistics/u);
  const yearSvg = gameStatisticsYearSvg(statistics, { href });
  assert.match(yearSvg, /<title id="year-chart-title">Erscheinungsjahre 1980–1999 – Jahre mit mindestens zwei Spielen<\/title>/u);
  assert.match(yearSvg, /<desc id="year-chart-description">Balkendiagramm für 1980–1999, Jahre mit mindestens zwei Spielen: 1980: 2 Spiele/u);
  assert.equal((yearSvg.match(/class="chart-bar"/gu) ?? []).length, 1);
  assert.match(yearSvg, /<a class="year-chart-link" href="\/spiele\/jahr\/1980\/" aria-label="Spiele aus dem Erscheinungsjahr 1980 anzeigen"><text class="chart-axis-label"[^>]*>1980<\/text><\/a>/u);
  assert.doesNotMatch(yearSvg, /spiele\/jahr\/(?:1982|1984)\//u);
  assert.match(yearSvg, /<text class="chart-axis-label"[^>]*>0<\/text>/u);
  assert.match(yearSvg, /<rect class="chart-bar" x="80\.19"/u);
  assert.match(genreStatisticsSvg(statistics), /Horizontales Balkendiagramm: Action: 3/u);
  assert.match(publisherStatisticsSvg(statistics),
    /<title id="publisher-chart-title">Spiele je Publisher \(Top 10\)<\/title>[\s\S]*Horizontales Balkendiagramm: Acme: 2, Rival: 2/u);
  assert.match(genreStatisticsSvg(statistics, { filters, href }),
    /<a href="\/spiele\/genre\/action\/"><text class="chart-axis-label"[^>]*>Action<\/text><\/a>/u);
  assert.match(publisherStatisticsSvg(statistics, { filters, href }),
    /<a href="\/spiele\/publisher\/acme\/"><text class="chart-axis-label"[^>]*>Acme<\/text><\/a>/u);
});

test("limits the year chart to 1980–1999 and omits singleton and out-of-range years", () => {
  const statistics = gameStatistics([
    game("a", "Alpha", 1979, [], []),
    game("b", "Beta", 1979, [], []),
    game("c", "Gamma", 1980, [], []),
    game("d", "Delta", 1980, [], []),
    game("e", "Epsilon", 1990, [], []),
    game("f", "Zeta", 1999, [], []),
    game("g", "Eta", 1999, [], []),
    game("h", "Theta", 2000, [], []),
    game("i", "Iota", 2000, [], []),
  ]);
  const svg = gameStatisticsYearSvg(statistics);
  const bars = [...svg.matchAll(/<rect class="chart-bar" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/gu)]
    .map((match) => ({ start: Number(match[1]), end: Number(match[1]) + Number(match[2]) }));
  assert.equal(bars.length, 2);
  assert.ok(bars.every((bar) => bar.start >= 58 && bar.end <= 818));
  assert.match(svg, />1980<\/text>/u);
  assert.match(svg, />1999<\/text>/u);
  assert.match(svg, /Spiele aus dem Erscheinungsjahr 1999 anzeigen/u);
  assert.doesNotMatch(svg, />(?:1979|2000)<|spiele\/jahr\/(?:1979|1990|2000)\//u);
  assert.match(svg, /x="781\.81"/u);
});

test("caps sorted combinations at 10 while retaining every qualifying combination in aggregation", () => {
  const entries = Array.from({ length: 12 }, (_, index) => {
    const genre = `Genre ${String(index).padStart(2, "0")}`;
    const publisher = `Publisher ${String(index).padStart(2, "0")}`;
    return [
      game(`a${index}`, `Alpha ${index}`, 1990, [genre], [publisher]),
      game(`b${index}`, `Beta ${index}`, 1990, [genre], [publisher]),
    ];
  }).flat();
  const statistics = gameStatistics(entries);
  assert.equal(statistics.combinations.length, 12);
  assert.equal((publisherStatisticsSvg(statistics).match(/class="chart-bar"/gu) ?? []).length, 10);
  const html = gameStatisticsMarkup(statistics, {
    href: (route) => `/${route}`, filters: [],
  });
  const table = html.match(/<section aria-labelledby="statistik-gemeinsamkeiten">([\s\S]*?)<\/section>/u)[1];
  assert.equal((table.match(/<tr>/gu) ?? []).length, 11);
  assert.doesNotMatch(html, /Weitere Publisher/u);
  assert.ok(table.indexOf("Genre 00") < table.indexOf("Genre 01"));
  assert.ok(table.includes("Gemeinsame Spiele ansehen"));
  for (const index of Array.from({ length: 10 }, (_, value) => value)) {
    assert.ok(table.includes(`/spiele/a${index}/`));
    assert.ok(table.includes(`/spiele/b${index}/`));
  }
  assert.ok(!table.includes("/spiele/a10/"));
  assert.ok(!table.includes("/spiele/a11/"));
});

test("states separately when there are no qualifying appearance years", () => {
  const statistics = gameStatistics([
    game("a", "Alpha", null, [], []),
    game("b", "Beta", null, [], []),
  ]);
  const html = gameStatisticsMarkup(statistics, {
    href: (route) => `/${route}`, filters: [],
  });
  assert.match(html, /<figure class="statistics-chart">[\s\S]*Keine Jahre mit mindestens zwei Spielen/u);
  assert.match(html, /Für 1980–1999 gibt es keine Jahre mit mindestens zwei Spielen/u);
  assert.match(gameStatisticsYearSvg(statistics), /Keine Jahre mit mindestens zwei Spielen/u);
});
