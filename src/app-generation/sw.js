const prefix = `pretty-old-pixel:app:${self.registration.scope}:`;
const cacheName = `${prefix}${BUILD.version}`;
const thumbnailCacheName = `${prefix}thumbnails`;
const thumbnailUrls = new Set(BUILD.thumbnails ?? []);
const metadataUrl = new URL("__offline_manifest__", self.registration.scope).href;
const cleanupUrl = new URL("__cleanup_candidates__", self.registration.scope).href;
const clientsUsing = new Map();
let clearing = false;
const thumbnailRequests = new Set();
const address = (relative) => new URL(relative, self.registration.scope).href;

async function verified(response, file) {
  if (!response.ok || response.type === "opaque") throw new Error(`Download fehlgeschlagen: ${file.url}`);
  const bytes = await response.clone().arrayBuffer();
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (digest !== file.hash) throw new Error(`Inhalt unvollständig oder veraltet: ${file.url}`);
  return response;
}

async function notify(message) {
  for (const client of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
    if (client.url.startsWith(self.registration.scope)) client.postMessage(message);
  }
}

async function thumbnailStatus() {
  if (clearing || !thumbnailUrls.size) return { completed: 0, total: thumbnailUrls.size };
  const cache = await caches.open(thumbnailCacheName);
  let completed = 0;
  for (const url of thumbnailUrls) if (await cache.match(url)) completed++;
  return { completed, total: thumbnailUrls.size };
}

async function downloadThumbnail(url) {
  const controller = new AbortController();
  thumbnailRequests.add(controller);
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    // Readable CORS responses avoid opaque cache entries and their inflated quota.
    const response = await fetch(url, {
      mode: "cors", credentials: "omit", referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok || response.type === "opaque" || !response.headers.get("Content-Type")?.startsWith("image/")) {
      throw new Error(`Vorschaubild nicht erreichbar oder keine lesbare Bildantwort: ${url}`);
    }
    return response;
  } finally {
    clearTimeout(timer);
    thumbnailRequests.delete(controller);
  }
}

let thumbnailDownload;
function storeThumbnails() {
  if (!thumbnailDownload) thumbnailDownload = downloadThumbnails().catch(async (error) => {
    console.error("Vorschaubild-Cache nicht verfügbar.", error);
    await notify({ type: "THUMBNAIL_ERROR", message: error.message });
  }).finally(() => { thumbnailDownload = undefined; });
  return thumbnailDownload;
}

async function downloadThumbnails() {
  if (!thumbnailUrls.size || clearing) return;
  const cache = await caches.open(thumbnailCacheName);
  let { completed, total } = await thumbnailStatus();
  await notify({ type: "THUMBNAILS", completed, total });
  const pending = [...thumbnailUrls][Symbol.iterator]();
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (const url of pending) {
      if (clearing) return;
      if (await cache.match(url)) continue;
      try {
        const response = await downloadThumbnail(url);
        if (clearing) return;
        await cache.put(url, response);
        completed++;
      } catch (error) {
        console.warn("Vorschaubild konnte nicht gespeichert werden.", url, error);
      }
      await notify({ type: "THUMBNAILS", completed, total });
    }
  }));
}

async function install(repair = false) {
  const cache = await caches.open(cacheName);
  const reusable = new Map();
  for (const name of await caches.keys()) {
    if (!name.startsWith(prefix) || name === cacheName) continue;
    const previous = await caches.open(name);
    const response = await previous.match(metadataUrl);
    if (!response) continue;
    const manifest = await response.json();
    for (const file of manifest.files) reusable.set(file.hash, { cache: previous, url: address(file.url) });
  }
  try {
    let completed = 0;
    let loadedBytes = 0;
    const totalBytes = BUILD.files.reduce((sum, file) => sum + file.bytes, 0);
    for (const file of BUILD.files) {
      if (clearing) throw new Error("App-Daten werden gelöscht.");
      const old = reusable.get(file.hash);
      const reused = old ? await old.cache.match(old.url) : undefined;
      const response = await verified(reused ?? await fetch(address(file.url), { cache: "no-store" }), file);
      if (clearing) throw new Error("App-Daten werden gelöscht.");
      await cache.put(address(file.url), response);
      loadedBytes += file.bytes;
      completed += 1;
      await notify({ type: "PROGRESS", completed, total: BUILD.files.length, loadedBytes, totalBytes });
    }
    if (clearing) throw new Error("App-Daten werden gelöscht.");
    await cache.put(metadataUrl, new Response(JSON.stringify(BUILD), { headers: { "Content-Type": "application/json" } }));
    await notify({ type: "DOWNLOADED", version: BUILD.version });
  } catch (error) {
    if (!repair) await caches.delete(cacheName);
    await notify({ type: "ERROR", message: `Offline-Download fehlgeschlagen: ${error.message}` });
    throw error;
  }
}

self.addEventListener("install", (event) => event.waitUntil(install()));
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  const candidates = (await caches.keys()).filter((name) =>
    name.startsWith(prefix) && name !== cacheName && name !== thumbnailCacheName);
  const cache = await caches.open(cacheName);
  await cache.put(cleanupUrl, new Response(JSON.stringify(candidates)));
  await self.clients.claim();
})()));

async function complete() {
  if (clearing) return false;
  const cache = await caches.open(cacheName);
  if (!await cache.match(metadataUrl)) return false;
  for (const file of BUILD.files) {
    if (!await cache.match(address(file.url))) return false;
  }
  return true;
}

async function cleanup() {
  if (clearing) return;
  const clients = (await self.clients.matchAll({ type: "window", includeUncontrolled: true }))
    .filter((client) => client.url.startsWith(self.registration.scope));
  if (!clients.length || clients.some((client) => clientsUsing.get(client.id) !== BUILD.version)) return;
  // A running worker must not delete a newer installing or waiting release.
  const cache = await caches.open(cacheName);
  const candidates = await cache.match(cleanupUrl);
  for (const name of candidates ? await candidates.json() : []) {
    if (name.startsWith(prefix) && name !== cacheName && name !== thumbnailCacheName) await caches.delete(name);
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR") event.waitUntil((async () => {
    clearing = true;
    for (const controller of thumbnailRequests) controller.abort();
    await thumbnailDownload;
    event.source?.postMessage({ type: "CLEARED", requestId: event.data.requestId });
  })());
  if (clearing) return;
  if (event.data?.type === "ACTIVATE") event.waitUntil(self.skipWaiting());
  if (event.data?.type === "STATUS") event.waitUntil((async () => {
    event.source?.postMessage({ type: "STATUS", requestId: event.data.requestId, ready: await complete(), version: BUILD.version, thumbnails: await thumbnailStatus() });
  })());
  if (event.data?.type === "REPAIR") event.waitUntil((async () => {
    if (!await complete()) await install(true);
    await storeThumbnails();
    if (clearing) return;
    event.source?.postMessage({ type: "STATUS", ready: await complete(), version: BUILD.version, thumbnails: await thumbnailStatus() });
  })());
  if (event.data?.type === "CLIENT_VERSION") {
    clientsUsing.set(event.source.id, event.data.version);
    event.waitUntil(cleanup());
  }
});

self.addEventListener("fetch", (event) => {
  if (clearing) return;
  const request = event.request;
  const url = new URL(request.url);
  if (request.method === "GET" && thumbnailUrls.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(thumbnailCacheName);
      const cached = await cache.match(url.href);
      if (cached) return cached;
      const response = await downloadThumbnail(url.href);
      if (!clearing) await cache.put(url.href, response.clone());
      return response;
    })());
    return;
  }
  if (request.method !== "GET" || !url.href.startsWith(self.registration.scope)
    || ["sw.js", "offline-manifest.json"].includes(url.pathname.slice(new URL(self.registration.scope).pathname.length))) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    if (request.mode === "navigate") {
      const shell = await cache.match(address("index.html"));
      if (shell) return shell;
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    // Other open clients may still be using the previous renderer.
    for (const name of await caches.keys()) {
      if (!name.startsWith(prefix) || name === cacheName) continue;
      const response = await (await caches.open(name)).match(request);
      if (response) return response;
    }
    try {
      return await fetch(request);
    } catch (error) {
      if (request.mode !== "navigate") throw error;
      return new Response("<!doctype html><html lang=\"de\"><meta charset=\"utf-8\"><title>Offline-Daten fehlen</title><h1>Offline-Daten fehlen</h1><p>Bitte öffne die App erneut mit Internetverbindung und lade sie vollständig.</p></html>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
  })());
});
