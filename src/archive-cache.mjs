import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_MAX_AGE_DAYS = 365;
export const DEFAULT_INDEX_MAX_AGE_DAYS = 30;
const REQUEST_DELAY_MS = 200;
const MAX_RETRIES = 3;

export function normalizeMagazineName(name) {
  return name.toLowerCase().replace(/[^a-z0-9!]/g, "");
}

export function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`);
  await rename(temporaryFile, file);
}

export function isFresh(data, maxAgeDays, now) {
  return Boolean(data?.fetchedAt) && now - Date.parse(data.fetchedAt) < maxAgeDays * 86_400_000;
}

export function cacheFileName(name) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "magazine"}.json`;
}

// Serializes requests with a polite delay and retries rate limits and server errors.
export function createFetcher({ fetchImpl, sleep, log, siteName }) {
  let requests = 0;
  const fetchPage = async (url) => {
    for (let attempt = 0; ; attempt += 1) {
      if (requests > 0) {
        await sleep(REQUEST_DELAY_MS);
      }
      requests += 1;
      const response = await fetchImpl(url, { headers: { "user-agent": "prettyoldpixel-blaetterabend/1.0" } });
      if (response.ok) {
        return response.text();
      }
      if (attempt >= MAX_RETRIES || (response.status !== 429 && response.status < 500)) {
        throw new Error(`${siteName}-Anfrage fehlgeschlagen (${response.status}): ${url}`);
      }
      log(`  ${siteName} antwortet mit ${response.status}, neuer Versuch …`);
      await sleep(1000 * 2 ** attempt);
    }
  };
  return { fetchPage, requestCount: () => requests };
}

export const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
