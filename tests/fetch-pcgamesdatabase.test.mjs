import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  GAMESTAR_ARCHIVE_URL, GAMESTAR_LOGO_URL, addPcgamesdatabaseLinks, findPcgamesdatabaseIssue,
  loadPcgamesdatabaseCatalog, parseGameStarArchive,
} from "../src/fetch-pcgamesdatabase.mjs";
import { loadSiteData } from "../src/site-data.mjs";
import { generateSite } from "../src/generate-site.mjs";
import { generateBlaetterabendList } from "../src/generate-blaetterabend.mjs";

const html = `<a href="gamestar.php?mag=gamestar&amp;vol=10/1997#gamestar">Erste Ausgabe</a>
<a class="newslink" href="gamestar.php?mag=gamestar&vol=10/1997#gamestar">10/1997</a>
<font>9/1997</font>
<a href='gamestar.php?mag=gamestar&vol=11/1997#gamestar'>11/1997</a>
<a href="gamestar.php?mag=gamestar&vol=01/2000#gamestar">01/2000</a>
<a href="gamestar.php?mag=gamestar&vol=13/2000">Ungültig</a>
<a href="gamestar.php?mag=pcgames&vol=12/1997">Anderes Magazin</a>
<a href="https://example.org/gamestar.php?mag=gamestar&vol=12/1997">Andere Quelle</a>`;
const issue = (overrides = {}) => ({ year: 1997, months: [10], number: 1, special: false, label: "#1 10/1997", ...overrides });
const silent = { log() {}, sleep: async () => {} };
const logoBytes = Buffer.from([255, 216, 255, 224, 0, 0]);

async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), "pixel-pcgamesdatabase-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cacheDirectory = path.join(root, "cache");
  const cacheDir = path.join(cacheDirectory, "pcgamesdatabase");
  const magazine = await loadPcgamesdatabaseCatalog({
    cacheDir, ...silent, fetchImpl: async (url) => {
      assert.ok([GAMESTAR_ARCHIVE_URL, GAMESTAR_LOGO_URL].includes(url));
      return new Response(url === GAMESTAR_LOGO_URL ? logoBytes : html);
    },
  });
  return { root, cacheDirectory, cacheDir, magazine };
}

test("liest nur belegte GameStar-Heftlinks, dedupliziert und erfindet keine Downloads", () => {
  const issues = parseGameStarArchive(html);
  assert.deepEqual(issues.map((entry) => [entry.year, entry.numbers]), [[1997, [10]], [1997, [11]], [2000, [1]]]);
  assert.equal(issues[0].pageUrl, `${GAMESTAR_ARCHIVE_URL}?mag=gamestar&vol=10/1997#gamestar`);
  assert.ok(issues.every((entry) => entry.readerUrl === null && entry.downloadUrl === null && !entry.special));
  assert.throws(() => parseGameStarArchive("<html>Fehlerseite</html>"), /Keine GameStar-Heftlinks/u);
});

test("ordnet nur GameStar anhand von Jahr und Monat eindeutig zu, sonst nur die Übersicht", async (t) => {
  const { magazine } = await setup(t);
  const link = findPcgamesdatabaseIssue(magazine, "Game Star", issue());
  assert.equal(link.match, "issue");
  assert.equal(link.matchedBy, "month");
  assert.equal(link.title, "GameStar 1997-10");
  assert.equal(link.readerUrl, null);
  for (const data of [null, issue({ months: [] }), issue({ year: null }),
    issue({ months: [10, 11] }), issue({ special: true }), issue({ months: [9] })]) {
    assert.equal(findPcgamesdatabaseIssue(magazine, "GameStar", data).match, "folder");
  }
  assert.equal(findPcgamesdatabaseIssue(magazine, "PC Games", issue()), null);
  const videos = [{ magazines: [{ name: "GameStar", issue: issue() }, { name: "PC Games", issue: issue() }] }];
  addPcgamesdatabaseLinks(videos, magazine);
  assert.equal(videos[0].magazines[0].pcgamesdatabase.match, "issue");
  assert.ok(!("pcgamesdatabase" in videos[0].magazines[1]));
});

test("speichert dasselbe Magazin-/Ausgabenformat, nutzt Cache offline und aktualisiert nur ausdrücklich oder nach Ablauf", async (t) => {
  const { cacheDir, magazine } = await setup(t);
  const file = path.join(cacheDir, "magazines", "gamestar.json");
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), magazine);
  assert.equal(JSON.parse(await readFile(path.join(cacheDir, "index.json"), "utf8")).magazines[0].name, "GameStar");
  for (const options of [{}, { cachedOnly: true, refresh: true, now: Date.parse("2099-01-01") }]) {
    assert.deepEqual(await loadPcgamesdatabaseCatalog({
      cacheDir, ...options, fetchImpl: () => assert.fail("Kein Netzwerkzugriff"),
    }), magazine);
  }
  let requests = 0;
  await loadPcgamesdatabaseCatalog({
    cacheDir, ...silent, refresh: true, fetchImpl: async (url) => {
      requests += 1;
      return new Response(url === GAMESTAR_LOGO_URL ? logoBytes : html);
    },
  });
  assert.equal(requests, 2);
  await assert.rejects(loadPcgamesdatabaseCatalog({
    cacheDir, ...silent, refresh: true, fetchImpl: async () => new Response("Fehlerseite"),
  }), /Keine GameStar-Heftlinks/u);
  await writeFile(file, JSON.stringify({ ...magazine, issues: [
    { ...magazine.issues[0], pageUrl: `${GAMESTAR_ARCHIVE_URL}?mag=gamestar&vol=11/1997` },
  ] }));
  await assert.rejects(loadPcgamesdatabaseCatalog({ cacheDir, cachedOnly: true }), /Ungültige.*Ausgabe/u);
  await rm(file);
  assert.equal(await loadPcgamesdatabaseCatalog({ cacheDir, cachedOnly: true, optional: true }), null);
  await assert.rejects(loadPcgamesdatabaseCatalog({ cacheDir, cachedOnly: true }), /fetch:gamestar/u);
});

test("ergänzt in frischen alten GameStar-Caches nur das feste Logo, ohne Heftdaten neu zu laden", async (t) => {
  const { cacheDir, magazine } = await setup(t);
  const file = path.join(cacheDir, "magazines", "gamestar.json");
  const { logo, ...old } = magazine;
  await writeFile(file, JSON.stringify(old));
  const requests = [];
  const updated = await loadPcgamesdatabaseCatalog({
    cacheDir, ...silent, fetchImpl: async (url) => {
      requests.push(url);
      return new Response(logoBytes);
    },
  });
  assert.deepEqual(requests, [GAMESTAR_LOGO_URL]);
  assert.equal(updated.fetchedAt, old.fetchedAt);
  assert.deepEqual(updated.issues, old.issues);
  assert.deepEqual(updated.logo, logo);
  assert.deepEqual(await readFile(path.join(cacheDir, "logos", logo.file)), logoBytes);
});

test("integriert neue Heftlinks auch ohne erneute Blätterabend-Generierung in den Offline-Build", async (t) => {
  const { root, cacheDirectory, cacheDir } = await setup(t);
  const channel = { id: "UC-gamestar", title: "Pretty Old Pixel" };
  const id = "g0000000000";
  for (const [name, data] of [
    ["youtube-videos", { channel, complete: true, videos: [{ id, title: "Blätterabend - GameStar #1 10/97", durationSeconds: 60 }] }],
    ["youtube-playlists", { channel, complete: true, playlists: [] }],
    ["blaetterabend-videos", { channel, videos: [{ id, magazines: [{
      name: "GameStar", issue: issue(), kultmags: {
        match: "folder", title: "GameStar", pageUrl: "https://www.kultmags.com/mags.php?folder=GameStar",
      },
    }] }] }],
  ]) await writeFile(path.join(cacheDirectory, `${name}.json`), JSON.stringify(data));
  const model = await loadSiteData(cacheDirectory);
  const mention = model.videoById.get(id).magazines[0];
  assert.ok(mention.archives.some((archive) => archive.provider === "pcgamesdatabase"));
  assert.ok(mention.archives.some((archive) => archive.provider === "kultmags"));
  const route = mention.issue.route;
  const outputDirectory = path.join(root, "docs");
  await generateSite({ cacheDirectory, outputDirectory, logger: { log() {}, warn() {} } });
  const detail = await readFile(path.join(outputDirectory, route, "index.html"), "utf8");
  assert.ok(detail.includes('href="https://www.pcgamesdatabase.de/gamestar.php?mag=gamestar&amp;vol=10/1997#gamestar"'));
  assert.ok(detail.includes("<span>PC Games Database: Ausgabe</span>"));
  assert.ok(detail.includes("<span>kultmags: Zeitschriftenübersicht</span>"));
  assert.ok(!detail.includes("Heft herunterladen"));
  const overview = await readFile(path.join(outputDirectory, "zeitschriften/gamestar/index.html"), "utf8");
  assert.ok(overview.includes("PC Games Database: Ausgabe"));
  const logo = model.magazines[0].logo;
  assert.ok(overview.includes("Logoquelle: PC Games Database"));
  assert.ok(overview.includes(`src="../../${logo.asset}"`));
  assert.ok(!overview.includes('<img src="https://www.pcgamesdatabase.de'));
  assert.deepEqual(await readFile(path.join(outputDirectory, logo.asset)), logoBytes);
  const generatedFile = path.join(root, "generated-blaetterabend.json");
  const generated = await generateBlaetterabendList({
    sourceFile: path.join(cacheDirectory, "youtube-videos.json"), targetFile: generatedFile,
    kultmags: false, pcgamesdatabase: { cacheDir }, log() {},
  });
  assert.equal(generated.videos[0].magazines[0].pcgamesdatabase.match, "issue");
});
