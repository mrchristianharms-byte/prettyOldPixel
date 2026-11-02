import { slugify } from "./routes.mjs";

export function gameMetadataValues(game, field) {
  if (field === "year") return Number.isInteger(game.releaseYear) ? [String(game.releaseYear)] : [];
  if (game.metadata?.status !== "ready") return [];
  const { genres = [], releases = [] } = game.metadata.data;
  let values;
  if (field === "platform") values = game.platforms.length ? game.platforms : game.metadata.data.scope?.platforms ?? [];
  else if (field === "genre") values = genres;
  else values = releases.map((release) => release[field]);
  return [...new Set(values.filter(Boolean))];
}

export function gameMetadataFilters(games) {
  const filters = new Map();
  for (const [field, label, segment] of [
    ["year", "Erscheinungsjahr", "jahr"],
    ["genre", "Genre", "genre"],
    ["developer", "Entwickler", "entwickler"],
    ["publisher", "Publisher", "publisher"],
    ["platform", "Spieleplattformen", "plattform"],
  ]) {
    const minimumMatchCount = field === "year" ? 1 : 2;
    const byName = new Map();
    for (const game of games) {
      for (const name of gameMetadataValues(game, field)) {
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push(game);
      }
    }
    const bySlug = new Map();
    for (const name of [...byName.keys()].sort()) {
      const matches = byName.get(name);
      if (matches.length < minimumMatchCount) continue;
      const slug = slugify(name) || "wert";
      if (!bySlug.has(slug)) bySlug.set(slug, []);
      bySlug.get(slug).push({ name, label, games: matches });
    }
    const entries = new Map();
    const usedSlugs = new Set(bySlug.keys());
    for (const [slug, values] of bySlug) {
      let variant = 1;
      for (const entry of values) {
        let routeSlug = slug;
        if (values.length > 1) {
          do { routeSlug = `${slug}-variante-${variant++}`; } while (usedSlugs.has(routeSlug));
          usedSlugs.add(routeSlug);
        }
        entries.set(entry.name, { ...entry, route: `spiele/${segment}/${routeSlug}/` });
      }
    }
    filters.set(field, entries);
  }
  return filters;
}
