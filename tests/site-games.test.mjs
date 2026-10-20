import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { generateSite, validateSite } from "../src/site-generation/generate-site.mjs";
import { gameDefinitions } from "../src/data/data-games.mjs";
import { createSiteConfig } from "../src/site-generation/site-config.mjs";
import { normalizeSources, loadSiteData } from "../src/site-generation/site-data.mjs";
import { renderSite } from "../src/site-generation/site-render.mjs";
import { escapeHtml } from "../src/site-generation/site-html.mjs";

const channel = { id: "UC-games", title: "Pretty Old Pixel" };
const videoId = (index) => `g${String(index).padStart(10, "0")}`;
const playlistId = "PLZW5k3rtbudqSHgAFraosQMdGOpK08alM";
const definition = (overrides = {}) => ({
  id: "cadaver", name: "Cadaver", playlistIds: [playlistId], videoIds: [], platforms: [], aliases: [],
  release: { year: 1990, source: "https://www.mobygames.com/game/42/" }, ...overrides,
});
const member = (index, position = index + 1) => ({ videoId: videoId(index), position, availability: "listed" });

function fixture(count = 3) {
  const videos = Array.from({ length: count }, (_, index) => ({
    id: videoId(index), title: `Cadaver [re.play - #${index}]`,
    description: index ? `Beschreibung ${index}` : "",
    publishedAt: new Date(Date.UTC(2020, 0, index + 1)).toISOString(),
  }));
  return {
    videos: { channel, complete: true, videos },
    playlists: { channel, complete: true, playlists: [{
      id: playlistId, title: "re.play - Cadaver", description: "",
      videos: videos.map((_, index) => member(index)).reverse(),
    }] },
    magazines: { channel, videos: [] },
  };
}

function render(input = fixture(), definitions = [definition()]) {
  const model = normalizeSources(input, { games: definitions });
  return renderModel(model);
}

function renderModel(model, config = createSiteConfig()) {
  const pages = renderSite(model, config, config.href("assets/test.css"));
  const budgets = validateSite(pages, new Map([["assets/test.css", ""], ["assets/video-series.js", ""], ["assets/theme.js", ""], ["favicon.webp", ""], ["apple-touch-icon.png", ""]]), config);
  return { model, config, pages, budgets };
}

function metadataModel(count = 2) {
  const model = normalizeSources(fixture(2), { games: Array.from({ length: count }, (_, index) => definition({
    id: `game-${String(index).padStart(2, "0")}`, name: `Spiel ${String(index).padStart(2, "0")}`,
    playlistIds: [], videoIds: [videoId(0), videoId(1)],
  })) });
  for (const game of model.games) {
    game.metadata = { status: "ready", data: {
      evidence: { sourceUrl: "https://www.mobygames.com/game/10/" },
      scope: { platforms: ["DOS"] }, genres: ["Simulation"],
      releases: [{ platform: "DOS", year: 1990, developer: "Studio", publisher: "Publisher",
        publisherLabel: null, countries: "Germany" }],
    } };
  }
  return model;
}

const graph = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)[1])["@graph"];

test("verlängert Spielüberschriften unter 20 Zeichen mit eindeutigem System und Seiteninhalt", () => {
  for (const [name, platforms, expected] of [
    ["Aces of the Pacific", ["MS-DOS"], "Aces of the Pacific - DOS"],
    ["Cadaver", ["Amiga"], "Cadaver - Amiga - Spielinformationen und Videos"],
    ["Aces of the Pacific", [], "Aces of the Pacific - Spielinformationen und Videos"],
    ["Aces of the Pacific", ["MS-DOS", "Amiga"], "Aces of the Pacific - Spielinformationen und Videos"],
    ["1234567890123456789", ["DOS"], "1234567890123456789 - DOS"],
    ["12345678901234567890", ["DOS"], "12345678901234567890"],
    ["Cadaver - Amiga", ["Amiga"], "Cadaver - Amiga - Spielinformationen und Videos"],
    ["Cadaver & <Demo>", ["<Amiga>"], "Cadaver & <Demo> - <Amiga>"],
    ["X", [], "X - Spielinformationen und Videos"],
    ["😀".repeat(10), [], `${"😀".repeat(10)} - Spielinformationen und Videos`],
    ["1234567890123", ["DOS"], "1234567890123 - DOS - Spielinformationen und Videos"],
    ["12345678901234", ["DOS"], "12345678901234 - DOS"],
  ]) {
    const { pages, model } = render(fixture(2), [definition({ name, platforms })]);
    const html = pages.get("spiele/cadaver/index.html").html;
    assert.ok(html.includes(`<h1 class="detail-heading" title="${escapeHtml(expected)}">${escapeHtml(expected)}</h1>`), name);
    assert.ok([...expected].length >= 20);
    assert.equal(model.games[0].name, name);
    assert.equal(graph(html).find((item) => item["@type"] === "VideoGame").name, name);
  }
});

test("nutzt ein eindeutiges System aus freigegebenen Metadaten für kurze Spielüberschriften", () => {
  const model = metadataModel(1);
  let html = renderModel(model).pages.get("spiele/game-00/index.html").html;
  assert.ok(html.includes('<h1 class="detail-heading" title="Spiel 00 - DOS - Spielinformationen und Videos">Spiel 00 - DOS - Spielinformationen und Videos</h1>'));
  model.games[0].metadata.data.scope.platforms.push("Amiga");
  html = renderModel(model).pages.get("spiele/game-00/index.html").html;
  assert.ok(html.includes('<h1 class="detail-heading" title="Spiel 00 - Spielinformationen und Videos">Spiel 00 - Spielinformationen und Videos</h1>'));
  model.games[0].metadata.status = "blocked";
  html = renderModel(model).pages.get("spiele/game-00/index.html").html;
  assert.ok(html.includes('<h1 class="detail-heading" title="Spiel 00 - Spielinformationen und Videos">Spiel 00 - Spielinformationen und Videos</h1>'));
});

test("erzeugt für alle veröffentlichten Spiele eine H1 mit mindestens 20 Zeichen", async () => {
  const model = await loadSiteData(new URL("../cache/", import.meta.url).pathname);
  const pages = renderSite(model, createSiteConfig(), "assets/test.css");
  assert.ok(model.games.length > 0);
  for (const game of model.games) {
    const html = pages.get(`${game.route}index.html`).html;
    const headings = [...html.matchAll(/<h1\b[^>]*>(.*?)<\/h1>/gu)];
    assert.equal(headings.length, 1, game.name);
    const expectedMinimum = escapeHtml(game.name);
    assert.ok(headings[0][1].startsWith(expectedMinimum), game.name);
    const entities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
    const heading = headings[0][1].replace(/&(?:amp|lt|gt|quot|#39);/gu, (entity) => entities[entity]);
    assert.ok([...heading].length >= 20, `${game.name}: ${heading}`);
    if ([...game.name].length >= 20) assert.equal(headings[0][1], expectedMinimum);
    assert.equal(graph(html).find((item) => item["@type"] === "VideoGame").name, game.name);
  }
});

test("vermeidet wiederholte Beschreibungsüberschriften auf langen Spieleseiten", () => {
  const { pages } = render(fixture(40), [definition({
    name: "Aces of the Pacific", platforms: ["MS-DOS"],
  })]);
  const html = pages.get("spiele/cadaver/index.html").html;
  const headings = [...html.matchAll(/<h[1-6]\b[^>]*>(.*?)<\/h[1-6]>/gu)].map((match) => match[1]);
  assert.equal(headings.length, 42);
  assert.equal(new Set(headings).size, headings.length);
  assert.equal((html.match(/class="description"/gu) ?? []).length, 40);
  assert.ok(html.includes("Beschreibung 39"));
  assert.ok(html.includes("Für dieses Video ist keine Beschreibung vorhanden."));
});

test("erweitert kurze Filterüberschriften und stimmt H1, Titel, Beschreibung und Einleitung ab", () => {
  const model = metadataModel(2);
  for (const game of model.games) {
    game.metadata.data.genres = ["X", "Action", "1234567890123", "123456789012"];
    game.metadata.data.releases[0].publisher = "Sierra";
    game.metadata.data.releases[0].developer = "Ocean";
  }
  const { pages } = renderModel(model);
  for (const [route, heading] of [
    ["publisher/sierra", "Spiele des Publishers Sierra"],
    ["entwickler/ocean", "Spiele des Entwicklers Ocean"],
    ["genre/action", "Spiele im Genre Action"],
    ["genre/x", "Spiele im Genre X – Retrospiele und Videos"],
    ["genre/1234567890123", "Genre: 1234567890123"],
    ["genre/123456789012", "Spiele im Genre 123456789012"],
    ["plattform/dos", "Spieleplattformen: DOS"],
  ]) {
    const html = pages.get(`spiele/${route}/index.html`).html;
    assert.ok(html.includes(`<h1>${heading}</h1>`), route);
    assert.ok(html.includes(`<title>${heading} | Pretty Old Pixel</title>`), route);
    assert.ok(html.includes(`<meta name="description" content="${heading}:`), route);
    assert.ok(html.includes(`<p>${heading}: 2 Retrospiele`), route);
    assert.ok([...heading].length >= 20, route);
  }
});

test("nennt in Spielefilter-Vorschauen konkrete Spiele statt alphabetischer Seitenhinweise", () => {
  const { pages } = renderModel(metadataModel(2));
  const html = pages.get("spiele/genre/simulation/index.html").html;
  const description = html.match(/<meta name="description" content="([^"]+)">/u)[1];
  assert.match(description, /^Spiele im Genre Simulation: Entdecke Spiel 00 und Spiel 01/u);
  assert.doesNotMatch(description, /alphabetisch geordnet|Seite 1 von 1/u);
});

test("haben alle veröffentlichten Spielefilter mindestens 20 Zeichen in der H1", async () => {
  const model = await loadSiteData(new URL("../cache/", import.meta.url).pathname);
  const pages = renderSite(model, createSiteConfig(), "assets/test.css");
  let checked = 0;
  for (const [file, { html }] of pages) {
    if (!/^spiele\/(?:genre|entwickler|publisher|plattform)\//u.test(file)) continue;
    const heading = html.match(/<h1>(.*?)<\/h1>/u)[1];
    const entities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
    const text = heading.replace(/&(?:amp|lt|gt|quot|#39);/gu, (entity) => entities[entity]);
    assert.ok([...text].length >= 20, `${file}: ${text}`);
    checked++;
  }
  assert.ok(checked > 0);
});

test("zählt unterschiedliche Spiele im Beschreibungstext der Spielebox statt ihrer gemeinsamen Videos", () => {
  for (const count of [1, 2, 6]) {
    const home = renderModel(metadataModel(count)).pages.get("index.html").html;
    const label = count === 1 ? "1 Retrospiel" : `${count} Retrospiele`;
    assert.ok(home.includes(`<a href="spiele/">Spiele</a></h3><p class="theme-count">2 Videos</p><p>${label} wiederentdecken: vom ersten Start bis zum Fazit.</p>`));
  }
});

test("zeigt pro Genre, Entwickler und Publisher die Top 5 als einzelne Links unter unverlinkten Überschriften", () => {
  const model = metadataModel(6);
  for (const [index, game] of model.games.entries()) {
    const names = [
      ...(index < 4 ? ['Alpha & "Partner"'] : []),
      ...(index < 3 ? ["Beta"] : []),
      ...(index < 2 ? ["Gamma"] : []),
      ...(index < 2 ? ["Delta", "Epsilon"] : []),
      ...(index >= 4 ? ["Zeta"] : []),
      `Einzelwert ${index}`,
    ];
    game.metadata.data.genres = [...names, ...names];
    const release = game.metadata.data.releases[0];
    game.metadata.data.releases = names.flatMap((name) => [
      { ...release, developer: name, publisher: name },
      { ...release, developer: name, publisher: name },
    ]);
  }
  const home = renderModel(model).pages.get("index.html").html;
  const section = home.match(/<section aria-labelledby="bereiche">([\s\S]*?)<\/section>/u)[1];
  for (const [segment, label] of [
    ["genre", "Genre"], ["entwickler", "Entwickler"], ["publisher", "Publisher"],
  ]) {
    const ranking = section.match(new RegExp(`<article><h3>${label}</h3><ol class="theme-ranking">([\\s\\S]*?)</ol></article>`, "u"))?.[1];
    assert.ok(ranking);
    assert.deepEqual([...ranking.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]),
      ["alpha-partner", "beta", "delta", "epsilon", "gamma"].map((slug) => `spiele/${segment}/${slug}/`));
    assert.deepEqual([...ranking.matchAll(/<span class="meta">([^<]+)<\/span>/gu)].map((match) => match[1]),
      ["4 Spiele", "3 Spiele", "2 Spiele", "2 Spiele", "2 Spiele"]);
    assert.ok(ranking.includes('>Alpha &amp; &quot;Partner&quot;</a>'));
    assert.ok(!section.includes(`href="spiele/${segment}/zeta/"`));
  }
  assert.ok(section.includes('href="spiele/">Spiele</a>'));
  assert.match(section, /<p class="theme-count">2 Videos<\/p>/u);
  assert.equal((section.match(/class="theme-ranking"/gu) ?? []).length, 4);
  model.games[4].metadata.data.genres.push("Beta");
  model.games[5].metadata.data.genres.push("Beta");
  const updated = renderModel(model).pages.get("index.html").html;
  assert.match(updated, /<h3>Genre<\/h3><ol class="theme-ranking"><li><span class="theme-ranking-entry"><a href="spiele\/genre\/beta\/" title="Beta">Beta<\/a><span class="meta">5 Spiele/u);
});

test("wählt Spitzenfilter bei Gleichstand alphabetisch und blendet Boxen ohne gemeinsame Metadaten aus", () => {
  const model = metadataModel();
  for (const game of model.games) game.metadata.data.genres = ["Zeta", "Alpha"];
  const home = () => renderModel(model).pages.get("index.html").html;
  const before = home();
  assert.ok(before.includes('<h3>Genre</h3><ol class="theme-ranking"><li><span class="theme-ranking-entry"><a href="spiele/genre/alpha/" title="Alpha">Alpha</a>'));
  assert.ok(before.includes('href="spiele/genre/zeta/" title="Zeta">Zeta</a>'));
  assert.equal((before.match(/<ol class="theme-ranking">([\s\S]*?)<\/ol>/u)[1].match(/<li>/gu) ?? []).length, 2);
  for (const game of model.games) game.metadata.data.genres.reverse();
  assert.equal(home(), before);
  for (const game of model.games) game.metadata.data.releases = [];
  const genreOnly = home();
  assert.ok(genreOnly.includes('href="spiele/genre/alpha/"'));
  assert.ok(!genreOnly.includes('href="spiele/entwickler/') && !genreOnly.includes('href="spiele/publisher/'));
  model.games[1].metadata.status = "blocked";
  assert.ok(!home().includes('class="theme-ranking"'));
  delete model.games[0].metadata;
  assert.ok(!home().includes('class="theme-ranking"'));
});

test("zeigt die fünf häufigsten Spieleplattformen mit eindeutigen Spielzahlen und Filterlinks", () => {
  const model = metadataModel(8);
  const assignments = [
    ["MS-DOS", "MS-DOS", "Amiga", "C64", "NES", "SNES", "Windows"],
    ["MS-DOS", "Amiga", "C64", "NES", "SNES", "Windows"],
    ["MS-DOS", "Amiga", "C64"],
    ["MS-DOS", "Amiga"],
    ["MS-DOS"],
    ["MS-DOS"],
    ["Windows"],
    ["Windows"],
  ];
  model.games.forEach((game, index) => {
    game.platforms = assignments[index];
    game.metadata.data.scope.platforms = ["DOS"];
  });
  model.games[6].metadata.status = "blocked";
  delete model.games[7].metadata;
  const { pages } = renderModel(model);
  const html = pages.get("index.html").html;
  const ranking = html.match(/<h3>Spieleplattformen<\/h3><ol class="theme-ranking">([\s\S]*?)<\/ol>/u)[1];
  assert.deepEqual([...ranking.matchAll(/title="([^"]+)"/gu)].map((match) => match[1]),
    ["MS-DOS", "Amiga", "C64", "NES", "SNES"]);
  assert.deepEqual([...ranking.matchAll(/<span class="meta">([^<]+)<\/span>/gu)].map((match) => match[1]),
    ["6 Spiele", "4 Spiele", "3 Spiele", "2 Spiele", "2 Spiele"]);
  assert.ok(!ranking.includes("Windows"));
  for (const slug of ["ms-dos", "amiga", "c64", "nes", "snes", "windows"]) {
    const route = `spiele/plattform/${slug}/`;
    assert.ok(pages.has(`${route}index.html`), route);
    const filtered = pages.get(`${route}index.html`).html;
    assert.match(filtered, /Alle Spiele anzeigen/u);
    assert.match(filtered, /Spieleplattformen:/u);
    assert.ok(graph(filtered).some((item) => item["@type"] === "BreadcrumbList"));
  }
  assert.ok(ranking.includes('href="spiele/plattform/ms-dos/"'));
  const dos = pages.get("spiele/plattform/ms-dos/index.html").html;
  assert.equal((dos.match(/<li><h2>/gu) ?? []).length, 6);
});

test("verlinkt gemeinsame Genres, Entwickler und Publisher nur für mindestens zwei veröffentlichte Spiele", () => {
  const model = metadataModel(5);
  model.games[0].metadata.data.genres.push("Simulation", "Einzelgenre");
  model.games[0].metadata.data.releases.push({ ...model.games[0].metadata.data.releases[0], year: 2000 });
  model.games[0].metadata.data.releases[0].publisherLabel = "Budget";
  model.games[2].metadata.data.genres = ["Einzelnes Genre"];
  model.games[2].metadata.data.releases[0].developer = "Einzelstudio";
  model.games[2].metadata.data.releases[0].publisher = "Einzelpublisher";
  model.games[3].metadata.status = "blocked";
  delete model.games[4].metadata;
  const { pages, config } = renderModel(model);
  const routes = ["spiele/genre/simulation/", "spiele/entwickler/studio/", "spiele/publisher/publisher/"];
  assert.deepEqual([...pages.keys()].filter((file) => /^spiele\/(?:genre|entwickler|publisher)\//u.test(file)),
    routes.map((route) => `${route}index.html`));
  for (const route of routes) {
    const page = pages.get(`${route}index.html`);
    assert.deepEqual(graph(page.html).find((item) => item["@type"] === "CollectionPage").mainEntity.itemListElement
      .map((item) => item.name), ["Spiel 00", "Spiel 01"]);
    assert.match(page.html, /2 Retrospiele, alphabetisch geordnet/u);
    assert.ok(page.html.includes('class="game-catalog"><ul class="catalog-grid">'));
    assert.match(page.html, /Erscheinungsjahr: 1990/u);
    assert.match(page.html, /2 Videos/u);
    assert.ok(!page.html.includes("data-video-series"));
    assert.ok(page.html.includes(`href="${config.href("spiele/", route)}">Alle Spiele anzeigen</a>`));
    for (const game of model.games.slice(0, 2)) {
      assert.ok(pages.get(`${game.route}index.html`).html.includes(`href="${config.href(route, game.route)}"`));
    }
  }
  const html = pages.get("spiele/game-00/index.html").html;
  assert.match(html, /<\/a> \(Budget\)/u);
  assert.match(html, /<\/a>, Einzelgenre<\/dd>/u);
  assert.ok(![...pages.keys()].some((file) => file.includes("budget") || file.includes("einzel")));

  model.games[1].metadata.status = "blocked";
  const single = renderModel(model).pages;
  assert.ok(![...single.keys()].some((file) => /^spiele\/(?:genre|entwickler|publisher)\//u.test(file)));
  const information = single.get("spiele/game-00/index.html").html
    .match(/<section aria-label="Zusätzliche Spielinformationen">([\s\S]*?)<\/section>/u)[1];
  assert.match(information, /<dt>Entwickler<\/dt><dd>Studio<\/dd>/u);
  assert.match(information, /<dt>Publisher<\/dt><dd>Publisher \(Budget\)<\/dd>/u);
  assert.ok(!information.includes("../genre/") && !information.includes("../entwickler/") && !information.includes("../publisher/"));
});

test("berücksichtigt und verlinkt Entwickler sowie Publisher zusätzlicher Veröffentlichungen", () => {
  const model = metadataModel();
  const releases = model.games[0].metadata.data.releases;
  releases.push({ ...releases[0], year: 2000 });
  releases[0].developer = "Nur erstes Release";
  releases[0].publisher = "Nur erster Publisher";
  const { pages } = renderModel(model);
  for (const route of ["entwickler/studio", "publisher/publisher"]) {
    assert.ok(pages.has(`spiele/${route}/index.html`));
    assert.ok(pages.get("spiele/game-00/index.html").html.match(/<tbody>([\s\S]*?)<\/tbody>/u)[1]
      .includes(`href="../${route}/"`));
  }
  assert.match(pages.get("spiele/game-00/index.html").html, /<dt>Entwickler<\/dt><dd>Nur erstes Release<\/dd>/u);
});

test("paginiert gefilterte Spielelisten mit eigenen Links, Breadcrumbs und JSON-LD", () => {
  const model = metadataModel(62);
  model.games.at(-1).metadata.status = "blocked";
  const config = createSiteConfig("https://example.org/anderer/tiefer/pfad/");
  const { pages } = renderModel(model, config);
  const relocatedConfig = createSiteConfig("http://localhost:8000/");
  const relocated = renderModel(model, relocatedConfig);
  assert.deepEqual([...pages].map(([file, page]) => [
    file, { ...page, html: page.html.replaceAll(config.baseUrl, relocatedConfig.baseUrl) },
  ]), [...relocated.pages]);
  for (const [segment, value, label, heading] of [
    ["genre", "simulation", "Genre: Simulation", "Spiele im Genre Simulation"],
    ["entwickler", "studio", "Entwickler: Studio", "Spiele des Entwicklers Studio"],
    ["publisher", "publisher", "Publisher: Publisher", "Publisher: Publisher"],
  ]) {
    const route = `spiele/${segment}/${value}/`;
    const nextRoute = `${route}seite/2/`;
    const first = pages.get(`${route}index.html`).html;
    const second = pages.get(`${nextRoute}index.html`).html;
    const entries = (html) => graph(html).find((item) => item["@type"] === "CollectionPage").mainEntity.itemListElement;
    assert.equal(entries(first).length, 60);
    assert.equal(entries(second).length, 1);
    assert.equal(entries(second)[0].name, "Spiel 60");
    assert.ok(!entries(first).some((item) => item.name === "Spiel 61"));
    assert.equal((first.match(/<li><h2><a /gu) ?? []).length, 60);
    assert.equal((second.match(/<li><h2><a /gu) ?? []).length, 1);
    assert.ok(first.includes(`href="${config.href(nextRoute, route)}" rel="next"`));
    assert.ok(second.includes(`href="${config.href(route, nextRoute)}" rel="prev"`));
    assert.ok(second.includes(`rel="canonical" href="${config.absolute(nextRoute)}"`));
    assert.ok(second.includes(`<h1>${heading} – Seite 2</h1>`));
    assert.deepEqual(graph(second).at(-1).itemListElement.map((item) => item.name),
      ["Startseite", "Spiele", label, "Seite 2"]);
    assert.ok(!pages.has(`${route}seite/3/index.html`));
  }
  model.games[60].metadata.status = "blocked";
  const exact = renderModel(model).pages;
  assert.ok(![...exact.keys()].some((file) => /^spiele\/(?:genre|entwickler|publisher)\/[^/]+\/seite\//u.test(file)));
});

test("escaped Filterwerte und trennt kollidierende Slugs deterministisch", () => {
  const model = metadataModel();
  for (const game of model.games) {
    game.metadata.data.genres = ["A+B", "A B", "A B Variante 1", '<Action & "Adventure">', "東京"];
    game.metadata.data.releases[0].developer = 'D & "Studio"';
    game.metadata.data.releases[0].publisher = "<Publisher>";
  }
  const { pages } = renderModel(model);
  const detail = pages.get("spiele/game-00/index.html").html;
  for (const [slug, text] of [
    ["a-b-variante-2", "A B"], ["a-b-variante-3", "A+B"], ["a-b-variante-1", "A B Variante 1"],
    ["action-adventure", "&lt;Action &amp; &quot;Adventure&quot;&gt;"], ["wert", "東京"],
  ]) {
    assert.ok(pages.has(`spiele/genre/${slug}/index.html`));
    assert.ok(detail.includes(`href="../genre/${slug}/">${text}</a>`));
  }
  assert.ok(detail.includes('href="../entwickler/d-studio/">D &amp; &quot;Studio&quot;</a>'));
  assert.ok(detail.includes('href="../publisher/publisher/">&lt;Publisher&gt;</a>'));
  const filteredPages = (entries) => [...entries].filter(([file]) => /^spiele\/(?:genre|entwickler|publisher)\//u.test(file));
  for (const game of model.games) game.metadata.data.genres.reverse();
  assert.deepEqual(filteredPages(renderModel(model).pages), filteredPages(pages));
});

test("schreibt Filterseiten offline in Sitemap und Manifest und entfernt sie unterhalb der Schwelle", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "pretty-pixel-game-filters-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cacheDirectory = path.join(directory, "cache");
  const outputDirectory = path.join(directory, "docs");
  await mkdir(path.join(cacheDirectory, "game-metadata"), { recursive: true });
  const metadataFile = new URL("../cache/game-metadata/ready.json", import.meta.url);
  const metadata = JSON.parse(await readFile(metadataFile, "utf8")).games;
  const candidates = gameDefinitions.filter((game) => game.playlistIds.length
    && metadata.find((record) => record.gameId === game.id)?.status === "ready");
  const records = new Map(metadata.map((record) => [record.gameId, record]));
  const first = candidates[0];
  const second = candidates.find((game) => game.id !== first.id
    && records.get(game.id).data.genres.some((genre) => records.get(first.id).data.genres.includes(genre)));
  assert.ok(second, "Zwei Spiele mit gemeinsamem Genre im gepflegten Cache");
  const input = fixture(4);
  input.playlists.playlists = [first, second].map((game, index) => ({
    id: game.playlistIds[0], title: game.name, videos: [member(index * 2), member(index * 2 + 1)],
  }));
  const save = () => Promise.all(Object.entries({
    "youtube-videos.json": input.videos,
    "youtube-playlists.json": input.playlists,
    "blaetterabend-videos.json": input.magazines,
  }).map(([file, data]) => writeFile(path.join(cacheDirectory, file), JSON.stringify(data))));
  await copyFile(metadataFile, path.join(cacheDirectory, "game-metadata/ready.json"));
  await save();
  const options = { cacheDirectory, outputDirectory, logger: { warn() {}, log() {} } };
  await generateSite(options);
  const manifestFile = path.join(outputDirectory, "build-manifest.json");
  const readManifest = async () => JSON.parse(await readFile(manifestFile, "utf8"));
  const filtered = Object.keys((await readManifest()).pages).filter((file) => /^spiele\/(?:genre|entwickler|publisher)\//u.test(file));
  assert.ok(filtered.some((file) => file.startsWith("spiele/genre/")));
  const sitemap = await readFile(path.join(outputDirectory, "sitemap.xml"), "utf8");
  for (const file of filtered) {
    assert.match(await readFile(path.join(outputDirectory, file), "utf8"), /2 Retrospiele/u);
    assert.ok(sitemap.includes(`/${file.replace(/index\.html$/u, "")}`));
  }
  const unchanged = await generateSite(options);
  assert.equal(unchanged.reused, unchanged.files);
  input.videos.videos.pop();
  await save();
  await generateSite(options);
  const updated = await readManifest();
  for (const file of filtered) {
    assert.ok(!updated.pages[file]);
    await assert.rejects(readFile(path.join(outputDirectory, file)), { code: "ENOENT" });
  }
  assert.ok(!(await readFile(path.join(outputDirectory, "sitemap.xml"), "utf8"))
    .match(/\/spiele\/(?:genre|entwickler|publisher)\//u));
  const detail = await readFile(path.join(outputDirectory, `spiele/${first.id}/index.html`), "utf8");
  assert.doesNotMatch(detail, /href="[^"]*\/(?:genre|entwickler|publisher)\//u);
});

test("bindet konsolidierte Metadaten im echten Offline-Modell ein und zeigt Quellenumfang je Spiel", async () => {
  const model = await loadSiteData(path.resolve(import.meta.dirname, "../cache"));
  const config = createSiteConfig();
  const pages = renderSite(model, config, config.href("assets/test.css"));
  const paradroid = model.games.find((game) => game.id === "paradroid-c64");
  assert.equal(paradroid.metadata.status, "ready");
  const html = pages.get(`${paradroid.route}index.html`).html;
  assert.match(html, /Graftgold Ltd\./u);
  assert.match(html, /Hewson Consultants Ltd\./u);
  assert.match(html, /Thunder Mountain/u);
  assert.match(html, /mobygames\.com\/game\/9272\//u);
  assert.ok(!html.includes("Spiel-ID"));
  assert.ok(!html.includes("lokalen MobyGames-Datenstand"));
  assert.ok(!html.includes("nicht unabhängig gegengeprüft"));
  assert.match(html, /<caption>Veröffentlichungen für C64<\/caption>/u);
  assert.equal(paradroid.releaseYear, 1985);
  assert.equal(new URL(paradroid.releaseYearSource).hostname, "www.mobygames.com");
  const dune = model.games.find((game) => game.id === "dune-ii-the-building-of-a-dynasty");
  assert.deepEqual(dune.platforms, []);
  const duneHtml = pages.get(`${dune.route}index.html`).html;
  assert.ok(!duneHtml.includes("Bei offener Katalogplattform"));
  assert.ok(!duneHtml.includes("keine nachträgliche Bestätigung"));
  assert.match(duneHtml, /mobygames\.com\/game\/241\//u);
  const wingCommander = model.games.find((game) => game.id === "wing-commander-ii");
  assert.equal(wingCommander.metadata.status, "ready");
  assert.deepEqual(wingCommander.platforms, ["MS-DOS"]);
  assert.equal(wingCommander.releaseYear, 1991);
  assert.match(pages.get(`${wingCommander.route}index.html`).html, /mobygames\.com\/game\/823\//u);
  for (const [id, platform, year] of [
    ["a-boy-and-his-blob-nes", "NES", 1990],
    ["airships-conquer-the-skies", "Windows", 2018],
    ["hyperspace-delivery-service", "Windows", 2019],
  ]) {
    const game = model.games.find((game) => game.id === id);
    assert.equal(game.metadata.status, "ready");
    assert.deepEqual(game.platforms, [platform]);
    assert.equal(game.releaseYear, year);
    assert.doesNotMatch(pages.get(`${game.route}index.html`).html, /Weitere Spielinformationen sind derzeit nicht verfügbar/u);
  }
  for (const game of model.games) {
    assert.match(pages.get(`${game.route}index.html`).html, /aria-label="Zusätzliche Spielinformationen"/u);
    assert.equal(game.releaseYear, game.metadata.data?.releaseYear ?? null);
    assert.equal(game.releaseYearSource, game.releaseYear === null ? null : game.metadata.data.evidence.sourceUrl);
    const information = pages.get(`${game.route}index.html`).html
      .match(/<section aria-label="Zusätzliche Spielinformationen">([\s\S]*?)<\/section>/u)[1];
    const externalUrls = [];
    for (const [, url] of information.matchAll(/href="([^"]+)"/gu)) {
      if (/^https:/u.test(url)) externalUrls.push(url);
      else {
        const target = new URL(url, config.absolute(game.route));
        const file = `${target.pathname.slice(config.basePath.length)}index.html`;
        assert.ok(pages.has(file), file);
        assert.ok(/>Alle Spiele anzeigen<\/a>/u.test(pages.get(file).html));
      }
    }
    assert.ok(externalUrls.every((url) => new URL(url).hostname === "www.mobygames.com"));
    const additionalSources = game.metadata.data?.additionalReleases ?? [];
    for (const entry of additionalSources) assert.ok(externalUrls.includes(entry.sourceUrl));
    if (!additionalSources.length) assert.equal(externalUrls.length, game.metadata.status === "ready" ? 1 : 0);
  }
});

test("Akalabeth behält Apple II als Hauptversion und zeigt Ultima Collection als DOS-Veröffentlichung", async () => {
  const model = await loadSiteData(path.resolve(import.meta.dirname, "../cache"));
  const game = model.games.find((entry) => entry.id === "akalabeth-world-of-doom");
  assert.deepEqual(game.platforms, ["Apple II"]);
  assert.equal(game.releaseYear, 1980);
  assert.equal(game.metadata.data.identity.id, 1256);
  const config = createSiteConfig();
  const html = renderSite(model, config, "assets/test.css").get(`${game.route}index.html`).html;
  const table = html.match(/<details><summary>Weitere Veröffentlichungen[\s\S]*?<\/details>/u)[0];
  assert.match(table, /Ultima Collection/u);
  assert.match(table, /mobygames\.com\/game\/1254\//u);
  assert.match(table, /<td>DOS<\/td><td>1998<\/td>/u);
  assert.match(table, /Electronic Arts/u);
  assert.match(table, /<table class="release-table">/u);
  assert.match(table, /<td><span class="release-country">United Kingdom<\/span><span class="release-country">United States<\/span><\/td>/u);
  assert.match(table, /Veröffentlichungen für Apple II, MS-DOS/u);
  assert.match(html, /<dt>Plattform<\/dt><dd>Apple II<\/dd>/u);
});

test("fehlender Metadatencache wird gemeldet; beschädigter Cache bricht das Laden ab", async (t) => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "pixel-site-metadata-"));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const input = fixture();
  for (const [file, data] of [
    ["youtube-videos.json", input.videos], ["youtube-playlists.json", input.playlists],
    ["blaetterabend-videos.json", input.magazines],
  ]) await writeFile(path.join(cacheDir, file), JSON.stringify(data));
  const model = await loadSiteData(cacheDir, { games: [definition()] });
  assert.equal(model.games[0].metadata.reason, "metadata-cache-missing");
  assert.equal(model.games[0].releaseYear, null);
  assert.equal(model.games[0].releaseYearSource, null);
  assert.ok(model.warnings.some((warning) => warning.includes("Erscheinungsjahr fehlt")));
  assert.ok(model.warnings.some((warning) => warning.includes("Spielemetadaten-Cache fehlt")));
  await mkdir(path.join(cacheDir, "game-metadata"));
  await writeFile(path.join(cacheDir, "game-metadata/ready.json"), "{}");
  await assert.rejects(loadSiteData(cacheDir, { games: [definition()] }), /beschädigt oder veraltet/u);
});

test("escaped konsolidierte Metadaten und behält leere Felder sowie Releaseunterschiede sichtbar", () => {
  const model = normalizeSources(fixture(), { games: [definition()] });
  const game = model.games[0];
  game.metadata = { status: "ready", data: {
    identity: { id: 10 }, evidence: { sourceUrl: "https://www.mobygames.com/game/10/", importedAt: "2026-10-18T20:00:00Z" },
    scope: { platforms: ["MS-DOS"], platformBasis: "dos-amiga-c64-nes-snes-priority" },
    genres: ["<script>genre</script>", "Simulation"],
    releases: [
      { platform: "DOS", year: 1990, developer: "<Studio>", publisher: "Original", countries: "Germany", publisherLabel: null },
      { platform: "DOS", year: 2000, developer: null, publisher: "Reissue", countries: null, publisherLabel: "<Label>" },
    ],
  } };
  const config = createSiteConfig();
  const pages = renderSite(model, config, config.href("assets/test.css"));
  validateSite(pages, new Map([["assets/test.css", ""], ["assets/video-series.js", ""], ["assets/theme.js", ""], ["favicon.webp", ""], ["apple-touch-icon.png", ""]]), config);
  const html = pages.get("spiele/cadaver/index.html").html;
  assert.match(html, /&lt;script&gt;genre&lt;\/script&gt;/u);
  assert.match(html, /&lt;Studio&gt;/u);
  assert.match(html, /&lt;Label&gt;/u);
  assert.match(html, /Keine Angabe/u);
  assert.match(html, /1990/u);
  assert.match(html, /2000/u);
  assert.ok(!html.includes("<script>genre"));
});

test("fasst nur länderabweichende Releases zusammen und erhält alle anderen Unterschiede", () => {
  const model = normalizeSources(fixture(), { games: [definition()] });
  const base = { platform: "DOS", year: 1990, developer: "Studio", publisher: "Publisher", publisherLabel: null };
  const releases = [
    { ...base, sourceReleaseId: 1, countries: "Germany" },
    { ...base, sourceReleaseId: 2, countries: "United States, Germany" },
    { ...base, sourceReleaseId: 3, countries: null },
    { ...base, sourceReleaseId: 4, countries: "<Country>" },
    { ...base, sourceReleaseId: 5, countries: "Germany", year: 1991 },
    { ...base, sourceReleaseId: 6, countries: "Germany", platform: "Amiga" },
    { ...base, sourceReleaseId: 7, countries: "Germany", developer: "Other Studio" },
    { ...base, sourceReleaseId: 8, countries: "Germany", publisher: "Other Publisher" },
    { ...base, sourceReleaseId: 9, countries: "Germany", publisherLabel: "Budget" },
  ];
  const before = structuredClone(releases);
  model.games[0].metadata = { status: "ready", data: {
    identity: { id: 10 }, evidence: { sourceUrl: "https://www.mobygames.com/game/10/", importedAt: "2026-10-18T20:00:00Z" },
    scope: { platforms: ["MS-DOS", "Amiga"], platformBasis: "catalogue" },
    genres: ["Simulation"], releases,
  } };
  const config = createSiteConfig();
  const pages = renderSite(model, config, config.href("assets/test.css"));
  validateSite(pages, new Map([["assets/test.css", ""], ["assets/video-series.js", ""], ["assets/theme.js", ""], ["favicon.webp", ""], ["apple-touch-icon.png", ""]]), config);
  const html = pages.get("spiele/cadaver/index.html").html;
  const table = html.match(/<tbody>([\s\S]*?)<\/tbody>/u)[1];
  assert.equal((table.match(/<tr>/gu) ?? []).length, 5);
  assert.match(html, /Weitere Veröffentlichungen \(5\)/u);
  assert.match(table, /<span class="release-country">&lt;Country&gt;<\/span><span class="release-country">Germany<\/span><span class="release-country">United States<\/span>/u);
  assert.ok(!table.includes("Keine Angabe"));
  assert.ok(!table.includes("Germany, Germany"));
  assert.match(table, /Other Studio/u);
  assert.match(table, /Other Publisher/u);
  assert.match(html, /Budget/u);
  assert.deepEqual(releases, before);
});

test("unterdrückt abgedeckte unvollständige Releases ohne widersprüchliche oder zusätzliche Angaben zu verlieren", () => {
  const model = normalizeSources(fixture(), { games: [definition()] });
  const full = { platform: "DOS", year: 1990, developer: "Studio", publisher: "Publisher", publisherLabel: "Budget", countries: "Germany" };
  const releases = [
    { ...full, developer: null },
    { ...full, publisher: null },
    { ...full, year: null },
    { ...full, publisherLabel: null },
    { ...full, countries: null },
    full,
    { ...full, developer: "Different Studio" },
    { ...full, developer: null, countries: "France" },
    { ...full, year: 1991, publisher: null, countries: null },
  ];
  const before = structuredClone(releases);
  const config = createSiteConfig();
  model.games[0].metadata = { status: "ready", data: {
    identity: { id: 10 }, evidence: { sourceUrl: "https://www.mobygames.com/game/10/", importedAt: "2026-10-18T20:00:00Z" },
    scope: { platforms: ["MS-DOS"], platformBasis: "catalogue" }, genres: ["Simulation"], releases,
  } };
  const pageHtml = () => renderSite(model, config, config.href("assets/test.css"))
    .get("spiele/cadaver/index.html").html;
  const tableHtml = () => pageHtml().match(/<tbody>([\s\S]*?)<\/tbody>/u)[1];
  const table = tableHtml();
  assert.equal((table.match(/<tr>/gu) ?? []).length, 3);
  assert.match(pageHtml(), /Different Studio/u);
  assert.match(table, /France/u);
  assert.match(table, /1991/u);
  assert.match(table, /Keine Angabe/u);
  assert.deepEqual(releases, before);
  model.games[0].metadata.data.releases = [...releases].reverse();
  assert.equal((tableHtml().match(/<tr>/gu) ?? []).length, 3);
});

test("einheitlicher Steckbrief zeigt Einzelrelease ohne Tabelle und bewahrt abweichende Jahresbelege", () => {
  const model = normalizeSources(fixture(), { games: [definition({ platforms: ["MS-DOS"], release: {
    year: 1988, source: "https://www.mobygames.com/game/10/",
  } })] });
  model.games[0].metadata = { status: "ready", data: {
    evidence: { sourceUrl: "https://www.mobygames.com/game/10/" },
    scope: { platforms: ["MS-DOS"], platformBasis: "catalogue" }, genres: ["Simulation"],
    releases: [{ platform: "DOS", year: 1989, developer: "Studio", publisher: "Publisher",
      publisherLabel: null, countries: "United States" }],
  } };
  const config = createSiteConfig();
  const html = renderSite(model, config, config.href("assets/test.css")).get("spiele/cadaver/index.html").html;
  assert.equal((html.match(/<dt>Plattform<\/dt>/gu) ?? []).length, 1);
  assert.ok(!html.includes("<dt>Spieltitel</dt>"));
  assert.ok(!html.includes("Metadaten zur Plattform"));
  assert.ok(!html.includes("<dt>Videos</dt>"));
  assert.ok(!html.includes("<table"));
  assert.ok(!html.includes("Weitere Veröffentlichungen"));
  assert.match(html, /<dt>Erscheinungsjahr<\/dt><dd>1988/u);
  assert.match(html, /<\/a><br>1989 · DOS · United States/u);
  assert.ok(!html.includes("<dt>Veröffentlichung</dt>"));
  assert.ok(!html.includes("Quellen:"));
  assert.match(html, /aria-label="MobyGames \(externe Website\)"/u);
  assert.match(html, /MobyGames/u);
});

test("veröffentlicht manuell bestätigte Spielreihen ohne Playlist, aber nicht ohne Zuordnung oder unterhalb der Schwelle", () => {
  const input = fixture();
  input.playlists.playlists = [];
  const manual = definition({ playlistIds: [], videoIds: [videoId(0), videoId(1)] });
  const { model, pages } = render(input, [manual]);
  assert.deepEqual(model.games[0].videos, [videoId(0), videoId(1)]);
  assert.equal(model.games[0].playlists.length, 0);
  const html = pages.get("spiele/cadaver/index.html").html;
  assert.ok(html.includes("data-video-series"));
  assert.ok(!html.includes("Playlists auf YouTube"));
  assert.equal(model.videoById.get(videoId(0)).games[0].id, "cadaver");
  assert.ok(!model.sections.find((section) => section.id === "sonstiges").entries.some((entry) => entry.videoId === videoId(0)));
  assert.equal(render(input, [{ ...manual, videoIds: [videoId(0)] }]).model.games.length, 0);
  assert.throws(() => render(input, [{ ...manual, videoIds: [] }]), /Quellplaylist oder Videozuordnung fehlt/u);
});

test("ergänzt fehlende re.play-Zuordnungen und die vollständige Patrizier-Reihe im echten Katalog", async () => {
  const model = await loadSiteData(path.resolve(import.meta.dirname, "../cache"), { now: Date.parse("2026-10-18T00:00:00Z") });
  const assignments = {
    "Ni3U6-W8lxw": "wing-commander-ii",
    "MWP0qizqt3M": "raptor-call-of-the-shadows-ms-dos",
    "iQkncspXiNM": "heretic-shadow-of-the-serpent-riders",
    "3IzIuwz-VWw": "they-stole-a-million-c64",
    "gWdsp_hujXs": "christoph-kolumbus-ms-dos",
    "52HT5sCdy-8": "die-siedler-ms-dos",
    "NsVj5ma3isI": "system-shock-ms-dos",
    "YjYCvZPRCUc": "system-shock-ms-dos",
    "PRp18az_Wig": "system-shock-ms-dos",
    "F83fcQiixjE": "system-shock-ms-dos",
    "eDYFb4PxBXg": "system-shock-ms-dos",
    "P--e3iHUDQg": "system-shock-ms-dos",
    "8v8TIC5Cpz4": "knights-of-the-sky-ms-dos",
    "s909Oqn1kwQ": "darklands-ms-dos",
    "WlpS5ygvi-w": "doom-ms-dos",
    "_Fe2lnbPFBQ": "stonekeep-ms-dos",
    "xAOFFuY_nXU": "ufo-enemy-unknown-ms-dos",
    "dWVWoPCCEek": "star-control-ii-ur-quan-masters",
    "E5G4S7y7538": "der-patrizier",
    "LPQ3nL7ltHU": "super-mario-bros-2-nes",
  };
  for (const [id, game] of Object.entries(assignments)) {
    assert.ok(model.videoById.get(id).games.some((item) => item.id === game), id);
    assert.ok(!model.videoById.get(id).sections.some((item) => item.id === "sonstiges"), id);
  }
  const patrician = model.games.find((game) => game.id === "der-patrizier");
  assert.equal(patrician.videos.length, 17);
  assert.equal(patrician.releaseYear, null);
  assert.equal(patrician.series.entries.length, 17);
  assert.ok(patrician.videos.includes("rvL8B_qulwU"));
  assert.equal(patrician.series.entries.find((entry) => entry.videoId === "rvL8B_qulwU").phase.id, "reminder");
  for (const id of patrician.videos) {
    assert.ok(model.videoById.get(id).title.startsWith(id === "E5G4S7y7538" ? "der Patrizier [streamstag]"
      : id === "rvL8B_qulwU" ? "Der Patrizier [re.minder]" : "Der Patrizier [re.play"));
    assert.ok(!model.videoById.get(id).sections.some((section) => section.id === "sonstiges"));
  }
  const wizardry = model.games.find((game) => game.videos.includes("eXRHHZ8l_Jc"));
  assert.equal(wizardry.name, "Wizardry: Proving Grounds of the Mad Overlord");
  assert.deepEqual(wizardry.videos, ["eXRHHZ8l_Jc"]);
  assert.ok(!model.videoById.get("eXRHHZ8l_Jc").sections.some((section) => section.id === "sonstiges"));
  for (const id of ["s0xuUVyfrp4", "iovuFSPzkH8"]) {
    assert.ok(model.videoById.get(id).sections.some((section) => section.id === "sonstiges"));
  }
});

test("ordnet ausschließlich die ausgewählten re.invented-Reihen manuell ihren Spielen zu", async () => {
  const model = await loadSiteData(path.resolve(import.meta.dirname, "../cache"));
  const selected = [
    ["airships-conquer-the-skies", ["L5dl6cyoJOg", "_TMntZnoA2s", "FejpeWADb6Q", "s12md_R_AKY"], 2018],
    ["hyperspace-delivery-service", ["iHwHp1yIbqc", "MBY8HVQyLEQ", "5IKiUnbudhM", "UbJ2Wat9hjQ", "CyYkUIRGx68", "cNv2GumJLXs"], 2019],
  ];
  const config = createSiteConfig();
  const pages = renderSite(model, config, "assets/test.css");
  for (const [id, ids, year] of selected) {
    const game = model.games.find((item) => item.id === id);
    assert.deepEqual([...game.videos].sort(), [...ids].sort());
    assert.equal(game.releaseYear, year);
    assert.equal(game.playlists.length, 0);
    const html = pages.get(`${game.route}index.html`).html;
    assert.equal((html.match(/data-video-panel /gu) ?? []).length, ids.length);
    for (const videoId of ids) {
      const video = model.videoById.get(videoId);
      assert.ok(video.games.some((item) => item.id === id));
      assert.ok(!video.sections.some((item) => item.id === "sonstiges"));
    }
  }
  for (const id of ["9Rp1vcl4JSU", "8nqOWnfl-Cw", "UR0MMFM9BnI", "SBBxuufkNfA", "KRker5bSpN4", "iFP4nrtIz78", "zw18FXkucu0"]) {
    assert.equal(model.videoById.get(id).games.length, 0);
    assert.ok(model.videoById.get(id).sections.some((item) => item.id === "sonstiges"));
  }
  assert.ok(!model.videoById.get("9E8t2UkeTGI").games.length);
});

test("zeigt Spiele als Kachelliste mit escaped Titeln, Plattformen und Videozahlen", () => {
  const { pages } = render(fixture(2), [definition({ name: "Cadaver & <Demo>", platforms: ["<Amiga>"] })]);
  const html = pages.get("spiele/index.html").html;
  assert.ok(html.includes('<div class="game-catalog"><ul class="catalog-grid">'));
  const grid = html.match(/<ul class="catalog-grid">[\s\S]*?<\/ul>/u)[0];
  assert.ok(grid.includes('<li><h2><a href="cadaver/">Cadaver &amp; &lt;Demo&gt;</a></h2>'));
  assert.ok(grid.includes('<p class="meta">&lt;Amiga&gt;</p><p class="meta">Erscheinungsjahr: 1990</p><p class="meta">2 Videos</p><p class="meta">Gesamtlaufzeit unbekannt</p>'));
  assert.ok(!grid.includes("<Demo>"));
});

test("zeigt das gepflegte Erscheinungsjahr statt Uploadjahr oder Zahlen aus Beschreibungen", () => {
  const input = fixture(2);
  for (const video of input.videos.videos) video.description = "Releasedatum: 1991\nVeröffentlicht: 2000";
  const { model, pages } = render(input);
  assert.equal(model.games[0].releaseYear, 1990);
  assert.equal(model.games[0].releaseYearSource, definition().release.source);
  assert.ok(pages.get("spiele/index.html").html.includes("Erscheinungsjahr: 1990"));
  const detail = pages.get("spiele/cadaver/index.html").html;
  assert.ok(detail.includes("<dt>Erscheinungsjahr</dt><dd>1990 <a"));
  assert.ok(detail.includes(`href="${definition().release.source}" rel="external"`));
  assert.ok(detail.includes('aria-label="MobyGames (externe Website)"><span aria-hidden="true">↗</span>'));
  const unknown = render(input, [definition({ release: null })]);
  assert.ok(unknown.pages.get("spiele/index.html").html.includes("Erscheinungsjahr: unbekannt"));
  assert.ok(unknown.model.warnings.some((warning) => warning.includes("Erscheinungsjahr fehlt")));
});

test("verwendet die Einzahl für ein Spielvideo ohne Veröffentlichungsdatum", () => {
  const input = fixture(2);
  input.videos.videos[0].publishedAt = null;
  const { pages } = render(input);
  assert.ok(pages.get("spiele/index.html").html.includes('<p class="meta">2 Videos</p>'));
  const detail = pages.get("spiele/cadaver/index.html").html;
  assert.ok(detail.includes("<p>2 Videos rund um Cadaver"));
  assert.ok(detail.includes("Datum unbekannt"));
  assert.doesNotMatch(detail, /steht gesondert|zugeordneten zusätzlichen Metadaten/u);
  assert.ok(!/\b1 Videos\b/u.test(detail));
});

test("benennt die recherchierte Quelle auf der Spieleseite nach ihrem Anbieter", () => {
  for (const [source, label] of [
    ["https://www.mobygames.com/game/1/", "MobyGames"],
    ["https://example.com/game?x=1&y=2", "example.com"],
  ]) {
    const { pages } = render(fixture(2), [definition({ release: { year: 1990, source } })]);
    const html = pages.get("spiele/cadaver/index.html").html;
    const field = html.match(/<dt>Erscheinungsjahr<\/dt><dd>(.*?)<\/dd>/u)[1];
    assert.ok(field.includes(`href="${source.replaceAll("&", "&amp;")}" rel="external"`));
    assert.ok(field.includes(`aria-label="${label} (externe Website)"`));
    assert.ok(field.includes('><span aria-hidden="true">↗</span></a>'));
    assert.ok(field.startsWith("1990 <a"));
  }
});

test("weist ungültige Erscheinungsjahre und unbrauchbare Quellen zurück", () => {
  for (const release of [
    { year: "1990", source: "https://example.com/" },
    { year: 1086, source: "https://example.com/" },
    { year: 1990.5, source: "https://example.com/" },
    { year: 1990, source: "javascript:alert(1)" },
    { year: 1990 }, 1990,
  ]) assert.throws(() => render(fixture(), [definition({ release })]));
});

test("Spielkatalog enthält keine manuell oder extern gepflegten Erscheinungsjahre", () => {
  for (const game of gameDefinitions) {
    assert.equal(game.release, null, game.id);
  }
});

test("summiert Spiel-Laufzeiten über 24 Stunden und kennzeichnet fehlende Werte", () => {
  for (const [durations, expected] of [
    [[3661, 90000], "Gesamtlaufzeit: 26:01 h"],
    [[3661, null], "Bekannte Laufzeit: 1:01 h (1 von 2 Videos)"],
    [[null, null], "Gesamtlaufzeit unbekannt"],
    [[0, 0], "Gesamtlaufzeit: 0:00 h"],
    [[14, 15], "Gesamtlaufzeit: 0:00 h"],
    [[15, 15], "Gesamtlaufzeit: 0:01 h"],
    [[1799, 1771], "Gesamtlaufzeit: 1:00 h"],
    [[7200, 780], "Gesamtlaufzeit: 2:13 h"],
  ]) {
    const input = fixture(3);
    input.videos.videos.forEach((video, index) => { video.durationSeconds = durations[index] ?? null; });
    input.videos.videos[2].durationSeconds = 99999;
    input.playlists.playlists[0].videos = [member(0), member(0), member(1)];
    const { pages } = render(input);
    const grid = pages.get("spiele/index.html").html.match(/<ul class="catalog-grid">[\s\S]*?<\/ul>/u)[0];
    assert.ok(grid.includes(`<p class="meta">2 Videos</p><p class="meta">${expected}</p>`), expected);
  }
});

test("erfordert bestätigte Spieleidentitäten statt Format- oder Titelheuristiken", () => {
  const input = fixture();
  input.playlists.playlists[0].id = "PL-unconfirmed";
  const model = normalizeSources(input, { games: [definition()] });
  assert.equal(model.games.length, 0);
  assert.ok(model.videos.every((video) => video.games.length === 0));
  assert.ok(model.warnings.some((warning) => warning.includes("Spielzuordnung nicht bestätigt")));
  assert.equal(render(input).pages.has("spiele/index.html"), false);
  assert.ok(render(input).pages.get("news/index.html").html.includes('href="../sonstiges/cadaver-re-play-2/#video-g0000000002"'));
});

test("vereinigt bestätigte Playlists und zählt nur unterschiedliche öffentliche Videos", () => {
  const input = fixture(4);
  input.playlists.playlists[0].videos = [member(0), member(0, 2), { ...member(1), availability: "unavailable" }];
  input.playlists.playlists.push({
    id: "PL-second", title: "Cadaver – späterer Durchlauf",
    videos: [member(0), member(2), { videoId: "missing0000", position: 4, availability: "listed" }],
  });
  const { model } = render(input, [definition({ playlistIds: [playlistId, "PL-second"] })]);
  assert.deepEqual(model.games[0].videos, [videoId(0), videoId(2)]);
  assert.equal(model.games[0].playlists.length, 2);
  assert.equal(model.videoById.get(videoId(0)).games.length, 1);
  assert.equal(model.videoById.get(videoId(1)).games.length, 0);
});

test("nimmt aktuelle Ein-Video-Spiele nur aus bestätigten Playlists bis einschließlich zwei Kalendermonate auf", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  const normalize = (input, definitions = [definition()]) => normalizeSources(input, { now, games: definitions, sections: [] });
  for (const [publishedAt, expected] of [
    ["2026-10-18T12:00:00Z", 1],
    ["2026-08-18T12:00:00Z", 1],
    ["2026-08-18T11:59:59Z", 0],
    ["2026-10-18T12:00:01Z", 0],
    [null, 0],
  ]) {
    const input = fixture(2);
    input.playlists.playlists[0].videos = [member(0)];
    input.videos.videos[0].publishedAt = publishedAt;
    assert.equal(normalize(input).games.length, expected, String(publishedAt));
  }
  const input = fixture(1);
  input.videos.videos[0].publishedAt = "2026-10-01T00:00:00Z";
  assert.equal(normalize(input, [definition({ playlistIds: [], videoIds: [videoId(0)] })]).games.length, 0);
  input.playlists.playlists[0].videos = [];
  assert.equal(normalize(input, [definition({ videoIds: [videoId(0)] })]).games.length, 0);
  input.playlists.playlists[0].videos = [member(0), member(0)];
  assert.equal(normalize(input).games.length, 1);
  input.videos.videos[0].title = "Cadaver [re.minder]";
  assert.equal(normalize(input).games.length, 0);
  input.videos.videos[0].title = "Cadaver [re.play]";
  for (const [publishedAt, expected] of [["2026-02-28T12:00:00Z", 1], ["2026-02-28T11:59:59Z", 0]]) {
    input.videos.videos[0].publishedAt = publishedAt;
    assert.equal(normalizeSources(input, {
      now: Date.parse("2026-04-30T12:00:00Z"), games: [definition()], sections: [],
    }).games.length, expected);
  }
});

test("re.minder hebt eine Reihe nicht über die Schwelle und ergänzt qualifizierte Spiele", () => {
  const input = fixture(3);
  input.videos.videos[2].title = "Cadaver [re.minder]";
  input.playlists.playlists[0].videos = [member(0), member(2)];
  const definitions = [definition({ videoIds: [videoId(2)] })];
  assert.equal(render(input, definitions).model.games.length, 0);
  input.playlists.playlists[0].videos.push(member(1));
  assert.deepEqual(render(input, definitions).model.games[0].videos, [videoId(0), videoId(1), videoId(2)]);
  input.playlists.playlists[0].videos.pop();
  input.videos.videos[2].title = "Cadaver [re.consider]";
  assert.equal(render(input, definitions).model.games.length, 1);
});

test("hält Nachfolger und Plattformversionen getrennt und ignoriert zufällige Titelnennungen", () => {
  const input = fixture(4);
  input.playlists.playlists[0].videos = [member(0), member(1)];
  input.playlists.playlists.push({ id: "PL-sequel", title: "Cadaver II", videos: [member(2), member(3)] });
  const { model } = render(input, [
    definition({ platforms: ["Amiga"] }),
    definition({ id: "cadaver-ii", name: "Cadaver II", playlistIds: ["PL-sequel"], platforms: ["MS-DOS"] }),
  ]);
  assert.equal(model.games.length, 2);
  assert.deepEqual(model.games[1].videos, [videoId(2), videoId(3)]);
  assert.deepEqual(model.videoById.get(videoId(0)).games.map((game) => game.id), ["cadaver"]);
});

test("schließt bekannte Formatvorstellungen aus und aktualisiert bestätigte Mitgliedschaften", () => {
  const input = fixture(4);
  const definitions = [definition({ excludedVideoIds: [videoId(0)] })];
  assert.deepEqual(render(input, definitions).model.games[0].videos, [videoId(1), videoId(2), videoId(3)]);
  input.playlists.playlists[0].videos = [member(0), member(1)];
  assert.equal(render(input, definitions).model.games.length, 0);
  input.playlists.playlists[0].videos.push(member(2));
  assert.deepEqual(render(input, definitions).model.games[0].videos, [videoId(1), videoId(2)]);
});

test("sortiert numerisch nach Veröffentlichung und kennzeichnet undatierte Videos am Ende", () => {
  const input = fixture(4);
  input.videos.videos[0].publishedAt = "2020-01-01T01:00:00+02:00";
  input.videos.videos[1].publishedAt = "2019-12-31T23:30:00Z";
  input.videos.videos[2].publishedAt = input.videos.videos[1].publishedAt;
  delete input.videos.videos[3].publishedAt;
  const { model, pages } = render(input);
  assert.deepEqual(model.games[0].videos, [videoId(0), videoId(1), videoId(2), videoId(3)]);
  const html = pages.get("spiele/cadaver/index.html").html;
  assert.ok(html.includes("Datum unbekannt"));
  assert.doesNotMatch(html, /gesondert am Ende/u);
  assert.ok(html.indexOf(`id="video-${videoId(0)}"`) < html.indexOf(`id="video-${videoId(3)}"`));
});

test("rendert eine vollständige Spieleseite mit Metadaten, Player und Beschreibungen auch über 60 Videos", () => {
  const input = fixture(65);
  input.videos.videos[0].durationSeconds = 3661;
  const { pages, config, budgets } = render(input, [definition({ platforms: ["Amiga"], aliases: ["Cadaver (Amiga)"] })]);
  const html = pages.get("spiele/cadaver/index.html").html;
  assert.equal((html.match(/data-video-panel /gu) ?? []).length, 65);
  assert.equal((html.match(/<iframe /gu) ?? []).length, 1);
  assert.ok(html.includes('class="detail-layout">\n<div class="detail-main">\n<h1 class="detail-heading" title="Cadaver - Amiga - Spielinformationen und Videos">Cadaver - Amiga - Spielinformationen und Videos'));
  assert.equal((html.match(/class="episode-menu"/gu) ?? []).length, 1);
  assert.ok(html.indexOf('class="detail-player"') < html.indexOf('class="episode-menu"'));
  assert.ok(html.indexOf('class="detail-player"') < html.indexOf('<dl class="detail-meta">'));
  assert.ok(html.includes("Video 65/65"));
  const menu = html.match(/<details class="episode-menu"[\s\S]*?<\/details>/u)[0];
  assert.ok(menu.includes(`data-video-link href="#video-${videoId(64)}">65/65: `));
  assert.ok(!/data-video-link[^>]*>Video /u.test(menu));
  assert.ok(menu.includes('<span aria-label="Laufzeit">1:01:01</span>'));
  assert.ok(menu.includes("Laufzeit unbekannt"));
  assert.ok(menu.includes('<time datetime="2020-01-01T00:00:00.000Z">01.01.2020</time>'));
  assert.ok(menu.includes('tabindex="0"'));
  assert.ok(!html.includes("<dt>Spieltitel</dt>"));
  assert.ok(html.includes('<div><dt>Plattform</dt><dd>Amiga</dd></div>'));
  const playlists = menu.match(/<div class="episode-playlists">([\s\S]*?)<\/div>/u)[1];
  assert.ok(!html.includes("Playlists auf YouTube"));
  assert.ok(menu.indexOf('class="episode-playlists"') > menu.indexOf("</nav>"));
  assert.ok(!/<(?:h2|ul|li)\b/u.test(playlists));
  assert.ok(playlists.startsWith("<a "));
  assert.ok(menu.includes(`href="https://www.youtube.com/playlist?list=${playlistId}"`));
  assert.ok(!html.includes("Weitere Spiele entdecken"));
  assert.ok(!html.includes(">Neue Videos</a>"));
  assert.ok(!/lokal gespeichert|Zuordnung.*geprüft|bestätigte Videos|Quellen der Spielzuordnung/u.test(html));
  assert.equal((html.match(/<dl class="detail-meta">/gu) ?? []).length, 66);
  assert.ok(html.includes("keine Beschreibung vorhanden"));
  assert.ok(!/<article\b[^>]*data-video-panel[^>]*\shidden(?:\s|>)/u.test(html));
  assert.ok(!html.includes("autoplay="));
  assert.ok(!pages.has("spiele/cadaver/seite/2/index.html"));
  assert.ok(![...pages.keys()].some((file) => /^videos\/[A-Za-z0-9_-]{11}\//u.test(file)));
  const schema = graph(html);
  const game = schema.find((item) => item["@type"] === "VideoGame");
  assert.equal(game.name, "Cadaver");
  assert.deepEqual(game.gamePlatform, ["Amiga"]);
  assert.deepEqual(game.alternateName, ["Cadaver (Amiga)"]);
  assert.equal(game.publisher, undefined);
  assert.deepEqual(schema.find((item) => item["@type"] === "CollectionPage").mainEntity.itemListElement.map((item) => item.url),
    Array.from({ length: 65 }, (_, index) => `./#video-${videoId(index)}`));
  assert.equal(schema.filter((item) => item["@type"] === "VideoObject").length, 65);
  assert.ok(schema.filter((item) => item["@type"] === "VideoObject").every((item) => item.about[0].name === "Cadaver"));
  assert.deepEqual(schema.at(-1).itemListElement.map((item) => item.name), ["Startseite", "Spiele", "Cadaver"]);
  assert.ok(budgets.maxHtmlGzip < 50 * 1024);
  assert.ok(pages.get("news/index.html").html.includes(`${config.href("spiele/cadaver/", "news/")}#video-${videoId(64)}`));
  assert.ok(pages.get("index.html").html.includes("<dt>Spiele</dt><dd>1</dd>"));
});

test("paginiert den Spieleindex, aber nicht Spieleseiten", () => {
  const input = fixture(2);
  const definitions = Array.from({ length: 61 }, (_, index) => {
    const id = `game-${String(index).padStart(2, "0")}`;
    const playlist = `PL-${id}`;
    input.playlists.playlists.push({ id: playlist, title: id, videos: [member(0), member(1)] });
    return definition({ id, name: id, playlistIds: [playlist] });
  });
  const { pages } = render(input, definitions);
  assert.ok(pages.has("spiele/seite/2/index.html"));
  assert.equal((pages.get("spiele/index.html").html.match(/<li><h2><a /gu) ?? []).length, 60);
  assert.equal((pages.get("spiele/seite/2/index.html").html.match(/<li><h2><a /gu) ?? []).length, 1);
  for (const route of ["spiele/index.html", "spiele/seite/2/index.html"]) {
    const grid = pages.get(route).html.match(/<ul class="catalog-grid">[\s\S]*?<\/ul>/u)[0];
    assert.equal((grid.match(/Erscheinungsjahr: 1990/gu) ?? []).length, route.includes("seite/2") ? 1 : 60);
  }
  assert.ok(!pages.has("spiele/seite/3/index.html"));
  const { pages: exact } = render(input, definitions.slice(0, 60));
  assert.ok(!exact.has("spiele/seite/2/index.html"));
});

test("behält Spiel- und Ausgabenkontexte bei Mehrfachzuordnungen korrekt bei", () => {
  const input = fixture(2);
  input.magazines.videos = input.videos.videos.map((video) => ({
    id: video.id, magazines: [{ name: "Power Play", issue: {
      label: "11/1988", year: 1988, number: null, months: [11], special: false,
    } }],
  }));
  const { pages, model, config } = render(input);
  const issue = model.videoById.get(videoId(0)).magazines[0].issue;
  const news = pages.get("news/index.html").html;
  assert.ok(news.includes(`${config.href(issue.route, "news/")}#video-${videoId(1)}`));
  assert.ok(news.includes('href="../spiele/cadaver/"'));
  for (const route of ["spiele/cadaver/", issue.route]) {
    const schema = graph(pages.get(`${route}index.html`).html);
    const videos = schema.filter((item) => item["@type"] === "VideoObject");
    assert.ok(videos.every((video) => video.url.startsWith("./#video-")));
    assert.ok(videos.every((video) => video.about.some((entity) => entity["@type"] === "VideoGame")));
    assert.ok(schema.find((item) => item["@type"] === "CollectionPage").mainEntity.itemListElement
      .every((item) => item.url.startsWith("./#video-")));
  }
});

test("hält Routen und HTML bei geänderter Quellreihenfolge und Abrufzeiten stabil", () => {
  const input = fixture();
  const first = render(input);
  input.playlists.playlists[0].title = "Korrigierter Playlist-Titel";
  assert.equal(render(input).model.games[0].route, "spiele/cadaver/");
  input.playlists.playlists[0].title = "re.play - Cadaver";
  input.playlists.playlists[0].videos.reverse();
  input.videos.videos.reverse();
  input.playlists.checkedAt = "2099-01-01";
  const second = render(input);
  assert.deepEqual([...first.pages], [...second.pages]);
});

test("behält Phasen- und Reihenmetadaten ohne zusätzliche Übersicht und ohne Änderung der Folgenliste", () => {
  const input = fixture(6);
  [
    "Cadaver [re.play - #1] Intro und Unboxing",
    "Cadaver [re.play - #2] Abschluss Level 1",
    "Cadaver [re.play - #3] Abschlussgespräch",
    "Cadaver [re.play - #4] Es geht weiter",
    "Cadaver [streamstag] Neue Runde",
    "Cadaver [re.minder]",
  ].forEach((title, index) => { input.videos.videos[index].title = title; });
  const { pages, model } = render(input);
  const game = model.games[0];
  assert.deepEqual(game.videos, Array.from({ length: 6 }, (_, index) => videoId(index)));
  assert.deepEqual(game.series.entries.map((entry) => entry.phase.id),
    ["intro", "gameplay", "conclusion", "gameplay", "gameplay", "reminder"]);
  assert.deepEqual(game.series.runs.map((run) => run.videos),
    [[videoId(0), videoId(1), videoId(2), videoId(3)], [videoId(4)], [videoId(5)]]);
  const html = pages.get("spiele/cadaver/index.html").html;
  assert.ok(!html.includes('class="series-guide"'));
  assert.ok(!html.includes("Abschnitte und Reihen"));
  for (const phase of game.series.phases) assert.ok(html.includes(`<dt>Abschnitt</dt><dd>${phase.label}</dd>`));
  assert.ok(!html.includes("Interview / Gespräch"));
  const menu = html.match(/<details class="episode-menu"[\s\S]*?<\/details>/u)[0];
  for (const id of game.videos) assert.ok(menu.includes(`href="#video-${id}"`));
  assert.match(html, /id="video-g0000000002"[\s\S]*?href="#video-g0000000003">Nächster Teil/u);
  assert.deepEqual(graph(html).find((item) => item["@type"] === "CollectionPage").mainEntity.itemListElement.map((item) => item.position),
    [1, 2, 3, 4, 5, 6]);
});

test("validiert die gepflegten Identitäten und meldet fehlende Zusatzbeiträge", () => {
  const { model } = render(fixture(), [definition({ videoIds: ["missing0000"] })]);
  assert.ok(model.warnings.some((warning) => warning.includes("Bestätigter Zusatzbeitrag fehlt")));
  const cases = [
    [definition({ id: "seite" })],
    [definition({ id: "../bad" })],
    [definition(), definition()],
    [definition(), definition({ id: "other" })],
    [definition({ playlistIds: [playlistId, playlistId] })],
    [definition({ videoIds: ["invalid"] })],
    [definition({ platforms: "Amiga" })],
    [definition({ excludedVideoIds: ["invalid"] })],
    [definition({ videoIds: [videoId(0)], excludedVideoIds: [videoId(0)] })],
  ];
  for (const definitions of cases) assert.throws(() => render(fixture(), definitions));
  assert.equal(new Set(gameDefinitions.map((game) => game.id)).size, gameDefinitions.length);
});

test("aktualisiert Spieleseiten offline und entfernt sie beim Unterschreiten der Schwelle", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "pretty-pixel-games-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cacheDirectory = path.join(directory, "cache");
  const outputDirectory = path.join(directory, "docs");
  await mkdir(cacheDirectory);
  const input = fixture();
  async function save() {
    await Promise.all(Object.entries({
      "youtube-videos.json": input.videos,
      "youtube-playlists.json": input.playlists,
      "blaetterabend-videos.json": input.magazines,
    }).map(([name, value]) => writeFile(path.join(cacheDirectory, name), JSON.stringify(value))));
  }
  const options = { cacheDirectory, outputDirectory, now: Date.parse("2026-01-01T00:00:00Z"), logger: { warn() {}, log() {} } };
  await save();
  const first = await generateSite(options);
  const file = path.join(outputDirectory, "spiele/cadaver/index.html");
  const fixedTime = new Date("2020-02-01T12:00:00Z");
  await utimes(file, fixedTime, fixedTime);
  const mtime = (await stat(file)).mtimeMs;
  const second = await generateSite(options);
  assert.equal(second.reused, first.files);
  assert.equal((await stat(file)).mtimeMs, mtime);
  const manifestFile = path.join(outputDirectory, "build-manifest.json");
  const before = JSON.parse(await readFile(manifestFile, "utf8")).pages;
  input.videos.videos[0].title = "Cadaver [re.play - #1] Intro und Unboxing";
  await save();
  options.now += 86400000;
  await generateSite(options);
  const after = JSON.parse(await readFile(manifestFile, "utf8")).pages;
  assert.equal(after["spiele/cadaver/index.html"].lastModified, "2026-01-02T00:00:00.000Z");
  assert.equal(after["spiele/cadaver/index.html"].contentPublishedAt, before["spiele/cadaver/index.html"].contentPublishedAt);
  assert.deepEqual(after["datenschutz/index.html"], before["datenschutz/index.html"]);
  assert.ok((await readFile(file, "utf8")).includes("<dt>Abschnitt</dt><dd>Intro / Unboxing</dd>"));
  input.videos.videos[0].description = "Aktualisierte Beschreibung";
  await save();
  await generateSite(options);
  assert.ok((await readFile(file, "utf8")).includes("Aktualisierte Beschreibung"));
  input.playlists.playlists[0].videos = [member(0)];
  await save();
  await generateSite(options);
  await assert.rejects(stat(file), { code: "ENOENT" });
  assert.ok(!(await readFile(path.join(outputDirectory, "sitemap.xml"), "utf8")).includes("/spiele/cadaver/"));
});
