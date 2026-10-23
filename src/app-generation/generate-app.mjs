import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { exportAppData, hydrateAppData } from "./app-model.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const sourceRoot = new URL("../", import.meta.url);

async function browserModules() {
  const files = new Map();
  async function visit(file) {
    if (files.has(file)) return;
    const source = await readFile(new URL(file, sourceRoot), "utf8");
    files.set(file, source);
    for (const match of source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/gu)) {
      if (!match[1].startsWith(".")) throw new Error(`App-Modul darf keine Paket-/Node-Imports haben: ${file}`);
      const dependency = new URL(match[1], new URL(file, sourceRoot));
      if (!dependency.href.startsWith(sourceRoot.href)) throw new Error("App-Import außerhalb von src.");
      await visit(dependency.href.slice(sourceRoot.href.length));
    }
  }
  await visit("app-generation/app.js");
  return files;
}

export async function generateApp(model, config, websiteAssets) {
  const data = exportAppData(model, config.baseUrl);
  hydrateAppData(data);
  const modules = await browserModules();
  modules.set("assets/offline-preview.svg", await readFile(new URL("./assets/offline-preview.svg", import.meta.url)));
  modules.set("data.json", JSON.stringify(data));
  modules.set("app.css", await readFile(new URL("./app.css", import.meta.url), "utf8"));
  for (const size of [192, 512]) modules.set(`icon-${size}.png`, await readFile(new URL(`./assets/icon-${size}.png`, import.meta.url)));
  const shared = [...websiteAssets].filter(([name]) =>
    name.endsWith(".css") || name === "assets/pico-LICENSE.txt" || /\.(?:png|webp|gif|jpg)$/u.test(name));
  for (const [name, content] of shared) modules.set(`shared/${name}`, content);
  const worker = await readFile(new URL("./sw.js", import.meta.url), "utf8");
  const generator = await readFile(new URL("./generate-app.mjs", import.meta.url), "utf8");
  const version = hash([...modules].map(([name, content]) => `${name}:${hash(content)}`).join("\n") + worker + generator).slice(0, 20);
  const release = `releases/${version}/`;
  const files = new Map([...modules].map(([name, content]) => [`app/${release}${name}`, content]));
  const css = shared.find(([name]) => name.endsWith(".css"))?.[0];
  if (!css) throw new Error("Gemeinsames App-Stylesheet fehlt.");
  const icon = `${release}shared/apple-touch-icon.png`;
  const manifest = {
    id: "./", name: "Pretty Old Pixel Offline", short_name: "Pretty Old Pixel",
    lang: "de", start_url: "./", scope: "./", display: "standalone",
    background_color: "#fff", theme_color: "#206a8a",
    icons: [192, 512].map((size) => ({ src: `${release}icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png" })),
  };
  files.set("app/manifest.webmanifest", JSON.stringify(manifest));
  files.set("app/index.html", `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,follow"><meta name="theme-color" content="#206a8a">
<meta name="apple-mobile-web-app-title" content="Pretty Old Pixel">
<title>Pretty Old Pixel Offline</title><link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="${icon}"><link rel="icon" href="${release}shared/favicon.webp">
<link rel="stylesheet" href="${release}shared/${css}"><link rel="stylesheet" href="${release}app.css">
<script type="module" src="${release}app-generation/app.js"></script></head>
<body data-version="${version}" data-release="${release}">
<a class="skip-link" href="#inhalt">Zum Inhalt</a>
<header class="container"><a href="#/">Pretty Old Pixel Offline</a>
<nav aria-label="App-Navigation" id="app-nav"></nav><button type="button" id="app-theme">Hell / Dunkel</button></header>
<aside class="container" aria-label="Offline-Speicher"><p id="offline-status" role="status" aria-live="polite">Offline-Daten werden geprüft …</p>
<button type="button" id="offline-retry" hidden>Erneut versuchen</button>
<button type="button" id="offline-update" hidden>Update laden und neu starten</button></aside>
<main class="container" id="inhalt" tabindex="-1"><h1>App wird geladen …</h1></main>
<footer class="container"><a href="../">Öffentliche Website</a> · <a href="#/hilfe/">Installation und Speicher</a> · <a href="#/datenschutz/">Datenschutz</a></footer>
<noscript><p>Diese Offline-App benötigt JavaScript. Die <a href="../">öffentliche Website</a> funktioniert auch ohne JavaScript.</p></noscript></body></html>`);
  const entries = [...files].map(([file, content]) => ({
    url: file.slice(4), hash: hash(content), bytes: Buffer.byteLength(content),
  }));
  const offline = {
    version, schemaVersion: 1, files: entries,
    thumbnails: data.videos.map((video) => `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`),
  };
  files.set("app/offline-manifest.json", JSON.stringify(offline));
  files.set("app/sw.js", `const BUILD = ${JSON.stringify(offline)};\n${worker}`);
  const bytes = [...files.values()].reduce((sum, value) => sum + Buffer.byteLength(value), 0);
  const gzip = [...files.values()].reduce((sum, value) => sum + gzipSync(value).length, 0);
  const sizes = Object.fromEntries(["data", "renderer", "styles", "media", "other"].map((category) => [category, { bytes: 0, gzip: 0 }]));
  for (const [file, content] of files) {
    const category = file.endsWith("/data.json") ? "data"
      : /\.(?:mjs|js)$/u.test(file) ? "renderer"
      : file.endsWith(".css") ? "styles"
      : /\.(?:png|webp|gif|jpg|svg)$/u.test(file) ? "media" : "other";
    sizes[category].bytes += Buffer.byteLength(content);
    sizes[category].gzip += gzipSync(content).length;
  }
  return { files, version, bytes, gzip, dataBytes: sizes.data.bytes, sizes };
}
