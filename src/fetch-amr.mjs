import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MAX_AGE_DAYS, createFetcher, decodeHtml, defaultSleep, isFresh,
  normalizeMagazineName, readJson, writeJson,
} from "./archive-cache.mjs";
import { cacheMagazineLogo } from "./kultmags-logos.mjs";

export const AMIGA_ACTION_URL = "https://amr.abime.net/issues_1";
export const AMIGA_ACTION_LOGO = "https://amr.abime.net/logos/amiga_action_logos.png";
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Xmas"];
const plain = (html) => decodeHtml(html.replace(/<[^>]*>/gu, "")).trim();

export function parseAmigaActionArchive(html) {
  const issues = [];
  const seen = new Set();
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/giu)];
  const table = tables.find(([, body]) => {
    const first = /<tr\b[^>]*>([\s\S]*?)<\/tr>/iu.exec(body)?.[1] ?? "";
    const cells = [...first.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map(([, cell]) => plain(cell));
    return cells.length === 14 && months.every((month, index) => cells[index + 1] === month);
  });
  if (!table) throw new Error("AMR: Amiga-Action-Jahrgangstabelle nicht erkannt.");
  for (const [, row] of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map(([, cell]) => cell);
    if (!/^(?:19|20)\d{2}$/u.test(plain(cells[0] ?? ""))) continue;
    if (cells.length !== 14) throw new Error("AMR: Unerwartete Anzahl Monatsspalten.");
    const year = Number(plain(cells[0]));
    for (let column = 1; column <= 13; column += 1) {
      const cell = cells[column];
      const link = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/iu.exec(cell);
      if (!link) continue;
      const url = new URL(decodeHtml(link[1]), AMIGA_ACTION_URL);
      const issueNumber = plain(link[2]);
      if (url.origin !== "https://amr.abime.net" || !/^\/issue_\d+$/u.test(url.pathname)
        || url.search || url.hash || !/^[1-9]\d*$/u.test(issueNumber) || seen.has(url.href)) {
        throw new Error("AMR: Ungültiger oder doppelter Amiga-Action-Heftlink.");
      }
      seen.add(url.href);
      issues.push({
        title: `Amiga Action #${issueNumber} ${column === 13 ? "Xmas" : String(column).padStart(2, "0")}/${year}`,
        section: String(year), year, numbers: column === 13 ? [] : [column], issueNumber: Number(issueNumber),
        special: column === 13, supplement: false, words: [],
        pageUrl: url.href, readerUrl: null, downloadUrl: null, coverUrl: null,
      });
    }
  }
  if (!issues.length) throw new Error("AMR: Keine Amiga-Action-Ausgaben erkannt.");
  return issues;
}

function validateMagazine(magazine) {
  if (magazine?.name !== "Amiga Action" || magazine.url !== AMIGA_ACTION_URL
    || !Number.isFinite(Date.parse(magazine.fetchedAt)) || !Array.isArray(magazine.sections)
    || !Array.isArray(magazine.issues) || !magazine.issues.length || magazine.logo?.url !== AMIGA_ACTION_LOGO) {
    throw new Error("AMR: Ungültiger Amiga-Action-Cache.");
  }
  const seen = new Set();
  for (const issue of magazine.issues) {
    if (!issue || !Number.isInteger(issue.year) || issue.year < 1989 || issue.year > 2099
      || !Number.isInteger(issue.issueNumber) || issue.issueNumber < 1
      || !Array.isArray(issue.numbers) || typeof issue.special !== "boolean"
      || (issue.special ? issue.numbers.length !== 0 : issue.numbers.length !== 1
        || !Number.isInteger(issue.numbers[0]) || issue.numbers[0] < 1 || issue.numbers[0] > 12)
      || typeof issue.title !== "string" || !issue.title.trim()
      || !/^https:\/\/amr\.abime\.net\/issue_\d+$/u.test(issue.pageUrl)
      || seen.has(issue.pageUrl) || issue.readerUrl !== null || issue.downloadUrl !== null) {
      throw new Error("AMR: Ungültige oder doppelte Amiga-Action-Ausgabe.");
    }
    seen.add(issue.pageUrl);
  }
  return magazine;
}

export async function loadAmrCatalog({
  cacheDir = path.join(projectRoot, "cache", "amr"), maxAgeDays = DEFAULT_MAX_AGE_DAYS,
  refresh = false, cachedOnly = false, optional = false,
  fetchImpl = fetch, sleep = defaultSleep, log = console.log, now = Date.now(),
} = {}) {
  const file = path.join(cacheDir, "magazines", "amiga-action.json");
  const cached = await readJson(file);
  if (cached) validateMagazine(cached);
  if (cachedOnly) {
    if (!cached && !optional) throw new Error(`AMR-Cache fehlt: ${file}. Zuerst npm run dev:fetch:amiga-action ausführen.`);
    return cached;
  }
  if (!refresh && isFresh(cached, maxAgeDays, now)) return cached;
  const fetcher = createFetcher({ fetchImpl, sleep, log, siteName: "amr.abime.net" });
  const issues = parseAmigaActionArchive(await fetcher.fetchPage(AMIGA_ACTION_URL));
  const logo = await cacheMagazineLogo(AMIGA_ACTION_LOGO, cacheDir, fetcher);
  const magazine = validateMagazine({
    name: "Amiga Action", url: AMIGA_ACTION_URL, fetchedAt: new Date(now).toISOString(), logo,
    sections: [...new Set(issues.map((issue) => issue.year))].map((year) => ({ name: String(year), url: AMIGA_ACTION_URL })),
    issues,
  });
  await writeJson(file, magazine);
  await writeJson(path.join(cacheDir, "index.json"), {
    source: AMIGA_ACTION_URL, fetchedAt: magazine.fetchedAt, magazines: [{ name: magazine.name, url: magazine.url }],
  });
  log(`AMR: ${issues.length} Amiga-Action-Ausgaben und Logo gespeichert: ${file}`);
  return magazine;
}

export function findAmrIssue(magazine, name, issue) {
  if (!magazine || normalizeMagazineName(name) !== "amigaaction") return null;
  let matches = [];
  if (issue) {
    matches = magazine.issues.filter((candidate) =>
      (issue.year === null || candidate.year === issue.year)
      && (Number.isInteger(issue.number) ? candidate.issueNumber === issue.number
        : issue.months.length === 1 && candidate.numbers.includes(issue.months[0]))
      && (!issue.special || candidate.special)
      && (issue.months.length === 0 || issue.months.every((month) => candidate.numbers.includes(month))));
    if (issue.number === null && issue.year === null) matches = [];
  }
  if (matches.length !== 1) return { match: "folder", title: magazine.name, pageUrl: magazine.url };
  const found = matches[0];
  return {
    match: "issue", matchedBy: issue.number !== null ? "number" : "month",
    title: found.title, pageUrl: found.pageUrl, readerUrl: null, downloadUrl: null, coverUrl: null,
  };
}

export function addAmrLinks(videos, magazine) {
  if (!magazine) return;
  for (const video of videos) {
    for (const mention of video.magazines) {
      if (normalizeMagazineName(mention.name) === "amigaaction") {
        mention.amr = findAmrIssue(magazine, mention.name, mention.issue);
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--refresh")) {
    console.error("Aufruf: node src/fetch-amr.mjs [--refresh]");
    process.exitCode = 1;
  } else {
    loadAmrCatalog({ refresh: args.includes("--refresh") }).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
