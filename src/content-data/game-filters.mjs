import { slugify } from "./routes.mjs";

export function gameMetadataFilters(games) {
  const filters = new Map();
  for (const [field, label, segment] of [
    ["genre", "Genre", "genre"],
    ["developer", "Entwickler", "entwickler"],
    ["publisher", "Publisher", "publisher"],
    ["platform", "Spieleplattformen", "plattform"],
  ]) {
    const byName = new Map();
    for (const game of games) {
      if (game.metadata?.status !== "ready") continue;
      const { genres = [], releases = [] } = game.metadata.data;
      const values = field === "platform" ? (game.platforms.length ? game.platforms : game.metadata.data.scope?.platforms ?? [])
        : field === "genre" ? genres : releases.map((release) => release[field]);
      for (const name of new Set(values.filter(Boolean))) {
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push(game);
      }
    }
    const bySlug = new Map();
    for (const name of [...byName.keys()].sort()) {
      const matches = byName.get(name);
      if (matches.length < 2) continue;
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
