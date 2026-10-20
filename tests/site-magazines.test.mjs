import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { generateSite, validateSite } from "../src/site-generation/generate-site.mjs";
import { createSiteConfig, slugify } from "../src/site-generation/site-config.mjs";
import { normalizeSources } from "../src/site-generation/site-data.mjs";
import { renderSite } from "../src/site-generation/site-render.mjs";
import { loadSiteData } from "../src/site-generation/site-data.mjs";
import { cacheMagazineLogo } from "../src/fetch-magazine/kultmags-logos.mjs";
import { magazineGuestChannels } from "../src/data/data-magazine-guest-channels.mjs";

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

function render(input = variedFixture(), pageSize = createSiteConfig().pageSize) {
  const model = normalizeSources(input);
  const config = { ...createSiteConfig(), pageSize };
  const pages = renderSite(model, config, config.href("assets/test.css"));
  validateSite(pages, new Map([["assets/test.css", "body{}"], ["assets/video-series.js", ""], ["assets/theme.js", ""], ["favicon.webp", ""], ["apple-touch-icon.png", ""]]), config);
  return { model, pages, config };
}

const graph = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)[1])["@graph"];

test("entfernt redundante Zeitschriften-Linklisten nur aus Zeitschriftenseiten und erhält die Navigation", () => {
  const { model, pages } = render();
  for (const [file, { html }] of pages) {
    if (!file.startsWith("zeitschriften/")) continue;
    assert.ok(!html.includes(">Blätterabend / Zeitschriften</a>:"), file);
    assert.ok(html.includes('aria-label="Brotkrümelnavigation"'), file);
  }
  const magazine = model.magazines.find((item) => item.name === "PC Games");
  const issue = [...magazine.issues.values()].find((item) => item.year === 1992 && item.months.includes(11));
  const html = pages.get(`${magazine.route}index.html`).html;
  assert.ok(html.includes(`href="${createSiteConfig().forPage(magazine.route).href(issue.route)}#video-`));
  assert.ok(pages.get("news/index.html").html.includes(">Blätterabend / Zeitschriften</a>:"));
});

test("stimmt Zeitschriften-H1, Fließtext und Meta-Beschreibung auch auf Folgeseiten aufeinander ab", async () => {
  const realModel = await loadSiteData(new URL("../cache/", import.meta.url).pathname);
  const guestInput = fixture(5);
  guestInput.videos.videos.forEach((video) => { video.title = "Blätterabend mit Anna"; });
  const models = [
    realModel,
    normalizeSources(variedFixture()),
    normalizeSources(guestInput),
  ];
  const entities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
  const text = (html) => html.replace(/<span\b[^>]*class="visually-hidden"[^>]*>[\s\S]*?<\/span>/gu, "")
    .replace(/<[^>]+>/gu, " ").replace(/&(?:amp|lt|gt|quot|#39);/gu, (entity) => entities[entity]);
  const words = (value) => text(value).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  let checked = 0;
  for (const model of models) {
    const config = { ...createSiteConfig(), pageSize: 2 };
    const pages = renderSite(model, config, "assets/test.css");
    for (const [file, { html }] of pages) {
      if (!file.startsWith("zeitschriften/")) continue;
      const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/u)[1];
      const heading = main.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/u)[1];
      const paragraphs = [...main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gu)].map((match) => match[1]).join(" ");
      const description = html.match(/<meta name="description" content="([^"]+)">/u)[1];
      const proseWords = new Set(words(paragraphs));
      const descriptionWords = new Set(words(description));
      for (const word of words(heading)) {
        assert.ok(proseWords.has(word), `${file}: H1-Wort "${word}" fehlt im Fließtext.`);
        assert.ok(descriptionWords.has(word), `${file}: H1-Wort "${word}" fehlt in der Meta-Beschreibung.`);
      }
      checked++;
    }
  }
  assert.ok(checked > realModel.magazines.length);
});

test("ergänzt den Steinwallen-Blätterabend ohne mit-Zusatz samt Ausgabe und aktualisierten Kachelzahlen", async () => {
  const model = await loadSiteData("cache");
  const guest = model.magazineGuests.find((item) => item.key === "@steinwallen");
  assert.ok(guest.videoIds.includes("GMF5SxCxE6M"));
  assert.equal(guest.videoIds.length, new Set(guest.videoIds).size);
  assert.ok(guest.entries.some((entry) => entry.videoId === "GMF5SxCxE6M"
    && entry.mention.name === "Power Play"));
  const config = createSiteConfig();
  const pages = renderSite(model, config, config.href("assets/test.css"));
  const html = pages.get(`${guest.route}index.html`).html;
  assert.ok(html.includes("Strategie für Geniesser"));
  assert.ok(html.includes(`${guest.videoIds.length} Videos,`));
  assert.ok(pages.get("zeitschriften/index.html").html.includes(
    `<p class="meta">${guest.videoIds.length} Videos</p>`));
});

test("bündelt Gäste dynamisch nach Handle und verlinkt deren Ausgaben mit passendem Heftkontext", () => {
  const input = fixture(5);
  input.videos.videos[0].title = "Blätterabend mit Robin @retrokompott - PC Games";
  input.videos.videos[1].title = "Blätterabend mit @RetroKompott - PC Games - Teil 2";
  input.videos.videos[2].title = "Blätterabend mit @retrokompott - Power Play";
  input.videos.videos[3].title = "Blätterabend mit Chat-Vote - PC Games";
  input.videos.videos[4].title = "Blätterabend mit Gast außerhalb des Blätterabends";
  input.magazines.videos.pop();
  input.magazines.videos[0].part = 1;
  input.magazines.videos[1].part = 2;
  input.magazines.videos[0].magazines[0].kultmags = archive("guest-issue");
  input.magazines.videos[2].magazines = [mention(issue(), "Power Play")];
  const { model, pages, config } = render(input);
  assert.equal(model.magazineGuests.length, 1);
  const guest = model.magazineGuests[0];
  assert.equal(guest.name, "Robin @retrokompott");
  assert.equal(guest.route, "zeitschriften/gaeste/retrokompott/");
  assert.equal(guest.issueCount, 2);
  assert.equal(guest.videoIds.length, 3);
  const index = pages.get("zeitschriften/index.html").html;
  assert.ok(index.includes('<h2 id="gaeste">Blätterabend mit Gast</h2>'));
  assert.ok(index.includes('href="gaeste/retrokompott/">Robin @retrokompott</a>'));
  assert.ok(index.includes('<p class="meta">2 bekannte Ausgaben</p><p class="meta">3 Videos</p>'));
  const html = pages.get(`${guest.route}index.html`).html;
  assert.ok(!html.includes("Gäste werden aus den Videotiteln ermittelt."));
  assert.ok(!html.includes("data-video-series") && !html.includes('script type="module"'));
  assert.equal((html.match(/<section class="issue-group">/gu) ?? []).length, 2);
  for (const magazine of model.magazines) {
    const issue = [...magazine.issues.values()][0];
    assert.ok(html.includes(`href="${config.href(issue.route, guest.route)}"`));
  }
  assert.ok(html.includes("guest-issue"));
  assert.ok(html.includes("Teil 1: Blätterabend"));
  assert.ok(!html.includes("Chat-Vote"));
  assert.ok(!html.includes("außerhalb des Blätterabends"));
  assert.deepEqual(graph(html).at(-1).itemListElement.map((item) => item.name),
    ["Startseite", "Zeitschriften", "Robin @retrokompott"]);
  const original = [...pages];
  input.videos.videos.reverse();
  input.magazines.videos.reverse();
  assert.deepEqual([...render(input).pages], original);
});

test("lässt unbekannte Heftdaten und ungeklärte Zeitschriften auf Gästeseiten sichtbar", () => {
  const input = fixture(2);
  for (const video of input.videos.videos) video.title = "Blätterabend mit Jürgen";
  input.magazines.videos[0].magazines = [mention(null)];
  input.magazines.videos[1].magazines = [];
  const { pages, model } = render(input);
  const guest = model.magazineGuests[0];
  assert.equal(guest.issueCount, 0);
  const html = pages.get(`${guest.route}index.html`).html;
  assert.ok(html.includes("Jahrgang unbekannt"));
  assert.ok(html.includes("Heftausgabe unbekannt"));
  assert.ok(html.includes("Zeitschrift ungeklärt"));
  assert.ok(html.includes(`href="../../videos/blatterabend-mit-jurgen/#video-${videoId(0)}"`));
  assert.ok(html.includes(`href="../../videos/blatterabend-mit-jurgen-2/#video-${videoId(1)}"`));
  const index = pages.get("zeitschriften/index.html").html;
  assert.ok(index.includes("Ausgabe ungeklärt"));
  assert.ok(index.includes("Weitere Blätterabende"));
});

test("verlinkt nur statisch bestätigte @Gäste in der Überschrift, nicht in Seitentitel oder Brotkrümeln", () => {
  assert.equal(Object.values(magazineGuestChannels).filter(Boolean).length, 14);
  assert.equal(magazineGuestChannels["@v3to_c64pixels"], "https://www.youtube.com/@vetodrom");
  assert.equal(magazineGuestChannels["@virtual_dimension"], magazineGuestChannels["@virtualdimension"]);
  for (const [name, url] of [
    ...Object.entries(magazineGuestChannels),
    ["@UngepruefterGast", null], ["Jürgen", null],
    ["Christian @StayForeverDE", magazineGuestChannels["@stayforeverde"]],
    ["Robin @RetroKompott", magazineGuestChannels["@retrokompott"]],
  ]) {
    const input = fixture(1);
    input.videos.videos[0].title = `Blätterabend mit ${name} - PC Games`;
    const { model, pages } = render(input);
    const guest = model.magazineGuests[0];
    assert.equal(guest.channelUrl, url);
    const html = pages.get(`${guest.route}index.html`).html;
    const heading = html.match(/<h1>(.*?)<\/h1>/u)[1];
    if (url) {
      assert.match(url, /^https:\/\/www\.youtube\.com\/@[\p{L}\p{M}\p{N}_.-]+$/u);
      assert.ok(heading.includes(`href="${url}" rel="external"`), name);
      assert.ok(heading.includes(`>${name.slice(name.indexOf("@"))} <span aria-hidden="true">↗</span>`));
      assert.ok(heading.startsWith(`Blätterabend mit ${name.slice(0, name.indexOf("@"))}<a `));
    } else {
      assert.equal(heading, `Blätterabend mit ${name}`);
    }
    assert.ok(html.includes(`<title>Blätterabend mit ${name} |`));
    assert.deepEqual(graph(html).at(-1).itemListElement.map((item) => item.name),
      ["Startseite", "Zeitschriften", name]);
  }
});

test("erhält den statischen Kanallink auch auf Folgeseiten eines Gasts", () => {
  const input = fixture(3);
  input.videos.videos.forEach((video, index) => {
    video.title = "Blätterabend mit Robin @retrokompott - PC Games";
    input.magazines.videos[index].magazines = [mention(issue(1992, [index + 1]))];
  });
  const { pages, model } = render(input, 2);
  const route = model.magazineGuests[0].route;
  for (const suffix of ["index.html", "seite/2/index.html"]) {
    const heading = pages.get(`${route}${suffix}`).html.match(/<h1>(.*?)<\/h1>/u)[1];
    assert.ok(heading.includes(`href="${magazineGuestChannels["@retrokompott"]}" rel="external"`));
    assert.ok(heading.startsWith("Blätterabend mit Robin <a "));
    assert.equal(heading.endsWith(" – Seite 2"), suffix.startsWith("seite/"));
  }
});

test("paginiert Gäste im Blätterabendindex und deren Ausgaben mit relativen Links", () => {
  const input = fixture(5);
  input.videos.videos.forEach((video, index) => {
    video.title = `Blätterabend mit ${index < 3 ? "Anna" : "Ben"} - PC Games`;
    input.magazines.videos[index].magazines = [mention(issue(1992, [index + 1]))];
  });
  const { model, pages, config } = render(input, 2);
  assert.ok(pages.get("zeitschriften/index.html").html.includes('href="gaeste/anna/"'));
  assert.ok(pages.get("zeitschriften/seite/2/index.html").html.includes('href="../../gaeste/ben/"'));
  const guest = model.magazineGuests.find((item) => item.name === "Anna");
  const nextRoute = `${guest.route}seite/2/`;
  const first = pages.get(`${guest.route}index.html`).html;
  const second = pages.get(`${nextRoute}index.html`).html;
  assert.equal(graph(first)[0].mainEntity.itemListElement.length, 2);
  assert.equal(graph(second)[0].mainEntity.itemListElement.length, 1);
  assert.ok(first.includes(`href="${config.href(nextRoute, guest.route)}" rel="next"`));
  assert.ok(second.includes(`href="${config.href(guest.route, nextRoute)}" rel="prev"`));
  assert.ok(!pages.has(`${guest.route}seite/3/index.html`));
  const relocatedConfig = createSiteConfig("https://example.org/anderer/pfad/");
  relocatedConfig.pageSize = 2;
  const relocated = renderSite(model, relocatedConfig, "assets/test.css");
  assert.deepEqual([...relocated], [...pages].map(([file, page]) => [
    file, { ...page, html: page.html.replaceAll(config.baseUrl, relocatedConfig.baseUrl) },
  ]));
});

test("trennt kollidierende Gäste-Slugs und escapet Namen in Kacheln und Gästeseiten", () => {
  const input = fixture(4);
  ["Anna", "@Anna", "Jürgen", "J'urgen"].forEach((name, index) => {
    input.videos.videos[index].title = `Blätterabend mit ${name}`;
  });
  const { model, pages } = render(input);
  assert.equal(new Set(model.magazineGuests.map((guest) => guest.route)).size, 4);
  for (const guest of model.magazineGuests) {
    assert.ok(pages.has(`${guest.route}index.html`));
    assert.ok(pages.get("zeitschriften/index.html").html.includes(guest.route.replace("zeitschriften/", "")));
  }
  assert.ok(pages.get("zeitschriften/index.html").html.includes("J&#39;urgen"));
});

test("aktualisiert Gästeseiten, Sitemap und Manifest beim Ändern der Videotitel", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "pixel-magazine-guests-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cacheDirectory = path.join(root, "cache");
  const outputDirectory = path.join(root, "docs");
  await mkdir(cacheDirectory);
  const input = fixture(1);
  input.videos.videos[0].title = "Blätterabend mit Anna - PC Games";
  const save = () => Promise.all([
    ["youtube-videos", input.videos], ["youtube-playlists", input.playlists], ["blaetterabend-videos", input.magazines],
  ].map(([name, data]) => writeFile(path.join(cacheDirectory, `${name}.json`), JSON.stringify(data))));
  const options = { cacheDirectory, outputDirectory, logger: { log() {}, warn() {} } };
  await save();
  await generateSite(options);
  const file = "zeitschriften/gaeste/anna/index.html";
  assert.ok((await readFile(path.join(outputDirectory, "sitemap.xml"), "utf8")).includes("/zeitschriften/gaeste/anna/"));
  assert.ok(JSON.parse(await readFile(path.join(outputDirectory, "build-manifest.json"), "utf8")).pages[file]);
  const unchanged = await generateSite(options);
  assert.equal(unchanged.reused, unchanged.files);
  input.videos.videos[0].title = "Blätterabend ohne Gast";
  await save();
  await generateSite(options);
  await assert.rejects(readFile(path.join(outputDirectory, file)), { code: "ENOENT" });
  assert.ok(!(await readFile(path.join(outputDirectory, "sitemap.xml"), "utf8")).includes("/gaeste/"));
  assert.ok(!JSON.parse(await readFile(path.join(outputDirectory, "build-manifest.json"), "utf8")).pages[file]);
  assert.ok(!(await readFile(path.join(outputDirectory, "zeitschriften/index.html"), "utf8")).includes('id="gaeste"'));
});

test("übernimmt Kultmags-Logos offline als lokale Bildassets nur auf Zeitschriftenseiten", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "pixel-logos-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cacheDirectory = path.join(root, "cache");
  const cacheDir = path.join(cacheDirectory, "kultmags");
  await mkdir(path.join(cacheDir, "magazines"), { recursive: true });
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4////fwAJ+wP9CNHoHgAAAABJRU5ErkJggg==", "base64");
  const logo = await cacheMagazineLogo("https://www.kultmags.com/PC-Games/title.png", cacheDir, {
    fetchResponse: async (_url, options) => {
      assert.equal(options.redirect, "error");
      return new Response(bytes);
    },
  });
  const source = fixture(1);
  for (const [name, data] of [
    ["youtube-videos", source.videos], ["youtube-playlists", source.playlists], ["blaetterabend-videos", source.magazines],
  ]) await writeFile(path.join(cacheDirectory, `${name}.json`), JSON.stringify(data));
  await writeFile(path.join(cacheDir, "index.json"), JSON.stringify({ magazines: [{ name: "PC-Games" }] }));
  await writeFile(path.join(cacheDir, "magazines", "pc-games.json"), JSON.stringify({
    name: "PC-Games", url: "https://www.kultmags.com/mags.php?folder=UEMtR2FtZXM%3D", logo,
  }));
  const outputDirectory = path.join(root, "docs");
  const result = await generateSite({ cacheDirectory, outputDirectory, logger: { log() {}, warn() {} } });
  assert.ok(result.pages > 0);
  const detail = await readFile(path.join(outputDirectory, "zeitschriften/pc-games/index.html"), "utf8");
  const model = await loadSiteData(cacheDirectory);
  const attachedLogo = model.magazines.find((magazine) => magazine.name === "PC Games").logo;
  assert.ok(detail.includes(`src="../../${attachedLogo.asset}"`));
  for (const candidate of attachedLogo.candidates) {
    assert.ok(detail.includes(`srcset="../../${candidate.asset}"`));
  }
  assert.ok(detail.includes('alt="PC Games – Zeitschriftenlogo"'));
  assert.ok(detail.includes("Logoquelle: kultmags.com"));
  assert.ok(!detail.includes('<img src="https://www.kultmags.com'));
  assert.deepEqual(await readFile(path.join(outputDirectory, "assets/magazine-logos", logo.file)), bytes);
  const pages = renderSite(model, createSiteConfig(), "assets/test.css");
  for (const [file, page] of pages) {
    if (file === "zeitschriften/pc-games/index.html") continue;
    assert.ok(!page.html.includes('class="magazine-logo"'), file);
  }
  await writeFile(path.join(cacheDir, "logos", logo.file), "beschädigt");
  await assert.rejects(loadSiteData(cacheDirectory), /Bildformat|Logo-Inhalt/u);
});

test("lehnt nicht-bildliche und übergroße Kultmags-Logoantworten ab", async (t) => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "pixel-invalid-logo-"));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  for (const bytes of [Buffer.from("<html>Fehler</html>"), Buffer.alloc(2 * 1024 * 1024 + 1)]) {
    await assert.rejects(cacheMagazineLogo("https://www.kultmags.com/title.png", cacheDir, {
      fetchResponse: async () => new Response(bytes),
    }), /Bildformat|2 MiB/u);
  }
});

test("zeigt Zeitschriften als Kachelliste mit Titel, Videos und Jahrgängen", () => {
  const { pages } = render();
  const html = pages.get("zeitschriften/index.html").html;
  const grid = html.match(/<ul class="catalog-grid">[\s\S]*?<\/ul>/u)[0];
  assert.equal((grid.match(/<li><h2><a /gu) ?? []).length, 3);
  assert.ok(grid.includes('href="amiga-joker/">Amiga Joker</a></h2><p class="meta">1 Jahrgang</p><p class="meta">1 Video</p><p class="meta">Gesamtlaufzeit: 0:02 h</p>'));
  assert.ok(grid.includes('<p class="meta">2 Jahrgänge</p>'));
  const detail = pages.get("zeitschriften/amiga-joker/index.html").html;
  assert.ok(detail.includes("<p>Blätterabend-Videos zu Amiga Joker: 1 Video."));
  assert.ok(!detail.includes('class="year-list"'));
  assert.ok(!pages.has("zeitschriften/amiga-joker/1991/index.html"));
  assert.ok(pages.get("zeitschriften/pc-games/index.html").html.includes('class="year-list"'));
  for (const page of pages.values()) {
    assert.ok(!/href="[^"]*amiga-joker\/1991\//u.test(page.html));
  }
  assert.ok(grid.indexOf(">Amiga Joker</a>") < grid.indexOf(">PC Games</a>"));
});

test("entfernt frühere Jahrgangsseiten beim Wechsel zu nur einem Jahrgang", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "pixel-single-year-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cacheDirectory = path.join(directory, "cache");
  const outputDirectory = path.join(directory, "docs");
  await mkdir(cacheDirectory);
  const input = fixture(2);
  input.magazines.videos[1].magazines[0].issue = issue(1993, [1]);
  async function build() {
    for (const [name, data] of [["youtube-videos", input.videos], ["youtube-playlists", input.playlists], ["blaetterabend-videos", input.magazines]]) {
      await writeFile(path.join(cacheDirectory, `${name}.json`), JSON.stringify(data));
    }
    await generateSite({ cacheDirectory, outputDirectory, logger: { log() {}, warn() {} } });
  }
  await build();
  for (const year of [1992, 1993]) {
    assert.ok(await stat(path.join(outputDirectory, `zeitschriften/pc-games/${year}/index.html`)));
  }
  input.magazines.videos[1].magazines[0].issue = issue(1992, [12]);
  await build();
  for (const year of [1992, 1993]) {
    await assert.rejects(stat(path.join(outputDirectory, `zeitschriften/pc-games/${year}/index.html`)), { code: "ENOENT" });
  }
  const sitemap = await readFile(path.join(outputDirectory, "sitemap.xml"), "utf8");
  assert.ok(!/zeitschriften\/pc-games\/199[23]\//u.test(sitemap));
});

test("verlinkt unbekannte Ausgaben mehrerer Zeitschriften auf eine gemeinsame Videodetailseite", () => {
  const input = fixture(1);
  input.magazines.videos[0].magazines = ["ASM", "PC Player", "PC Power"].map((name) => ({
    ...mention(null, name),
    kultmags: { match: "magazine", pageUrl: "https://www.kultmags.com/mags.php?folder=test" },
  }));
  const { model, pages, config } = render(input);
  const video = model.videoById.get(videoId(0));
  const route = `zeitschriften/videos/${slugify(video.title)}/`;
  assert.equal(video.detailRoute, route);
  assert.equal([...pages.keys()].filter((file) => file.startsWith("zeitschriften/videos/")).length, 1);
  for (const source of ["zeitschriften/asm/", "zeitschriften/pc-player/", "zeitschriften/pc-power/", "news/"]) {
    const html = pages.get(`${source}index.html`).html;
    const target = `${config.href(route, source)}#video-${video.id}`;
    assert.ok(html.includes(`href="${target}">${video.title}</a>`));
    assert.ok(html.includes(`class="video-entry-thumbnail" href="${target}"`));
  }
  const detail = pages.get(`${route}index.html`).html;
  assert.ok(detail.includes(`id="video-${video.id}"`));
  assert.ok(detail.includes('class="detail-player"'));
  assert.ok(detail.includes('<div class="description">'));
  assert.ok(!detail.includes("<h3>Videobeschreibung</h3>"));
  assert.ok(detail.includes("Die genaue Heftausgabe ist unbekannt"));
  assert.ok(detail.includes("kultmags: Zeitschriftenübersicht"));
  for (const name of ["ASM", "PC Player", "PC Power"]) assert.ok(detail.includes(`<h4>${name}</h4>`));
  const schema = graph(detail).find((item) => item["@type"] === "VideoObject");
  assert.equal(schema.sameAs, video.url);
  assert.ok(schema.about.every((item) => item["@type"] === "Periodical"));
  assert.ok(!detail.includes('"@type":"PublicationIssue"'));
});

test("erhält unbekannte und uneindeutige Heftdaten auf Videodetailseiten ohne erfundene Ausgabe", () => {
  for (const data of [null, issue(1993, [], { label: "1993" })]) {
    const input = fixture(1);
    input.magazines.videos[0].magazines = [mention(data)];
    const { model, pages } = render(input);
    const video = model.videoById.get(videoId(0));
    assert.equal(model.magazines[0].issues.size, 0);
    const html = pages.get(`${video.detailRoute}index.html`).html;
    assert.ok(html.includes("<h4>PC Games"));
    assert.ok(html.includes("Die genaue Heftausgabe ist unbekannt."));
    assert.ok(!html.includes('"@type":"PublicationIssue"'));
  }
});

test("zeigt Archivlinks als dritte Metadatenspalte unter dem Player mit sichtbaren Texten statt separater Sektion", () => {
  const { pages } = render();
  const html = [...pages].find(([file, page]) => file.includes("/ausgaben/") && page.html.includes("PC Games 11/1992"))[1].html;
  const fields = html.match(/<dl class="detail-meta">([\s\S]*?)<\/dl>/u)[1];
  assert.deepEqual([...fields.matchAll(/<dt>(.*?)<\/dt>/gu)].map((match) => match[1]),
    ["Zeitschrift", "Ausgabe", "Archivlinks"]);
  assert.ok(fields.includes("Kein passender Archivlink vorhanden."));
  assert.ok(!html.includes("<h2>Archivlinks</h2>"));
  const input = fixture(1);
  input.magazines.videos[0].magazines[0].kultmags = archive("1992-11");
  const linked = [...render(input).pages].find(([file]) => file.includes("/ausgaben/"))[1].html;
  assert.ok(linked.includes('<span>kultmags: Heft lesen</span>'));
  assert.ok(linked.indexOf('class="detail-player"') < linked.indexOf("<dt>Archivlinks</dt>"));
});

test("behält Heftjahr, Nummer und Monate intern, ohne sie als zusätzliche Metadatenspalten zu zeigen", () => {
  const input = fixture(1);
  input.magazines.videos[0].magazines[0].issue = issue(1997, [10], { number: 1, label: "1/1997" });
  const { model, pages } = render(input);
  const entity = [...model.magazines[0].issues.values()][0];
  assert.equal(entity.year, 1997);
  assert.equal(entity.number, 1);
  assert.deepEqual(entity.months, [10]);
  assert.ok(!pages.has("zeitschriften/pc-games/1997/index.html"));
  assert.equal(model.videoById.get(videoId(0)).magazines[0].yearRoute, null);
  const html = pages.get(`${entity.route}index.html`).html;
  for (const label of ["Erscheinungsjahr", "Heftnummer", "Monat(e)"]) {
    assert.ok(!html.includes(`<dt>${label}</dt>`));
  }
});

test("summiert Laufzeiten je Zeitschrift unabhängig von der Heftzuordnung und markiert Teilsummen", () => {
  const input = fixture(4);
  input.videos.videos[0].durationSeconds = 3601;
  input.videos.videos[1].durationSeconds = 59;
  input.videos.videos[2].durationSeconds = null;
  input.videos.videos[3].durationSeconds = 99999;
  input.magazines.videos[0].magazines.push(mention(null, "Amiga Joker"));
  input.magazines.videos[1].magazines.push(mention(null, "Amiga Joker"));
  input.magazines.videos[2].magazines = [mention(null), mention(null, "Unbekannte Laufzeit")];
  input.magazines.videos[3].magazines = [];
  const { pages } = render(input);
  const grid = pages.get("zeitschriften/index.html").html.match(/<ul class="catalog-grid">[\s\S]*?<\/ul>/u)[0];
  assert.ok(grid.includes('>Amiga Joker</a></h2><p class="meta">2 Videos</p><p class="meta">Gesamtlaufzeit: 1:01 h</p></li>'));
  assert.ok(grid.includes('>PC Games</a></h2><p class="meta">1 Jahrgang</p><p class="meta">3 Videos</p><p class="meta">Bekannte Laufzeit: 1:01 h (2 von 3 Videos)</p>'));
  assert.ok(grid.includes('>Unbekannte Laufzeit</a></h2><p class="meta">1 Video</p><p class="meta">Gesamtlaufzeit unbekannt</p></li>'));
  assert.ok(!grid.includes("0 Jahrgänge"));
});

test("lässt die Jahrgangsanzahl bei ACE mit bekannter Heftnummer ohne Heftjahr weg", () => {
  const input = fixture(1);
  input.videos.videos[0].title = "Blätterabend - ACE No. 49";
  input.magazines.videos[0].magazines = [mention(issue(null, [], { number: 49, label: "#49" }), "ACE")];
  const { model, pages } = render(input);
  assert.equal(model.magazines[0].years.length, 0);
  const grid = pages.get("zeitschriften/index.html").html.match(/<ul class="catalog-grid">[\s\S]*?<\/ul>/u)[0];
  assert.ok(grid.includes('>ACE</a></h2><p class="meta">1 Video</p><p class="meta">Gesamtlaufzeit: 0:02 h</p></li>'));
  assert.ok(!grid.includes("Jahrgang"));
  assert.ok(pages.get("zeitschriften/ace/index.html").html.includes("#49"));
  const entity = [...model.magazines[0].issues.values()][0];
  assert.equal(entity.year, null);
  assert.equal(entity.label, "#49");
  assert.equal(entity.route, "zeitschriften/ace/ausgaben/ace-49/");
  const overview = pages.get("zeitschriften/ace/index.html").html;
  assert.ok(overview.includes('href="ausgaben/ace-49/">ACE #49</a>'));
  assert.ok(overview.includes(`href="ausgaben/ace-49/#video-${videoId(0)}"`));
  assert.ok(overview.includes(`class="video-entry-thumbnail" href="ausgaben/ace-49/#video-${videoId(0)}"`));
  const detail = pages.get(`${entity.route}index.html`).html;
  assert.ok(detail.includes(`id="video-${videoId(0)}"`));
  assert.ok(detail.includes("Kein passender Archivlink vorhanden."));
  const schema = graph(detail).find((item) => item["@type"] === "PublicationIssue");
  assert.equal(schema.issueNumber, 49);
  assert.ok(!("temporalCoverage" in schema));
  assert.ok(!detail.includes("ACE #49 null"));
});

test("paginiert den Zeitschriftenindex erst ab der 61. Kachel", () => {
  const input = fixture(61);
  input.magazines.videos.forEach((entry, index) => {
    entry.magazines = [mention(issue(), `Zeitschrift ${String(index).padStart(3, "0")}`)];
  });
  const { pages } = render(input);
  for (const [route, count] of [["zeitschriften/index.html", 60], ["zeitschriften/seite/2/index.html", 1]]) {
    const grid = pages.get(route).html.match(/<ul class="catalog-grid">[\s\S]*?<\/ul>/u)[0];
    assert.equal((grid.match(/<li><h2><a /gu) ?? []).length, count);
    assert.equal(graph(pages.get(route).html)[0].mainEntity.itemListElement.length, count);
  }
  input.magazines.videos.pop();
  assert.ok(!render(input).pages.has("zeitschriften/seite/2/index.html"));
});

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
  assert.ok(pages.get("zeitschriften/pc-games/1993/index.html").html.includes("<h3>PC Games 1993</h3>"));
  assert.ok(pages.get("zeitschriften/pc-games/index.html").html.includes("Jahrgang unbekannt"));
  assert.ok(pages.get("zeitschriften/index.html").html.includes("Weitere Blätterabende"));
});

test("benennt Jahrgänge neutral und zeigt Einträge ohne Heftjahr erst nach bekannten Jahrgängen", () => {
  const { pages } = render();
  const overview = pages.get("zeitschriften/pc-games/index.html").html;
  const headings = [...overview.matchAll(/<h2>([^<]+)<\/h2>/gu)].map((match) => match[1]);
  assert.deepEqual(headings, [
    "Jahrgang 1992 – Ausgaben",
    "Jahrgang 1992 – Sonderhefte",
    "Jahrgang 1993 – Ausgaben",
    "Jahrgang unbekannt – Ausgaben",
  ]);
  const year = pages.get("zeitschriften/pc-games/1992/index.html").html;
  assert.ok(year.includes("<h2>Jahrgang 1992 – Ausgaben</h2>"));
  assert.ok(year.includes("<h2>Jahrgang 1992 – Sonderhefte</h2>"));
  assert.ok(!year.includes("Jahrgang unbekannt"));
  assert.ok(!overview.includes("Reguläre und ungeklärte Ausgaben"));
  const knownYearOnly = pages.get("zeitschriften/pc-games/1993/index.html").html;
  assert.ok(knownYearOnly.includes("<h2>Jahrgang 1993 – Ausgaben</h2>"));
  assert.ok(knownYearOnly.includes("<h3>PC Games 1993</h3>"));
});

test("erhält den chronologischen Platz unnummerierter Videos und sortiert bekannte Teile relativ zueinander", () => {
  const input = fixture(4);
  input.magazines.videos[1].part = 3;
  input.magazines.videos[3].part = 2;
  const { model, pages } = render(input);
  const entity = [...model.magazines[0].issues.values()][0];
  assert.deepEqual(entity.videos, [videoId(0), videoId(3), videoId(2), videoId(1)]);
  const html = pages.get(`${entity.route}index.html`).html;
  const menu = html.match(/<details class="episode-menu"[\s\S]*?<\/details>/u)[0];
  assert.ok(menu.indexOf(`href="#video-${videoId(0)}"`) < menu.indexOf(`href="#video-${videoId(3)}"`));
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
  assert.equal(unresolved.issue.label, "#148");
  assert.ok(unresolved.issue.route);
  assert.notEqual(unresolved.issue.route, entity.route);
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
  assert.equal(schema.url, "./");
  assert.deepEqual(graph(detail).find((item) => item["@type"] === "CollectionPage").mainEntity.itemListElement.map((item) => item.url),
    november.videos.map((id) => `./#video-${id}`));
  assert.equal(schema.datePublished, undefined);
  assert.ok(detail.includes(`href="${config.href("zeitschriften/pc-games/1992/", november.route)}"`));
  assert.ok(!detail.includes("Mit Video 1/3 beginnen"));
  const menu = detail.match(/<details class="episode-menu"[\s\S]*?<\/details>/u)[0];
  assert.ok(menu.indexOf('href="#video-m0000000001"') < menu.indexOf('href="#video-m0000000000"'));
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
    assert.ok(news.includes(`href="${config.href(route, "news/")}"`), route);
  }
  assert.ok(news.includes(`href="${config.href(mention.issue.route, "news/")}#video-${videoId(0)}"`));
  const html = pages.get(`${mention.issue.route}index.html`).html;
  assert.ok(html.includes("Video 2/3: Blätterabend"));
  assert.ok(html.includes(`href="#video-${videoId(1)}">← Vorheriger Teil`));
  assert.ok(html.includes(`href="#video-${videoId(9)}">Nächster Teil`));
  const breadcrumb = graph(html).at(-1);
  assert.deepEqual(breadcrumb.itemListElement.map((item) => item.name), ["Startseite", "Zeitschriften", "PC Games", "PC Games 11/1992"]);
  const about = graph(html).find((item) => item["@type"] === "VideoObject").about[0];
  assert.equal(about["@type"], "PublicationIssue");
  assert.equal(about.isPartOf.name, "PC Games");
  assert.equal(about.url, "./");
  assert.equal([...pages.keys()].filter((file) => /^videos\/m/u.test(file)).length, 0);
  const other = model.videoById.get(videoId(9)).magazines.find((item) => item.id === "amiga-joker").issue;
  assert.ok(pages.get(`${other.route}index.html`).html.includes(`id="video-${videoId(9)}"`));
});

test("zeigt Archivsymbole einmal in Klammern neben dem Ausgabentitel statt an Videolinks", () => {
  const input = fixture(2);
  const links = {
    ...archive("1992-11"),
    downloadUrl: "https://www.kultmags.com/PC%20Games/1992-11.rar",
  };
  for (const entry of input.magazines.videos) entry.magazines[0].kultmags = links;
  const { model, pages } = render(input);
  const entity = [...model.magazines[0].issues.values()][0];
  for (const route of ["zeitschriften/pc-games/"]) {
    const html = pages.get(`${route}index.html`).html;
    const entries = [...html.matchAll(/<li><article>[\s\S]*?<\/article><\/li>/gu)];
    assert.equal(entries.length, 2);
    for (const [entry] of entries) {
      const href = entry.match(/<h4><a href="([^"]+)"/u)[1];
      assert.ok(entry.includes(`class="video-entry-thumbnail" href="${href}"`));
      assert.ok(entry.includes('loading="lazy"'));
      assert.ok(entry.includes('class="video-entry-content"'));
      assert.ok(!entry.includes('class="archive-icon"'));
      assert.ok(!entry.includes('class="archive-links"'));
    }
    const heading = html.match(/<section class="issue-group"><h3>([\s\S]*?)<\/h3>/u)[1];
    assert.ok(heading.includes('PC Games 11/1992</a> <span class="archive-links" aria-label="Archivlinks">('));
    assert.ok(heading.endsWith(")</span>"));
    {
      const entry = heading;
      assert.equal((entry.match(/class="archive-icon"/gu) ?? []).length, 3);
      assert.equal((entry.match(/<svg aria-hidden="true"/gu) ?? []).length, 3);
      for (const label of ["Archivordner zur Ausgabe", "Heft lesen", "Heft herunterladen"]) {
        assert.ok(entry.includes(`title="kultmags: ${label} (externe Website)"`));
        assert.ok(entry.includes(`<span class="visually-hidden">kultmags: ${label}</span>`));
      }
      assert.ok(entry.includes('href="https://reader.kultmags.com/1992-11" rel="external"'));
      assert.ok(entry.includes(`href="${links.downloadUrl}" rel="external"`));
    }
    assert.equal((html.match(/class="archive-links"/gu) ?? []).length, 1);
  }
  const detail = pages.get(`${entity.route}index.html`).html;
  assert.equal((detail.match(/class="archive-icon archive-icon-labelled"/gu) ?? []).length, 3);
});

test("zeigt bei bloßem Archivordner keine Lese- oder Downloadsymbole", () => {
  const input = fixture(1);
  input.magazines.videos[0].magazines[0] = {
    name: "PC Games", issue: null,
    kultmags: { ...archive("unknown"), match: "magazine", downloadUrl: "https://example.com/not-confirmed.rar" },
  };
  const { pages } = render(input);
  const html = pages.get("zeitschriften/pc-games/index.html").html;
  assert.equal((html.match(/class="archive-icon"/gu) ?? []).length, 1);
  assert.ok(html.includes("Zeitschriftenübersicht"));
  assert.ok(!html.includes("not-confirmed.rar"));
  assert.ok(!html.includes("Heft lesen"));
});

test("paginiert Übersichten mit 60 Videos, behält jedoch alle Videoteile auf einer Ausgabenseite", () => {
  const input = fixture(126);
  input.magazines.videos[125].magazines[0].issue = issue(1993, [1]);
  const { model, pages, config } = render(input);
  const magazine = model.magazines[0];
  const entity = [...magazine.issues.values()][0];
  for (const route of [magazine.route, `${magazine.route}1992/`]) {
    const first = pages.get(`${route}index.html`).html;
    const second = pages.get(`${route}seite/2/index.html`).html;
    const third = pages.get(`${route}seite/3/index.html`).html;
    assert.equal((first.match(/<li><article>/gu) ?? []).length, 60);
    assert.equal((second.match(/<li><article>/gu) ?? []).length, 60);
    assert.equal((third.match(/<li><article>/gu) ?? []).length, route === magazine.route ? 6 : 5);
    assert.ok(second.includes(`rel="canonical" href="${config.absolute(`${route}seite/2/`)}"`));
    assert.ok(second.includes('href="../../" rel="prev"'));
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
  assert.ok(!pages.has("zeitschriften/seite/3/index.html"));
  assert.ok(pages.get("zeitschriften/seite/2/index.html").html.includes("Weitere Blätterabende"));
  assert.equal(graph(pages.get("zeitschriften/seite/2/index.html").html)[0].mainEntity.itemListElement.length, 45);
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

test("benennt Ausgabepfade nach Zeitschrift und finalem Hefttitel statt technischen IDs", () => {
  const { model, pages } = render();
  const magazine = model.magazines.find((item) => item.id === "pc-games");
  const november = [...magazine.issues.values()].find((item) => item.months[0] === 11);
  assert.equal(november.route, "zeitschriften/pc-games/ausgaben/pc-games-11-1992/");
  const double = [...magazine.issues.values()].find((item) => item.months.length === 2);
  assert.equal(double.route, "zeitschriften/pc-games/ausgaben/pc-games-8-9-1992/");
  const cgw = [...model.magazines.find((item) => item.id === "computer-gaming-world").issues.values()][0];
  assert.equal(cgw.route, "zeitschriften/computer-gaming-world/ausgaben/computer-gaming-world-148-11-1996/");
  assert.ok(!november.route.includes(november.id));
  assert.ok(pages.has(`${november.route}index.html`));
  assert.ok(!pages.has(`zeitschriften/pc-games/ausgaben/${november.id}/index.html`));
  for (const id of november.videos) assert.equal(model.videoById.get(id).magazines.find((item) => item.id === magazine.id).issue.route, november.route);
});

test("unterscheidet gleichlautende Sonderhefttitel deterministisch und ohne Pfadkollision", () => {
  const input = fixture(3);
  input.magazines.videos.forEach((entry, index) => {
    entry.magazines = [{
      ...mention(issue(1992, [], { special: true, label: index === 2 ? "Sonderheft Variante 1" : "Sonderheft" })),
      kultmags: { ...archive(`special-${index}`), title: "" },
    }];
  });
  const first = normalizeSources(input);
  const routes = [...first.magazines[0].issues.values()].map((item) => item.route);
  assert.equal(new Set(routes).size, 3);
  assert.ok(routes.every((route) => /\/pc-games-sonderheft(?:-variante-\d+)?\/$/u.test(route)));
  input.magazines.videos.reverse();
  input.videos.videos.reverse();
  const second = normalizeSources(input);
  assert.deepEqual([...second.magazines[0].issues.values()].map((item) => [item.id, item.route]).sort(),
    [...first.magazines[0].issues.values()].map((item) => [item.id, item.route]).sort());
  render(input);
});

test("stellt Heft- und Videometadaten als kompaktes semantisches Raster dar", () => {
  const { model, pages } = render(fixture(2));
  const issue = [...model.magazines[0].issues.values()][0];
  const html = pages.get(`${issue.route}index.html`).html;
  assert.ok(html.includes('class="detail-layout"'));
  assert.ok(html.includes('<h1 class="detail-heading"'));
  assert.ok(html.indexOf('class="detail-player"') < html.indexOf('class="episode-menu"'));
  assert.ok(html.indexOf('class="detail-player"') < html.indexOf('<dl class="detail-meta">'));
  assert.equal((html.match(/<dl class="detail-meta">/gu) ?? []).length, 3);
  assert.ok(html.includes('<div><dt>Zeitschrift</dt><dd><a href="../../">PC Games</a></dd></div>'));
  assert.ok(html.includes("<div><dt>Ausgabe</dt><dd>11/1992</dd></div>"));
  assert.ok(html.includes("<div><dt>Veröffentlicht</dt><dd><time datetime="));
  assert.ok(html.includes("<div><dt>Länge</dt><dd>2:00</dd></div>"));
  assert.ok(!html.includes("<dt>Heftnummer</dt>"));
  const input = fixture(1);
  input.videos.videos[0].publishedAt = null;
  input.videos.videos[0].durationSeconds = null;
  const unknown = render(input);
  const detail = [...unknown.pages.values()].find((page) => page.route.includes("/ausgaben/")).html;
  assert.ok(detail.includes("<dt>Veröffentlicht</dt><dd>Veröffentlichungsdatum unbekannt</dd>"));
  assert.ok(!detail.includes("<dt>Länge</dt>"));
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
  const outputDirectory = path.join(directory, "docs");
  await mkdir(cacheDirectory);
  const input = variedFixture();
  async function save() {
    for (const [file, data] of [["youtube-videos", input.videos], ["youtube-playlists", input.playlists], ["blaetterabend-videos", input.magazines]]) {
      await writeFile(path.join(cacheDirectory, `${file}.json`), JSON.stringify(data));
    }
  }
  const options = { cacheDirectory, outputDirectory, logger: { log() {}, warn() {} } };
  await save();
  await generateSite(options);
  const legacyIssue = [...normalizeSources(input).magazines[0].issues.values()][0];
  const legacyDirectory = path.join(outputDirectory, normalizeSources(input).magazines[0].route, "ausgaben", legacyIssue.id);
  await mkdir(legacyDirectory, { recursive: true });
  const legacyFile = path.join(legacyDirectory, "index.html");
  await writeFile(legacyFile, "Veralteter technischer Ausgabepfad");
  const manifest = () => readFile(path.join(outputDirectory, "build-manifest.json"), "utf8").then(JSON.parse);
  const initial = await manifest();
  const untouched = "zeitschriften/amiga-joker/index.html";
  const removedIssue = [...normalizeSources(input).magazines.find((item) => item.id === "pc-games").issues.values()].find((item) => item.months[0] === 12);
  input.magazines.videos[2].magazines = [mention(issue(1994, [2]))];
  await save();
  await generateSite(options);
  await assert.rejects(stat(legacyFile), { code: "ENOENT" });
  const changed = await manifest();
  assert.equal(initial.pages[untouched].fingerprint, changed.pages[untouched].fingerprint);
  assert.notEqual(initial.pages["zeitschriften/pc-games/index.html"].fingerprint, changed.pages["zeitschriften/pc-games/index.html"].fingerprint);
  await assert.rejects(stat(path.join(outputDirectory, `${removedIssue.route}index.html`)), { code: "ENOENT" });
  assert.ok(changed.pages["zeitschriften/pc-games/1994/index.html"]);
  const news = changed.pages["news/index.html"];
  input.magazines.videos[3].magazines[0].kultmags.downloadUrl = "https://www.kultmags.com/added.pdf";
  await save();
  await generateSite(options);
  const linked = await manifest();
  assert.equal(news.fingerprint, linked.pages["news/index.html"].fingerprint);
  assert.equal(news.contentPublishedAt, linked.pages["news/index.html"].contentPublishedAt);
  const specialRoute = normalizeSources(input).videoById.get(videoId(3)).magazines[0].issue.route;
  assert.ok((await readFile(path.join(outputDirectory, `${specialRoute}index.html`), "utf8")).includes("added.pdf"));
  input.magazines.videos[6].magazines.push(mention(issue(1987, [4]), "Neue Zeitschrift"));
  await save();
  await generateSite(options);
  const newMagazine = await manifest();
  assert.ok(newMagazine.pages["zeitschriften/neue-zeitschrift/index.html"]);
  assert.ok(!newMagazine.pages["zeitschriften/neue-zeitschrift/1987/index.html"]);
  assert.ok((await readFile(path.join(outputDirectory, "news/index.html"), "utf8")).includes("/zeitschriften/neue-zeitschrift/"));
  const repeat = await generateSite(options);
  assert.equal(repeat.files, repeat.reused);
});
