import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createSiteConfig } from "./site-config.mjs";
import { loadContentData } from "../content-data/content-data.mjs";
import { escapeHtml, renderSite } from "./site-render.mjs";
import { unreviewedPreviewVariable } from "../content-data/site-game-discussions.mjs";
import { generateApp } from "../app-generation/generate-app.mjs";
import { generateAiBot } from "../ai-bot-generation/generate-ai-bot.mjs";
import { generalPageAliases } from "../content-data/project-info.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const hash = (content) => createHash("sha256").update(content).digest("hex");

async function optionalStat(file) {
  try {
    return await lstat(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function validateSite(pages, assets, config) {
  const files = new Set([...pages.keys(), ...assets.keys()]);
  let maxHtmlGzip = 0;
  const cssGzip = [...assets.entries()].filter(([file]) => !file.startsWith("app/") && file.endsWith(".css"))
    .reduce((sum, [, content]) => sum + gzipSync(content).length, 0);
  let jsGzip = 0;
  if (cssGzip > 20 * 1024) throw new Error(`CSS überschreitet 20 KiB gzip: ${cssGzip} Bytes.`);
  for (const [file, page] of pages) {
    const bytes = gzipSync(page.html).length;
    maxHtmlGzip = Math.max(bytes, maxHtmlGzip);
    if (bytes > 50 * 1024) throw new Error(`${file}: HTML überschreitet 50 KiB gzip (${bytes} Bytes).`);
    if ((page.html.match(/<h1(?:\s|>)/gu) ?? []).length !== 1) throw new Error(`${file}: Genau eine h1 erforderlich.`);
    const canonicalTag = `<link rel="canonical" href="${config.absolute(page.route)}">`;
    if ((page.html.match(/<link\b[^>]*\brel="canonical"[^>]*>/gu) ?? []).length !== 1
      || !page.html.includes(canonicalTag)) {
      throw new Error(`${file}: Genau ein absoluter, selbstreferenzierender Canonical erforderlich.`);
    }
    const scripts = [...page.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gu)];
    if (scripts[0]?.[1] !== ' type="application/ld+json"' || scripts.length < 2 || scripts.length > 3
      || scripts[1]?.[1] !== "" || !scripts[1]?.[2].trim()
      || (scripts.length === 3 && !/^ (?:type="module"|defer) src="[^"]+"$/u.test(scripts[2][1]))) {
      throw new Error(`${file}: Nur JSON-LD, ein Inline-Darstellungs-Skript und ein lokales Interaktions-Skript sind erlaubt.`);
    }
    const pageJsGzip = scripts.slice(1).reduce((sum, script) => {
      if (script[1] === "") return sum + gzipSync(script[2]).length;
      const url = new URL(/\bsrc="([^"]+)"/u.exec(script[1])[1], config.absolute(page.route));
      const asset = url.pathname.slice(config.basePath.length);
      const content = assets.get(asset);
      return sum + (content === undefined ? 0 : gzipSync(content).length);
    }, 0);
    jsGzip = Math.max(jsGzip, pageJsGzip);
    if (pageJsGzip > 5 * 1024) throw new Error(`${file}: JavaScript überschreitet 5 KiB gzip: ${pageJsGzip} Bytes.`);
    const schema = JSON.parse(scripts[0][2]);
    for (const match of page.html.matchAll(/<(a|img|source|iframe|link|script)\b[^>]*>/gu)) {
      const tag = match[0];
      const url = /\b(?:href|src|srcset)="([^"]*)"/u.exec(tag)?.[1];
      if (!url) continue;
      const target = new URL(url.replaceAll("&amp;", "&"), config.absolute(page.route));
      if (target.origin === new URL(config.baseUrl).origin) continue;
      if (match[1] === "a") {
        if (!/\brel="[^"]*\bexternal\b/u.test(tag)) throw new Error(`${file}: Externer Link ohne Kennzeichnung.`);
      } else if (target.protocol !== "https:" || !(
        (match[1] === "img" && target.hostname === "i.ytimg.com")
        || (match[1] === "iframe" && target.hostname === "www.youtube-nocookie.com")
      )) {
        throw new Error(`${file}: Unerlaubte externe Ressource ${target.href}`);
      }
    }
    function validateUrl(value, checkFragment = true, allowAbsolute = false) {
      const target = new URL(value, config.absolute(page.route));
      if (target.origin !== new URL(config.baseUrl).origin) {
        if (!["http:", "https:"].includes(target.protocol)) throw new Error(`${file}: Unerlaubtes Linkprotokoll.`);
        return;
      }
      if (!target.pathname.startsWith(config.basePath)) throw new Error(`${file}: Link außerhalb des Projektpfads: ${value}`);
      if (!allowAbsolute && /^(?:\/|[a-z][a-z\d+.-]*:)/iu.test(value)) throw new Error(`${file}: Interner Link muss seitenrelativ sein: ${value}`);
      const relative = target.pathname.slice(config.basePath.length);
      const targetFile = relative.endsWith("/") || !relative ? `${relative}index.html` : relative;
      if (!files.has(targetFile)) throw new Error(`${file}: Nicht erzeugtes Linkziel ${value}`);
      if (checkFragment && target.hash && pages.has(targetFile)) {
        const fragment = decodeURIComponent(target.hash.slice(1));
        if (!pages.get(targetFile).html.includes(`id="${escapeHtml(fragment)}"`)) throw new Error(`${file}: Unbekanntes Fragment ${value}`);
      }
    }
    validateUrl(config.absolute(page.route), false, true);
    for (const match of page.html.replace(canonicalTag, "").matchAll(/\b(?:href|src|srcset)="([^"]*)"/gu)) {
      validateUrl(match[1].replaceAll("&amp;", "&"));
    }
    const ogUrl = /<meta property="og:url" content="([^"]*)">/u.exec(page.html)?.[1];
    if (ogUrl) validateUrl(ogUrl.replaceAll("&amp;", "&"), true, true);
    function validateSchema(value, key) {
      if (Array.isArray(value)) {
        for (const item of value) validateSchema(item, key);
      } else if (value && typeof value === "object") {
        for (const [property, item] of Object.entries(value)) validateSchema(item, property);
      } else if (typeof value === "string" && ["@id", "url", "item", "sameAs", "embedUrl", "thumbnailUrl"].includes(key)) {
        validateUrl(value, false);
      }
    }
    validateSchema(schema);
  }
  return { cssGzip, jsGzip, maxHtmlGzip };
}

function checkOutputPath(output, cache) {
  if (path.basename(output) !== "docs") {
    throw new Error(`Unsicheres Ausgabeverzeichnis: ${output}; der Ausgabeordner muss docs heißen.`);
  }
  const protectedPaths = [projectRoot, path.resolve(cache), path.parse(output).root];
  for (const protectedPath of protectedPaths) {
    if (output === protectedPath || protectedPath.startsWith(`${output}${path.sep}`)) {
      throw new Error(`Unsicheres Ausgabeverzeichnis: ${output}`);
    }
  }
  if (output.startsWith(`${path.join(projectRoot, "src")}${path.sep}`) || output === path.join(projectRoot, "src")
    || output.startsWith(`${path.join(projectRoot, "tests")}${path.sep}`) || output === path.join(projectRoot, "tests")
    || output.startsWith(`${cache}${path.sep}`)) {
    throw new Error(`Ausgabe darf keine Quelldateien überschreiben: ${output}`);
  }
}

export async function generateSite({
  cacheDirectory = path.join(projectRoot, "cache"),
  outputDirectory = path.join(projectRoot, "docs"),
  baseUrl,
  retainPreviousAssets = process.env.GITHUB_ACTIONS === "true",
  now = Date.now(),
  logger = console,
} = {}) {
  const output = path.resolve(outputDirectory);
  const cache = path.resolve(cacheDirectory);
  checkOutputPath(output, cache);
  const previousOutput = await optionalStat(output);
  if (previousOutput && (!previousOutput.isDirectory() || previousOutput.isSymbolicLink())) {
    throw new Error(`Ausgabe muss ein echtes Verzeichnis sein: ${output}`);
  }
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new Error("Ungültiger Build-Zeitpunkt.");
  const changedAt = new Date(now).toISOString();
  const config = createSiteConfig(baseUrl);
  config.markdown = true;
  config.offlineApp = true;
  const manifestFile = path.join(output, "build-manifest.json");
  const manifestStat = await optionalStat(manifestFile);
  let previousManifest;
  if (manifestStat) {
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error("Build-Manifest muss eine echte Datei sein.");
    previousManifest = JSON.parse(await readFile(manifestFile, "utf8"));
    if (![1, 2].includes(previousManifest?.version) || typeof previousManifest.baseUrl !== "string"
      || !previousManifest.pages || typeof previousManifest.pages !== "object" || Array.isArray(previousManifest.pages)) {
      throw new Error("Ungültiges Build-Manifest.");
    }
    for (const entry of Object.values(previousManifest.pages)) {
      if (!entry || typeof entry.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(entry.fingerprint)
        || (entry.lastModified !== undefined && (typeof entry.lastModified !== "string"
          || !Number.isFinite(Date.parse(entry.lastModified)) || new Date(entry.lastModified).toISOString() !== entry.lastModified))
        || (previousManifest.version === 2 && entry.lastModified === undefined)) {
        throw new Error("Ungültiger Seiten-Eintrag im Build-Manifest.");
      }
    }
  }
  const model = await loadContentData(cache, { now });
  for (const warning of model.warnings) logger.warn(`Build-Hinweis: ${warning}`);

  const [pico, customCss, license, seriesJs, favicon, touchIcon, tableJs, processJs] = await Promise.all([
    readFile(new URL("./vendor/pico-2.1.1.site.min.css", import.meta.url), "utf8"),
    readFile(new URL("./site.css", import.meta.url), "utf8"),
    readFile(new URL("./vendor/pico-LICENSE.md", import.meta.url), "utf8"),
    readFile(new URL("./video-series.js", import.meta.url), "utf8"),
    readFile(new URL("./assets/favicon.webp", import.meta.url)),
    readFile(new URL("./assets/apple-touch-icon.png", import.meta.url)),
    readFile(new URL("./game-table.js", import.meta.url), "utf8"),
    readFile(new URL("./process-diagram.js", import.meta.url), "utf8"),
  ]);
  const css = `${pico.replace(/\/\*# sourceMappingURL=[\s\S]*?\*\//gu, "")}\n${customCss}`;
  const cssUrls = [...css.matchAll(/url\(\s*["']?([^)]*)\)/giu)].map((match) => match[1].replace(/["']$/u, "").trim());
  if (/@import\b/iu.test(css) || cssUrls.some((url) => !url.startsWith("data:image/svg+xml"))) {
    throw new Error("CSS darf keine externen Ressourcen oder nicht eingebetteten Bilder nachladen.");
  }
  const cssFile = `assets/site.${hash(css).slice(0, 12)}.css`;
  const jsFile = `assets/video-series.${hash(seriesJs).slice(0, 12)}.js`;
  const tableFile = `assets/game-table.${hash(tableJs).slice(0, 12)}.js`;
  const processFile = `assets/process-diagram.${hash(processJs).slice(0, 12)}.js`;
  const assets = new Map([[cssFile, css], [jsFile, seriesJs], [tableFile, tableJs], ["favicon.webp", favicon], ["apple-touch-icon.png", touchIcon], ["assets/pico-LICENSE.txt", license], [".nojekyll", ""], ...model.magazineLogoAssets]);
  assets.set(processFile, processJs);
  const app = await generateApp(model, config, assets);
  for (const [file, value] of app.files) assets.set(file, value);
  const pages = renderSite(model, config, cssFile, jsFile, tableFile, processFile);
  for (const [file, content] of generateAiBot(model, config, pages)) assets.set(file, content);
  for (const [legacy, target] of Object.entries(generalPageAliases)) {
    const href = escapeHtml(config.href(target, legacy));
    assets.set(`${legacy}index.html`, `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Seite umgezogen | Pretty Old Pixel</title><meta name="robots" content="noindex, follow">
<link rel="canonical" href="${escapeHtml(config.absolute(target))}">
<meta http-equiv="refresh" content="0;url=${href}"></head>
<body><h1>Diese Seite ist umgezogen</h1><p><a href="${href}">Zur neuen Adresse</a></p></body></html>
`);
  }
  const budgets = validateSite(pages, assets, config);
  const manifest = {
    version: 2, baseUrl: config.baseUrl,
    pages: Object.fromEntries([...pages].map(([file, page]) => {
      const fingerprint = hash(page.html);
      const previous = previousManifest?.pages[file];
      return [file, {
        fingerprint, contentPublishedAt: page.contentPublishedAt,
        lastModified: previous?.fingerprint === fingerprint && previous.lastModified ? previous.lastModified : changedAt,
      }];
    })),
  };
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...pages]
    .filter(([, page]) => page.indexable).map(([file, page]) => `<url><loc>${escapeHtml(config.absolute(page.route))}</loc><lastmod>${manifest.pages[file].lastModified}</lastmod></url>`).join("\n")}\n</urlset>\n`;
  assets.set("sitemap.xml", sitemap);
  assets.set("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${config.absolute("sitemap.xml")}\n`);

  const content = new Map([...assets, ...[...pages].map(([file, page]) => [file, page.html])]);
  content.set("build-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

  // Cached HTML can still reference earlier assets after a Pages deployment.
  const previousAssets = path.join(output, "assets");
  const assetsStat = await optionalStat(previousAssets);
  if (assetsStat) {
    if (!assetsStat.isDirectory() || assetsStat.isSymbolicLink()) throw new Error("Asset-Verzeichnis muss ein echtes Verzeichnis sein.");
    for (const file of retainPreviousAssets ? (await readdir(previousAssets)).sort() : []) {
      const match = /^(?:site\.([a-f0-9]{12})\.css|(?:video-series|theme|game-table)\.([a-f0-9]{12})\.js)$/u.exec(file);
      if (!match) continue;
      const source = path.join(previousAssets, file);
      const sourceStat = await lstat(source);
      if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error(`Versioniertes Asset muss eine echte Datei sein: ${file}`);
      const value = await readFile(source);
      if (hash(value).slice(0, 12) !== (match[1] ?? match[2])) throw new Error(`Inhalts-Hash des bisherigen Assets stimmt nicht: ${file}`);
      // Retained versions are not loaded by new pages and do not count toward their budgets.
      content.set(`assets/${file}`, value);
    }
  }

  await mkdir(path.dirname(output), { recursive: true });
  const staging = await mkdtemp(path.join(path.dirname(output), ".site-build-"));
  const backup = `${staging}-previous`;
  let reused = 0;
  let movedPrevious = false;
  try {
    for (const [file, value] of content) {
      const destination = path.join(staging, file);
      await mkdir(path.dirname(destination), { recursive: true });
      const previous = path.join(output, file);
      const oldStat = await optionalStat(previous);
      if (oldStat?.isFile() && !oldStat.isSymbolicLink() && (await readFile(previous)).equals(Buffer.from(value))) {
        await copyFile(previous, destination);
        const times = await stat(previous);
        await utimes(destination, times.atime, times.mtime);
        reused += 1;
      } else {
        await writeFile(destination, value);
      }
    }
    if (previousOutput) {
      await rename(output, backup);
      movedPrevious = true;
    }
    try {
      await rename(staging, output);
    } catch (error) {
      if (movedPrevious) await rename(backup, output);
      movedPrevious = false;
      throw error;
    }
    if (movedPrevious) await rm(backup, { recursive: true });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  const unreviewedPages = unreviewedDiscussionPages(pages, model);
  const result = { pages: pages.size, files: content.size, reused, warnings: model.warnings, unreviewedPages, app: { version: app.version, bytes: app.bytes, gzip: app.gzip, dataBytes: app.dataBytes, sizes: app.sizes }, ...budgets };
  logger.log(`Statische Website erstellt: ${output}\n${result.pages} Seiten, ${reused}/${result.files} Dateien unverändert übernommen. CSS: ${budgets.cssGzip} Bytes gzip, JavaScript: ${budgets.jsGzip} Bytes gzip, größtes HTML: ${budgets.maxHtmlGzip} Bytes gzip.`);
  logger.log(`Offline-App: ${(app.bytes / 1e6).toFixed(2)} MB Nutzdaten, ${(app.gzip / 1e6).toFixed(2)} MB gzip; JSON: ${(app.dataBytes / 1e6).toFixed(2)} MB.`);
  for (const [category, size] of Object.entries(app.sizes)) logger.log(`  ${category}: ${size.bytes} Bytes, ${size.gzip} Bytes gzip.`);
  if (process.env[unreviewedPreviewVariable] === "1" || unreviewedPages.length) logger.log(unreviewedReport(unreviewedPages));
  return result;
}

export function unreviewedDiscussionPages(pages, model) {
  const result = [];
  for (const [file, page] of pages) {
    const counts = new Map();
    for (const [, videoId] of page.html.matchAll(/data-unreviewed-video="([^"]+)"/gu)) {
      counts.set(videoId, (counts.get(videoId) ?? 0) + 1);
    }
    if (!counts.size) continue;
    result.push({ file, route: page.route, videos: [...counts].map(([id, count]) => ({
      id, count, title: model.videoById.get(id)?.title ?? id,
    })) });
  }
  return result.sort((a, b) => a.route.localeCompare(b.route));
}

function unreviewedReport(entries) {
  if (!entries.length) return `${unreviewedPreviewVariable}=1: keine ungeprüften Spielebesprechungen gefunden.`;
  const total = entries.reduce((sum, entry) => sum + entry.videos.reduce((count, video) => count + video.count, 0), 0);
  return [
    `${unreviewedPreviewVariable}=1: ${total} ungeprüfte Sprungmarken auf ${entries.length} ${entries.length === 1 ? "Seite" : "Seiten"} (Vorschau mit npm run dev):`,
    ...entries.flatMap((entry) => [
      `  http://127.0.0.1:8000/${entry.route}`,
      ...entry.videos.map((video) => `    ${video.id}: ${video.count} ungeprüft · ${video.title}`),
    ]),
    "Nicht veröffentlichen: ohne Schalter erneut bauen; nur Analysen mit status: \"reviewed\" erscheinen.",
  ].join("\n");
}

export async function runCli() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--base-url")) {
    console.error("Aufruf: node src/generate-site.mjs [--base-url https://host/projekt/]");
    process.exitCode = 1;
  } else {
    try {
      await generateSite({ baseUrl: args[1] });
    } catch (error) {
      console.error(`Website-Build fehlgeschlagen: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
