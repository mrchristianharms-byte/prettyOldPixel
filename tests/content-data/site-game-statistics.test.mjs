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
  const html = gameStatisticsMarkup(statistics, {
    href: (route) => `/${route}`, filters, svgHref: "/spiele/statistik/erscheinungsjahre.svg",
  });
  assert.match(html, /aria-current="page">Spielestatistiken/u);
  assert.match(html, /<a href="\/spiele\/genre\/action\/">Action<\/a>/u);
  assert.match(html, /<a href="\/spiele\/d\/">Puzzle<\/a>/u);
  assert.match(html, /Gemeinsame Spiele ansehen/u);
  assert.doesNotMatch(html, /Anteil innerhalb des Publishers/u);
  assert.doesNotMatch(html, /SVG direkt öffnen|Spielpaare/u);
  assert.match(html, /<title id="publisher-chart-title">Spiele je Publisher \(Top 10\)<\/title>/u);
  assert.match(html, /<figcaption>Top 10; je Publisher wird unabhängig von regionalen Doppelungen/u);
  assert.match(html, /spiele\/statistik\/erscheinungsjahre\.svg/u);
  assert.match(html, /Jahrgänge mit je einem Spiel/u);
  const yearSvg = gameStatisticsYearSvg(statistics);
  assert.match(yearSvg, /<title id="year-chart-title">Spiele nach Erscheinungsjahr<\/title>/u);
  assert.match(yearSvg, /<desc id="year-chart-description">Balkendiagramm mit folgenden Werten: 1980: 2 Spiele/u);
  assert.equal((yearSvg.match(/class="chart-bar"/gu) ?? []).length, statistics.visibleYears.length);
  assert.match(yearSvg, /<text class="chart-axis-label"[^>]*>0<\/text>/u);
  assert.match(yearSvg, /<rect class="chart-bar" x="4\d\d\.\d{2}"/u);
  assert.match(genreStatisticsSvg(statistics), /Horizontales Balkendiagramm: Action: 3/u);
  assert.match(publisherStatisticsSvg(statistics),
    /<title id="publisher-chart-title">Spiele je Publisher \(Top 10\)<\/title>[\s\S]*Horizontales Balkendiagramm: Acme: 2, Rival: 2/u);
});

test("keeps year bars inside the plot area by padding the timeline one year on each side", () => {
  const statistics = gameStatistics([
    game("a", "Alpha", 1980, [], []),
    game("b", "Beta", 1980, [], []),
    game("c", "Gamma", 1984, [], []),
    game("d", "Delta", 1984, [], []),
  ]);
  const svg = gameStatisticsYearSvg(statistics);
  const bars = [...svg.matchAll(/<rect class="chart-bar" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/gu)]
    .map((match) => ({ start: Number(match[1]), end: Number(match[1]) + Number(match[2]) }));
  assert.equal(bars.length, 2);
  assert.ok(bars.every((bar) => bar.start >= 58 && bar.end <= 818));
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
    href: (route) => `/${route}`, filters: [], svgHref: "/statistics.svg",
  });
  const table = html.match(/<section aria-labelledby="statistik-gemeinsamkeiten">([\s\S]*?)<\/section>/u)[1];
  assert.equal((table.match(/<tr>/gu) ?? []).length, 11);
  assert.match(html, /Weitere Publisher \(2\)/u);
  assert.ok(table.indexOf("Genre 00") < table.indexOf("Genre 01"));
  assert.ok(table.includes("Gemeinsame Spiele ansehen"));
  for (const index of Array.from({ length: 10 }, (_, value) => value)) {
    assert.ok(table.includes(`/spiele/a${index}/`));
    assert.ok(table.includes(`/spiele/b${index}/`));
  }
  assert.ok(!table.includes("/spiele/a10/"));
  assert.ok(!table.includes("/spiele/a11/"));
});

test("states separately when there are no repeat-year groups", () => {
  const statistics = gameStatistics([
    game("a", "Alpha", 1980, [], []),
    game("b", "Beta", null, [], []),
  ]);
  const html = gameStatisticsMarkup(statistics, {
    href: (route) => `/${route}`, filters: [], svgHref: "/statistics.svg",
  });
  assert.doesNotMatch(html, /<figure class="statistics-chart"><img src="\/statistics\.svg"/u);
  assert.match(html, /keine entsprechenden Erscheinungsjahre/u);
  assert.match(gameStatisticsYearSvg(statistics), /Keine Jahresgruppen mit mindestens zwei Spielen/u);
});
