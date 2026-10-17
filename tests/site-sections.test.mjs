import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { sectionDefinitions } from "../src/sections.mjs";
import { normalizeSources, loadSiteData } from "../src/site-data.mjs";
import { createSiteConfig } from "../src/site-config.mjs";
import { renderSite } from "../src/site-render.mjs";
import { generateSite, validateSite } from "../src/generate-site.mjs";

const channel = { id: "UC-sections", title: "Pretty Old Pixel" };
const videoId = (index) => `s${String(index).padStart(10, "0")}`;
function fixture(count = 4) {
  const videos = Array.from({ length: count }, (_, index) => ({
    id: videoId(index), title: `Beitrag ${index}`, description: "",
    publishedAt: new Date(Date.UTC(2020, 0, index + 1)).toISOString(),
  }));
  return {
    videos: { channel, complete: true, videos },
    playlists: { channel, complete: true, playlists: [] },
    magazines: { channel, videos: [] },
  };
}
function definition(id = "hardware", count = 4) {
  const source = sectionDefinitions.find((section) => section.id === id);
  return {
    ...structuredClone(source), playlistIds: ["PL-test"], excludedVideoIds: [],
    videos: Array.from({ length: count }, (_, index) => ({
      id: videoId(index), topic: id === "retrospektiven" ? "Geschichte" : `Thema ${index}`,
      ...(id === "interviews" ? { people: [`Person ${index}`] } : {}),
      ...(id === "retrospektiven" ? { order: index } : {}),
    })),
  };
}
function render(input = fixture(), sections = [definition()], options = {}) {
  const model = normalizeSources(input, { games: [], sections });
  const config = { ...createSiteConfig(options.baseUrl), pageSize: options.pageSize ?? 50 };
  const pages = renderSite(model, config, "assets/test.css");
  validateSite(pages, new Map([["assets/test.css", ""], ["assets/video-series.js", ""]]), config);
  return { model, pages, config };
}
const graph = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)[1])["@graph"];

test("beschreibt Themen für Besucher ohne interne Prüf- oder Cachehinweise", () => {
  for (const id of ["hardware", "retrospektiven", "interviews"]) {
    const { pages } = render(fixture(), [definition(id)]);
    const html = pages.get(`${id}/index.html`).html;
    assert.ok(html.includes("4 Videos."));
    assert.ok(!/Cache|lokal gespeichert|geprüft|bestätigte Beiträge|Videolinks führen|Zuordnung wurde/u.test(html));
  }
});

test("ordnet nur geprüfte IDs zu und meldet neue Titel-/Playlist-Kandidaten", () => {
  const input = fixture();
  input.videos.videos[1].title = "re.ware - ungeprüft";
  input.videos.videos[2].title = "Spieleverpackungen";
  input.playlists.playlists = [{
    id: "PL-test", title: "re.ware", videos: input.videos.videos.slice(1).map((video, index) => ({
      videoId: video.id, position: index + 1, availability: "listed",
    })),
  }];
  const section = definition("hardware", 1);
  section.excludedVideoIds = [videoId(2)];
  const before = structuredClone(input);
  const { model } = render(input, [section]);
  assert.deepEqual(model.sections[0].entries.map((entry) => entry.videoId), [videoId(0)]);
  assert.equal(model.videoById.get(videoId(1)).sections.length, 0);
  assert.equal(model.videoById.get(videoId(2)).sections.length, 0);
  assert.equal(model.warnings.filter((warning) => warning.includes("Neuer Kandidat")).length, 2);
  assert.ok(!model.warnings.some((warning) => warning.includes(`hardware/${videoId(2)}`)));
  assert.deepEqual(input, before);
});

test("sortiert Hardware und Interviews nach echten Zeitpunkten, Unbekannte zuletzt", () => {
  const input = fixture();
  input.videos.videos[0].publishedAt = "2020-01-01T01:00:00+02:00";
  input.videos.videos[1].publishedAt = "2019-12-31T23:00:00Z";
  input.videos.videos[2].publishedAt = null;
  input.videos.videos[3].publishedAt = "2020-01-01T00:00:00Z";
  for (const id of ["hardware", "interviews"]) {
    const { model, pages } = render(input, [definition(id)]);
    assert.deepEqual(model.sections[0].entries.map((entry) => entry.videoId),
      [videoId(3), videoId(0), videoId(1), videoId(2)]);
    assert.ok(pages.get(`${id}/index.html`).html.includes("Veröffentlichungsdatum unbekannt"));
  }
});

test("gruppiert Retrospektiven nach Thema und geprüfter Reihenfolge statt Originalnummer oder Datum", () => {
  const input = fixture();
  input.videos.videos[0].title = "Thema [re.trospektive - #11] erster Beitrag";
  input.videos.videos[1].title = "Thema [re.trospektive - #11] zweiter Beitrag";
  const section = definition("retrospektiven");
  section.videos[3].topic = "Einleitung";
  section.videos[3].order = 0;
  section.videos[0].order = 1;
  section.videos[1].order = 2;
  section.videos[2].order = 3;
  const { pages } = render(input, [section]);
  const html = pages.get("retrospektiven/index.html").html;
  assert.ok(html.indexOf("<h2>Einleitung</h2>") < html.indexOf("<h2>Geschichte</h2>"));
  const items = graph(html)[0].mainEntity.itemListElement;
  assert.deepEqual(items.map((item) => item.url.split("v=")[1]), [videoId(3), videoId(0), videoId(1), videoId(2)]);
  assert.equal((html.match(/<h3>/gu) ?? []).length, 4);
  assert.ok(html.includes("#11] erster Beitrag"));
  assert.ok(html.includes("#11] zweiter Beitrag"));
  assert.ok(![...pages.keys()].some((file) => file.startsWith("retrospektiven/geschichte/")));
});

test("verlinkt Bereiche, Personen und bestätigte Spielkontexte ohne neue Videoseiten oder Player", () => {
  const input = fixture();
  input.playlists.playlists = [{
    id: "PL-game", title: "Ein Spiel", videos: input.videos.videos.slice(0, 2).map((video, index) => ({
      videoId: video.id, position: index + 1, availability: "listed",
    })),
  }];
  const model = normalizeSources(input, {
    sections: [definition("interviews")],
    games: [{ id: "ein-spiel", name: "Ein Spiel", playlistIds: ["PL-game"], videoIds: [], platforms: [], aliases: [] }],
  });

  const config = createSiteConfig();
  const pages = renderSite(model, config, "assets/test.css");
  validateSite(pages, new Map([["assets/test.css", ""], ["assets/video-series.js", ""]]), config);
  const html = pages.get("interviews/index.html").html;
  assert.ok(html.includes('href="../spiele/ein-spiel/#video-s0000000000"'));
  assert.ok(html.includes('href="https://www.youtube.com/watch?v=s0000000003" rel="external"'));
  assert.ok(html.includes("Im Gespräch: Person 0"));
  assert.ok(html.includes("Thema: Thema 0"));
  assert.ok(!html.includes("<iframe"));
  assert.ok(!html.includes('type="module"'));
  assert.ok(pages.get("index.html").html.includes('href="interviews/"'));
  assert.ok(pages.get("news/index.html").html.includes('href="../interviews/"'));
  assert.ok(pages.get("spiele/ein-spiel/index.html").html.includes('href="../../interviews/"'));
  assert.ok(![...pages.keys()].some((file) => /^videos\/s\d/u.test(file)));
});

test("hält Themen auch bei überlappenden Folgenpositionen in HTML und JSON-LD zusammen", () => {
  const section = definition("retrospektiven");
  section.videos[1].topic = "Anderes Thema";
  section.videos[3].topic = "Anderes Thema";
  const { model, pages } = render(fixture(), [section]);
  assert.deepEqual(model.sections[0].entries.map((entry) => entry.videoId),
    [videoId(0), videoId(2), videoId(1), videoId(3)]);
  const html = pages.get("retrospektiven/index.html").html;
  assert.deepEqual(graph(html)[0].mainEntity.itemListElement.map((item) => item.url.split("v=")[1]),
    [videoId(0), videoId(2), videoId(1), videoId(3)]);
  assert.ok(html.indexOf(`href="https://www.youtube.com/watch?v=${videoId(2)}"`)
    < html.indexOf(`href="https://www.youtube.com/watch?v=${videoId(1)}"`));
});

test("paginiert Bereiche und bewahrt relative Links sowie aktive Hauptnavigation", () => {
  for (const id of ["hardware", "retrospektiven", "interviews"]) {
    const { pages } = render(fixture(51), [definition(id, 51)]);
    const first = pages.get(`${id}/index.html`).html;
    const second = pages.get(`${id}/seite/2/index.html`).html;
    assert.equal(graph(first)[0].mainEntity.itemListElement.length, 50);
    assert.equal(graph(second)[0].mainEntity.itemListElement.length, 1);
    assert.ok(second.includes('rel="canonical" href="./"'));
    assert.ok(second.includes('href="../../" rel="prev"'));
    assert.ok(second.includes(`href="../../" aria-current="page">${sectionDefinitions.find((section) => section.id === id).name}</a>`));
    assert.ok(!pages.has(`${id}/geraete/index.html`));
  }
});

test("erhält deterministische Ausgabe bei Quellreihenfolge und unterschiedlicher Basisadresse", () => {
  const input = fixture();
  const sections = [definition("hardware"), definition("interviews"), definition("retrospektiven")];
  const first = render(input, sections).pages;
  input.videos.videos.reverse();
  sections.reverse();
  sections.forEach((section) => section.videos.reverse());
  const second = render(input, sections, { baseUrl: "https://example.com/anderer/pfad/" }).pages;
  assert.deepEqual([...first], [...second]);
});

test("erzeugt keine leeren Bereiche und lässt fehlende oder zukünftige Beiträge aus", () => {
  const input = fixture(1);
  input.videos.videos.push({ id: videoId(1), title: "Zukunft", publishedAt: "2199-01-01T00:00:00Z" });
  const { model, pages } = render(input, [definition("hardware", 3)]);
  assert.equal(model.sections[0].entries.length, 1);
  const empty = render(fixture(), [{ ...definition(), videos: [] }]);
  assert.equal(empty.model.sections.length, 0);
  assert.ok(!empty.pages.has("hardware/index.html"));
  assert.ok(!empty.pages.get("index.html").html.includes('href="hardware/"'));
  assert.ok(!pages.has("interviews/index.html"));
});

test("meldet fehlende bestätigte Beiträge und escapet kuratierte Themen, Personen und Hinweise", () => {
  const input = fixture(1);
  input.playlists.playlists = [{ id: "PL-test", title: "Gespräche", videos: [] }];
  const section = definition("interviews", 2);
  section.videos[0].topic = "<script>Fremdtext</script>";
  section.videos[0].people = ['Person "A" <B>'];
  section.videos[0].note = "<img src=x>";
  const { model, pages } = render(input, [section]);
  assert.ok(model.warnings.some((warning) => warning.includes(`interviews/${videoId(1)}: Bestätigter Bereichsbeitrag fehlt`)));
  const html = pages.get("interviews/index.html").html;
  assert.ok(html.includes("&lt;script&gt;Fremdtext&lt;/script&gt;"));
  assert.ok(html.includes("Person &quot;A&quot; &lt;B&gt;"));
  assert.ok(html.includes("&lt;img src=x&gt;"));
  assert.equal((html.match(/<script/gu) ?? []).length, 1);
});

test("prüft ungültige Zuordnungen, doppelte IDs und fehlende Personen oder Reihenfolgen", () => {
  const invalid = [
    [{ ...definition(), id: "../bad" }],
    [definition(), definition()],
    [{ ...definition(), videos: [{ id: "bad", topic: "Thema" }] }],
    [{ ...definition(), videos: [definition().videos[0], definition().videos[0]] }],
    [{ ...definition(), excludedVideoIds: [videoId(0)] }],
    [{ ...definition("interviews"), videos: [{ id: videoId(0), topic: "Thema" }] }],
    [{ ...definition("retrospektiven"), videos: [{ id: videoId(0), topic: "Thema" }] }],
    [{ ...definition(), playlistIds: ["PL-test", "PL-test"] }],
    [{ ...definition(), videos: [{ id: videoId(0), topic: "" }] }],
  ];
  for (const sections of invalid) assert.throws(() => render(fixture(), sections));
});

test("prüft die echten kuratierten Zuordnungen und die doppelte Originalnummer der Flugsimulationen", async () => {
  const cache = path.resolve(import.meta.dirname, "../cache");
  const model = await loadSiteData(cache);
  assert.deepEqual(model.sections.map((section) => [section.id, section.entries.length]),
    [["hardware", 14], ["retrospektiven", 13], ["interviews", 8]]);
  assert.ok(!model.sections[0].entries.some((entry) => entry.videoId === "bwVnfQJ-WEw"));
  assert.ok(model.sections[0].entries.find((entry) => entry.videoId === "XDvGVislnJg").note);
  assert.deepEqual(model.sections[1].entries.slice(-2).map((entry) => entry.videoId), ["4KrDqSCgFNw", "LuWmntgoZEo"]);
  assert.ok(model.videoById.get("S-7vf5iizyk").games.length);
  assert.ok(model.videoById.get("S-7vf5iizyk").sections.some((section) => section.id === "interviews"));
});

test("aktualisiert Bereichsinhalte offline, erhält fremde Änderungsdaten und entfernt leere Bereiche", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "pixel-sections-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cacheDirectory = path.join(directory, "cache");
  const outputDirectory = path.join(directory, "docs");
  await mkdir(cacheDirectory);
  const input = fixture(2);
  input.videos.videos[0].id = "UMUCVO8kbCo";
  const save = async () => Promise.all([
    ["youtube-videos", input.videos], ["youtube-playlists", input.playlists], ["blaetterabend-videos", input.magazines],
  ].map(([name, data]) => writeFile(path.join(cacheDirectory, `${name}.json`), JSON.stringify(data))));
  const options = { cacheDirectory, outputDirectory, now: Date.parse("2026-01-01T00:00:00Z"), logger: { log() {}, warn() {} } };
  await save();
  await generateSite(options);
  const manifest = async () => JSON.parse(await readFile(path.join(outputDirectory, "build-manifest.json"), "utf8"));
  const first = await manifest();
  input.videos.videos[0].description = "Aktualisierte Hardwarebeschreibung";
  await save();
  options.now += 86400000;
  await generateSite(options);
  const second = await manifest();
  assert.equal(second.pages["hardware/index.html"].lastModified, "2026-01-02T00:00:00.000Z");
  assert.equal(second.pages["hardware/index.html"].contentPublishedAt, first.pages["hardware/index.html"].contentPublishedAt);
  assert.deepEqual(second.pages["datenschutz/index.html"], first.pages["datenschutz/index.html"]);
  assert.ok((await readFile(path.join(outputDirectory, "sitemap.xml"), "utf8")).includes("/hardware/"));
  const repeat = await generateSite(options);
  assert.equal(repeat.files, repeat.reused);
  input.videos.videos.shift();
  await save();
  await generateSite(options);
  await assert.rejects(stat(path.join(outputDirectory, "hardware/index.html")), { code: "ENOENT" });
  assert.ok(!(await readFile(path.join(outputDirectory, "sitemap.xml"), "utf8")).includes("/hardware/"));
});
