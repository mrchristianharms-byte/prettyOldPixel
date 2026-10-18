export function normalizeDumpTitle(value) {
  return value.normalize("NFKC").toLowerCase().replace(/[’‘]/gu, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const platformNames = {
  C64: ["commodore 64", "commodore 64 128", "c64"],
  "MS-DOS": ["dos", "ms dos"],
  Amiga: ["amiga"],
  NES: ["nes", "nintendo entertainment system"],
  "Game Boy": ["game boy"],
};

export function platformMatches(platforms, source) {
  const normalized = normalizeDumpTitle(source ?? "");
  return platforms.some((platform) => (platformNames[platform] ?? [normalizeDumpTitle(platform)]).includes(normalized));
}

export function selectDumpCandidate(game, candidates, policy) {
  if (!policy || policy.version !== 1 || policy.preserveCataloguePlatforms !== true
    || policy.requireUniqueCandidate !== true
    || !/^\d{4}-\d{2}-\d{2}$/u.test(policy.approvedAt)
    || typeof policy.note !== "string" || !policy.note.trim()
    || JSON.stringify(policy.openPlatformPriority) !== JSON.stringify(["MS-DOS", "Amiga", "C64"])) {
    throw new Error("Dump-Auswahl: Ungültige oder nicht unterstützte Auswahlregel.");
  }
  const platforms = game.platforms.length ? [...game.platforms]
    : policy.openPlatformPriority.filter((platform) =>
      candidates.some((candidate) => candidate.releases.some((release) => platformMatches([platform], release.platform)))).slice(0, 1);
  const platformBasis = game.platforms.length ? "catalogue" : "dos-amiga-c64-priority";
  const eligible = candidates.filter((candidate) => platforms.length > 0
    && platforms.every((platform) => candidate.releases.some((release) => platformMatches([platform], release.platform))));
  const base = { platforms, platformBasis, consideredIds: eligible.map((candidate) => candidate.mobyid) };
  if (!candidates.length) return { ...base, status: "blocked", reason: "no-exact-title-match" };
  if (!platforms.length || !eligible.length) return { ...base, status: "blocked", reason: "no-matching-platform" };
  if (eligible.length !== 1) return { ...base, status: "blocked", reason: "ambiguous-on-selected-platform" };
  const candidate = eligible[0];
  // A reused alternate title must not turn a bundle/remaster into the original game.
  const explicitEdition = /\b(?:edition|remaster(?:ed)?|remake|collection|compilation|bundle|cd rom)\b/giu;
  const editionSuffix = /\b(?:gold|deluxe|complete|ultimate|plus|reinforcements)\b/giu;
  const localTitles = [game.name, ...(game.aliases ?? [])];
  const markers = (title, otherTitle) => {
    const normalized = normalizeDumpTitle(title);
    const other = normalizeDumpTitle(otherTitle);
    // "Black Gold" is a regional game title, not evidence of a Gold edition.
    const sameBase = ` ${normalized} `.includes(` ${other} `) || ` ${other} `.includes(` ${normalized} `);
    return [...normalized.matchAll(explicitEdition), ...(sameBase ? normalized.matchAll(editionSuffix) : [])]
      .map((match) => match[0]).sort();
  };
  if (!localTitles.some((title) => JSON.stringify(markers(title, candidate.title))
    === JSON.stringify(markers(candidate.title, title)))) {
    return { ...base, status: "blocked", reason: "edition-unverified" };
  }
  const sourceTitles = [candidate.title, ...(candidate.alternativeTitles ?? []).map((entry) => entry.title)];
  if (!localTitles.some((title) => sourceTitles.some((sourceTitle) =>
    normalizeDumpTitle(title) === normalizeDumpTitle(sourceTitle)))) {
    return { ...base, status: "blocked", reason: "title-unverified" };
  }
  return { ...base, status: "selected", reason: "unique-title-and-platform",
    mobyid: candidate.mobyid,
    matchingReleaseIds: candidate.releases.filter((release) => platformMatches(platforms, release.platform))
      .map((release) => release.mobyreleaseid),
    identityBasis: "dump-title-and-platform",
  };
}
