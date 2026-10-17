import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createBlaetterabendList, parseBlaetterabendTitle } from "../src/extract-blaetterabend.mjs";
import {
  findReetrozIssue,
  loadReetrozCatalog,
  parseCatalogPage,
  parseIssueDate,
  parseMagazinePage,
} from "../src/reetroz.mjs";

const railLink = (name, slug) => `<a title="${name}" class="flex" href="/catalog?pub=${slug}"><span>${name}</span></a>`;
const card = (slug, name, number, date, pages = 100) => `<li><a class="group block" href="/issue/${slug}"><div class="cover-3d">`
  + `<img src="https://assets.reetroz.com/covers/${slug}.jpg" alt="Cover of ${name} issue ${number}"/>`
  + `<span class="badge">Read online</span></div><div class="mt-2.5"><p class="font-display"><span>CGW</span> #<!-- -->${number}</p>`
  + `<p class="mt-0.5 text-base text-paper-dim">${date}<!-- --> · <!-- -->${pages}<!-- --> pages</p></div></a></li>`;

const pages = new Map([
  ["/catalog", railLink("Computer Gaming World", "cgw") + railLink("PC Gamer (US)", "pc-gamer-us")
    + railLink("PC Games / Electronic Entertainment", "pc-games") + railLink("Computer Gaming World", "cgw")],
  ["/magazines/cgw", card("cgw-1-1", "Computer Gaming World", "1.1", "Nov-Dec 1981")
    + card("cgw-60", "Computer Gaming World", "60", "Jun 1989")
    + card("cgw-67", "Computer Gaming World", "67", "Jan 1990")
    + card("cgw-148", "Computer Gaming World", "148", "Nov 1996")],
  ["/magazines/pc-gamer-us", card("pc-gamer-us-4", "PC Gamer (US)", "4", "September 1994")],
]);

function createFetch() {
  const requests = [];
  const fetchImpl = async (url) => {
    const key = new URL(url).pathname;
    requests.push(key);
    const body = pages.get(key);
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body };
  };
  return { fetchImpl, requests };
}

async function withCacheDir(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), "reetroz-"));
  try {
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const quiet = { sleep: async () => {}, log: () => {} };
const issueOf = (title, name) => parseBlaetterabendTitle(`Blätterabend - ${title}`).magazines.find((magazine) => magazine.name === name).issue;

test("parseCatalogPage liest Zeitschriften mit Aliasnamen", () => {
  const magazines = parseCatalogPage(pages.get("/catalog"));
  assert.deepEqual(magazines.map((magazine) => magazine.slug), ["cgw", "pc-gamer-us", "pc-games"]);
  assert.deepEqual(magazines[2].aliases, ["PC Games", "Electronic Entertainment"]);
  assert.equal(magazines[0].url, "https://reetroz.com/magazines/cgw");
});

test("parseIssueDate erkennt Monate, Doppelmonate und Jahreszeiten", () => {
  assert.deepEqual(parseIssueDate("Nov 1992"), { year: 1992, numbers: [11] });
  assert.deepEqual(parseIssueDate("Nov-Dec 1981"), { year: 1981, numbers: [11, 12] });
  assert.deepEqual(parseIssueDate("April/May 1991"), { year: 1991, numbers: [4, 5] });
  assert.deepEqual(parseIssueDate("Holiday 2004"), { year: 2004, numbers: [] });
});

test("parseMagazinePage liest Nummer, Datum, Seiten und Links", () => {
  const [first] = parseMagazinePage(pages.get("/magazines/cgw"));
  assert.equal(first.title, "Computer Gaming World #1.1 (Nov-Dec 1981)");
  assert.equal(first.issueNumber, "1.1");
  assert.equal(first.pages, 100);
  assert.equal(first.pageUrl, "https://reetroz.com/issue/cgw-1-1");
  assert.equal(first.readerUrl, first.pageUrl);
  assert.equal(first.coverUrl, "https://assets.reetroz.com/covers/cgw-1-1.jpg");
});

test("verlinkt Ausgaben über Heftnummer oder Monat und fällt sonst auf die Zeitschrift zurück", async () => {
  await withCacheDir(async (cacheDir) => {
    const { fetchImpl } = createFetch();
    const catalog = await loadReetrozCatalog({ ...quiet, cacheDir, fetchImpl, magazineNames: ["Computer Gaming World", "PC Gamer US", "GameStar"] });
    const cgw = (title) => findReetrozIssue(catalog, "Computer Gaming World", issueOf(title, "Computer Gaming World"));

    assert.deepEqual([cgw("Computer Gaming World #148 - 150 Best Games").title, cgw("Computer Gaming World #148 - 150 Best Games").matchedBy],
      ["Computer Gaming World #148 (Nov 1996)", "number"]);
    assert.equal(cgw("Computer Gaming World 1/90").title, "Computer Gaming World #67 (Jan 1990)");
    assert.equal(cgw("Computer Gaming World - #60 - 6/89").matchedBy, "number");
    assert.equal(cgw("Computer Gaming World - 15th Anniversary").pageUrl, "https://reetroz.com/issue/cgw-148");
    assert.deepEqual(cgw("Computer Gaming World"), {
      match: "folder", title: "Computer Gaming World", pageUrl: "https://reetroz.com/magazines/cgw",
    });
    assert.equal(findReetrozIssue(catalog, "PC Gamer US", issueOf("PC GAMER US 9/94", "PC Gamer US")).title, "PC Gamer (US) #4 (September 1994)");
    assert.equal(findReetrozIssue(catalog, "GameStar", issueOf("GameStar 6/99", "GameStar")), null);
  });
});

test("nutzt den Cache und lädt nur mit refresh neu", async () => {
  await withCacheDir(async (cacheDir) => {
    const first = createFetch();
    await loadReetrozCatalog({ ...quiet, cacheDir, fetchImpl: first.fetchImpl, magazineNames: ["Computer Gaming World"] });
    assert.deepEqual(first.requests, ["/catalog", "/magazines/cgw"]);
    const cached = JSON.parse(await readFile(path.join(cacheDir, "magazines", "cgw.json"), "utf8"));
    assert.equal(cached.issues.length, 4);

    const second = createFetch();
    await loadReetrozCatalog({ ...quiet, cacheDir, fetchImpl: second.fetchImpl, magazineNames: ["Computer Gaming World"] });
    assert.deepEqual(second.requests, []);
    await loadReetrozCatalog({ ...quiet, cacheDir, fetchImpl: second.fetchImpl, magazineNames: ["Computer Gaming World"], refresh: true });
    assert.deepEqual(second.requests, ["/catalog", "/magazines/cgw"]);
  });
});

test("createBlaetterabendList nutzt reetroz nur für Zeitschriften ohne kultmags-Eintrag", async () => {
  await withCacheDir(async (directory) => {
    const sourceFile = path.join(directory, "videos.json");
    const targetFile = path.join(directory, "result.json");
    await writeFile(sourceFile, JSON.stringify({
      videos: [
        { id: "a", title: "Blätterabend - Computer Gaming World #60 - 6/89", publishedAt: "2022-01-01", durationSeconds: 1 },
        ...["04.05.2021", "20.04.2021", "13.04.2021"].map((date, index) => ({
          id: `anniversary-${index}`,
          title: `Blätterabend - Computer Gaming World - 15th Anniversary - [re.read] ${date} [German/Deutsch]`,
        })),
        { id: "unknown", title: "Aufzeichnung - Blätterabend - Computer Gaming World [re.read] 17.07.2022 [German/Deutsch]" },
      ],
    }));
    const kultmagsFetch = async () => ({ ok: true, status: 200, text: async () => "" });
    const reetroz = createFetch();

    const logs = [];
    await createBlaetterabendList({
      sourceFile,
      targetFile,
      log: (message) => logs.push(message),
      kultmags: { ...quiet, cacheDir: path.join(directory, "kultmags"), fetchImpl: kultmagsFetch },
      reetroz: { ...quiet, cacheDir: path.join(directory, "reetroz"), fetchImpl: reetroz.fetchImpl },
    });

    const result = JSON.parse(await readFile(targetFile, "utf8"));
    const [magazine] = result.videos[0].magazines;
    assert.equal(magazine.kultmags, null);
    assert.equal(magazine.reetroz.title, "Computer Gaming World #60 (Jun 1989)");
    assert.equal(magazine.reetroz.readerUrl, "https://reetroz.com/issue/cgw-60");
    for (const video of result.videos.slice(1, 4)) {
      assert.equal(video.magazines[0].issue.label, "#148 11/1996");
      assert.equal(video.magazines[0].reetroz.title, "Computer Gaming World #148 (Nov 1996)");
      assert.equal(video.magazines[0].reetroz.pageUrl, "https://reetroz.com/issue/cgw-148");
    }
    assert.equal(result.videos[4].magazines[0].issue, null);
    assert.equal(result.videos[4].magazines[0].reetroz.match, "folder");
    const warnings = logs.filter((message) => message.includes("Keine Ausgabe"));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Archiv-Übersichtsseite verlinkt.*17\.07\.2022/);
  });
});
