import assert from "node:assert/strict";
import test from "node:test";
import { createSiteConfig, productionUrl, slugify } from "../../src/site-generation/site-config.mjs";
import { chronological, normalizeSources } from "../../src/content-data/content-data.mjs";

function sources(count = 3) {
  const channel = { id: "UC-test", title: "Pretty Old Pixel" };
  const videos = Array.from({ length: count }, (_, index) => ({
    id: `v${String(index).padStart(10, "0")}`,
    title: `Spiel ${index} [re.play - #${index}]`,
    description: `Beschreibung ${index}`,
    durationSeconds: 3600 + index,
    publishedAt: new Date(Date.UTC(2020, 0, index + 1)).toISOString(),
  }));
  return {
    videos: { channel, complete: true, videos },
    playlists: { channel, complete: true, playlists: [{
      id: "PL-test", title: "re.play - Spiel", description: "",
      videos: videos.toReversed().map((video, index) => ({
        videoId: video.id, position: index + 1, availability: "listed", title: video.title,
      })),
    }] },
    magazines: { channel, videos: [{
      id: videos[0].id, part: 1,
      magazines: [{
        name: "Power Play", issue: { label: "11/1988", year: 1988, number: null, months: [11], special: false },
        kultmags: { match: "issue", pageUrl: "https://www.kultmags.com/mags.php?folder=test", readerUrl: null, downloadUrl: null },
      }],
    }] },
  };
}

test("verwendet die Produktionsdomain, unterstützt Projektpfade und erstellt stabile Slugs", () => {
  const config = createSiteConfig();
  assert.equal(productionUrl, "https://prettyoldpixel.com/");
  assert.equal(config.baseUrl, productionUrl);
  assert.equal(config.basePath, "/");
  assert.equal(config.pageSize, 60);
  assert.equal(config.href("news/"), "news/");
  assert.equal(config.absolute("videos/abc/"), `${productionUrl}videos/abc/`);
  assert.equal(createSiteConfig("http://localhost:8000/test").href(), "./");
  assert.equal(createSiteConfig("https://example.org/projekt/").absolute("news/"), "https://example.org/projekt/news/");
  assert.equal(slugify("Blätterabend & Spaß"), "blatterabend-spass");
  for (const route of ["/videos/", "../oops", "videos/?q=x", "videos\\oops"]) {
    assert.throws(() => config.href(route), /Ungültiger/u);
  }
  for (const base of ["file:///tmp", "javascript:alert(1)", "https://user:password@example.com/", "https://example.com/?x"]) {
    assert.throws(() => createSiteConfig(base));
  }
});

test("berechnet seitenrelative Links für verschachtelte Seiten, Assets und einzelne HTML-Dateien", () => {
  const config = createSiteConfig();
  const cases = [
    ["", "", "./"],
    ["news/", "", "news/"],
    ["", "news/", "../"],
    ["videos/", "videos/seite/2/", "../../"],
    ["videos/seite/2/", "videos/", "seite/2/"],
    ["spiele/cadaver/", "spiele/cadaver/", "./"],
    ["assets/site.css", "zeitschriften/pc-games/1992/ausgaben/11/", "../../../../../assets/site.css"],
    ["privacy/", "404.html", "privacy/"],
    ["404.html", "404.html", "404.html"],
  ];
  for (const [target, from, expected] of cases) {
    assert.equal(config.href(target, from), expected);
    assert.equal(config.forPage(from).href(target), expected);
    assert.equal(new URL(expected, config.absolute(from)).href, config.absolute(target));
  }
  assert.equal({ ...config, pageSize: 2 }.forPage("news/").pageSize, 2);
});

test("verknüpft Quellen mit Herkunft, ohne Playlist-Titel als Spiele zu erfinden", () => {
  const input = sources();
  const before = structuredClone(input);
  const model = normalizeSources(input);
  const video = model.videoById.get("v0000000000");
  assert.equal(video.magazines[0].name, "Power Play");
  assert.equal(video.magazines[0].issue.year, 1988);
  assert.equal(video.magazines[0].source, "blaetterabend-videos");
  assert.equal(video.playlists[0].source, "youtube-playlists");
  assert.equal(video.duration, "PT1H");
  assert.equal(model.magazines[0].id, "power-play");
  assert.equal(model.games.length, 0);
  assert.ok(model.warnings.some((warning) => warning.includes("Spielzuordnung nicht bestätigt")));
  assert.deepEqual(model.playlists[0].videos.map((item) => item.id), before.videos.videos.map((item) => item.id));
  assert.equal(model.playlists[0].members[0].position, 1);
  assert.deepEqual(input, before);
});

test("ordnet die erste aktuelle Folge von Ultima Underworld II der bestätigten Spielplaylist zu", () => {
  const input = sources(1);
  const video = input.videos.videos[0];
  video.id = "g3qVlBsl_Io";
  video.title = "Ultima Underworld II: Labyrinth of Worlds [re.play - #1] Intro und Box [German]";
  video.publishedAt = "2026-10-28T18:00:17Z";
  input.playlists.playlists[0].id = "PLKAk_zU7LotY";
  input.playlists.playlists[0].title = "re.play - Ultima Underworld II: Labyrinth of Worlds";
  input.playlists.playlists[0].videos[0].videoId = video.id;
  input.magazines.videos = [];
  const model = normalizeSources(input, { now: Date.parse("2026-10-30T12:00:00Z") });
  const game = model.games.find((entry) => entry.id === "ultima-underworld-ii-labyrinth-of-worlds");
  assert.ok(game);
  assert.deepEqual(game.videos, [video.id]);
  assert.equal(model.videoById.get(video.id).games[0].id, game.id);
  assert.ok(!model.warnings.some((warning) => warning.includes("PLKAk_zU7LotY")));
});

test("sortiert News numerisch nach Zeitzonen und begrenzt auf 20 eindeutige Videos", () => {
  const input = sources(25);
  input.videos.videos[23].publishedAt = "2020-03-01T01:00:00+02:00";
  input.videos.videos[24].publishedAt = "2020-02-29T23:30:00Z";
  const model = normalizeSources(input);
  assert.equal(model.news.length, 20);
  assert.equal(new Set(model.news.map((video) => video.id)).size, 20);
  assert.equal(model.news[0].id, input.videos.videos[24].id);
  assert.equal(model.news[1].publishedAt, "2020-02-29T23:00:00.000Z");
});

test("behandelt Zeitgleichheit stabil und behält vollständige chronologische Listen über 50 Einträge", () => {
  const input = sources(65);
  input.videos.videos[0].publishedAt = input.videos.videos[1].publishedAt;
  const model = normalizeSources(input);
  assert.equal(model.playlists[0].videos.length, 65);
  assert.deepEqual(model.playlists[0].videos.slice(0, 2).map((video) => video.id), ["v0000000000", "v0000000001"]);
  assert.equal(model.news.at(-1).id, input.videos.videos[45].id);
});

test("meldet fehlende/ungültige Daten und schließt zukünftige Videos aus", () => {
  const input = sources(4);
  delete input.videos.videos[0].publishedAt;
  input.videos.videos[1].publishedAt = "2020-02-30T12:00:00Z";
  input.videos.videos[2].publishedAt = "2099-01-01T00:00:00Z";
  delete input.videos.videos[3].description;
  delete input.videos.videos[3].durationSeconds;
  const model = normalizeSources(input);
  assert.equal(model.videos.length, 3);
  assert.equal(model.news.length, 1);
  assert.equal(model.news[0].description, "");
  assert.equal(model.news[0].duration, null);
  assert.ok(model.warnings.some((warning) => warning.includes("Noch nicht veröffentlicht")));
  assert.equal(model.videos.filter((video) => video.publishedAt === null).length, 2);
  assert.equal([...model.videos].sort(chronological).at(-1).publishedAt, null);
});

test("zählt doppelte, unbekannte und nicht verfügbare Playlist-Mitglieder nicht mehrfach", () => {
  const input = sources();
  const members = input.playlists.playlists[0].videos;
  members.push({ ...members[0], position: 4 });
  members.push({ videoId: "missing0000", position: 5, availability: "listed" });
  members[1].availability = "unavailable";
  const model = normalizeSources(input);
  assert.equal(model.playlists[0].members.length, 5);
  assert.equal(model.playlists[0].videos.length, 2);
  assert.equal(model.videoById.get(members[0].videoId).playlists.length, 1);
  assert.equal(model.warnings.length, 3);
});

test("hält Zeitschriften-/Ausgaben-Identitäten unabhängig von Quellreihenfolge und Abrufzeiten stabil", () => {
  const input = sources();
  const first = normalizeSources(input);
  input.videos.videos.reverse();
  input.videos.fetchedAt = "2099-01-01";
  input.playlists.checkedAt = "2099-01-01";
  input.magazines.generatedAt = "2099-01-01";
  input.magazines.videos[0].magazines[0].issue.label = "November 1988";
  const second = normalizeSources(input);
  assert.deepEqual(first.magazines.map((magazine) => [...magazine.issues.keys()]), second.magazines.map((magazine) => [...magazine.issues.keys()]));
  assert.deepEqual(first.news.map((video) => video.id), second.news.map((video) => video.id));
});

test("stoppt bei unvollständigen, kanalübergreifenden oder beschädigten Quellen", () => {
  const cases = [
    (input) => { input.videos.complete = false; },
    (input) => { input.playlists.complete = false; },
    (input) => { input.playlists.channel = { id: "anderer-kanal" }; },
    (input) => { input.magazines.channel = { id: "anderer-kanal" }; },
    (input) => { input.videos.videos[0].id = "../../bad"; },
    (input) => { input.videos.videos[0].title = ""; },
    (input) => { input.videos.videos.push(input.videos.videos[0]); },
    (input) => { input.videos.videos[0].durationSeconds = -1; },
    (input) => { input.playlists.playlists[0].videos[0].position = 0; },
    (input) => { input.playlists.playlists[0].videos[0].availability = "maybe"; },
    (input) => { input.magazines.videos[0].magazines[0].kultmags.pageUrl = "javascript:alert(1)"; },
    (input) => { input.magazines.videos[0].magazines[0].issue.months = [13]; },
    (input) => { input.playlists.playlists = null; },
  ];
  for (const mutate of cases) {
    const input = sources();
    mutate(input);
    assert.throws(() => normalizeSources(input));
  }
});
