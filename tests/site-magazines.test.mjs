import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildSite, validateSite } from "../src/build.mjs";
import { createSiteConfig } from "../src/site-config.mjs";
import { normalizeSources } from "../src/site-data.mjs";
import { renderSite } from "../src/site-render.mjs";

const channel = { id: "UC-magazines", title: "Pretty Old Pixel" };
const videoId = (index) => `m${String(index).padStart(10, "0")}`;
const issue = (year = 1992, months = [11], options = {}) => ({
  label: `${months.join("+")}/${year}`, year, months, number: null, special: false, ...options,
});
const mention = (data = issue(), name = "PC Games") => ({ name, issue: data });
const archive = (key, provider = "kultmags") => provider === "kultmags"
  ? { match: "issue", pageUrl: "https://www.kultmags.com/mags.php?folder=test", readerUrl: `https://reader.kultmags.com/${key}`, title: `PC Games ${key}` }
  : { match: "issue", pageUrl: `https://reetroz.com/issue/${key}`, title: `Computer Gaming World ${key}` };

function fixture(count = 13) {
  const videos = Array.from({ length: count }, (_, index) => ({
    id: videoId(index), title: `Blätterabend – Video ${index}`, description: "",
    publishedAt: new Date(Date.UTC(2020, 0, index + 1)).toISOString(), durationSeconds: 120,
  }));
  return {
    videos: { channel, complete: true, videos },
    playlists: { channel, complete: true, playlists: [] },
    magazines: { channel, videos: videos.map((video) => ({ id: video.id, magazines: [mention()] })) },
  };
}

function variedFixture() {
  const input = fixture();
  const entries = input.magazines.videos;
  entries[0].part = 2;
  entries[1].part = 1;
  entries[2].magazines = [mention(issue(1992, [12]))];
  entries[3].magazines = [{ ...mention(issue(1992, [], { special: true, label: "Sonderheft 1992" })), kultmags: archive("Special-A") }];
  entries[4].magazines = [{ ...mention(issue(1992, [], { special: true, label: "Sonderheft 1992" })), kultmags: archive("Special-B") }];
  entries[5].magazines = [mention(issue(1993, [], { label: "1993" }))];
  entries[6].magazines = [mention(null)];
  entries[7].magazines = [];
  entries[8].magazines = [mention(issue(1992, [8, 9]))];
  entries[9].magazines.push(mention(issue(1991, [6]), "Amiga Joker"));
  entries[10].magazines = [mention(issue(1992, [], { special: true, label: "Sonderheft 1992" }))];
  entries[11].magazines = [{ ...mention(issue(1996, [11], { number: 148, label: "#148 11/1996" }), "Computer Gaming World"), reetroz: archive("cgw-148", "reetroz") }];
  entries[12].magazines = [{ ...mention(issue(null, [], { number: 148, label: "#148" }), "Computer Gaming World"), reetroz: archive("cgw-148", "reetroz") }];
  return input;
}

function render(input = variedFixture(), pageSize = 50) {
  const model = normalizeSources(input);
  const config = { ...createSiteConfig(), pageSize };
  const pages = renderSite(model, config, config.href("assets/test.css"));
  validateSite(pages, new Map([["assets/test.css", "body{}"], ["assets/video-series.js", ""]]), config);
  return { model, pages, config };
}

const graph = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)[1])["@graph"];

test("gruppiert Ausgaben nach Heftjahr, Monate und Videoteile statt Uploaddatum", () => {
  const model = normalizeSources(variedFixture());
  const magazine = model.magazines.find((item) => item.id === "pc-games");
  assert.deepEqual(magazine.years.map((year) => year.year), [1992, 1993]);
  assert.ok(!magazine.years.some((year) => year.year === 2020));
  const november = [...magazine.issues.values()].find((item) => item.months[0] === 11);
  assert.deepEqual(november.videos, [videoId(1), videoId(0), videoId(9)]);
  assert.deepEqual(magazine.years[0].entries.slice(0, 4).map((entry) => entry.videoId), [videoId(8), videoId(1), videoId(0), videoId(9)]);
  assert.ok(magazine.years[0].entries.slice(-3).every((entry) => entry.mention.issue.special));
  assert.equal(model.unresolvedMagazines[0].id, videoId(7));
  assert.equal(model.videoById.get(videoId(9)).magazines.length, 2);
});

test("unterscheidet Sonderhefte und erstellt keine spekulativen Seiten aus Jahr oder generischer Beschriftung", () => {
  const { model, pages } = render();
  const magazine = model.magazines.find((item) => item.id === "pc-games");
  const specials = [...magazine.issues.values()].filter((item) => item.special);
  assert.equal(specials.length, 2);
  assert.notEqual(specials[0].id, specials[1].id);
  assert.notEqual(specials[0].label, specials[1].label);
  for (const index of [5, 6, 10]) {
    assert.ok(!model.videoById.get(videoId(index)).magazines[0].issue?.route);
  }
  assert.ok(pages.get("zeitschriften/pc-games/1993/index.html").html.includes("Ausgabe nicht eindeutig"));
  assert.ok(pages.get("zeitschriften/pc-games/index.html").html.includes("Jahrgang unbekannt"));
  assert.ok(pages.get("zeitschriften/index.html").html.includes("Zeitschrift ungeklärt"));
});

test("erhält den chronologischen Platz unnummerierter Videos und sortiert bekannte Teile relativ zueinander", () => {
  const input = fixture(4);
  input.magazines.videos[1].part = 3;
  input.magazines.videos[3].part = 2;
  const { model, pages } = render(input);
  const entity = [...model.magazines[0].issues.values()][0];
  assert.deepEqual(entity.videos, [videoId(0), videoId(3), videoId(2), videoId(1)]);
  const html = pages.get(`${entity.route}index.html`).html;
  assert.ok(html.indexOf(`href="#video-${videoId(0)}"`) < html.indexOf(`href="#video-${videoId(3)}"`));
});

test("ergänzt fehlende Heftdaten nur aus identischem eindeutigem Archivtreffer", () => {
  const input = variedFixture();
  const model = normalizeSources(input);
  const magazine = model.magazines.find((item) => item.id === "computer-gaming-world");
  assert.deepEqual(magazine.years.map((year) => year.year), [1996]);
  assert.equal(magazine.issues.size, 1);
  const entity = [...magazine.issues.values()][0];
  assert.equal(entity.label, "#148 11/1996");
  assert.deepEqual(entity.videos, [videoId(11), videoId(12)]);
  assert.deepEqual(entity.months, [11]);
  assert.equal(entity.archives.length, 1);
  input.magazines.videos[12].magazines[0].reetroz = { match: "folder", pageUrl: "https://reetroz.com/magazines/cgw" };
  const unresolved = normalizeSources(input).videoById.get(videoId(12)).magazines[0];
  assert.equal(unresolved.issue.year, null);
  assert.equal(unresolved.issue.route, null);
});

test("meldet widersprüchliche Archivdaten statt unterschiedliche Hefte zu verschmelzen", () => {
  const input = variedFixture();
  input.magazines.videos[12].magazines[0].issue.year = 1997;
  const model = normalizeSources(input);
  assert.equal(model.magazines.find((item) => item.id === "computer-gaming-world").issues.size, 0);
  assert.ok(model.warnings.some((warning) => warning.includes("Widersprüchliche Heftdaten")));
});

test("erzeugt Zeitschriften-/Jahrgangs-/Ausgabenseiten mit sichtbaren Links und passendem JSON-LD", () => {
  const { model, pages, config } = render();
  const magazine = model.magazines.find((item) => item.id === "pc-games");
  const november = [...magazine.issues.values()].find((item) => item.months[0] === 11);
  const index = pages.get("zeitschriften/index.html").html;
  const year = pages.get("zeitschriften/pc-games/1992/index.html").html;
  const detail = pages.get(`${november.route}index.html`).html;
  assert.ok(index.indexOf(">Amiga Joker</a>") < index.indexOf(">PC Games</a>"));
  assert.deepEqual(graph(index)[0].mainEntity.itemListElement.slice(0, 3).map((item) => item.name), ["Amiga Joker", "Computer Gaming World", "PC Games"]);
  assert.ok(graph(year).some((item) => item["@type"] === "CollectionPage"));
  assert.ok(!graph(year).some((item) => item["@type"] === "PublicationIssue"));
  const schema = graph(detail).find((item) => item["@type"] === "PublicationIssue");
  assert.equal(schema.isPartOf["@type"], "Periodical");
  assert.equal(schema.temporalCoverage, "1992");
  assert.equal(schema.url, config.absolute(november.route));
  assert.deepEqual(graph(detail).find((item) => item["@type"] === "CollectionPage").mainEntity.itemListElement.map((item) => item.url),
    november.videos.map((id) => `${config.absolute(november.route)}#video-${id}`));
  assert.equal(schema.datePublished, undefined);
  assert.ok(detail.includes(`href="${config.href("zeitschriften/pc-games/1992/")}"`));
  assert.ok(detail.includes("Mit Video 1/3 beginnen"));
  assert.ok(detail.indexOf('href="#video-m0000000001"') < detail.indexOf('href="#video-m0000000000"'));
  assert.ok(year.indexOf("8+9/1992") < year.indexOf("11/1992"));
  assert.ok(year.indexOf("12/1992") < year.indexOf("1992 – Sonderhefte"));
  for (const page of pages.values()) {
    assert.ok(!page.html.includes('src="https://reader.kultmags.com'));
    assert.ok(!page.html.includes("dateModified"));
  }
});

test("verlinkt News direkt auf die Ausgabe mit Video-Fragment statt separater Videoseite", () => {
  const { model, pages, config } = render();
  const mention = model.videoById.get(videoId(0)).magazines[0];
  const news = pages.get("news/index.html").html;
  for (const route of ["zeitschriften/", mention.route, mention.yearRoute, mention.issue.route, "zeitschriften/amiga-joker/"]) {
    assert.ok(news.includes(`href="${config.href(route)}"`), route);
  }
  assert.ok(news.includes(`href="${config.href(mention.issue.route)}#video-${videoId(0)}"`));
  const html = pages.get(`${mention.issue.route}index.html`).html;
  assert.ok(html.includes("Video 2/3: Blätterabend"));
  assert.ok(html.includes(`href="#video-${videoId(1)}">← Vorheriger Teil`));
  assert.ok(html.includes(`href="#video-${videoId(9)}">Nächster Teil`));
  const breadcrumb = graph(html).at(-1);
  assert.deepEqual(breadcrumb.itemListElement.map((item) => item.name), ["Startseite", "Zeitschriften", "PC Games", "PC Games 11/1992"]);
  const about = graph(html).find((item) => item["@type"] === "VideoObject").about[0];
  assert.equal(about["@type"], "PublicationIssue");
  assert.equal(about.isPartOf.name, "PC Games");
  assert.equal(about.url, config.absolute(mention.issue.route));
  assert.equal([...pages.keys()].filter((file) => /^videos\/m/u.test(file)).length, 0);
  const other = model.videoById.get(videoId(9)).magazines.find((item) => item.id === "amiga-joker").issue;
  assert.ok(pages.get(`${other.route}index.html`).html.includes(`id="video-${videoId(9)}"`));
});

test("paginiert Übersichten mit 50 Videos, behält jedoch alle Videoteile auf einer Ausgabenseite", () => {
  const { model, pages, config } = render(fixture(125));
  const magazine = model.magazines[0];
  const entity = [...magazine.issues.values()][0];
  for (const route of [magazine.route, `${magazine.route}1992/`]) {
    const first = pages.get(`${route}index.html`).html;
    const second = pages.get(`${route}seite/2/index.html`).html;
    const third = pages.get(`${route}seite/3/index.html`).html;
    assert.equal((first.match(/<li><a href="[^"]*#video-m/gu) ?? []).length, 50);
    assert.equal((second.match(/<li><a href="[^"]*#video-m/gu) ?? []).length, 50);
    assert.equal((third.match(/<li><a href="[^"]*#video-m/gu) ?? []).length, 25);
    assert.ok(second.includes(`rel="canonical" href="${config.absolute(`${route}seite/2/`)}"`));
    assert.ok(second.includes(`href="${config.href(route)}" rel="prev"`));
  }
  const video = pages.get(`${entity.route}index.html`).html;
  assert.ok(video.includes("Video 52/125"));
  assert.equal((video.match(/data-video-panel /gu) ?? []).length, 125);
  assert.ok(!pages.has(`${entity.route}seite/2/index.html`));
});

test("paginiert große Zeitschriftenindizes und ungeklärte Blätterabend-Videos ebenfalls", () => {
  const input = fixture(105);
  input.magazines.videos.forEach((entry, index) => {
    entry.magazines = index < 55 ? [mention(issue(), `Zeitschrift ${String(index).padStart(3, "0")}`)] : [];
  });
  const { pages } = render(input);
  assert.ok(pages.has("zeitschriften/seite/3/index.html"));
  assert.ok(pages.get("zeitschriften/seite/2/index.html").html.includes("Zeitschrift ungeklärt"));
  assert.equal(graph(pages.get("zeitschriften/seite/3/index.html").html)[0].mainEntity.itemListElement.length, 5);
});

test("Ausgaben-IDs und gerenderte Inhalte bleiben bei geänderter Quellreihenfolge stabil", () => {
  const input = variedFixture();
  const first = render(input);
  input.videos.videos.reverse();
  input.magazines.videos.reverse();
  input.magazines.videos.forEach((entry) => entry.magazines.reverse());
  input.videos.fetchedAt = "2099-01-01";
  const second = render(input);
  assert.deepEqual([...first.pages.keys()].sort(), [...second.pages.keys()].sort());
  for (const [file, page] of first.pages) assert.equal(page.html, second.pages.get(file).html, file);
});

test("zeigt bei fehlenden Daten keine leeren Zeitschriftenseiten und übernimmt keine ungeprüften Archivmedien", () => {
  const input = fixture(1);
  input.magazines.videos = [];
  const { pages } = render(input);
  assert.ok(!pages.has("zeitschriften/index.html"));
  assert.ok(!pages.get("index.html").html.includes('href="/prettyOldPixel/zeitschriften/"'));
  const malformed = fixture(1);
  malformed.magazines.videos[0].part = -1;
  assert.throws(() => normalizeSources(malformed), /Videoteil/u);
  malformed.magazines.videos[0].part = null;
  malformed.magazines.videos[0].magazines.push(mention());
  assert.throws(() => normalizeSources(malformed), /Doppelte Zeitschrift/u);
});

test("aktualisiert betroffene Seiten bei neuen Heften und Links, entfernt alte Ausgaben und erhält fremde Jahrgänge", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "pixel-magazines-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cacheDirectory = path.join(directory, "cache");
  const outputDirectory = path.join(directory, "public");
  await mkdir(cacheDirectory);
  const input = variedFixture();
  async function save() {
    for (const [file, data] of [["youtube-videos", input.videos], ["youtube-playlists", input.playlists], ["blaetterabend-videos", input.magazines]]) {
      await writeFile(path.join(cacheDirectory, `${file}.json`), JSON.stringify(data));
    }
  }
  const options = { cacheDirectory, outputDirectory, logger: { log() {}, warn() {} } };
  await save();
  await buildSite(options);
  const manifest = () => readFile(path.join(outputDirectory, "build-manifest.json"), "utf8").then(JSON.parse);
  const initial = await manifest();
  const untouched = "zeitschriften/amiga-joker/1991/index.html";
  const removedIssue = [...normalizeSources(input).magazines.find((item) => item.id === "pc-games").issues.values()].find((item) => item.months[0] === 12);
  input.magazines.videos[2].magazines = [mention(issue(1994, [2]))];
  await save();
  await buildSite(options);
  const changed = await manifest();
  assert.equal(initial.pages[untouched].fingerprint, changed.pages[untouched].fingerprint);
  assert.notEqual(initial.pages["zeitschriften/pc-games/index.html"].fingerprint, changed.pages["zeitschriften/pc-games/index.html"].fingerprint);
  await assert.rejects(stat(path.join(outputDirectory, `${removedIssue.route}index.html`)), { code: "ENOENT" });
  assert.ok(changed.pages["zeitschriften/pc-games/1994/index.html"]);
  const news = changed.pages["news/index.html"];
  input.magazines.videos[3].magazines[0].kultmags.downloadUrl = "https://www.kultmags.com/added.pdf";
  await save();
  await buildSite(options);
  const linked = await manifest();
  assert.equal(news.fingerprint, linked.pages["news/index.html"].fingerprint);
  assert.equal(news.contentPublishedAt, linked.pages["news/index.html"].contentPublishedAt);
  const specialRoute = normalizeSources(input).videoById.get(videoId(3)).magazines[0].issue.route;
  assert.ok((await readFile(path.join(outputDirectory, `${specialRoute}index.html`), "utf8")).includes("added.pdf"));
  input.magazines.videos[6].magazines.push(mention(issue(1987, [4]), "Neue Zeitschrift"));
  await save();
  await buildSite(options);
  const newMagazine = await manifest();
  assert.ok(newMagazine.pages["zeitschriften/neue-zeitschrift/1987/index.html"]);
  assert.ok((await readFile(path.join(outputDirectory, "news/index.html"), "utf8")).includes("/zeitschriften/neue-zeitschrift/"));
  const repeat = await buildSite(options);
  assert.equal(repeat.files, repeat.reused);
});
