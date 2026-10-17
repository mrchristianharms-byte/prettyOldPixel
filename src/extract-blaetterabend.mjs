import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findKultmagsIssue, loadKultmagsCatalog } from "./kultmags.mjs";
import { findReetrozIssue, loadReetrozCatalog } from "./reetroz.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultSourceFile = path.join(projectRoot, "cache", "youtube-videos.json");
const defaultTargetFile = path.join(projectRoot, "cache", "blaetterabend-videos.json");

const BLAETTERABEND_PATTERN = /bl(?:ä|ae)tterabend/i;

// Longer names must come first so "Amiga Joker" wins over "Amiga".
const MAGAZINES = [
  ["Computer Games Strategy Plus", /computer\s*games\s*strategy\s*plus/],
  ["Computer Gaming World", /computer\s*gaming\s*world/],
  ["Happy Computer", /happy\s*computer/],
  ["Amiga Action", /amiga\s*action/],
  ["Amiga Fever", /amiga\s*fever/],
  ["Amiga Games", /amiga\s*games/],
  ["Amiga Joker", /amiga\s*joker/],
  ["Amiga Player", /amiga\s*player/],
  ["Amiga Play", /amiga\s*play/],
  ["PC Gamer UK", /pc\s*gamer\s*uk/],
  ["PC Gamer US", /pc\s*gamer\s*us/],
  ["PC Gamer", /pc\s*gamer/],
  ["PC Action", /pc\s*action/],
  ["PC Games", /pc\s*games/],
  ["PC Joker", /pc\s*jo(?:c)?ker/],
  ["PC Player", /pc\s*player/],
  ["PC Power", /pc\s*power/],
  ["PC Xtreme", /pc\s*e?xtreme/],
  ["Power Play", /power\s*play/],
  ["Play Time", /play\s*time/],
  ["Retro Gamer", /retro\s*gamer/],
  ["ST Action", /st\s*action/],
  ["GameStar", /game\s*star/],
  ["Joystick", /joystick/],
  ["64'er", /c?64'er/],
  ["Total!", /total!/],
  ["Smash", /smash/],
  ["ASM", /asm/],
  ["ACE", /ace/],
  // The plain "Amiga" magazine is only recognised with an issue, e.g. "Amiga 8/91".
  ["Amiga", /amiga(?=\s+\d)/],
];

const MAGAZINE_PATTERN = new RegExp(
  `(?<![\\w'])(?:${MAGAZINES.map(([, pattern]) => `(${pattern.source})`).join("|")})(?![\\w])`,
  "gi",
);

const MONTHS = {
  januar: 1, january: 1, jan: 1,
  februar: 2, february: 2, feb: 2,
  märz: 3, maerz: 3, march: 3,
  april: 4,
  mai: 5, may: 5,
  juni: 6, june: 6,
  juli: 7, july: 7,
  august: 8,
  september: 9,
  oktober: 10, october: 10,
  november: 11,
  dezember: 12, december: 12,
};
const MONTH_NAME = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

const ROMAN_NUMERALS = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };

function toYear(value) {
  const year = Number(value);
  if (value.length === 4) {
    return year;
  }
  return year <= 30 ? 2000 + year : 1900 + year;
}

function isMonth(value) {
  return value >= 1 && value <= 12;
}

function cleanTitle(title) {
  return title
    .normalize("NFC")
    .replace(/[\u2060-\u2064\u200B-\u200D\uFEFF]/g, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/@[\w.-]+/g, " ");
}

function extractPart(text) {
  const match = /\b(?:teil|stream)\s*#?\s*(\d+|iii|ii|iv|v|i)\b/i.exec(text);
  if (!match) {
    return { part: null, text };
  }
  const value = match[1].toLowerCase();
  return {
    part: ROMAN_NUMERALS[value] ?? Number(value),
    text: `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`,
  };
}

function findMagazines(text) {
  const matches = [];
  for (const match of text.matchAll(MAGAZINE_PATTERN)) {
    const index = match.slice(1).findIndex(Boolean);
    matches.push({ name: MAGAZINES[index][0], start: match.index, end: match.index + match[0].length });
  }
  return matches;
}

function formatIssueLabel({ special, number, months, year }) {
  const parts = [];
  if (special) {
    parts.push("Sonderheft");
  }
  if (number !== null) {
    parts.push(`#${number}`);
  }
  if (months.length > 0 && year !== null) {
    parts.push(`${months.join("+")}/${year}`);
  } else if (year !== null) {
    parts.push(String(year));
  }
  return parts.join(" ");
}

export function parseIssue(segment, textAfterMagazine = "") {
  let rest = segment;
  let months = [];
  let year = null;
  let number = null;

  const take = (pattern, handler) => {
    const match = pattern.exec(rest);
    if (match && handler(match) !== false) {
      rest = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}`;
      return true;
    }
    return false;
  };

  // "8/9 92", "6/7 1988", "8+9/95"
  take(/(?<![\d#])(\d{1,2})\s*[/+]\s*(\d{1,2})\s+((?:19|20)?\d{2})(?![\d/])/, (match) => {
    if (!isMonth(+match[1]) || !isMonth(+match[2])) return false;
    months = [+match[1], +match[2]];
    year = toYear(match[3]);
  })
    || take(/(?<![\d#])(\d{1,2})\s*\+\s*(\d{1,2})\s*\/\s*((?:19|20)?\d{2})(?!\d)/, (match) => {
      months = [+match[1], +match[2]];
      year = toYear(match[3]);
    })
    // "11/88", "12 / 1988", "01/1994"
    || take(/(?<![\d#.])(\d{1,2})\s*\/\s*((?:19|20)\d{2}|\d{2})(?![\d/])/, (match) => {
      if (!isMonth(+match[1])) return false;
      months = [+match[1]];
      year = toYear(match[2]);
    })
    // "Mai/Juni 1989", "Oktober 1991"
    || take(new RegExp(`\\b(${MONTH_NAME})(?:\\s*/\\s*(${MONTH_NAME}))?\\s+((?:19|20)\\d{2})\\b`, "i"), (match) => {
      months = [MONTHS[match[1].toLowerCase()], ...(match[2] ? [MONTHS[match[2].toLowerCase()]] : [])];
      year = Number(match[3]);
    });

  // "#60", "Nr. 2", "No. 49", "Ausgabe 2", "Sonderheft 11", "Sonderausgabe 4"
  if (!take(/(?:#|\b(?:nr|no)\.?\s*|\b(?:ausgabe|sonderheft|sonderausgabe)\s+#?\s*)(\d{1,4})(?![\d/+]|\s*[/+]\s*\d)/i, (match) => {
    number = Number(match[1]);
  })) {
    // Bare number right after the magazine name, e.g. "SMASH 3" or "SMASH - 3 -".
    const bare = /^\s*(?:-\s*)?(\d{1,3})(?![\w/+.])(?!\s*[/+]\s*\d)/.exec(textAfterMagazine);
    if (bare) {
      number = Number(bare[1]);
    }
  }

  if (year === null) {
    const fullYear = /\b((?:19[789]|20[0-3])\d)\b/.exec(rest);
    const shortYear = /(?:^|[\s"(])'(\d{2})\b/.exec(rest);
    year = fullYear ? Number(fullYear[1]) : shortYear ? toYear(shortYear[1]) : null;
  }

  // Regular issues often feature "Top 50" lists, so those words only mark a special issue without a month.
  const special = /sonderheft|sonderausgabe|special/i.test(segment)
    || (months.length === 0 && /beste[n]?\s|best\s+of|top\s+(?:games|spiele|\d)|die\s+\d+\s+beste/i.test(segment));
  if (number === null && months.length === 0 && year === null && !special) {
    return null;
  }

  const issue = { label: "", number, months, year, special };
  issue.label = formatIssueLabel(issue);
  return issue;
}

export function parseBlaetterabendTitle(title) {
  const { part, text } = extractPart(cleanTitle(title));
  const matches = findMagazines(text);
  const magazines = [];

  matches.forEach((match, index) => {
    // A single magazine owns the whole title so issue info before its name ("Die 100 Besten Spiele 1994 - Power Play") is found.
    const start = index === 0 ? 0 : match.end;
    const end = matches[index + 1]?.start ?? text.length;
    const segment = matches.length === 1 ? text : text.slice(start, end);
    let issue = parseIssue(segment, text.slice(match.end, end));
    if (!issue && match.name === "Computer Gaming World" && /\b15th\s+anniversary\b/i.test(segment)) {
      // Confirmed on the cover: https://assets.reetroz.com/covers/cgw-148.jpg
      issue = parseIssue("#148 11/1996");
    }

    const existing = magazines.find((magazine) => magazine.name === match.name);
    if (existing) {
      existing.issue ??= issue;
    } else {
      magazines.push({ name: match.name, issue });
    }
  });

  return { magazines, part };
}

export function extractBlaetterabendVideos(videos) {
  return videos
    .filter((video) => BLAETTERABEND_PATTERN.test(video.title))
    .map((video) => ({
      id: video.id,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      title: video.title,
      publishedAt: video.publishedAt,
      durationSeconds: video.durationSeconds,
      ...parseBlaetterabendTitle(video.title),
    }));
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`);
  await rename(temporaryFile, file);
}

export function addKultmagsLinks(videos, catalog) {
  for (const video of videos) {
    for (const magazine of video.magazines) {
      magazine.kultmags = findKultmagsIssue(catalog, magazine.name, magazine.issue, video.title);
    }
  }
  return videos;
}

// International magazines are missing on kultmags.com; reetroz.com is only used for those.
export function addReetrozLinks(videos, catalog) {
  for (const video of videos) {
    for (const magazine of video.magazines) {
      if (magazine.kultmags === null) {
        magazine.reetroz = findReetrozIssue(catalog, magazine.name, magazine.issue);
      }
    }
  }
  return videos;
}

function logLinkStats(log, site, links) {
  const count = (match) => links.filter((link) => link === match).length;
  log(`  ${site}: ${count("issue")} Ausgaben verlinkt, ${count("folder")} nur Übersichtsseite, ${count("none")} nicht im Archiv`);
}

export async function createBlaetterabendList({
  sourceFile = defaultSourceFile,
  targetFile = defaultTargetFile,
  log = console.log,
  kultmags = {},
  reetroz = {},
} = {}) {
  const source = JSON.parse(await readFile(sourceFile, "utf8"));
  const videos = extractBlaetterabendVideos(source.videos ?? []);
  if (kultmags) {
    const magazineNames = videos.flatMap((video) => video.magazines.map((magazine) => magazine.name));
    addKultmagsLinks(videos, await loadKultmagsCatalog({ log, ...kultmags, magazineNames }));
    if (reetroz) {
      const missingNames = videos.flatMap((video) => video.magazines.filter((magazine) => magazine.kultmags === null).map((magazine) => magazine.name));
      addReetrozLinks(videos, await loadReetrozCatalog({ log, ...reetroz, magazineNames: missingNames }));
    }
  }
  const withoutMagazine = videos.filter((video) => video.magazines.length === 0);
  const withoutIssue = videos.filter((video) => video.magazines.length > 0 && video.magazines.every((magazine) => !magazine.issue));

  const result = {
    source: path.relative(projectRoot, sourceFile),
    channel: source.channel,
    generatedAt: new Date().toISOString(),
    count: videos.length,
    videos,
  };
  await writeJson(targetFile, result);

  log(`${videos.length} Blätterabend-Videos gespeichert: ${targetFile}`);
  const magazines = videos.flatMap((video) => video.magazines);
  if (kultmags) {
    logLinkStats(log, "kultmags.com", magazines.map((magazine) => magazine.kultmags?.match ?? "none"));
    if (reetroz) {
      logLinkStats(log, "reetroz.com (ohne kultmags-Treffer)", magazines.filter((magazine) => "reetroz" in magazine).map((magazine) => magazine.reetroz?.match ?? "none"));
    }
  }
  for (const video of withoutMagazine) {
    log(`  Keine Zeitschrift erkannt: ${video.title}`);
  }
  for (const video of withoutIssue) {
    const hasArchiveOverview = video.magazines.some((magazine) =>
      magazine.kultmags?.match === "folder" || magazine.reetroz?.match === "folder");
    log(`  Keine Ausgabe im Videotitel erkannt${hasArchiveOverview ? " (Archiv-Übersichtsseite verlinkt)" : ""}: ${video.title}`);
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const refresh = process.argv.includes("--refresh-archives");
  createBlaetterabendList({ kultmags: { refresh }, reetroz: { refresh } }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
