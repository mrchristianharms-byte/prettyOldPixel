import path from "node:path";
import { fileURLToPath } from "node:url";
import { cacheKultmagsLogo, kultmagsLogoUrl } from "./kultmags-logos.mjs";
import {
  DEFAULT_MAX_AGE_DAYS,
  DEFAULT_INDEX_MAX_AGE_DAYS,
  cacheFileName,
  createFetcher,
  decodeHtml,
  defaultSleep,
  isFresh,
  normalizeMagazineName,
  readJson,
  writeJson,
} from "./archive-cache.mjs";

export { normalizeMagazineName };

export const KULTMAGS_URL = "https://www.kultmags.com/";
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultCacheDir = path.join(projectRoot, "cache", "kultmags");

const STOPWORDS = new Set([
  "sonderheft", "sonderausgabe", "special", "spezial", "extra", "beste", "besten", "spiele", "games",
  "aufzeichnung", "blätterabend", "blätterabendaufzeichnung", "streamaufzeichnung", "stream", "extended",
  "deutsch", "german", "re.read", "streamstag", "teil", "ausgabe", "magazin",
]);

export function folderUrl(folder) {
  return `${KULTMAGS_URL}mags.php?folder=${encodeURIComponent(Buffer.from(folder, "utf8").toString("base64"))}`;
}

function decodeFolder(value) {
  return Buffer.from(decodeURIComponent(value), "base64").toString("utf8");
}

function absoluteUrl(href) {
  return href ? new URL(decodeHtml(href), KULTMAGS_URL).href : null;
}

export function parseFolderPage(html) {
  const imageContainer = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\barchive-title-image\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/iu.exec(html)?.[1];
  const imageSource = imageContainer && /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/iu.exec(imageContainer)?.[1];
  const logoUrl = imageSource ? kultmagsLogoUrl(decodeHtml(imageSource)).href : null;
  const folders = [...new Set(
    [...html.matchAll(/class="folder-name"><a href="mags\.php\?folder=([^"&]+)"/g)].map((match) => decodeFolder(match[1])),
  )];
  const cards = [...html.matchAll(/<article class="magazine-card">(.*?)<\/article>/gs)].map(([, card]) => ({
    title: decodeHtml(/<u>(.*?)<\/u>/s.exec(card)?.[1]?.trim() ?? ""),
    downloadUrl: absoluteUrl(/<a href="([^"]+)"><img src="img\/pdf\.png"/.exec(card)?.[1]),
    readerUrl: absoluteUrl(/<a href="(https:\/\/reader\.kultmags\.com\/[^"]+)"/.exec(card)?.[1]),
    coverUrl: absoluteUrl(/<img class="mag-cover" src="([^"]+)"/.exec(card)?.[1]),
  }));
  return { folders, cards, logoUrl };
}

function significantWords(text) {
  return text
    .toLowerCase()
    .split(/[^a-zäöüß.]+/)
    .filter((word) => word.length >= 5 && !STOPWORDS.has(word));
}

export function parseIssueTitle(title, section) {
  const isYearSection = section === null || /^\d{4}$/.test(section);
  const date = /(?<!\d)(\d{4})-(\d{2})(?:\.\.(\d{2}))?(?!\d)/.exec(title);
  const yearOnly = date ? null : /(?<!\d)((?:19|20)\d{2})(?!\d)/.exec(title);
  const sequence = date || yearOnly ? null : /(?:sonderheft|special|extra|multimedia)\s*-?\s*(\d{1,3})\b/i.exec(title);
  const supplement = /\b(beilage|booklet|sst|spezial|special)\b/i.test(title.slice(date ? date.index + date[0].length : 0));

  const year = date ? Number(date[1]) : yearOnly ? Number(yearOnly[1]) : null;
  const first = date ? Number(date[2]) : null;
  const last = date?.[3] ? Number(date[3]) : first;
  return {
    title,
    section,
    special: !isYearSection,
    supplement: isYearSection && supplement,
    year,
    // Regular issues are "YYYY-MM[..MM]"; special issues use the same pattern as "YYYY-<sequence number>".
    numbers: first === null ? (sequence ? [Number(sequence[1])] : []) : Array.from({ length: last - first + 1 }, (_, index) => first + index),
    words: significantWords(title.replace(/\d{4}-\d{2}(?:\.\.\d{2})?/, " ")),
  };
}

async function loadIndex({ cacheDir, maxAgeDays, refresh, now, fetcher, cachedOnly }) {
  const file = path.join(cacheDir, "index.json");
  const cached = await readJson(file);
  if (cachedOnly) {
    if (!cached) throw new Error(`kultmags-Cache fehlt: ${file}. Zuerst npm run fetch:archives ausführen.`);
    return cached;
  }
  if (!refresh && isFresh(cached, maxAgeDays, now)) {
    return cached;
  }
  const { folders } = parseFolderPage(await fetcher.fetchPage(`${KULTMAGS_URL}mags.php`));
  const index = {
    source: `${KULTMAGS_URL}mags.php`,
    fetchedAt: new Date(now).toISOString(),
    magazines: folders.map((folder) => ({ name: folder, url: folderUrl(folder) })),
  };
  await writeJson(file, index);
  return index;
}

async function loadMagazine(name, { cacheDir, maxAgeDays, refresh, now, fetcher, cachedOnly }) {
  const file = path.join(cacheDir, "magazines", cacheFileName(name));
  const cached = await readJson(file);
  if (cachedOnly) {
    if (!cached) throw new Error(`kultmags-Cache fehlt: ${file}. Zuerst npm run fetch:archives ausführen.`);
    return cached;
  }
  if (!refresh && isFresh(cached, maxAgeDays, now) && cached.logo !== undefined) {
    return cached;
  }

  const top = parseFolderPage(await fetcher.fetchPage(folderUrl(name)));
  const logo = await cacheKultmagsLogo(top.logoUrl, cacheDir, fetcher);
  if (!refresh && isFresh(cached, maxAgeDays, now)) {
    const updated = { ...cached, logo };
    await writeJson(file, updated);
    return updated;
  }
  const sections = [{ name: null, folder: name, cards: top.cards }];
  for (const folder of top.folders) {
    const { cards } = parseFolderPage(await fetcher.fetchPage(folderUrl(folder)));
    sections.push({ name: folder.slice(name.length + 1) || folder, folder, cards });
  }

  const magazine = {
    name,
    logo,
    url: folderUrl(name),
    fetchedAt: new Date(now).toISOString(),
    sections: sections
      .filter((section) => section.name !== null || section.cards.length > 0)
      .map((section) => ({ name: section.name, url: folderUrl(section.folder) })),
    issues: sections.flatMap((section) => section.cards.map((card) => ({
      ...parseIssueTitle(card.title, section.name),
      pageUrl: folderUrl(section.folder),
      downloadUrl: card.downloadUrl,
      readerUrl: card.readerUrl,
      coverUrl: card.coverUrl,
    }))),
  };
  await writeJson(file, magazine);
  return magazine;
}

export async function loadKultmagsCatalog({
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
  const fetcher = createFetcher({ fetchImpl, sleep, log, siteName: "kultmags.com" });
  const options = { cacheDir, maxAgeDays, refresh, now, fetcher, cachedOnly };
  const index = await loadIndex({ ...options, maxAgeDays: indexMaxAgeDays });
  const byName = new Map(index.magazines.map((magazine) => [normalizeMagazineName(magazine.name), magazine]));

  const magazines = new Map();
  for (const name of new Set(magazineNames)) {
    const entry = byName.get(normalizeMagazineName(name));
    if (entry) {
      magazines.set(name, await loadMagazine(entry.name, options));
    }
  }
  if (fetcher.requestCount() > 0) {
    log(`kultmags.com: ${fetcher.requestCount()} Seiten geladen, Cache: ${cacheDir}`);
  }
  return { index, magazines };
}

function byPreference(a, b) {
  return Number(a.supplement) - Number(b.supplement) || a.numbers.length - b.numbers.length || a.title.length - b.title.length;
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

function folderLink(magazine, section) {
  const target = magazine.sections.find((candidate) => candidate.name === section);
  return { match: "folder", title: target?.name ? `${magazine.name}/${target.name}` : magazine.name, pageUrl: target?.url ?? magazine.url };
}

function matchRegular(magazine, issue) {
  const candidates = magazine.issues.filter((candidate) => !candidate.special && candidate.year === issue.year).sort(byPreference);
  if (issue.months.length > 0) {
    const found = candidates.find((candidate) => issue.months.every((month) => candidate.numbers.includes(month)));
    if (found) {
      return issueLink(found, "month");
    }
  }
  // Some magazines (e.g. Smash) are archived by issue number instead of month.
  if (issue.number !== null) {
    const found = candidates.find((candidate) => candidate.numbers.length === 1 && candidate.numbers[0] === issue.number);
    if (found) {
      return issueLink(found, "number");
    }
  }
  return null;
}

function matchSpecial(magazine, magazineName, issue, title) {
  const candidates = magazine.issues.filter((candidate) => candidate.special || magazine.sections.length === 1).sort(byPreference);
  const sameYear = (candidate) => issue.year === null || candidate.year === null || candidate.year === issue.year;
  const nameWords = new Set(significantWords(`${magazine.name} ${magazineName} joker player`));
  const titleWords = significantWords(title).filter((word) => !nameWords.has(word));

  const byKeyword = candidates.filter((candidate) => sameYear(candidate)
    && candidate.words.some((word) => !nameWords.has(word)
      && titleWords.some((titleWord) => titleWord.startsWith(word) || word.startsWith(titleWord))));
  if (byKeyword.length === 1) {
    return issueLink(byKeyword[0], "keyword");
  }

  const number = issue.number ?? (issue.months.length === 1 ? issue.months[0] : null);
  if (number !== null) {
    const byNumber = candidates.filter((candidate) => candidate.numbers.length === 1 && candidate.numbers[0] === number
      && (issue.year === null ? candidate.year === null : candidate.year === issue.year));
    if (byNumber.length === 1) {
      return issueLink(byNumber[0], "number");
    }
  }
  return null;
}

export function findKultmagsIssue(catalog, magazineName, issue, title = "") {
  const magazine = catalog.magazines.get(magazineName);
  if (!magazine) {
    return null;
  }
  if (!issue) {
    return folderLink(magazine, null);
  }

  const match = issue.special ? matchSpecial(magazine, magazineName, issue, title) : matchRegular(magazine, issue);
  if (match) {
    return match;
  }
  if (issue.special) {
    const specialSection = magazine.sections.find((section) => section.name && !/^\d{4}$/.test(section.name));
    return folderLink(magazine, specialSection?.name ?? null);
  }
  return folderLink(magazine, issue.year !== null && magazine.sections.some((section) => section.name === String(issue.year)) ? String(issue.year) : null);
}
