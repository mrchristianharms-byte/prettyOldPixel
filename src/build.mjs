import { copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createSiteConfig } from "./site-config.mjs";
import { loadSiteData } from "./site-data.mjs";
import { escapeHtml, renderSite } from "./site-render.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
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
  const cssGzip = [...assets.entries()].filter(([file]) => file.endsWith(".css"))
    .reduce((sum, [, content]) => sum + gzipSync(content).length, 0);
  const jsGzip = [...assets.entries()].filter(([file]) => file.endsWith(".js"))
    .reduce((sum, [, content]) => sum + gzipSync(content).length, 0);
  if (cssGzip > 20 * 1024) throw new Error(`CSS überschreitet 20 KiB gzip: ${cssGzip} Bytes.`);
  if (jsGzip > 5 * 1024) throw new Error(`JavaScript überschreitet 5 KiB gzip: ${jsGzip} Bytes.`);
  for (const [file, page] of pages) {
    const bytes = gzipSync(page.html).length;
    maxHtmlGzip = Math.max(bytes, maxHtmlGzip);
    if (bytes > 50 * 1024) throw new Error(`${file}: HTML überschreitet 50 KiB gzip (${bytes} Bytes).`);
    if ((page.html.match(/<h1(?:\s|>)/gu) ?? []).length !== 1) throw new Error(`${file}: Genau eine h1 erforderlich.`);
    if (!page.html.includes(`<link rel="canonical" href="${config.absolute(page.route)}">`)) throw new Error(`${file}: Canonical fehlt.`);
    const scripts = [...page.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gu)];
    if (scripts[0]?.[1] !== ' type="application/ld+json"' || scripts.length > 2
      || (scripts.length === 2 && !/^ type="module" src="[^"]+"$/u.test(scripts[1][1]))) {
      throw new Error(`${file}: Nur JSON-LD und ein lokales Videowechsel-Modul sind erlaubt.`);
    }
    JSON.parse(scripts[0][2]);
    for (const match of page.html.matchAll(/<(a|img|iframe|link|script)\b[^>]*>/gu)) {
      const tag = match[0];
      const url = /\b(?:href|src)="([^"]*)"/u.exec(tag)?.[1];
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
    for (const match of page.html.matchAll(/\b(?:href|src)="([^"]*)"/gu)) {
      const value = match[1].replaceAll("&amp;", "&");
      const target = new URL(value, config.absolute(page.route));
      if (target.origin !== new URL(config.baseUrl).origin) {
        if (!["http:", "https:"].includes(target.protocol)) throw new Error(`${file}: Unerlaubtes Linkprotokoll.`);
        continue;
      }
      if (!target.pathname.startsWith(config.basePath)) throw new Error(`${file}: Link außerhalb des Projektpfads: ${value}`);
      const relative = target.pathname.slice(config.basePath.length);
      const targetFile = relative.endsWith("/") || !relative ? `${relative}index.html` : relative;
      if (!files.has(targetFile)) throw new Error(`${file}: Nicht erzeugtes Linkziel ${value}`);
      if (target.hash && pages.has(targetFile)) {
        const fragment = decodeURIComponent(target.hash.slice(1));
        if (!pages.get(targetFile).html.includes(`id="${escapeHtml(fragment)}"`)) throw new Error(`${file}: Unbekanntes Fragment ${value}`);
      }
    }
  }
  return { cssGzip, jsGzip, maxHtmlGzip };
}

function checkOutputPath(output, cache) {
  if (path.basename(output) !== "public") {
    throw new Error(`Unsicheres Ausgabeverzeichnis: ${output}; der Ausgabeordner muss public heißen.`);
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

export async function buildSite({
  cacheDirectory = path.join(projectRoot, "cache"),
  outputDirectory = path.join(projectRoot, "public"),
  baseUrl,
  now,
  logger = console,
} = {}) {
  const output = path.resolve(outputDirectory);
  const cache = path.resolve(cacheDirectory);
  checkOutputPath(output, cache);
  const previousOutput = await optionalStat(output);
  if (previousOutput && (!previousOutput.isDirectory() || previousOutput.isSymbolicLink())) {
    throw new Error(`Ausgabe muss ein echtes Verzeichnis sein: ${output}`);
  }
  const config = createSiteConfig(baseUrl);
  const model = await loadSiteData(cache, { now });
  for (const warning of model.warnings) logger.warn(`Build-Hinweis: ${warning}`);

  const [pico, customCss, license, seriesJs] = await Promise.all([
    readFile(path.join(projectRoot, "src/vendor/pico-2.1.1.min.css"), "utf8"),
    readFile(path.join(projectRoot, "src/site.css"), "utf8"),
    readFile(path.join(projectRoot, "src/vendor/pico-LICENSE.md"), "utf8"),
    readFile(path.join(projectRoot, "src/video-series.js"), "utf8"),
  ]);
  const css = `${pico.replace(/\/\*# sourceMappingURL=[\s\S]*?\*\//gu, "")}\n${customCss}`;
  const cssUrls = [...css.matchAll(/url\(\s*["']?([^)]*)\)/giu)].map((match) => match[1].replace(/["']$/u, "").trim());
  if (/@import\b/iu.test(css) || cssUrls.some((url) => !url.startsWith("data:image/svg+xml"))) {
    throw new Error("CSS darf keine externen Ressourcen oder nicht eingebetteten Bilder nachladen.");
  }
  const cssFile = `assets/site.${hash(css).slice(0, 12)}.css`;
  const jsFile = `assets/video-series.${hash(seriesJs).slice(0, 12)}.js`;
  const assets = new Map([[cssFile, css], [jsFile, seriesJs], ["assets/pico-LICENSE.txt", license], [".nojekyll", ""]]);
  const pages = renderSite(model, config, config.href(cssFile), config.href(jsFile));
  const budgets = validateSite(pages, assets, config);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...pages.values()]
    .filter((page) => page.indexable).map((page) => `<url><loc>${escapeHtml(config.absolute(page.route))}</loc></url>`).join("\n")}\n</urlset>\n`;
  assets.set("sitemap.xml", sitemap);
  assets.set("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${config.absolute("sitemap.xml")}\n`);

  const content = new Map([...assets, ...[...pages].map(([file, page]) => [file, page.html])]);
  const manifest = {
    version: 1, baseUrl: config.baseUrl,
    pages: Object.fromEntries([...pages].map(([file, page]) => [file, {
      fingerprint: hash(page.html), contentPublishedAt: page.contentPublishedAt,
    }])),
  };
  content.set("build-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

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
  const result = { pages: pages.size, files: content.size, reused, warnings: model.warnings, ...budgets };
  logger.log(`Statische Website erstellt: ${output}\n${result.pages} Seiten, ${reused}/${result.files} Dateien unverändert übernommen. CSS: ${budgets.cssGzip} Bytes gzip, JavaScript: ${budgets.jsGzip} Bytes gzip, größtes HTML: ${budgets.maxHtmlGzip} Bytes gzip.`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--base-url")) {
    console.error("Aufruf: node src/build.mjs [--base-url https://host/projekt/]");
    process.exitCode = 1;
  } else {
    try {
      await buildSite({ baseUrl: args[1] });
    } catch (error) {
      console.error(`Website-Build fehlgeschlagen: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
