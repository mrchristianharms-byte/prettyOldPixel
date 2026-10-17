import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { buildSite, validateSite } from "../src/build.mjs";
import { createSiteConfig } from "../src/site-config.mjs";
import { normalizeSources } from "../src/site-data.mjs";
import { descriptionHtml, jsonLd, renderSite } from "../src/site-render.mjs";

const channel = { id: "UC-build", title: "Pretty Old Pixel" };
function fixture(count = 53) {
  const videos = Array.from({ length: count }, (_, index) => ({
    id: `b${String(index).padStart(10, "0")}`, title: `Video ${index} – Retrospiel`,
    description: index === 0 ? "" : `Beschreibung ${index}\n\nWeitere Videos https://www.youtube.com/@PrettyOldPixel`,
    durationSeconds: 60 + index, publishedAt: new Date(Date.UTC(2020, 0, index + 1)).toISOString(),
  }));
  return {
    videos: { channel, complete: true, videos },
    playlists: { channel, complete: true, playlists: [] },
    magazines: { channel, videos: [] },
  };
}

function render(input = fixture(), baseUrl) {
  const config = createSiteConfig(baseUrl);
  const pages = renderSite(normalizeSources(input), config, config.href("assets/site.css"));
  return { pages, config, assets: new Map([["assets/site.css", "body{}"], ["assets/video-series.js", ""]]) };
}

function issueFixture() {
  const input = fixture(2);
  input.magazines.videos = input.videos.videos.map((video) => ({
    id: video.id, magazines: [{ name: "PC Games", issue: {
      label: "11/1992", year: 1992, months: [11], number: null, special: false,
    } }],
  }));
  return input;
}

const issuePage = (pages) => [...pages].find(([file]) => file.includes("/ausgaben/"))[1].html;

async function setup(t, input = fixture()) {
  const directory = await mkdtemp(path.join(tmpdir(), "pretty-pixel-build-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cacheDirectory = path.join(directory, "cache");
  const outputDirectory = path.join(directory, "public");
  await mkdir(cacheDirectory);
  async function save(data) {
    await Promise.all(Object.entries({
      "youtube-videos.json": data.videos,
      "youtube-playlists.json": data.playlists,
      "blaetterabend-videos.json": data.magazines,
    }).map(([file, value]) => writeFile(path.join(cacheDirectory, file), JSON.stringify(value))));
  }
  await save(input);
  return {
    cacheDirectory, outputDirectory, save,
    logger: { log() {}, warn() {} },
  };
}

test("erzeugt echte Seitenlinks, selbstreferenzierende Canonicals und paginierte Kataloge", () => {
  const { pages, config, assets } = render();
  assert.equal(pages.size, 6);
  assert.ok(![...pages.keys()].some((file) => /^videos\/[A-Za-z0-9_-]{11}\//u.test(file)));
  assert.ok(pages.get("news/index.html").html.includes('href="https://www.youtube.com/watch?v=b0000000052" rel="external"'));
  assert.ok(pages.has("videos/seite/2/index.html"));
  const first = pages.get("videos/index.html").html;
  const second = pages.get("videos/seite/2/index.html").html;
  assert.equal((first.match(/<li><article>/gu) ?? []).length, 50);
  assert.equal((second.match(/<li><article>/gu) ?? []).length, 3);
  assert.ok(second.includes(`rel="canonical" href="${config.absolute("videos/seite/2/")}"`));
  assert.ok(second.includes(`href="${config.href("videos/")}" rel="prev"`));
  assert.ok(![...pages.values()].some((page) => /href="[^"]*\/spiele\/|href="[^"]*\/zeitschriften\//u.test(page.html)));
  assert.ok(validateSite(pages, assets, config).maxHtmlGzip < 50 * 1024);
});

test("rendert News vollständig ohne Laufzeit-JavaScript und setzt VideoObject-Metadaten korrekt", () => {
  const { pages } = render();
  const news = pages.get("news/index.html").html;
  assert.equal((news.match(/<li><article>/gu) ?? []).length, 20);
  assert.ok(news.includes("<time datetime="));
  const video = issuePage(render(issueFixture()).pages);
  const graph = JSON.parse(video.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)[1])["@graph"];
  const schema = graph.find((item) => item["@type"] === "VideoObject" && item.sameAs.endsWith("b0000000001"));
  assert.equal(schema.duration, "PT1M1S");
  assert.equal(schema.uploadDate, "2020-01-02T00:00:00.000Z");
  assert.equal(schema.contentUrl, undefined);
  assert.ok(schema.url.endsWith("#video-b0000000001"));
  assert.equal(graph.at(-1)["@type"], "BreadcrumbList");
  assert.equal((video.match(/<script/gu) ?? []).length, 2);
  assert.ok(!video.includes("dateModified"));
});

test("escapet Quelltexte und JSON-LD, verlinkt nur HTTP(S) und kennzeichnet externe Ziele", () => {
  const input = issueFixture();
  input.videos.videos[0].title = '<img src=x onerror="alert(1)">';
  input.videos.videos[0].description = '</script><script>alert("x")</script>\n\nhttps://example.com/?x=1&y=2. javascript:alert(1)';
  const { pages, config, assets } = render(input);
  const html = issuePage(pages);
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('href="https://example.com/?x=1&amp;y=2" rel="external"'));
  assert.equal((html.match(/<script/gu) ?? []).length, 2);
  assert.ok(!jsonLd({ text: "</script>\u2028" }).includes("</script>"));
  assert.ok(descriptionHtml("https://example.com/path).").endsWith("</a>).</p>"));
  validateSite(pages, assets, config);
});

test("lädt vor Aktivierung keinen YouTube-Player und dokumentiert den aktuellen Datenschutzstand", () => {
  const { pages } = render(issueFixture());
  const html = issuePage(pages);
  assert.ok(!/<iframe[^>]*\ssrc="/u.test(html));
  assert.ok(html.includes('srcdoc="'));
  assert.ok(html.includes('name="issue-player"'));
  assert.ok(html.includes('target="issue-player"'));
  assert.equal((html.match(/<iframe /gu) ?? []).length, 1);
  assert.equal((html.match(/data-video-panel /gu) ?? []).length, 2);
  assert.ok(html.includes("keine Beschreibung vorhanden"));
  const privacy = pages.get("datenschutz/index.html").html;
  for (const text of ["nicht kommerziell", "GitHub Pages", "i.ytimg.com", "youtube-nocookie.com", "keine YouTube-IFrame-API", "Session Storage"]) {
    assert.ok(privacy.includes(text), text);
  }
  for (const page of pages.values()) assert.ok(page.html.includes('href="/prettyOldPixel/datenschutz/"'));
  assert.ok(pages.get("404.html").html.includes('content="noindex, follow"'));
});

test("stellt Zeitschriften mit Archiv-Match-Typ dar, ohne Cover-Hotlinks oder Phantomseiten", () => {
  const input = fixture(1);
  input.magazines.videos = [{
    id: input.videos.videos[0].id,
    magazines: [{ name: "Computer Gaming World", issue: null,
      reetroz: { match: "magazine", pageUrl: "https://reetroz.com/magazines/cgw", coverUrl: "https://example.com/cover.jpg" },
    }],
  }];
  const { pages, config, assets } = render(input);
  const html = pages.get("zeitschriften/computer-gaming-world/index.html").html;
  assert.ok(html.includes("Computer Gaming World"));
  assert.ok(html.includes("kein eindeutiger Hefttreffer"));
  assert.ok(html.includes('"@type":"Periodical"'));
  assert.ok(!html.includes("cover.jpg"));
  validateSite(pages, assets, config);
});

test("validiert defekte Links, Fragmente und HTML-/CSS-Budgets als Build-Fehler", () => {
  const { pages, config, assets } = render(fixture(1));
  const original = pages.get("index.html").html;
  pages.get("index.html").html += '<a href="/prettyOldPixel/fehlt/">Falsch</a>';
  assert.throws(() => validateSite(pages, assets, config), /Nicht erzeugtes Linkziel/u);
  pages.get("index.html").html = `${original}<a href="#nicht-vorhanden">Falsch</a>`;
  assert.throws(() => validateSite(pages, assets, config), /Unbekanntes Fragment/u);
  pages.get("index.html").html = `${original}<a href="/videos/">Falsch</a>`;
  assert.throws(() => validateSite(pages, assets, config), /Projektpfad/u);
  pages.get("index.html").html = `${original}<a href="https://example.com/">Extern</a>`;
  assert.throws(() => validateSite(pages, assets, config), /ohne Kennzeichnung/u);
  pages.get("index.html").html = `${original}<img src="https://example.com/cover.jpg" width="320" height="180" alt="Cover">`;
  assert.throws(() => validateSite(pages, assets, config), /Unerlaubte externe Ressource/u);
  pages.get("index.html").html = original;
  const noise = Array.from({ length: 50000 }, (_, i) => `${i}:${Math.imul(i, 2654435761) >>> 0};`).join("");
  assert.ok(gzipSync(noise).length > 50 * 1024);
  assets.set("assets/site.css", noise);
  assert.throws(() => validateSite(pages, assets, config), /CSS überschreitet/u);
  assets.set("assets/site.css", "");
  assets.set("assets/video-series.js", noise);
  assert.throws(() => validateSite(pages, assets, config), /JavaScript überschreitet/u);
  assets.set("assets/video-series.js", "");
  pages.get("index.html").html = original + '<script type="module" src="https://example.com/script.js"></script>';
  assert.throws(() => validateSite(pages, assets, config), /Unerlaubte externe Ressource/u);
  pages.get("index.html").html = original + noise;
  assert.throws(() => validateSite(pages, assets, config), /HTML überschreitet/u);
});

test("baut offline mit Projektpfad, Sitemap und Inhalts-Manifest; übernimmt unveränderte Dateien", async (t) => {
  const options = await setup(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Netzwerk im Build verboten"); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const first = await buildSite(options);
  assert.equal(first.pages, 6);
  assert.equal(first.reused, 0);
  assert.ok(first.cssGzip <= 20 * 1024);
  assert.ok(first.jsGzip <= 5 * 1024);
  const css = (await readdir(path.join(options.outputDirectory, "assets"))).find((file) => file.endsWith(".css"));
  assert.match(css, /^site\.[a-f0-9]{12}\.css$/u);
  const stylesheet = await readFile(path.join(options.outputDirectory, "assets", css), "utf8");
  assert.ok(stylesheet.includes("Pico CSS"));
  assert.ok(!stylesheet.includes("sourceMappingURL"));
  const sitemap = await readFile(path.join(options.outputDirectory, "sitemap.xml"), "utf8");
  assert.ok(sitemap.includes("https://mrchristianharms-byte.github.io/prettyOldPixel/news/"));
  assert.ok(!sitemap.includes("404.html"));
  assert.ok(!sitemap.includes("<lastmod>"));
  assert.match(await readFile(path.join(options.outputDirectory, "robots.txt"), "utf8"), /Sitemap: https:.*prettyOldPixel\/sitemap.xml/u);
  const homePath = path.join(options.outputDirectory, "index.html");
  const preservedTime = new Date("2020-01-01T00:00:00Z");
  await utimes(homePath, preservedTime, preservedTime);
  const second = await buildSite(options);
  assert.equal(second.reused, second.files);
  assert.equal((await stat(homePath)).mtime.toISOString(), preservedTime.toISOString());
  const manifest = JSON.parse(await readFile(path.join(options.outputDirectory, "build-manifest.json"), "utf8"));
  assert.equal(manifest.pages["news/index.html"].contentPublishedAt, "2020-02-22T00:00:00.000Z");
});

test("ignoriert Abrufzeiten, aktualisiert nur betroffene Inhalte und entfernt veraltete Seiten", async (t) => {
  const input = fixture();
  const options = await setup(t, input);
  await buildSite(options);
  const newsPath = path.join(options.outputDirectory, "news/index.html");
  const before = await readFile(newsPath, "utf8");
  input.videos.fetchedAt = "2099-01-01T00:00:00Z";
  input.playlists.lastModified = "2099-01-01T00:00:00Z";
  input.magazines.generatedAt = "2099-01-01T00:00:00Z";
  await options.save(input);
  const unchanged = await buildSite(options);
  assert.equal(unchanged.reused, unchanged.files);
  input.videos.videos[0].description = "Korrektur an einem alten Video";
  await options.save(input);
  const changed = await buildSite(options);
  assert.equal(changed.files - changed.reused, 2); // Katalogseite und Manifest.
  assert.equal(await readFile(newsPath, "utf8"), before);
  input.videos.videos.pop();
  const legacy = path.join(options.outputDirectory, "videos/b0000000052");
  await mkdir(legacy, { recursive: true });
  await writeFile(path.join(legacy, "index.html"), "Alte Videoseite");
  await options.save(input);
  await buildSite(options);
  await assert.rejects(stat(path.join(options.outputDirectory, "videos/b0000000052/index.html")), { code: "ENOENT" });
  assert.notEqual(await readFile(newsPath, "utf8"), before);
});

test("erhält den letzten erfolgreichen Build bei ungültigen oder fehlenden Quelldaten", async (t) => {
  const input = fixture(1);
  const options = await setup(t, input);
  await buildSite(options);
  const previous = await readFile(path.join(options.outputDirectory, "index.html"), "utf8");
  input.playlists.complete = false;
  await options.save(input);
  await assert.rejects(buildSite(options), /nicht vollständig/u);
  assert.equal(await readFile(path.join(options.outputDirectory, "index.html"), "utf8"), previous);
  await rm(path.join(options.cacheDirectory, "youtube-videos.json"));
  await assert.rejects(buildSite(options), /Quelldatei kann nicht gelesen werden/u);
});

test("erkennt neue Themenlinks als Inhaltsänderung, ohne einen neuen Veröffentlichungszeitpunkt zu erfinden", async (t) => {
  const input = fixture(1);
  const options = await setup(t, input);
  await buildSite(options);
  const manifestFile = path.join(options.outputDirectory, "build-manifest.json");
  const first = JSON.parse(await readFile(manifestFile, "utf8")).pages["news/index.html"];
  input.magazines.videos = [{
    id: input.videos.videos[0].id,
    magazines: [{
      name: "Amiga Joker", issue: null,
      kultmags: { match: "magazine", pageUrl: "https://www.kultmags.com/mags.php?folder=test" },
    }],
  }];
  await options.save(input);
  await buildSite(options);
  const second = JSON.parse(await readFile(manifestFile, "utf8")).pages["news/index.html"];
  assert.notEqual(first.fingerprint, second.fingerprint);
  assert.equal(first.contentPublishedAt, second.contentPublishedAt);
  assert.ok((await readFile(path.join(options.outputDirectory, "news/index.html"), "utf8")).includes("Amiga Joker"));
  assert.ok((await readFile(path.join(options.outputDirectory, "zeitschriften/amiga-joker/index.html"), "utf8")).includes("kultmags.com/mags.php?folder=test"));
});

test("unterstützt lokale Vorschau-Basis und verweigert das Überschreiben von Quellen", async (t) => {
  const options = await setup(t, fixture(1));
  await buildSite({ ...options, baseUrl: "http://localhost:4173/" });
  const html = await readFile(path.join(options.outputDirectory, "index.html"), "utf8");
  assert.ok(html.includes('href="/videos/"'));
  assert.ok(html.includes('href="http://localhost:4173/"'));
  await assert.rejects(buildSite({ ...options, outputDirectory: options.cacheDirectory }), /Unsicheres Ausgabeverzeichnis/u);
});
