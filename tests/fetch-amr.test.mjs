import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AMIGA_ACTION_LOGO, AMIGA_ACTION_URL, addAmrLinks, findAmrIssue, loadAmrCatalog, parseAmigaActionArchive } from "../src/fetch-amr.mjs";
import { loadSiteData } from "../src/site-data.mjs";
import { generateSite } from "../src/generate-site.mjs";
import { generateBlaetterabendList } from "../src/generate-blaetterabend.mjs";

const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Xmas"];
const row = (values) => `<tr>${values.map((value) => `<td>${value}</td>`).join("")}</tr>`;
const link = (id, number) => `<a href="/issue_${id}">${number}</a>`;
const html = `<table>${row(monthNames)}${row([
  "1991", ...Array.from({ length: 13 }, (_, index) => index === 9 ? link(98, 25) : ""),
])}${row([
  "1993", ...Array.from({ length: 13 }, (_, index) => index === 12 ? link(125, 52) : ""),
])}</table>`;
const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=", "base64");
const issue = (overrides = {}) => ({ year: 1991, months: [10], number: 25, special: false, label: "#25 10/1991", ...overrides });
const silent = { log() {}, sleep: async () => {} };

async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), "pixel-amr-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cacheDirectory = path.join(root, "cache");
  const cacheDir = path.join(cacheDirectory, "amr");
  const requests = [];
  const magazine = await loadAmrCatalog({
    cacheDir, ...silent, fetchImpl: async (url) => {
      requests.push(url);
      assert.ok([AMIGA_ACTION_URL, AMIGA_ACTION_LOGO].includes(url));
      return new Response(url === AMIGA_ACTION_LOGO ? bytes : html);
    },
  });
  return { root, cacheDirectory, cacheDir, magazine, requests };
}

test("liest Heftnummern aus Monatsspalten statt Monatsnummern aus Linktexten; Xmas bleibt separat", () => {
  const issues = parseAmigaActionArchive(html);
  assert.equal(issues[0].issueNumber, 25);
  assert.deepEqual(issues[0].numbers, [10]);
  assert.equal(issues[0].pageUrl, "https://amr.abime.net/issue_98");
  assert.equal(issues[1].special, true);
  assert.deepEqual(issues[1].numbers, []);
  assert.equal(issues[1].issueNumber, 52);
  for (const source of [
    "<html>Fehler</html>", html.replace("Oct", "October"),
    html.replace('/issue_98', 'https://example.org/issue_98'),
    html.replace(link(125, 52), link(98, 25)),
  ]) assert.throws(() => parseAmigaActionArchive(source), /AMR/u);
});

test("ordnet nur Amiga Action eindeutig anhand Heftnummer oder Jahr und Monat zu, Konflikte bleiben Übersicht", async (t) => {
  const { magazine } = await setup(t);
  for (const data of [issue(), issue({ number: null }), issue({ year: null, months: [] })]) {
    assert.equal(findAmrIssue(magazine, "AmigaAction", data).pageUrl, "https://amr.abime.net/issue_98");
  }
  for (const data of [
    null, issue({ number: 24 }), issue({ year: 1992 }), issue({ months: [11] }),
    issue({ year: null, number: null }), issue({ special: true }),
    issue({ months: [10, 11] }),
  ]) assert.equal(findAmrIssue(magazine, "Amiga Action", data).match, "folder");
  assert.equal(findAmrIssue(magazine, "Amiga Joker", issue()), null);
  assert.equal(findAmrIssue(magazine, "Amiga Action", issue({
    year: 1993, number: 52, months: [], special: true,
  })).pageUrl, "https://amr.abime.net/issue_125");
  const videos = [{ magazines: [{ name: "Amiga Action", issue: issue() }, { name: "ASM", issue: issue() }] }];
  addAmrLinks(videos, magazine);
  assert.equal(videos[0].magazines[0].amr.match, "issue");
  assert.ok(!("amr" in videos[0].magazines[1]));
});

test("lädt nur Übersicht und Logo, verwendet frischen und Offline-Cache und überschreibt ihn nicht bei Parserfehlern", async (t) => {
  const { cacheDir, magazine, requests } = await setup(t);
  assert.deepEqual(requests, [AMIGA_ACTION_URL, AMIGA_ACTION_LOGO]);
  const file = path.join(cacheDir, "magazines", "amiga-action.json");
  assert.deepEqual(await readFile(path.join(cacheDir, "logos", magazine.logo.file)), bytes);
  assert.equal(JSON.parse(await readFile(path.join(cacheDir, "index.json"), "utf8")).magazines[0].name, "Amiga Action");
  for (const options of [{}, { cachedOnly: true, refresh: true, now: Date.parse("2099-01-01") }]) {
    assert.deepEqual(await loadAmrCatalog({
      cacheDir, ...options, fetchImpl: () => assert.fail("Kein erneuter Abruf"),
    }), magazine);
  }
  const before = await readFile(file, "utf8");
  await assert.rejects(loadAmrCatalog({
    cacheDir, ...silent, refresh: true, fetchImpl: async () => new Response("Fehlerseite"),
  }), /nicht erkannt/u);
  assert.equal(await readFile(file, "utf8"), before);
  await writeFile(file, JSON.stringify({ ...magazine, issues: [{ ...magazine.issues[0], numbers: [25] }] }));
  await assert.rejects(loadAmrCatalog({ cacheDir, cachedOnly: true }), /Ungültige/u);
  await rm(file);
  assert.equal(await loadAmrCatalog({ cacheDir, cachedOnly: true, optional: true }), null);
  await assert.rejects(loadAmrCatalog({ cacheDir, cachedOnly: true }), /fetch:amiga-action/u);
});

test("erzeugt lokale Logoassets und AMR-Heftlinks offline, erhält bestehende Archivverweise", async (t) => {
  const { root, cacheDirectory, cacheDir, magazine } = await setup(t);
  const id = "r0000000000";
  const channel = { id: "UC-amr", title: "Pretty Old Pixel" };
  for (const [name, data] of [
    ["youtube-videos", { channel, complete: true, videos: [{ id, title: "Blätterabend - Amiga Action #025 October 1991", durationSeconds: 120 }] }],
    ["youtube-playlists", { channel, complete: true, playlists: [] }],
    ["blaetterabend-videos", { channel, videos: [{ id, magazines: [{
      name: "Amiga Action", issue: issue(),
      reetroz: { match: "folder", title: "Amiga Action", pageUrl: "https://reetroz.com/magazines/amiga-action" },
    }] }] }],
  ]) await writeFile(path.join(cacheDirectory, `${name}.json`), JSON.stringify(data));
  const model = await loadSiteData(cacheDirectory);
  const mention = model.videoById.get(id).magazines[0];
  assert.ok(mention.archives.some((archive) => archive.provider === "reetroz"));
  assert.ok(mention.archives.some((archive) => archive.provider === "amr" && archive.match === "issue"));
  const outputDirectory = path.join(root, "docs");
  await generateSite({ cacheDirectory, outputDirectory, logger: { log() {}, warn() {} } });
  const detail = await readFile(path.join(outputDirectory, mention.issue.route, "index.html"), "utf8");
  assert.ok(detail.includes('<span>AMR: Ausgabe</span>'));
  assert.ok(detail.includes('href="https://amr.abime.net/issue_98"'));
  assert.ok(!detail.includes("Heft herunterladen"));
  const overview = await readFile(path.join(outputDirectory, "zeitschriften/amiga-action/index.html"), "utf8");
  assert.ok(overview.includes("Logoquelle: AMR"));
  assert.ok(overview.includes(`src="../../assets/magazine-logos/${magazine.logo.file}"`));
  assert.ok(!overview.includes('<img src="https://amr.abime.net'));
  assert.deepEqual(await readFile(path.join(outputDirectory, "assets/magazine-logos", magazine.logo.file)), bytes);
  const generated = await generateBlaetterabendList({
    sourceFile: path.join(cacheDirectory, "youtube-videos.json"), targetFile: path.join(root, "blaetterabend.json"),
    kultmags: false, pcgamesdatabase: false, amr: { cacheDir }, log() {},
  });
  assert.equal(generated.videos[0].magazines[0].amr.pageUrl, "https://amr.abime.net/issue_98");
  await rm(path.join(cacheDir, "logos", magazine.logo.file));
  await assert.rejects(loadSiteData(cacheDirectory), { code: "ENOENT" });
});
