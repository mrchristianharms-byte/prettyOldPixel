import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MAX_AGE_DAYS,
  DEFAULT_INDEX_MAX_AGE_DAYS,
  createFetcher,
  decodeHtml,
  defaultSleep,
  isFresh,
  normalizeMagazineName,
  readJson,
  writeJson,
} from "../shared/archive-cache.mjs";

export const REETROZ_URL = "https://reetroz.com/";
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultCacheDir = path.join(projectRoot, "cache", "reetroz");

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const stripTags = (html) => decodeHtml(html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "")).trim();

export function parseCatalogPage(html) {
  const magazines = new Map();
  for (const [, name, slug] of html.matchAll(/<a title="([^"]+)"[^>]*href="\/catalog\?pub=([^"&]+)"/g)) {
    if (!magazines.has(slug)) {
      const decodedName = decodeHtml(name);
      magazines.set(slug, {
        name: decodedName,
        slug,
        // "PC Games / Electronic Entertainment" was renamed over time; every name is a valid alias.
        aliases: decodedName.split(" / ").map((alias) => alias.trim()),
        url: `${REETROZ_URL}magazines/${slug}`,
      });
    }
  }
  return [...magazines.values()];
}

// Parses dates like "Nov 1992", "Nov-Dec 1981", "April/May 1991" or "Holiday 2004".
export function parseIssueDate(text) {
  const year = /(?<!\d)(\d{4})(?!\d)/.exec(text);
  const found = [...text.toLowerCase().matchAll(/[a-z]+/g)]
    .map(([word]) => MONTHS.indexOf(word.slice(0, 3)) + 1)
    .filter((month) => month > 0);
  const first = found[0];
  const last = found.at(-1);
  return {
    year: year ? Number(year[1]) : null,
    numbers: first === undefined ? [] : Array.from({ length: Math.max(last - first, 0) + 1 }, (_, index) => first + index),
  };
}

export function parseMagazinePage(html) {
  return [...html.matchAll(/<a class="group block" href="\/issue\/([^"]+)">(.*?)<\/a><\/li>/gs)].map(([, slug, card]) => {
    const alt = decodeHtml(/alt="Cover of ([^"]*)"/.exec(card)?.[1] ?? "");
    const issueNumber = /\bissue (\S+)$/.exec(alt)?.[1] ?? null;
    const lines = [...card.matchAll(/<p class="[^"]*">(.*?)<\/p>/gs)].map(([, line]) => stripTags(line));
    const [dateText = "", pagesText = ""] = (lines[1] ?? "").split("·").map((part) => part.trim());
    const pageUrl = `${REETROZ_URL}issue/${slug}`;
    return {
      title: `${alt.replace(/ issue \S+$/, "")}${issueNumber ? ` #${issueNumber}` : ""}${dateText ? ` (${dateText})` : ""}`,
      section: null,
      special: false,
      supplement: false,
      issueNumber,
      date: dateText || null,
      ...parseIssueDate(dateText),
      pages: Number.parseInt(pagesText, 10) || null,
      pageUrl,
      // The online reader is embedded in the issue page; reetroz offers no downloads.
      readerUrl: card.includes("Read online") ? pageUrl : null,
      downloadUrl: null,
      coverUrl: /<img src="([^"]+)"/.exec(card)?.[1] ?? null,
    };
  });
}

async function loadIndex({ cacheDir, maxAgeDays, refresh, now, fetcher, cachedOnly }) {
  const file = path.join(cacheDir, "index.json");
  const cached = await readJson(file);
  if (cachedOnly) {
    if (!cached) throw new Error(`reetroz-Cache fehlt: ${file}. Zuerst npm run dev:fetch:archives ausführen.`);
    return cached;
  }
  if (!refresh && isFresh(cached, maxAgeDays, now)) {
    return cached;
  }
  const index = {
    source: `${REETROZ_URL}catalog`,
    fetchedAt: new Date(now).toISOString(),
    magazines: parseCatalogPage(await fetcher.fetchPage(`${REETROZ_URL}catalog`)),
  };
  await writeJson(file, index);
  return index;
}

async function loadMagazine(entry, { cacheDir, maxAgeDays, refresh, now, fetcher, cachedOnly }) {
  const file = path.join(cacheDir, "magazines", `${entry.slug}.json`);
  const cached = await readJson(file);
  if (cachedOnly) {
    if (!cached) throw new Error(`reetroz-Cache fehlt: ${file}. Zuerst npm run dev:fetch:archives ausführen.`);
    return cached;
  }
  if (!refresh && isFresh(cached, maxAgeDays, now)) {
    return cached;
  }
  const magazine = {
    name: entry.name,
    url: entry.url,
    fetchedAt: new Date(now).toISOString(),
    sections: [{ name: null, url: entry.url }],
    issues: parseMagazinePage(await fetcher.fetchPage(entry.url)),
  };
  await writeJson(file, magazine);
  return magazine;
}

export async function loadReetrozCatalog({
  magazineNames,
  cacheDir = defaultCacheDir,
  maxAgeDays = DEFAULT_MAX_AGE_DAYS,
  indexMaxAgeDays = DEFAULT_INDEX_MAX_AGE_DAYS,
  refresh = false,
  cachedOnly = false,
  fetchImpl = fetch,
  sleep = defaultSleep,
  log = console.log,
  now = Date.now(),
}) {
  const fetcher = createFetcher({ fetchImpl, sleep, log, siteName: "reetroz.com" });
  const options = { cacheDir, maxAgeDays, refresh, now, fetcher, cachedOnly };
  const index = await loadIndex({ ...options, maxAgeDays: indexMaxAgeDays });
  const byName = new Map(index.magazines.flatMap((entry) => entry.aliases.map((alias) => [normalizeMagazineName(alias), entry])));
  const pcGamerUs = byName.get(normalizeMagazineName("PC Gamer (US)"));
  if (pcGamerUs) byName.set(normalizeMagazineName("PC Gamer"), pcGamerUs);

  const magazines = new Map();
  for (const name of new Set(magazineNames)) {
    const entry = byName.get(normalizeMagazineName(name));
    if (entry) {
      magazines.set(name, await loadMagazine(entry, options));
    }
  }
  if (fetcher.requestCount() > 0) {
    log(`reetroz.com: ${fetcher.requestCount()} Seiten geladen, Cache: ${cacheDir}`);
  }
  return { index, magazines };
}

function issueLink(issue, matchedBy) {
  return {
    match: "issue",
    matchedBy,
    title: issue.title,
    pageUrl: issue.pageUrl,
    readerUrl: issue.readerUrl,
    downloadUrl: issue.downloadUrl,
    coverUrl: issue.coverUrl,
  };
}

export function findReetrozIssue(catalog, magazineName, issue) {
  const magazine = catalog.magazines.get(magazineName);
  if (!magazine) {
    return null;
  }
  const folder = { match: "folder", title: magazine.name, pageUrl: magazine.url };
  if (!issue) {
    return folder;
  }

  const sameYear = (candidate) => issue.year === null || candidate.year === null || candidate.year === issue.year;
  if (issue.number !== null) {
    const found = magazine.issues.find((candidate) => candidate.issueNumber === String(issue.number) && sameYear(candidate));
    if (found) {
      return issueLink(found, "number");
    }
  }
  if (issue.year !== null && issue.months.length > 0) {
    const found = magazine.issues
      .filter((candidate) => candidate.year === issue.year && issue.months.every((month) => candidate.numbers.includes(month)))
      .sort((a, b) => a.numbers.length - b.numbers.length)[0];
    if (found) {
      return issueLink(found, "month");
    }
  }
  return folder;
}
