import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MAX_AGE_DAYS, createFetcher, decodeHtml, defaultSleep, isFresh,
  normalizeMagazineName, readJson, writeJson,
} from "../shared/archive-cache.mjs";
import { cacheMagazineLogo } from "./kultmags-logos.mjs";

export const GAMESTAR_ARCHIVE_URL = "https://www.pcgamesdatabase.de/gamestar.php";
export const GAMESTAR_LOGO_URL = "https://www.pcgamesdatabase.de/images/gamestar.jpg";
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export function parseGameStarArchive(html) {
  const issues = new Map();
  for (const [, href] of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/giu)) {
    const url = new URL(decodeHtml(href), GAMESTAR_ARCHIVE_URL);
    if (url.origin !== new URL(GAMESTAR_ARCHIVE_URL).origin || url.pathname !== "/gamestar.php"
      || url.searchParams.get("mag") !== "gamestar") continue;
    const date = /^(0?[1-9]|1[0-2])\/((?:19|20)\d{2})$/u.exec(url.searchParams.get("vol") ?? "");
    if (!date) continue;
    const month = Number(date[1]);
    const year = Number(date[2]);
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (issues.has(key)) continue;
    issues.set(key, {
      title: `GameStar ${key}`, section: String(year), special: false, supplement: false,
      year, numbers: [month], words: [], pageUrl: url.href,
      readerUrl: null, downloadUrl: null, coverUrl: null,
    });
  }
  if (!issues.size) throw new Error("PC Games Database: Keine GameStar-Heftlinks erkannt; Seitenformat prüfen.");
  return [...issues.values()].sort((a, b) => a.year - b.year || a.numbers[0] - b.numbers[0]);
}

function validateMagazine(magazine) {
  if (magazine?.name !== "GameStar" || magazine.url !== GAMESTAR_ARCHIVE_URL
    || !Number.isFinite(Date.parse(magazine.fetchedAt)) || !Array.isArray(magazine.sections)
    || !Array.isArray(magazine.issues) || !magazine.issues.length) {
    throw new Error("PC Games Database: Ungültiger GameStar-Cache.");
  }
  const seen = new Set();
  if (magazine.logo !== undefined && magazine.logo?.url !== GAMESTAR_LOGO_URL) {
    throw new Error("PC Games Database: Ungültiges GameStar-Logo.");
  }
  for (const issue of magazine.issues) {
    const url = new URL(issue.pageUrl);
    const key = `${issue.year}-${issue.numbers?.[0]}`;
    if (!Number.isInteger(issue.year) || issue.year < 1997 || issue.year > 2099
      || !Array.isArray(issue.numbers) || issue.numbers.length !== 1
      || !Number.isInteger(issue.numbers[0]) || issue.numbers[0] < 1 || issue.numbers[0] > 12
      || issue.special !== false || typeof issue.title !== "string" || !issue.title.trim()
      || url.origin !== new URL(GAMESTAR_ARCHIVE_URL).origin || url.pathname !== "/gamestar.php"
      || url.searchParams.get("mag") !== "gamestar"
      || !/^(0?[1-9]|1[0-2])\/(?:19|20)\d{2}$/u.test(url.searchParams.get("vol") ?? "")
      || Number(url.searchParams.get("vol").split("/")[0]) !== issue.numbers[0]
      || Number(url.searchParams.get("vol").split("/")[1]) !== issue.year || seen.has(key)
      || issue.readerUrl !== null || issue.downloadUrl !== null) {
      throw new Error("PC Games Database: Ungültige oder doppelte GameStar-Ausgabe.");
    }
    seen.add(key);
  }
  return magazine;
}

export async function loadPcgamesdatabaseCatalog({
  cacheDir = path.join(projectRoot, "cache", "pcgamesdatabase"),
  maxAgeDays = DEFAULT_MAX_AGE_DAYS, refresh = false, cachedOnly = false, optional = false,
  fetchImpl = fetch, sleep = defaultSleep, log = console.log, now = Date.now(),
} = {}) {
  const file = path.join(cacheDir, "magazines", "gamestar.json");
  const cached = await readJson(file);
  if (cached) validateMagazine(cached);
  if (cachedOnly) {
    if (!cached && !optional) throw new Error(`PC Games Database-Cache fehlt: ${file}. Zuerst npm run dev:fetch:gamestar ausführen.`);
    return cached;
  }
  if (!refresh && isFresh(cached, maxAgeDays, now) && cached.logo !== undefined) return cached;
  const fetcher = createFetcher({ fetchImpl, sleep, log, siteName: "pcgamesdatabase.de" });
  if (!refresh && isFresh(cached, maxAgeDays, now)) {
    const updated = { ...cached, logo: await cacheMagazineLogo(GAMESTAR_LOGO_URL, cacheDir, fetcher) };
    await writeJson(file, updated);
    log(`pcgamesdatabase.de: GameStar-Logo ergänzt: ${file}`);
    return updated;
  }
  const issues = parseGameStarArchive(await fetcher.fetchPage(GAMESTAR_ARCHIVE_URL));
  const logo = await cacheMagazineLogo(GAMESTAR_LOGO_URL, cacheDir, fetcher);
  const magazine = validateMagazine({
    name: "GameStar", url: GAMESTAR_ARCHIVE_URL, fetchedAt: new Date(now).toISOString(), logo,
    sections: [...new Set(issues.map((issue) => issue.year))].map((year) => ({
      name: String(year), url: GAMESTAR_ARCHIVE_URL,
    })),
    issues,
  });
  await writeJson(file, magazine);
  await writeJson(path.join(cacheDir, "index.json"), {
    source: GAMESTAR_ARCHIVE_URL, fetchedAt: magazine.fetchedAt,
    magazines: [{ name: "GameStar", url: GAMESTAR_ARCHIVE_URL }],
  });
  log(`pcgamesdatabase.de: ${issues.length} GameStar-Ausgaben und Logo gespeichert: ${file}`);
  return magazine;
}

export function findPcgamesdatabaseIssue(magazine, name, issue) {
  if (!magazine || normalizeMagazineName(name) !== "gamestar") return null;
  const matches = issue && !issue.special && Number.isInteger(issue.year) && issue.months?.length === 1
    ? magazine.issues.filter((candidate) => candidate.year === issue.year && candidate.numbers[0] === issue.months[0])
    : [];
  if (matches.length !== 1) return { match: "folder", title: "GameStar", pageUrl: magazine.url };
  const found = matches[0];
  return {
    match: "issue", matchedBy: "month", title: found.title, pageUrl: found.pageUrl,
    readerUrl: null, downloadUrl: null, coverUrl: found.coverUrl,
  };
}

export function addPcgamesdatabaseLinks(videos, magazine) {
  if (!magazine) return;
  for (const video of videos) {
    for (const mention of video.magazines) {
      if (normalizeMagazineName(mention.name) === "gamestar") {
        mention.pcgamesdatabase = findPcgamesdatabaseIssue(magazine, mention.name, mention.issue);
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--refresh")) {
    console.error("Aufruf: node src/fetch-magazine/fetch-pcgamesdatabase.mjs [--refresh]");
    process.exitCode = 1;
  } else {
    await loadPcgamesdatabaseCatalog({ refresh: args.includes("--refresh") }).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
