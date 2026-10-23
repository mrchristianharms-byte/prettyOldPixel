import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash, webcrypto } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import { loadContentData } from "../src/content-data/content-data.mjs";
import { exportAppData, hydrateAppData } from "../src/app-generation/app-model.mjs";
import { generateApp } from "../src/app-generation/generate-app.mjs";
import { appHref, parseAppRoute, renderView, publicAddress, filterGames, gameTableBody } from "../src/app-generation/app-views.mjs";
import { createSiteConfig } from "../src/site-generation/site-config.mjs";
import { renderSite } from "../src/site-generation/site-render.mjs";
import { gameDiscussions } from "../src/site-generation/widget/game-discussions.mjs";

const model = await loadContentData(new URL("../cache/", import.meta.url).pathname);
const config = createSiteConfig("https://example.com/project/");
const original = JSON.stringify(model, (key, value) => value instanceof Map ? [...value] : value);
const exported = exportAppData(model, config.baseUrl);
const data = hydrateAppData(JSON.parse(JSON.stringify(exported)));
const images = new Map([
  ["assets/site.css", "body{}"], ["favicon.webp", Buffer.from("icon")],
  ["apple-touch-icon.png", Buffer.from("touch")], ...model.magazineLogoAssets,
]);

test("ein gemeinsamer Loader bleibt unabhängig von beiden Generatoren", async () => {
  const source = await readFile(new URL("../src/content-data/content-data.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /site-generation|app-generation/u);
  const build = await readFile(new URL("../src/site-generation/generate-site.mjs", import.meta.url), "utf8");
  assert.equal((build.match(/await loadContentData\(/gu) ?? []).length, 1);
  assert.match(build, /generateApp\(model, config, assets\)/u);
  assert.match(build, /renderSite\(model, config/u);
  for (const file of await readdir(new URL("../src/app-generation/", import.meta.url))) {
    if (!/\.(?:mjs|js)$/u.test(file)) continue;
    const source = await readFile(new URL(`../src/app-generation/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /youtube-videos\.json|blaetterabend-videos\.json|loadContentData\(/u, file);
  }
});

test("JSON-Export erhält alle Inhalte und Referenzen ohne das Ausgangsmodell zu verändern", () => {
  assert.equal(JSON.stringify(model, (key, value) => value instanceof Map ? [...value] : value), original);
  assert.equal(data.videos.length, model.videos.length);
  assert.equal(data.games.length, model.games.length);
  assert.equal(data.magazines.length, model.magazines.length);
  for (const video of model.videos) {
    const hydrated = data.videoById.get(video.id);
    for (const key of ["title", "description", "descriptionWithoutChapters", "chapters", "mentionedChannels", "magazines", "games", "gameDiscussions"]) {
      assert.deepEqual(hydrated[key], video[key], `${video.id}/${key}`);
    }
  }
  for (const playlist of data.playlists) assert.ok(playlist.videos.every((video) => data.videoById.get(video.id) === video));
  for (const game of model.games) {
    const hydrated = data.games.find((item) => item.id === game.id);
    const { metadata, ...rest } = game;
    assert.deepEqual(Object.fromEntries(Object.keys(rest).map((key) => [key, hydrated[key]])), rest);
    if (metadata?.status === "ready") {
      for (const field of ["releaseYear", "genres", "releases", "additionalReleases"]) {
        assert.deepEqual(hydrated.metadata.data[field], metadata.data[field]);
      }
    }
    assert.ok(!hydrated.metadata.selection);
    assert.ok(!hydrated.metadata.data?.evidence.dumpHash);
  }
  assert.ok(!Object.hasOwn(exported, "warnings"));
  assert.ok(Buffer.byteLength(JSON.stringify(exported)) < 4_000_000);
  assert.throws(() => hydrateAppData({ ...exported, schemaVersion: 999 }), /Schema/u);
  assert.throws(() => hydrateAppData({ ...exported, news: ["missing"] }), /Fehlendes Video/u);
  assert.throws(() => hydrateAppData({ ...exported, publicUrl: "javascript:alert(1)" }), /Adresse/u);
});

test("alle öffentlichen Inhaltsrouten haben eine lokale App-Ansicht", () => {
  const pages = renderSite(model, config, "assets/site.css");
  for (const page of pages.values()) {
    if (page.route === "404.html") continue;
    const view = renderView(data, { route: page.route });
    assert.notEqual(view.title, "Seite nicht gefunden", page.route);
    assert.ok(view.body, page.route);
  }
  assert.equal(renderView(data, { route: "unbekannt/" }).title, "Seite nicht gefunden");
});

test("App-Routing erhält Video, Kapitel und öffentliche Teilen-Links", () => {
  const game = data.games.find((game) => game.videos.length > 1);
  const id = game.videos[1];
  const state = parseAppRoute(appHref(game.route, id, 120));
  assert.deepEqual(state, { route: game.route, videoId: id, seconds: 120 });
  const view = renderView(data, state);
  assert.equal(view.selected.id, id);
  assert.equal(publicAddress(data, state, view), `${config.baseUrl}${game.route}?t=120#video-${id}`);
  assert.throws(() => parseAppRoute("#/spiele/?t=-1"), /Kapitelzeit/u);
  assert.throws(() => renderView(data, { route: game.route, videoId: "missing" }), /gehört nicht/u);
  assert.equal(parseAppRoute("#inhalt"), null);
  const video = {
    id: "abcdefghijk", url: "https://www.youtube.com/watch?v=abcdefghijk",
    gameDiscussions: [{ title: "Testspiel", startMs: 120000, endMs: null, reviewed: true }],
  };
  const discussion = gameDiscussions(video, { timestampHref: (seconds) => appHref(game.route, video.id, seconds) });
  assert.ok(discussion.includes(`href="#/${game.route}?video=abcdefghijk&amp;t=120"`));
  assert.doesNotMatch(discussion, /rel="external"/u);
  assert.match(gameDiscussions(video), /youtube\.com\/watch/u);
});

test("Spielefilter und Sortierung funktionieren auf demselben Datenstand", () => {
  const game = data.games.find((game) => game.platforms.length);
  assert.ok(filterGames(data.games, { search: game.name.toUpperCase(), platform: game.platforms[0] }).some((item) => item.id === game.id));
  assert.equal(filterGames(data.games, { search: "unmöglicher-titel-xyz" }).length, 0);
  const sample = [...data.games].slice(0, 3).map((game, index) => ({ ...game, name: ["Z", "A", "M"][index], releaseYear: [null, 1990, 1980][index] }));
  const html = gameTableBody(sample, data, "release", -1);
  assert.ok(html.indexOf(">A</a>") < html.indexOf(">M</a>"));
  assert.ok(html.indexOf(">M</a>") < html.indexOf(">Z</a>"));
  const tableView = renderView(data, { route: "spiele/uebersicht/" });
  assert.match(tableView.body, /<table class="app-game-table"><thead><tr>/u);
  assert.match(tableView.body, /<th scope="col" aria-sort="descending"><button data-sort="video">Erstvideo ↕<\/button><\/th>/u);
  const hostile = { ...game, name: '<script>alert("x")</script>' };
  assert.doesNotMatch(gameTableBody([hostile], data), /<script>/u);
});

test("App-Build ist deterministisch, vollständig gehasht und separat budgetiert", async () => {
  const app = await generateApp(model, config, images);
  const again = await generateApp(model, config, images);
  assert.deepEqual(app, again);
  const index = app.files.get("app/index.html");
  assert.match(index, /<header class="container"><a href="#\/">PrettyOldPixel<\/a>\s*<nav[^>]*id="app-nav"><\/nav>\s*<span id="offline-status"/u);
  assert.doesNotMatch(index, /class="app-header-controls"/u);
  assert.match(index, /<span id="offline-status" role="status"/u);
  assert.match(index, /<button type="button" id="app-theme"[^>]*>[\s\S]*?class="theme-sun"[\s\S]*?class="theme-moon"[\s\S]*?<\/svg><\/button>/u);
  assert.doesNotMatch(index, /Hell \/ Dunkel/u);
  assert.match(index, /<p id="offline-message" role="status"/u);
  const manifest = JSON.parse(app.files.get("app/offline-manifest.json"));
  assert.equal(manifest.version, app.version);
  assert.deepEqual(manifest.thumbnails, model.videos.map((video) => video.thumbnailUrl));
  assert.ok(manifest.files.some((file) => file.url.endsWith("data.json")));
  for (const file of manifest.files) {
    const bytes = app.files.get(`app/${file.url}`);
    assert.ok(bytes !== undefined, file.url);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.hash);
    assert.equal(Buffer.byteLength(bytes), file.bytes);
    assert.doesNotMatch(file.url, /^https?:|^\//u);
  }
  const html = app.files.get("app/index.html");
  assert.match(html, /manifest\.webmanifest/u);
  assert.match(html, /noscript/u);
  assert.ok(app.bytes < 6_000_000, `${app.bytes} Bytes`);
  assert.ok(app.gzip < 3_000_000, `${app.gzip} Bytes gzip`);
  assert.equal(Object.values(app.sizes).reduce((sum, size) => sum + size.bytes, 0), app.bytes);
  assert.equal(Object.values(app.sizes).reduce((sum, size) => sum + size.gzip, 0), app.gzip);
  assert.equal(app.sizes.data.bytes, app.dataBytes);
  for (const category of ["renderer", "styles", "media", "other"]) assert.ok(app.sizes[category].bytes > 0, category);
  assert.ok(manifest.files.some((file) => file.url.endsWith("assets/offline-preview.svg")));
  const placeholder = manifest.files.find((file) => file.url.endsWith("assets/offline-preview.svg"));
  const previewModule = manifest.files.find((file) => file.url.endsWith("app-generation/preview.mjs"));
  assert.equal(new URL("../assets/offline-preview.svg", `https://example.com/app/${previewModule.url}`).pathname,
    `/app/${placeholder.url}`);
  const publicHtml = [...renderSite(model, config, "assets/site.css").values()].map((page) => page.html).join("");
  assert.doesNotMatch(publicHtml, /serviceWorker|releases\/|app-generation\/app\.js/u);
});

function workerHarness(build, { fail, old, thumbnailFetch, otherClients = [] } = {}) {
  const handlers = new Map(), stores = new Map(), messages = [], fetched = [];
  const scope = "https://example.com/project/app/";
  const key = (request) => typeof request === "string" ? request : request.url;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(url) { return entries.get(key(url))?.clone(); },
        async put(url, value) { entries.set(key(url), value.clone()); },
      };
    },
  };
  const client = { id: "client-1", url: scope, postMessage: (message) => messages.push(message) };
  const self = {
    registration: { scope },
    clients: { async matchAll() { return [client, ...otherClients]; }, async claim() {} },
    async skipWaiting() { messages.push({ type: "ACTIVATED" }); },
    addEventListener(type, callback) { handlers.set(type, callback); },
  };
  const source = readFile(new URL("../src/app-generation/sw.js", import.meta.url), "utf8");
  async function start() {
    if (old) {
      const cache = await caches.open(`pretty-old-pixel:app:${scope}:old`);
      for (const [url, content] of old) await cache.put(new URL(url, scope).href, new Response(content));
    }
    vm.runInNewContext(`const BUILD = ${JSON.stringify(build)};\n${await source}`, {
      self, caches, URL, Response, AbortSignal, AbortController, setTimeout, clearTimeout, console, crypto: webcrypto,
      fetch: async (url, options) => {
        fetched.push(url);
        if (build.thumbnails?.includes(url) && thumbnailFetch) return thumbnailFetch(url, options);
        if (fail) throw new Error("Netz unterbrochen");
        const file = build.files.find((file) => new URL(file.url, scope).href === url);
        return new Response(file?.content ?? "missing", { status: file ? 200 : 404 });
      },
    });
  }
  async function dispatch(type, fields = {}) {
    let pending, response;
    const event = { ...fields, waitUntil(value) { pending = value; }, respondWith(value) { response = value; } };
    handlers.get(type)(event);
    await pending;
    return response ? await response : undefined;
  }
  return { start, dispatch, messages, stores, fetched, client, scope };
}

const workerBuild = (version = "new") => ({
  version, files: [{ url: "index.html", content: "<h1>Offline-App</h1>" }, { url: "releases/new/data.json", content: '{"ready":true}' }]
    .map((file) => ({ ...file, bytes: Buffer.byteLength(file.content), hash: createHash("sha256").update(file.content).digest("hex") })),
});

test("Service Worker bestätigt erst vollständige Daten und liefert Navigation offline", async () => {
  const worker = workerHarness(workerBuild());
  await worker.start();
  await worker.dispatch("install");
  await worker.dispatch("message", { data: { type: "STATUS" }, source: worker.client });
  assert.ok(worker.messages.some((message) => message.type === "STATUS" && message.ready));
  assert.ok(!worker.messages.some((message) => message.type === "ACTIVATED"));
  const response = await worker.dispatch("fetch", { request: { method: "GET", mode: "navigate", url: `${worker.scope}?route=test` } });
  assert.equal(await response.text(), "<h1>Offline-App</h1>");
  const before = worker.fetched.length;
  await worker.dispatch("fetch", { request: { method: "GET", url: "https://i.ytimg.com/vi/test/mqdefault.jpg" } });
  assert.equal(worker.fetched.length, before);
  await worker.dispatch("message", { data: { type: "ACTIVATE" }, source: worker.client });
  assert.ok(worker.messages.some((message) => message.type === "ACTIVATED"));
});

test("abgebrochene Updates und falsche Hashes beschädigen nicht den alten Offline-Stand", async () => {
  for (const fail of [true, false]) {
    const build = workerBuild();
    if (!fail) build.files[1].hash = "bad-hash";
    const worker = workerHarness(build, { fail, old: [["index.html", "alter Stand"]] });
    await worker.start();
    await assert.rejects(worker.dispatch("install"));
    assert.equal(worker.stores.size, 1);
    const entries = [...worker.stores.values()][0];
    assert.equal(await entries.get(new URL("index.html", worker.scope).href).clone().text(), "alter Stand");
    assert.ok(worker.messages.some((message) => message.type === "ERROR"));
  }
});

test("Cache-Bereinigung wartet auf den passenden Renderer aller App-Clients", async () => {
  const worker = workerHarness(workerBuild(), { old: [["index.html", "alt"]] });
  await worker.start();
  await worker.dispatch("install");
  await worker.dispatch("activate");
  await worker.dispatch("message", { data: { type: "CLIENT_VERSION", version: "old" }, source: worker.client });
  assert.equal(worker.stores.size, 2);
  await worker.dispatch("message", { data: { type: "CLIENT_VERSION", version: "new" }, source: worker.client });
  assert.equal(worker.stores.size, 1);
});

test("Cache-Bereinigung lässt ein nach Aktivierung vorbereitetes Update unberührt", async () => {
  const worker = workerHarness(workerBuild(), { old: [["index.html", "alt"]] });
  await worker.start();
  await worker.dispatch("install");
  await worker.dispatch("activate");
  const futureCache = `pretty-old-pixel:app:${worker.scope}:future`;
  worker.stores.set(futureCache, new Map());
  await worker.dispatch("message", { data: { type: "CLIENT_VERSION", version: "new" }, source: worker.client });
  assert.equal(worker.stores.size, 2);
  assert.ok(worker.stores.has(futureCache));
});

test("Alte Dateien bleiben erhalten, bis alle offenen App-Clients den neuen Renderer melden", async () => {
  const second = { id: "client-2", url: "https://example.com/project/app/#/spiele/", postMessage() {} };
  const worker = workerHarness(workerBuild(), { old: [["index.html", "alt"]], otherClients: [second] });
  await worker.start();
  await worker.dispatch("install");
  await worker.dispatch("activate");
  await worker.dispatch("message", { data: { type: "CLIENT_VERSION", version: "new" }, source: worker.client });
  assert.equal(worker.stores.size, 2);
  await worker.dispatch("message", { data: { type: "CLIENT_VERSION", version: "old" }, source: second });
  assert.equal(worker.stores.size, 2);
  await worker.dispatch("message", { data: { type: "CLIENT_VERSION", version: "new" }, source: second });
  assert.equal(worker.stores.size, 1);
});

test("fehlende Offline-Dateien werden erkannt und über denselben Worker repariert", async () => {
  const worker = workerHarness(workerBuild());
  await worker.start();
  await worker.dispatch("install");
  const entries = [...worker.stores.values()][0];
  entries.delete(new URL("releases/new/data.json", worker.scope).href);
  await worker.dispatch("message", { data: { type: "STATUS" }, source: worker.client });
  assert.equal(worker.messages.at(-1).ready, false);
  await worker.dispatch("message", { data: { type: "REPAIR" }, source: worker.client });
  assert.equal(worker.messages.at(-1).ready, true);
});

test("unveränderte Inhalte werden beim Update anhand ihres Hashes wiederverwendet", async () => {
  const build = workerBuild();
  const scope = "https://example.com/project/app/";
  const previous = {
    files: [{ ...build.files[1], url: "releases/old/data.json" }],
  };
  const worker = workerHarness(build, { old: [
    ["__offline_manifest__", JSON.stringify(previous)],
    ["releases/old/data.json", build.files[1].content],
  ] });
  await worker.start();
  await worker.dispatch("install");
  assert.deepEqual(worker.fetched, [new URL("index.html", scope).href]);
});

test("Vorschaubilder werden vollständig gespeichert, offline geliefert und bei Updates behalten", async () => {
  const url = "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg";
  const build = { ...workerBuild(), thumbnails: [url] };
  const worker = workerHarness(build, { thumbnailFetch: async (_, options) => {
    assert.equal(options.mode, "cors");
    assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer");
    return new Response("thumbnail", { headers: { "Content-Type": "image/jpeg" } });
  } });
  await worker.start();
  await worker.dispatch("install");
  assert.equal(worker.fetched.includes(url), false, "Vorschaubilder dürfen die Installation des Katalogs nicht blockieren");
  await worker.dispatch("message", { data: { type: "REPAIR" }, source: worker.client });
  await worker.dispatch("message", { data: { type: "STATUS" }, source: worker.client });
  assert.deepEqual(JSON.parse(JSON.stringify(worker.messages.at(-1).thumbnails)), { completed: 1, total: 1 });
  const before = worker.fetched.length;
  const image = await worker.dispatch("fetch", { request: { method: "GET", url } });
  assert.equal(await image.text(), "thumbnail");
  await worker.dispatch("message", { data: { type: "CLIENT_VERSION", version: build.version }, source: worker.client });
  await worker.dispatch("message", { data: { type: "REPAIR" }, source: worker.client });
  assert.equal(worker.fetched.length, before, "Reparatur und Versionsbereinigung dürfen gespeicherte Bilder nicht neu laden");
  assert.ok([...worker.stores.keys()].some((name) => name.endsWith(":thumbnails")));
});

test("Fehlgeschlagene Vorschaubilder lassen den Katalog intakt und können erneut geladen werden", async () => {
  const url = "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg";
  let available = false;
  const worker = workerHarness({ ...workerBuild(), thumbnails: [url] }, {
    thumbnailFetch: async () => new Response(available ? "image" : "missing", { status: available ? 200 : 404, headers: { "Content-Type": "image/jpeg" } }),
  });
  await worker.start();
  await worker.dispatch("install");
  await worker.dispatch("message", { data: { type: "REPAIR" }, source: worker.client });
  await worker.dispatch("message", { data: { type: "STATUS" }, source: worker.client });
  assert.equal(worker.messages.at(-1).ready, true);
  assert.equal(worker.messages.at(-1).thumbnails.completed, 0);
  available = true;
  await worker.dispatch("message", { data: { type: "REPAIR" }, source: worker.client });
  assert.equal(worker.messages.at(-1).thumbnails.completed, 1);
});

test("Opaque Bildantworten werden abgelehnt und fremde Videos und Player nicht abgefangen", async () => {
  const url = "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg";
  const worker = workerHarness({ ...workerBuild(), thumbnails: [url] }, {
    thumbnailFetch: async () => {
      const response = new Response("opaque image");
      Object.defineProperty(response, "type", { value: "opaque" });
      Object.defineProperty(response, "ok", { value: false });
      return response;
    },
  });
  await worker.start();
  await worker.dispatch("install");
  await worker.dispatch("message", { data: { type: "REPAIR" }, source: worker.client });
  await worker.dispatch("message", { data: { type: "STATUS" }, source: worker.client });
  assert.equal(worker.messages.at(-1).thumbnails.completed, 0);
  const before = worker.fetched.length;
  for (const external of ["https://www.youtube-nocookie.com/embed/abcdefghijk", "https://i.ytimg.com/vi/other-video/mqdefault.jpg"]) {
    assert.equal(await worker.dispatch("fetch", { request: { method: "GET", url: external } }), undefined);
  }
  assert.equal(worker.fetched.length, before);
});

test("Löschen stoppt laufende Bilddownloads, bevor die App ihre Caches entfernt", async () => {
  const url = "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg";
  let started;
  const downloading = new Promise((resolve) => { started = resolve; });
  const worker = workerHarness({ ...workerBuild(), thumbnails: [url] }, {
    thumbnailFetch: (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("Bilddownload abgebrochen")), { once: true });
      started();
    }),
  });
  await worker.start();
  await worker.dispatch("install");
  const repair = worker.dispatch("message", { data: { type: "REPAIR" }, source: worker.client });
  await downloading;
  await worker.dispatch("message", { data: { type: "CLEAR", requestId: 42 }, source: worker.client });
  await repair;
  assert.ok(worker.messages.some((message) => message.type === "CLEARED" && message.requestId === 42));
  const images = [...worker.stores].find(([name]) => name.endsWith(":thumbnails"))[1];
  assert.equal(images.size, 0);
  assert.equal(await worker.dispatch("fetch", { request: { method: "GET", url } }), undefined);
});
