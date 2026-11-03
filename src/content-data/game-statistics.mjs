import { gameMetadataValues } from "./game-filters.mjs";

const byGermanName = (a, b) => a.localeCompare(b, "de");

function sortedGames(games) {
  return [...games].sort((a, b) => byGermanName(a.name, b.name) || a.id.localeCompare(b.id, "en"));
}

function groupedValues(games, field) {
  const groups = new Map();
  const knownGameIds = new Set();
  for (const game of games) {
    const values = gameMetadataValues(game, field);
    if (values.length) knownGameIds.add(game.id);
    for (const value of values) {
      if (!groups.has(value)) groups.set(value, new Map());
      groups.get(value).set(game.id, game);
    }
  }
  const entries = [...groups].map(([name, byId]) => ({
    name, count: byId.size, games: sortedGames(byId.values()),
  })).sort((a, b) => b.count - a.count || byGermanName(a.name, b.name));
  return { entries, knownGameIds };
}

function pairMetrics(entries) {
  const pairs = new Set();
  const connectedGames = new Set();
  for (const entry of entries) {
    if (entry.games.length < 2) continue;
    for (const game of entry.games) connectedGames.add(game.id);
    for (let first = 0; first < entry.games.length; first += 1) {
      for (let second = first + 1; second < entry.games.length; second += 1) {
        const ids = [entry.games[first].id, entry.games[second].id].sort();
        pairs.add(JSON.stringify(ids));
      }
    }
  }
  return { connectedGames: connectedGames.size, sharedPairs: pairs.size };
}

export function gameStatistics(sourceGames) {
  const games = [...new Map(sourceGames.map((game) => [game.id, game])).values()];
  const years = new Map();
  const unknownYearGames = [];
  for (const game of games) {
    if (!Number.isInteger(game.releaseYear)) {
      unknownYearGames.push(game);
      continue;
    }
    if (!years.has(game.releaseYear)) years.set(game.releaseYear, []);
    years.get(game.releaseYear).push(game);
  }
  const yearEntries = [...years].map(([year, yearGames]) => ({
    year, count: yearGames.length, games: sortedGames(yearGames),
  })).sort((a, b) => a.year - b.year);
  const genreStats = groupedValues(games, "genre");
  const publisherStats = groupedValues(games, "publisher");
  const developerStats = groupedValues(games, "developer");
  const publisherCounts = new Map(publisherStats.entries.map((entry) => [entry.name, entry]));
  const combinationGroups = new Map();
  for (const game of games) {
    const genres = gameMetadataValues(game, "genre");
    const publishers = gameMetadataValues(game, "publisher");
    for (const genre of genres) {
      for (const publisher of publishers) {
        const key = JSON.stringify([genre, publisher]);
        if (!combinationGroups.has(key)) combinationGroups.set(key, new Map());
        combinationGroups.get(key).set(game.id, game);
      }
    }
  }
  const combinations = [...combinationGroups].map(([key, byId]) => {
    const [genre, publisher] = JSON.parse(key);
    return {
      genre, publisher, count: byId.size, games: sortedGames(byId.values()),
      publisherCount: publisherCounts.get(publisher)?.count ?? 0,
    };
  }).filter((entry) => entry.count >= 2).sort((a, b) => b.count - a.count
    || byGermanName(a.genre, b.genre) || byGermanName(a.publisher, b.publisher));
  const visibleYears = yearEntries.filter((entry) => entry.count >= 2);
  const omittedYears = yearEntries.filter((entry) => entry.count === 1);
  return {
    games, total: games.length, yearEntries, visibleYears, omittedYears,
    unknownYearGames: sortedGames(unknownYearGames),
    genres: genreStats.entries, genreKnown: genreStats.knownGameIds.size,
    genreUnknown: games.length - genreStats.knownGameIds.size,
    genreConnections: pairMetrics(genreStats.entries),
    publishers: publisherStats.entries, publisherKnown: publisherStats.knownGameIds.size,
    publisherUnknown: games.length - publisherStats.knownGameIds.size,
    developers: developerStats.entries, developerKnown: developerStats.knownGameIds.size,
    developerUnknown: games.length - developerStats.knownGameIds.size,
    developerUnknownGames: sortedGames(games.filter((game) => !developerStats.knownGameIds.has(game.id))),
    publisherConnections: pairMetrics(publisherStats.entries),
    combinations,
  };
}
