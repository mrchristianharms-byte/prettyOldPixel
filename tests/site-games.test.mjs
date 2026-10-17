import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { generateSite, validateSite } from "../src/generate-site.mjs";
import { gameDefinitions } from "../src/games.mjs";
import { createSiteConfig } from "../src/site-config.mjs";
import { normalizeSources } from "../src/site-data.mjs";
import { renderSite } from "../src/site-render.mjs";

const channel = { id: "UC-games", title: "Pretty Old Pixel" };
const videoId = (index) => `g${String(index).padStart(10, "0")}`;
const playlistId = "PLZW5k3rtbudqSHgAFraosQMdGOpK08alM";
const definition = (overrides = {}) => ({
  id: "cadaver", name: "Cadaver", playlistIds: [playlistId], videoIds: [], platforms: [], aliases: [], ...overrides,
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
  const config = createSiteConfig();
  const pages = renderSite(model, config, config.href("assets/test.css"));
  const budgets = validateSite(pages, new Map([["assets/test.css", ""], ["assets/video-series.js", ""]]), config);
  return { model, config, pages, budgets };
}

const graph = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)[1])["@graph"];

test("erfordert bestätigte Spieleidentitäten statt Format- oder Titelheuristiken", () => {
  const input = fixture();
  input.playlists.playlists[0].id = "PL-unconfirmed";
  const model = normalizeSources(input, { games: [definition()] });
  assert.equal(model.games.length, 0);
  assert.ok(model.videos.every((video) => video.games.length === 0));
  assert.ok(model.warnings.some((warning) => warning.includes("Spielzuordnung nicht bestätigt")));
  assert.equal(render(input).pages.has("spiele/index.html"), false);
  assert.ok(render(input).pages.get("news/index.html").html.includes('href="https://www.youtube.com/watch?v=g0000000002" rel="external"'));
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
  assert.ok(html.includes("gesondert am Ende"));
  assert.ok(html.indexOf(`id="video-${videoId(0)}"`) < html.indexOf(`id="video-${videoId(3)}"`));
});

test("rendert eine vollständige Spieleseite mit Metadaten, Player und Beschreibungen auch über 50 Videos", () => {
  const { pages, config, budgets } = render(fixture(65), [definition({ platforms: ["Amiga"], aliases: ["Cadaver (Amiga)"] })]);
  const html = pages.get("spiele/cadaver/index.html").html;
  assert.equal((html.match(/data-video-panel /gu) ?? []).length, 65);
  assert.equal((html.match(/<iframe /gu) ?? []).length, 1);
  assert.ok(html.includes('class="detail-layout">\n<div class="detail-main">\n<h1 class="detail-heading" title="Cadaver">Cadaver'));
  assert.equal((html.match(/class="episode-menu"/gu) ?? []).length, 1);
  assert.ok(html.indexOf('class="detail-player"') < html.indexOf('class="episode-menu"'));
  assert.ok(html.indexOf('class="detail-player"') < html.indexOf('<dl class="detail-meta">'));
  assert.ok(html.includes("Video 65/65"));
  assert.ok(html.includes('<div><dt>Spieltitel</dt><dd>Cadaver</dd></div>'));
  assert.ok(html.includes('<div><dt>Hauptplattform laut Quellplaylist</dt><dd>Amiga</dd></div>'));
  assert.equal((html.match(/<dl class="detail-meta">/gu) ?? []).length, 66);
  assert.ok(html.includes("keine Beschreibung vorhanden"));
  assert.ok(!html.includes(' hidden'));
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
  const definitions = Array.from({ length: 51 }, (_, index) => {
    const id = `game-${String(index).padStart(2, "0")}`;
    const playlist = `PL-${id}`;
    input.playlists.playlists.push({ id: playlist, title: id, videos: [member(0), member(1)] });
    return definition({ id, name: id, playlistIds: [playlist] });
  });
  const { pages } = render(input, definitions);
  assert.ok(pages.has("spiele/seite/2/index.html"));
  assert.equal((pages.get("spiele/index.html").html.match(/ · 2 Videos<\/li>/gu) ?? []).length, 50);
  assert.equal((pages.get("spiele/seite/2/index.html").html.match(/ · 2 Videos<\/li>/gu) ?? []).length, 1);
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

test("zeigt Phasen und Reihen als echte Abschnittslinks, ohne die chronologische Gesamtliste umzubauen", () => {
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
  assert.ok(html.includes('class="series-guide"'));
  for (const phase of game.series.phases) assert.ok(html.includes(`<strong>${phase.label}</strong>`));
  assert.ok(!html.includes("Interview / Gespräch"));
  const guide = html.slice(html.indexOf('<details class="series-guide">'), html.indexOf('<div class="video-panels">'));
  for (const id of game.videos) assert.ok(guide.includes(`href="#video-${id}"`));
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
  assert.ok((await readFile(file, "utf8")).includes("<strong>Intro / Unboxing</strong>"));
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
