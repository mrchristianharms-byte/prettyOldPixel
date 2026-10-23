import { execFile } from "node:child_process";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { writeJson, defaultSleep } from "../shared/archive-cache.mjs";
import { loadContentData } from "../content-data/content-data.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const execute = promisify(execFile);
const MAX_BYTES = 16 * 1024 * 1024;

export class YoutubeRateLimitError extends Error {
  constructor(retryAfter, options) {
    super(`YouTube: HTTP 429 (zu viele Anfragen).${retryAfter ? ` Retry-After: ${retryAfter}.` : ""}`, options);
    this.name = "YoutubeRateLimitError";
    this.status = 429;
  }
}

function isRateLimit(error) {
  return error instanceof YoutubeRateLimitError || error.status === 429
    || /HTTP(?: Error)?\s*429\b|Too Many Requests/iu.test(`${error.message ?? ""}\n${error.stderr ?? ""}`);
}

export function parseTranscript(data) {
  if (!data || !Array.isArray(data.events)) throw new Error("Untertitel: JSON3-Ereignisse fehlen.");
  const segments = [];
  for (const event of data.events) {
    if (!Array.isArray(event.segs)) continue;
    if (event.segs.some((segment) => typeof segment.utf8 !== "string")) {
      throw new Error("Untertitel: Ungültiger Text.");
    }
    const text = event.segs.map((segment) => segment.utf8).join("").trim();
    if (!text) continue;
    if (!Number.isSafeInteger(event.tStartMs) || event.tStartMs < 0
      || (event.dDurationMs !== undefined && (!Number.isSafeInteger(event.dDurationMs) || event.dDurationMs < 0))) {
      throw new Error("Untertitel: Ungültige Zeitmarke.");
    }
    segments.push({ startMs: event.tStartMs, durationMs: event.dDurationMs ?? null, text });
  }
  if (!segments.length) throw new Error("Untertitel: Keine Textsegmente enthalten.");
  return segments;
}

export function selectCaptionTrack(info) {
  const tracks = [];
  for (const [automatic, field] of [[false, "subtitles"], [true, "automatic_captions"]]) {
    if (info[field] === undefined || !info[field] || typeof info[field] !== "object" || Array.isArray(info[field])) {
      throw new Error(`yt-dlp: Ungültige oder fehlende ${field}.`);
    }
    for (const [language, formats] of Object.entries(info[field])) {
      if (language === "live_chat") continue;
      if (!Array.isArray(formats)) throw new Error("yt-dlp: Ungültige Untertitelspur.");
      const track = formats.find((format) => format.ext === "json3" && typeof format.url === "string");
      tracks.push({ language, automatic, track });
    }
  }
  if (!tracks.length) return null;
  const rank = ({ language, automatic }) => /^de(?:-|$)/iu.test(language) ? Number(automatic)
    : /^en(?:-|$)/iu.test(language) ? 2 + Number(automatic) : 4 + Number(automatic);
  tracks.sort((a, b) => rank(a) - rank(b) || Number(b.language.endsWith("-orig")) - Number(a.language.endsWith("-orig"))
    || a.language.localeCompare(b.language, "en"));
  const selected = tracks[0];
  if (!selected.track) throw new Error(`Untertitel: JSON3 für ${selected.language} nicht verfügbar.`);
  return { language: selected.language, automatic: selected.automatic, url: selected.track.url };
}

async function captionJson(url, fetchImpl, sleep, log) {
  const target = new URL(url);
  if (target.protocol !== "https:" || !["www.youtube.com", "youtube.com"].includes(target.hostname)
    || target.pathname !== "/api/timedtext" || target.username || target.password || (target.port && target.port !== "443")) {
    throw new Error("Untertitel: Unerwartete YouTube-Untertiteladresse.");
  }
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetchImpl(target.href, { redirect: "error", signal: AbortSignal.timeout(60_000) });
    if (response.status === 429) {
      await response.body?.cancel();
      throw new YoutubeRateLimitError(response.headers.get("retry-after"));
    }
    if (![500, 502, 503, 504].includes(response.status) || attempt === 2) break;
    await response.body?.cancel();
    const delay = 5000 * 2 ** attempt;
    log(`YouTube-Untertitel: HTTP ${response.status}; Wiederholung ${attempt + 1}/2 nach ${delay / 1000} Sekunden.`);
    await sleep(delay);
  }
  if (!response.ok) throw new Error(`YouTube-Untertitel: HTTP ${response.status}.`);
  if (!response.body) throw new Error("YouTube-Untertitel: Antwort fehlt.");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error("YouTube-Untertitel: Antwort überschreitet 16 MiB.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function fetchTranscript(videoId, { execFileImpl = execute, fetchImpl = fetch, log = console.log, sleep = defaultSleep } = {}) {
  if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId)) throw new Error("Ungültige YouTube-Video-ID.");
  let metadata;
  try {
    metadata = await execFileImpl("yt-dlp", [
      "--ignore-config", "--no-cache-dir", "--no-playlist", "--skip-download",
      "--dump-single-json", "--socket-timeout", "30", "--retries", "0", "--extractor-retries", "0",
      "--", `https://www.youtube.com/watch?v=${videoId}`,
    ], { timeout: 120_000, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" });
  } catch (error) {
    if (isRateLimit(error)) throw new YoutubeRateLimitError(undefined, { cause: error });
    throw error;
  }
  const { stdout, stderr } = metadata;
  if (stderr.trim()) log(`yt-dlp/${videoId}: ${stderr.trim()}`);
  if (isRateLimit({ stderr })) throw new YoutubeRateLimitError();
  const info = JSON.parse(stdout);
  if (info.id !== videoId) throw new Error("yt-dlp: Video-ID der Antwort stimmt nicht überein.");
  const track = selectCaptionTrack(info);
  if (!track) return { status: "unavailable", reason: "no-public-captions" };
  await sleep(3000);
  return {
    status: "available", language: track.language, automatic: track.automatic,
    segments: parseTranscript(await captionJson(track.url, fetchImpl, sleep, log)),
  };
}

function validateCache(data, videoId) {
  if (!data || data.version !== 1 || data.videoId !== videoId || !Number.isFinite(Date.parse(data.checkedAt))
    || !["available", "unavailable"].includes(data.status)) {
    throw new Error(`${videoId}: Ungültiger Transkript-Cache; kein erneuter Abruf.`);
  }
  if (data.status === "available") {
    if (typeof data.language !== "string" || typeof data.automatic !== "boolean" || !Array.isArray(data.segments) || !data.segments.length
      || data.segments.some((segment) => !Number.isSafeInteger(segment.startMs) || segment.startMs < 0
        || (segment.durationMs !== null && (!Number.isSafeInteger(segment.durationMs) || segment.durationMs < 0))
        || typeof segment.text !== "string" || !segment.text.trim())) {
      throw new Error(`${videoId}: Beschädigte Transkriptsegmente; kein erneuter Abruf.`);
    }
  } else if (data.reason !== "no-public-captions") {
    throw new Error(`${videoId}: Ungültiger Untertitelstatus; kein erneuter Abruf.`);
  }
}

async function readCachedTranscript(file) {
  let contents;
  try {
    contents = await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
  return JSON.parse(contents);
}

export async function fetchYoutubeTranscripts({
  cacheDirectory = path.join(projectRoot, "cache"),
  targetDirectory = path.join(cacheDirectory, "youtube-transcripts"),
  fetchTranscriptImpl = fetchTranscript, log = console.log, sleep = defaultSleep,
} = {}) {
  const model = await loadContentData(cacheDirectory);
  const videos = model.videos.filter((video) => video.blaetterabend || video.magazines.length);
  await mkdir(targetDirectory, { recursive: true });
  const result = { selected: videos.length, fetched: 0, unavailable: 0, skipped: 0, failed: 0 };
  log(`Transkript-Abruf: ${videos.length} Blätterabend-/Zeitschriftenvideos ausgewählt.`);
  log(`Cache: ${targetDirectory}`);
  let rateLimit;
  for (const [index, video] of videos.entries()) {
    const progress = `[${index + 1}/${videos.length} · ${Math.floor((index + 1) / videos.length * 100)} %]`;
    const context = `${progress} ${video.id} – ${video.title}`;
    const file = path.join(targetDirectory, `${video.id}.json`);
    const existing = await readCachedTranscript(file);
    if (existing !== undefined) {
      validateCache(existing, video.id);
      result.skipped += 1;
      continue;
    }
    const lockFile = path.join(targetDirectory, `${video.id}.lock`);
    let lock;
    try {
      lock = await open(lockFile, "wx");
    } catch (error) {
      throw new Error(`${video.id}: Transkript gesperrt oder nicht schreibbar (${error.code}); laufenden Abruf prüfen, verwaiste Sperre gegebenenfalls manuell entfernen.`, { cause: error });
    }
    try {
      const cached = await readCachedTranscript(file);
      if (cached !== undefined) {
        validateCache(cached, video.id);
        result.skipped += 1;
        continue;
      }
      if (result.fetched + result.unavailable + result.failed > 0) {
        log(`${context}: Pause von 15 Sekunden vor dem nächsten Abruf.`);
        await sleep(15_000);
      }
      log(`${context}: Transkript abrufen …`);
      log(`  Video: ${video.url}`);
      const data = await fetchTranscriptImpl(video.id, { log, sleep });
      const record = { ...data, version: 1, videoId: video.id, checkedAt: new Date().toISOString(), source: "youtube-public-captions" };
      validateCache(record, video.id);
      await writeJson(file, record);
      result[data.status === "available" ? "fetched" : "unavailable"] += 1;
      log(`${context}: ${data.status === "available"
        ? `Transkript gespeichert (${data.language}, ${data.automatic ? "automatische" : "manuelle"} Untertitel, ${data.segments.length} Segmente)`
        : "Keine öffentlichen Untertitel; dauerhaft vermerkt"}.`);
    } catch (error) {
      result.failed += 1;
      log(`${progress} FEHLER ${video.id}: ${error.message} – ${video.title}`);
      if (isRateLimit(error)) {
        rateLimit = error;
        log("Rate-Limit: Abruf sofort gestoppt; keine Wiederholung und keine weiteren Videos. Vor einem neuen Lauf abwarten; gegebenenfalls Retry-After beachten.");
        break;
      }
    } finally {
      await lock.close();
      await unlink(lockFile);
    }
  }
  log(`${rateLimit ? "Abgebrochen" : "Abgeschlossen"}: ${result.fetched + result.unavailable + result.skipped + result.failed}/${result.selected} Videos geprüft.`);
  log(`Transkripte: ${result.fetched} neu gespeichert, ${result.unavailable} ohne Untertitel, ${result.skipped} aus Cache übersprungen, ${result.failed} fehlgeschlagen.`);
  if (rateLimit) throw new Error("YouTube-Rate-Limit (HTTP 429): Lauf abgebrochen. Gespeicherte Transkripte bleiben erhalten; erst nach einer ausreichenden Pause erneut starten.", { cause: rateLimit });
  if (result.failed) throw new Error(`${result.failed} Transkriptabrufe fehlgeschlagen; diese Videos bleiben beim nächsten Lauf erneut versuchbar.`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) {
    console.error("Aufruf: node src/extra-data/fetch-youtube-transcripts.mjs");
    process.exitCode = 1;
  } else {
    await fetchYoutubeTranscripts().catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
