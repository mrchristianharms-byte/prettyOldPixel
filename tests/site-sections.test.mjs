import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { sectionDefinitions } from "../src/data/data-sections.mjs";
import { normalizeSources, loadSiteData } from "../src/site-generation/site-data.mjs";
import { createSiteConfig, slugify } from "../src/site-generation/site-config.mjs";
import { renderSite } from "../src/site-generation/site-render.mjs";
import { generateSite, validateSite } from "../src/site-generation/generate-site.mjs";
import { videoListEntry } from "../src/site-generation/widget/video-entry.mjs";

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
  const config = createSiteConfig(options.baseUrl);
  if (options.pageSize !== undefined) config.pageSize = options.pageSize;
  const pages = renderSite(model, config, "assets/test.css");
  validateSite(pages, new Map([["assets/test.css", ""], ["assets/video-series.js", ""], ["assets/theme.js", ""], ["favicon.webp", ""], ["apple-touch-icon.png", ""]]), config);
  return { model, pages, config };
}
const graph = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)[1])["@graph"];

test("verlinkt Sonstiges und News intern auf eigene Videodetailseiten mit gemeinsamem Player", () => {
  const input = fixture(2);
  input.videos.videos[0].description = "Vollständige Beschreibung zum Video.";
  const { model, pages, config } = render(input, []);
  for (const video of model.videos) {
    const route = `sonstiges/${slugify(video.title)}/`;
    assert.equal(video.detailRoute, route);
    for (const listing of ["sonstiges/", "news/"]) {
      const html = pages.get(`${listing}index.html`).html;
      const href = `${config.href(route, listing)}#video-${video.id}`;
      assert.ok(html.includes(`href="${href}">${video.title}</a>`));
      assert.ok(html.includes(`class="video-entry-thumbnail" href="${href}"`));
      assert.ok(!html.includes('class="detail-player"'));
    }
    const html = pages.get(`${route}index.html`).html;
    assert.ok(html.includes(`id="video-${video.id}"`));
    assert.ok(html.includes('class="detail-player"'));
    assert.ok(html.includes('<div class="description">'));
    assert.ok(!html.includes("<h3>Videobeschreibung</h3>"));
    assert.ok(html.includes('aria-label="Videos auf dieser Seite"'));
    assert.ok(!html.includes("Heftausgabe"));
    const schema = graph(html);
    assert.equal(schema.find((item) => item["@type"] === "VideoObject").sameAs, video.url);
    assert.deepEqual(schema.find((item) => item["@type"] === "BreadcrumbList").itemListElement.map((item) => item.name),
      ["Startseite", "Sonstiges", video.title]);
  }
  assert.ok(pages.get("sonstiges/beitrag-0/index.html").html.includes(input.videos.videos[0].description));
  const assigned = render(input, [definition("hardware", 1)]);
  assert.equal(assigned.model.videoById.get(videoId(0)).detailRoute, "hardware/beitrag-0/");
  assert.ok(!assigned.pages.has("sonstiges/beitrag-0/index.html"));
});

test("ordnet Themenblock Vietnam per Titelregel chronologisch und ohne manuelle IDs zu", () => {
  const input = fixture(6);
  input.videos.videos[0].title = "Themenblock Vietnam - Teil 1";
  input.videos.videos[1].title = "  THEMENBLOCK   VIETNAM - Teil 2";
  input.videos.videos[2].title = "Themenblock Vietnam - Neuer Beitrag";
  input.videos.videos[3].title = "Themenblock Vietnamesisch";
  input.videos.videos[4].title = "Spiel über Vietnam";
  input.videos.videos[5].title = "Themenblock Vietnam - ausgeschlossen";
  const section = definition("retrospektiven", 0);
  section.excludedVideoIds = [videoId(5)];
  const { model, pages } = render(input, [section]);
  const entries = model.sections.find((section) => section.id === "retrospektiven").entries;
  assert.deepEqual(entries.map((entry) => entry.videoId), [videoId(0), videoId(1), videoId(2)]);
  assert.ok(entries.every((entry) => entry.topic === "Themenblock Vietnam"));
  const html = pages.get("retrospektiven/index.html").html;
  assert.ok(html.includes("<h2>Themenblock Vietnam</h2>"));
  assert.equal((html.match(/<li><article>/gu) ?? []).length, 3);
  assert.ok(!model.warnings.some((warning) => warning.includes("Neuer Kandidat")));
  for (const index of [0, 1, 2]) {
    assert.ok(!model.videoById.get(videoId(index)).sections.some((section) => section.id === "sonstiges"));
  }
  input.videos.videos.reverse();
  assert.deepEqual([...render(input, [section]).pages], [...pages]);
  const manual = { ...section, videos: [{ id: videoId(0), topic: "Geprüfter Kontext", order: 0 }] };
  const assigned = render(input, [manual]).model.sections.find((section) => section.id === "retrospektiven").entries;
  assert.equal(assigned.filter((entry) => entry.videoId === videoId(0)).length, 1);
  assert.equal(assigned.find((entry) => entry.videoId === videoId(0)).topic, "Geprüfter Kontext");
});

test("bildet lesbare Titelpfade in allen Bereichen und hält Linkmetadaten konsistent", () => {
  for (const id of ["hardware", "interviews", "retrospektiven", "sonstiges"]) {
    const input = fixture(1);
    input.videos.videos[0].title = "Mein Amiga: Zubehör & Spaß!";
    const { model, pages, config } = render(input, id === "sonstiges" ? [] : [definition(id, 1)]);
    const video = model.videos[0];
    const route = `${id}/mein-amiga-zubehor-spass/`;
    assert.equal(video.detailRoute, route);
    const html = pages.get(`${route}index.html`).html;
    assert.ok(html.includes(`<link rel="canonical" href="${config.absolute(route)}">`));
    assert.ok(html.includes(`<meta property="og:url" content="${config.absolute(route)}">`));
    assert.ok(!pages.has(`${id}/${video.id}/index.html`));
  }
});

test("löst kollidierende, leere und lange Titel ohne IDs und unabhängig von der Quellreihenfolge auf", () => {
  const input = fixture(7);
  const titles = ["Über Spaß!", "Uber Spass", "Uber Spass 2", "!!!", "???", "A".repeat(240), `${"A".repeat(240)} B`];
  input.videos.videos.forEach((video, index) => { video.title = titles[index]; });
  const { model, pages } = render(input, []);
  const routes = model.videos.map((video) => video.detailRoute);
  assert.equal(new Set(routes).size, 7);
  assert.equal(model.videoById.get(videoId(0)).detailRoute, "sonstiges/uber-spass/");
  assert.equal(model.videoById.get(videoId(1)).detailRoute, "sonstiges/uber-spass-3/");
  assert.equal(model.videoById.get(videoId(2)).detailRoute, "sonstiges/uber-spass-2/");
  assert.equal(model.videoById.get(videoId(3)).detailRoute, "sonstiges/video/");
  assert.equal(model.videoById.get(videoId(4)).detailRoute, "sonstiges/video-2/");
  for (const video of model.videos) {
    assert.ok(!video.detailRoute.includes(video.id));
    assert.ok(video.detailRoute.split("/")[1].length <= 162);
  }
  input.videos.videos.reverse();
  const reversed = render(input, []);
  assert.deepEqual([...pages], [...reversed.pages]);
});

test("Sonstiges erfasst nur thematisch unzugeordnete Videos unabhängig von News und Playlists", () => {
  const input = fixture(7);
  input.videos.videos[6].publishedAt = null;
  input.magazines.videos = [
    { id: videoId(1), magazines: [{ name: "Demo", issue: null }] },
    { id: videoId(2), magazines: [] },
  ];
  input.playlists.playlists = [
    { id: "PL-game", title: "Demo-Spiel", videos: [3, 4].map((index) => ({
      videoId: videoId(index), position: index, availability: "listed",
    })) },
    { id: "PL-other", title: "Andere Playlist", videos: [
      { videoId: videoId(5), position: 1, availability: "listed" },
    ] },
  ];
  const model = normalizeSources(input, {
    sections: [definition("hardware", 1)],
    games: [{ id: "demo-spiel", name: "Demo-Spiel", playlistIds: ["PL-game"], videoIds: [], platforms: [], aliases: [] }],
  });
  const other = model.sections.find((section) => section.id === "sonstiges");
  assert.deepEqual(other.entries.map((entry) => entry.videoId), [videoId(5), videoId(6)]);
  assert.ok(model.news.some((video) => video.id === videoId(5)));
  assert.deepEqual(model.videoById.get(videoId(5)).sections, [
    { id: "sonstiges", name: "Sonstiges", route: "sonstiges/" },
  ]);
  const reassigned = normalizeSources(input, {
    games: [], sections: [definition("hardware", 7)],
  });
  assert.ok(!reassigned.sections.some((section) => section.id === "sonstiges"));
});

test("Sonstiges nutzt News-Einträge, paginiert alle Videos und erscheint in Navigation und Themenübersicht", () => {
  const input = fixture(61);
  input.videos.videos[0].publishedAt = null;
  const { model, pages, config } = render(input, []);
  const first = pages.get("sonstiges/index.html").html;
  const second = pages.get("sonstiges/seite/2/index.html").html;
  assert.equal(model.sections[0].entries.length, 61);
  assert.equal((first.match(/<li><article>/gu) ?? []).length, 60);
  assert.equal((second.match(/<li><article>/gu) ?? []).length, 1);
  for (const html of [first, second]) {
    assert.equal((html.match(/<nav class="pagination"/gu) ?? []).length, 1);
    assert.ok(html.indexOf('<nav class="pagination"') > html.indexOf('</article>'));
  }
  assert.ok(first.includes('href="seite/2/" rel="next"'));
  assert.ok(second.includes('href="../../" rel="prev"'));
  assert.equal(graph(first)[0].mainEntity.itemListElement.length, 60);
  assert.ok(second.includes("Veröffentlichungsdatum unbekannt"));
  assert.ok(first.includes('href="./" aria-current="page">Sonstiges</a>'));
  assert.ok(pages.get("index.html").html.includes('href="sonstiges/">Sonstiges</a>'));
  assert.ok(pages.get("news/index.html").html.includes('href="../sonstiges/">Sonstiges</a>'));
  assert.ok(!first.includes("Thema:"));
  assert.ok(!first.includes("<iframe"));
  assert.ok(!first.includes('type="module"'));
  const news = pages.get("news/index.html").html;
  const newest = model.videos[0];
  assert.ok(first.includes(videoListEntry(newest, config.forPage("sonstiges/"))));
  assert.ok(news.includes(videoListEntry(newest, config.forPage("news/"))));
});

test("Sonstiges bleibt bei geänderter Quellreihenfolge deterministisch und entfällt ohne Restvideos", () => {
  const input = fixture();
  const first = render(input, []).pages;
  input.videos.videos.reverse();
  assert.deepEqual([...render(input, []).pages], [...first]);
  assert.ok(!render(fixture(), [definition()]).pages.has("sonstiges/index.html"));
});

test("re.consider ordnet Formatvideos automatisch zu und verwendet paginierte News-Einträge", () => {
  const input = fixture(63);
  input.videos.videos.forEach((video, index) => {
    video.title = `Spiel ${index} [${index === 1 ? "RE.CONSIDER" : "re.consider"}]`;
  });
  input.videos.videos[0].publishedAt = null;
  input.videos.videos[61].title = "Spiel re.considered";
  input.videos.videos[62].title = "Anderes Spiel";
  const { model, pages, config } = render(input, [definition("hardware", 2)]);
  const section = model.sections.find((section) => section.id === "reconsider");
  assert.equal(section.entries.length, 61);
  assert.equal(section.entries.at(-1).videoId, videoId(0));
  assert.ok(model.videoById.get(videoId(1)).sections.some((section) => section.id === "hardware"));
  assert.ok(model.videoById.get(videoId(1)).sections.some((section) => section.id === "reconsider"));
  assert.deepEqual(model.sections.find((section) => section.id === "sonstiges").entries.map((entry) => entry.videoId),
    [videoId(62), videoId(61)]);
  const first = pages.get("reconsider/index.html").html;
  const second = pages.get("reconsider/seite/2/index.html").html;
  assert.equal((first.match(/<li><article>/gu) ?? []).length, 60);
  assert.equal((second.match(/<li><article>/gu) ?? []).length, 1);
  assert.ok(second.includes("Veröffentlichungsdatum unbekannt"));
  assert.ok(first.includes(videoListEntry(model.videoById.get(videoId(60)), config.forPage("reconsider/"))));
  assert.ok(first.includes('href="./" aria-current="page">re.consider</a>'));
  assert.ok(pages.get("index.html").html.includes('href="reconsider/">re.consider</a>'));
  assert.ok(!first.includes("Thema:"));
  assert.ok(!first.includes('type="module"'));
  assert.ok(!first.includes("<iframe"));
  assert.ok(!render(fixture(), []).pages.has("reconsider/index.html"));
  const original = [...pages];
  input.videos.videos.reverse();
  assert.deepEqual([...render(input, [definition("hardware", 2)]).pages], original);
});

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
  assert.deepEqual(model.videoById.get(videoId(1)).sections.map((section) => section.id), ["sonstiges"]);
  assert.deepEqual(model.videoById.get(videoId(2)).sections.map((section) => section.id), ["sonstiges"]);
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
  assert.deepEqual(items.map((item) => item.url.split("#video-")[1]), [videoId(3), videoId(0), videoId(1), videoId(2)]);
  assert.equal((html.match(/<h3>/gu) ?? []).length, 4);
  assert.ok(html.includes("#11] erster Beitrag"));
  assert.ok(html.includes("#11] zweiter Beitrag"));
  assert.ok(![...pages.keys()].some((file) => file.startsWith("retrospektiven/geschichte/")));
});

test("verlinkt Bereiche intern auf Spiele oder eigene Detailseiten und hält Listen ohne Player", () => {
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
  validateSite(pages, new Map([["assets/test.css", ""], ["assets/video-series.js", ""], ["assets/theme.js", ""], ["favicon.webp", ""], ["apple-touch-icon.png", ""]]), config);
  const html = pages.get("interviews/index.html").html;
  assert.ok(html.includes('href="../spiele/ein-spiel/#video-s0000000000"'));
  assert.ok(html.includes('href="beitrag-3/#video-s0000000003"'));
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
  assert.deepEqual(graph(html)[0].mainEntity.itemListElement.map((item) => item.url.split("#video-")[1]),
    [videoId(0), videoId(2), videoId(1), videoId(3)]);
  assert.ok(html.indexOf(`href="beitrag-2/#video-${videoId(2)}"`)
    < html.indexOf(`href="beitrag-1/#video-${videoId(1)}"`));
});

test("paginiert Bereiche und bewahrt relative Links sowie aktive Hauptnavigation", () => {
  for (const id of ["hardware", "retrospektiven", "interviews"]) {
    const { pages, config } = render(fixture(61), [definition(id, 61)]);
    const first = pages.get(`${id}/index.html`).html;
    const second = pages.get(`${id}/seite/2/index.html`).html;
    assert.equal(graph(first)[0].mainEntity.itemListElement.length, 60);
    assert.equal(graph(second)[0].mainEntity.itemListElement.length, 1);
    assert.ok(second.includes(`rel="canonical" href="${config.absolute(`${id}/seite/2/`)}"`));
    assert.ok(second.includes('href="../../" rel="prev"'));
    assert.ok(second.includes(`href="../../" aria-current="page">${{ hardware: "re.ware", interviews: "Interviews", retrospektiven: "projects" }[id] ?? sectionDefinitions.find((section) => section.id === id).name}</a>`));
    if (id === "interviews") {
      assert.ok(second.includes("<h1>Interviews und Gespräche – Seite 2</h1>"));
      assert.ok(!second.match(/<nav aria-label="Hauptnavigation">[\s\S]*?<\/nav>/u)[0].includes("Interviews und Gespräche"));
    }
    assert.ok(!pages.has(`${id}/geraete/index.html`));
  }
});

test("erhält deterministische Ausgabe bei Quellreihenfolge und unterschiedlicher Basisadresse", () => {
  const input = fixture();
  const sections = [definition("hardware"), definition("interviews"), definition("retrospektiven")];
  const { pages: first, config } = render(input, sections);
  input.videos.videos.reverse();
  sections.reverse();
  sections.forEach((section) => section.videos.reverse());
  const baseUrl = "https://example.com/anderer/pfad/";
  const second = render(input, sections, { baseUrl }).pages;
  assert.deepEqual([...first].map(([file, page]) => [
    file, { ...page, html: page.html.replaceAll(config.baseUrl, baseUrl) },
  ]), [...second]);
});

test("erzeugt keine leeren Bereiche und lässt fehlende oder zukünftige Beiträge aus", () => {
  const input = fixture(1);
  input.videos.videos.push({ id: videoId(1), title: "Zukunft", publishedAt: "2199-01-01T00:00:00Z" });
  const { model, pages } = render(input, [definition("hardware", 3)]);
  assert.equal(model.sections[0].entries.length, 1);
  const empty = render(fixture(), [{ ...definition(), videos: [] }]);
  assert.deepEqual(empty.model.sections.map((section) => section.id), ["sonstiges"]);
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
  assert.equal((html.match(/<script/gu) ?? []).length, 2);
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
  assert.deepEqual(model.sections.filter((section) => ["hardware", "retrospektiven", "interviews"].includes(section.id)).map((section) => [section.id, section.entries.length]),
    [["hardware", 15], ["retrospektiven", 21], ["interviews", 8]]);
  const other = model.sections.find((section) => section.id === "sonstiges");
  assert.ok(other.entries.length > 0);
  assert.deepEqual(other.entries.map((entry) => entry.videoId),
    model.videos.filter((video) => !video.blaetterabend && !video.games.length
      && video.sections.every((section) => section.id === "sonstiges")).map((video) => video.id));
  assert.ok(model.sections[0].entries.some((entry) => entry.videoId === "bwVnfQJ-WEw"));
  assert.ok(!other.entries.some((entry) => entry.videoId === "bwVnfQJ-WEw"));
  const hardwareVideo = model.videoById.get("bwVnfQJ-WEw");
  assert.equal(hardwareVideo.detailRoute, `hardware/${slugify(hardwareVideo.title)}/`);
  assert.ok(model.sections[0].entries.find((entry) => entry.videoId === "XDvGVislnJg").note);
  assert.deepEqual(model.sections[1].entries.filter((entry) => entry.topic === "Geschichte der Flugsimulationen").slice(-2).map((entry) => entry.videoId), ["4KrDqSCgFNw", "LuWmntgoZEo"]);
  assert.deepEqual(model.sections[1].entries.filter((entry) => entry.topic === "Themenblock Vietnam").map((entry) => entry.videoId),
    ["HZ9tBbNtLJU", "MnJECZ7NWMQ"]);
  const immersionIds = ["4s7lDupOgWg", "TAsByu_hCwo", "E23VT0epyHo", "hJdFOecpQvE", "HoLJ5JRh1Jw", "19oYQ-fUt70"];
  assert.deepEqual(model.sections[1].entries.filter((entry) => entry.topic === "Immersion in Videospielen").map((entry) => entry.videoId),
    immersionIds);
  for (const id of immersionIds) {
    assert.ok(!other.entries.some((entry) => entry.videoId === id));
    assert.ok(model.videoById.get(id).sections.some((section) => section.id === "retrospektiven"));
  }
  const config = createSiteConfig();
  const html = renderSite(model, config, "assets/test.css").get("retrospektiven/index.html").html;
  const navigation = html.match(/<nav aria-label="Hauptnavigation">[\s\S]*?<\/nav>/u)[0];
  assert.ok(navigation.includes('>Blätterabend</a>'));
  assert.ok(navigation.includes('>re.play</a>'));
  assert.ok(navigation.includes('aria-current="page">projects</a>'));
  assert.deepEqual([...navigation.matchAll(/<a [^>]*>([^<]+)<\/a>/gu)].map((match) => match[1]),
    ["News", "Blätterabend", "re.play", "re.consider", "re.ware", "projects", "Interviews", "Sonstiges"]);
  assert.equal((navigation.match(/class="navigation-separator" aria-hidden="true">\|/gu) ?? []).length, 1);
  assert.ok(navigation.indexOf(">re.consider</a>") < navigation.indexOf('class="navigation-separator"'));
  assert.ok(navigation.indexOf('class="navigation-separator"') < navigation.indexOf(">re.ware</a>"));
  assert.ok(!/>Zeitschriften<\/a>|>Spiele<\/a>|>Retrospektiven<\/a>/u.test(navigation));
  assert.ok(html.includes("<h2>Immersion in Videospielen</h2>"));
  for (let index = 1; index < immersionIds.length; index += 1) {
    assert.ok(html.indexOf(`#video-${immersionIds[index - 1]}`) < html.indexOf(`#video-${immersionIds[index]}`));
  }
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
