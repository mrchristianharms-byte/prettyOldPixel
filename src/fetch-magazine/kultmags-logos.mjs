import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { cacheFileName, normalizeMagazineName, readJson } from "../shared/archive-cache.mjs";

const MAX_BYTES = 2 * 1024 * 1024;

export function kultmagsLogoUrl(value) {
  const url = new URL(value, "https://www.kultmags.com/");
  if (url.protocol !== "https:" || url.hostname !== "www.kultmags.com"
    || url.username || url.password || url.port || !/\.(?:png|jpe?g|gif|webp)$/iu.test(url.pathname)) {
    throw new Error(`Ungültige Kultmags-Logoadresse: ${value}`);
  }
  return url;
}

function imageExtension(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (/^GIF8[79]a$/u.test(bytes.subarray(0, 6).toString("ascii"))) return "gif";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return "webp";
  throw new Error("Kultmags-Logo: Unbekanntes Bildformat.");
}

export async function cacheMagazineLogo(url, cacheDir, fetcher) {
  if (!url) return null;
  const target = new URL(url);
  if (target.protocol !== "https:" || !["www.kultmags.com", "amr.abime.net", "www.pcgamesdatabase.de"].includes(target.hostname)
    || target.username || target.password || target.port || !/\.(?:png|jpe?g|gif|webp)$/iu.test(target.pathname)) {
    throw new Error(`Ungültige Magazin-Logoadresse: ${url}`);
  }
  const response = await fetcher.fetchResponse(target.href, { redirect: "error", signal: AbortSignal.timeout(60_000) });
  if (!response.body) throw new Error("Kultmags-Logo: Leere Antwort.");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error("Kultmags-Logo überschreitet 2 MiB.");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const file = `${createHash("sha256").update(bytes).digest("hex")}.${imageExtension(bytes)}`;
  const directory = path.join(cacheDir, "logos");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${file}.tmp`), bytes);
  await rename(path.join(directory, `${file}.tmp`), path.join(directory, file));
  return { url: target.href, file };
}

export async function cacheKultmagsLogo(url, cacheDir, fetcher) {
  if (url) kultmagsLogoUrl(url);
  return convertKultmagsLogo(await cacheMagazineLogo(url, cacheDir, fetcher), cacheDir);
}

export async function convertKultmagsLogo(logo, cacheDir) {
  if (!logo) return logo;
  const bytes = await readLogoFile(logo.file, cacheDir);
  const stem = path.parse(logo.file).name;
  if (Array.isArray(logo.variants) && logo.variants.length === 2
    && ["webp", "gif"].every((format) => logo.variants.some((variant) =>
      variant.file === `${stem}.${format}` && /^[a-f0-9]{64}$/u.test(variant.sha256)))) {
    for (const variant of logo.variants) await readLogoFile(variant.file, cacheDir, variant.sha256);
    return logo;
  }
  const variants = [];
  const { default: sharp } = await import("sharp");
  for (const format of ["webp", "gif"]) {
    const image = sharp(bytes, { animated: true, limitInputPixels: 40_000_000 });
    const converted = imageExtension(bytes) === format ? bytes
      : await (format === "webp" ? image.webp({ lossless: true, effort: 6 }) : image.gif({ effort: 7 })).toBuffer();
    if (converted.length > MAX_BYTES) throw new Error(`Kultmags-Logo: ${format}-Variante überschreitet 2 MiB.`);
    const file = `${stem}.${format}`;
    await writeFile(path.join(cacheDir, "logos", `${file}.tmp`), converted);
    await rename(path.join(cacheDir, "logos", `${file}.tmp`), path.join(cacheDir, "logos", file));
    variants.push({ file, sha256: createHash("sha256").update(converted).digest("hex") });
  }
  return { ...logo, variants };
}

async function readLogoFile(file, cacheDir, sha256) {
  if (typeof file !== "string" || !/^[a-f0-9]{64}\.(?:png|jpg|gif|webp)$/u.test(file)) {
    throw new Error("Ungültiger Logo-Dateiname.");
  }
  const bytes = await readFile(path.join(cacheDir, "logos", file));
  const expectedHash = sha256 === undefined ? path.parse(file).name : sha256;
  if (bytes.length > MAX_BYTES || !/^[a-f0-9]{64}$/u.test(expectedHash)
    || expectedHash !== createHash("sha256").update(bytes).digest("hex")
    || path.extname(file) !== `.${imageExtension(bytes)}`) {
    throw new Error("Logo-Inhalt stimmt nicht mit dem Cache überein.");
  }
  return bytes;
}

export async function cleanKultmagsLogos(cacheDir) {
  const referenced = new Set();
  await mkdir(path.join(cacheDir, "magazines"), { recursive: true });
  for (const entry of await readdir(path.join(cacheDir, "magazines"), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const cached = await readJson(path.join(cacheDir, "magazines", entry.name));
    if (!cached?.logo) continue;
    for (const logo of [cached.logo, ...(cached.logo.variants ?? [])]) {
      await readLogoFile(logo.file, cacheDir, logo.sha256);
      referenced.add(logo.file);
    }
  }
  const removed = [];
  if (!referenced.size) {
    // Caches without logos need not have a logo directory yet.
    await mkdir(path.join(cacheDir, "logos"), { recursive: true });
  }
  for (const entry of await readdir(path.join(cacheDir, "logos"), { withFileTypes: true })) {
    if (entry.isFile() && /^[a-f0-9]{64}\.(?:png|jpg|gif|webp)$/u.test(entry.name) && !referenced.has(entry.name)) {
      await unlink(path.join(cacheDir, "logos", entry.name));
      removed.push(entry.name);
    }
  }
  return removed;
}

export async function attachMagazineLogo(model, magazine, cached, cacheDir, sourceLabel) {
  if (!cached?.logo) return;
  const { url, file } = cached.logo;
  const target = new URL(url);
  const source = new URL(cached.url);
  const host = sourceLabel === "AMR" ? "amr.abime.net"
    : sourceLabel === "PC Games Database" ? "www.pcgamesdatabase.de" : "www.kultmags.com";
  if (target.protocol !== "https:" || target.hostname !== host || target.username || target.password || target.port
    || source.protocol !== "https:" || source.hostname !== host || source.username || source.password || source.port
    || typeof file !== "string" || !/^[a-f0-9]{64}\.(?:png|jpg|gif|webp)$/u.test(file)) {
    throw new Error(`${magazine.name}: Ungültiger Logo-Dateiname oder Ursprung.`);
  }
  if (cached.logo.variants !== undefined && !Array.isArray(cached.logo.variants)) {
    throw new Error(`${magazine.name}: Ungültige Logo-Varianten.`);
  }
  const candidates = [];
  const seen = new Set();
  for (const candidate of [cached.logo, ...(cached.logo.variants ?? [])]) {
    const bytes = await readLogoFile(candidate.file, cacheDir, candidate.sha256);
    if (seen.has(candidate.file)) continue;
    seen.add(candidate.file);
    const asset = `assets/magazine-logos/${candidate.file}`;
    model.magazineLogoAssets.set(asset, bytes);
    const extension = imageExtension(bytes);
    candidates.push({ asset, size: bytes.length, type: `image/${extension === "jpg" ? "jpeg" : extension}` });
  }
  candidates.sort((a, b) => a.size - b.size || a.asset.localeCompare(b.asset));
  const fallback = candidates.find((candidate) => candidate.type !== "image/webp") ?? candidates[0];
  magazine.logo = { asset: fallback.asset, candidates, sourceUrl: cached.url, sourceLabel };
}

export async function loadMagazineLogos(model, cacheDirectory) {
  const cacheDir = path.join(cacheDirectory, "kultmags");
  const index = await readJson(path.join(cacheDir, "index.json"));
  model.magazineLogoAssets = new Map();
  if (!index) return model;
  if (!Array.isArray(index.magazines)) throw new Error("Kultmags-Index: Zeitschriftenliste fehlt.");
  const byName = new Map(index.magazines.map((entry) => [normalizeMagazineName(entry.name), entry]));
  for (const magazine of model.magazines) {
    const entry = byName.get(normalizeMagazineName(magazine.name));
    if (!entry) continue;
    const cached = await readJson(path.join(cacheDir, "magazines", cacheFileName(entry.name)));
    if (!cached?.logo) continue;
    await attachMagazineLogo(model, magazine, cached, cacheDir, "kultmags.com");
  }
  return model;
}
