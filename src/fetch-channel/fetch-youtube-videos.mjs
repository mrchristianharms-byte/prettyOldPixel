import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { secondsToIsoDuration } from "./youtube-data-api.mjs";

export { secondsToIsoDuration };

const YOUTUBE_URL = "https://www.youtube.com";
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultCacheFile = path.join(projectRoot, "cache", "youtube-videos.json");
const DETAIL_CONCURRENCY = 4;
const MAX_RETRIES = 3;
const REQUEST_HEADERS = {
  "accept-language": "de-DE,de;q=0.9,en;q=0.8",
  // Skips the EU cookie consent page so the public HTML contains the page data.
  cookie: "SOCS=CAI",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
};

export function parseChannelHandle(input) {
  const value = input?.trim();
  if (!value) {
    throw new Error("Bitte einen YouTube-Kanal angeben, z. B. PrettyOldPixel.");
  }

  let handle = value;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (!/(^|\.)youtube\.com$/i.test(url.hostname)) {
      throw new Error(`Keine YouTube-URL: ${value}`);
    }
    handle = url.pathname.split("/").find((part) => part.startsWith("@"));
  }

  handle = handle?.replace(/^@/, "");
  if (!handle || !/^[A-Za-z0-9._-]+$/.test(handle)) {
    throw new Error(`Ungültiger YouTube-Handle: ${value}`);
  }
  return handle;
}

export function extractJsonAssignment(html, variableName) {
  if (variableName === "ytInitialData") {
    const jsonScript = /<script\b(?=[^>]*\bid=["']yt-initial-data["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/i.exec(html);
    if (jsonScript) return JSON.parse(jsonScript[1]);
  }
  const marker = new RegExp(`(?:var\\s+|window\\[["'])${variableName}(?:["']\\])?\\s*=\\s*`);
  const match = marker.exec(html);
  if (!match) {
    return null;
  }

  const start = match.index + match[0].length;
  if (html[start] !== "{") {
    throw new Error(`YouTube: Nicht unterstütztes Datenformat für ${variableName}.`);
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
    } else if (character === "\"") {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(start, index + 1));
      }
    }
  }
  return null;
}

export function findClientVersion(html) {
  return /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(html)?.[1] ?? "2.20260101.00.00";
}

export function findContinuationToken(node) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const token = findContinuationToken(child);
      if (token) {
        return token;
      }
    }
    return null;
  }
  if (!node || typeof node !== "object") {
    return null;
  }
  if (typeof node.continuationCommand?.token === "string") {
    return node.continuationCommand.token;
  }
  return findContinuationToken(Object.values(node));
}

export function extractPlaylistPage(data) {
  const videoIds = [];
  let continuation = null;

  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.lockupViewModel?.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") {
      videoIds.push(node.lockupViewModel.contentId);
      return;
    }
    if (node.playlistVideoRenderer?.videoId) {
      videoIds.push(node.playlistVideoRenderer.videoId);
      return;
    }
    if (node.continuationItemRenderer || node.continuationItemViewModel) {
      continuation ??= findContinuationToken(node);
      return;
    }
    Object.values(node).forEach(visit);
  };

  visit(data);
  return { videoIds: [...new Set(videoIds)], continuation };
}

async function request(url, init, { fetchImpl, sleep, log = console.log }) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetchImpl(url, { ...init, headers: { ...REQUEST_HEADERS, ...init?.headers } });
    if (response.ok) {
      return response;
    }
    if (attempt >= MAX_RETRIES || (response.status !== 429 && response.status < 500)) {
      const advice = response.status === 429 ? " Rate-Limit: Vor einem neuen Lauf ausreichend warten; die Runner-IP kann weiterhin gesperrt sein." : "";
      throw new Error(`YouTube-Anfrage fehlgeschlagen (${response.status}): ${url}${advice}`);
    }
    const retryAfter = response.headers?.get("retry-after");
    const retryAfterMilliseconds = retryAfter
      ? (/^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now())
      : 0;
    const backoff = (response.status === 429 ? 30000 : 1000) * 2 ** attempt;
    const delay = Math.max(backoff, Number.isFinite(retryAfterMilliseconds) ? retryAfterMilliseconds : 0);
    log(`YouTube HTTP ${response.status}: ${url}; Wiederholung ${attempt + 1}/${MAX_RETRIES} in ${Math.ceil(delay / 1000)} Sekunden.`);
    await sleep(delay);
  }
}

export async function fetchHtml(url, options) {
  return (await request(url, {}, options)).text();
}

export async function postInnertube(endpoint, body, options) {
  const response = await request(`${YOUTUBE_URL}/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: options.clientVersion, hl: "de", gl: "DE" } },
      ...body,
    }),
  }, options);
  return response.json();
}

async function fetchChannel(handle, options) {
  const html = await fetchHtml(`${YOUTUBE_URL}/@${encodeURIComponent(handle)}`, options);
  const data = extractJsonAssignment(html, "ytInitialData");
  const metadata = data?.metadata?.channelMetadataRenderer;
  const id = metadata?.externalId ?? /"externalId":"(UC[\w-]{22})"/.exec(html)?.[1];
  if (!id) {
    throw new Error(`YouTube-Kanal nicht gefunden: @${handle}`);
  }
  return {
    id,
    title: metadata?.title ?? handle,
    clientVersion: findClientVersion(html),
  };
}

function toVideo(playerResponse) {
  const details = playerResponse?.videoDetails;
  const microformat = playerResponse?.microformat?.playerMicroformatRenderer;
  if (!details?.videoId || details.isUpcoming || details.isPrivate || microformat?.isUnlisted) {
    return null;
  }
  const durationSeconds = Number.parseInt(details.lengthSeconds, 10);
  return {
    id: details.videoId,
    title: details.title,
    description: details.shortDescription ?? "",
    duration: secondsToIsoDuration(durationSeconds),
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    publishedAt: microformat?.publishDate ?? microformat?.uploadDate ?? null,
  };
}

async function fetchVideo(videoId, options) {
  const playerResponse = await postInnertube("player", { videoId }, options);
  if (playerResponse?.videoDetails && playerResponse?.microformat) {
    return toVideo(playerResponse);
  }
  const html = await fetchHtml(`${YOUTUBE_URL}/watch?v=${encodeURIComponent(videoId)}`, options);
  return toVideo(extractJsonAssignment(html, "ytInitialPlayerResponse"));
}

export function createYoutubeScraper({ fetchImpl = fetch, log = console.log, sleep }) {
  const options = { fetchImpl, sleep, log, clientVersion: undefined };
  return {
    mode: "scraper",
    channel: (handle) => fetchChannel(handle, options),
    async* playlistVideoIds(playlistId) {
      const html = await fetchHtml(`${YOUTUBE_URL}/playlist?list=${encodeURIComponent(playlistId)}`, options);
      options.clientVersion = findClientVersion(html);
      let pageData = extractJsonAssignment(html, "ytInitialData");
      while (pageData) {
        const { videoIds, continuation } = extractPlaylistPage(pageData);
        yield videoIds;
        if (!continuation) return;
        const response = await postInnertube("browse", { continuation }, options);
        pageData = response.onResponseReceivedActions ?? response.continuationContents ?? null;
      }
    },
    videos: (ids) => mapWithConcurrency(ids, DETAIL_CONCURRENCY, (id) => fetchVideo(id, options)),
  };
}

export async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function readCache(cacheFile) {
  try {
    return JSON.parse(await readFile(cacheFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeCache(cacheFile, data) {
  await mkdir(path.dirname(cacheFile), { recursive: true });
  const temporaryFile = `${cacheFile}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`);
  await rename(temporaryFile, cacheFile);
}

function publishedTime(video) {
  const time = video.publishedAt ? Date.parse(video.publishedAt) : Number.NaN;
  return Number.isNaN(time) ? -Infinity : time;
}

// Compares instants because scraped dates carry a Pacific offset while the API returns UTC.
function sortVideos(videosById) {
  return [...videosById.values()].sort((a, b) => (publishedTime(b) - publishedTime(a)) || 0);
}

export async function syncYoutubeVideos({
  channel,
  cacheFile = defaultCacheFile,
  source,
  log = console.log,
}) {
  const handle = parseChannelHandle(channel);
  const cache = await readCache(cacheFile);
  const sameChannel = cache?.channel?.handle?.toLowerCase() === handle.toLowerCase();
  const lastModified = sameChannel ? cache.lastModified ?? null : null;
  const lastModifiedTime = lastModified ? Date.parse(lastModified) : null;
  const videosById = new Map((sameChannel ? cache.videos ?? [] : []).map((video) => [video.id, video]));

  log(`Videos über ${source.label}.`);
  // The channel ID never changes, so a cached one saves the channel page request.
  const channelData = sameChannel && cache.channel.id ? cache.channel : await source.channel(handle);
  const channelInfo = {
    id: channelData.id,
    handle,
    title: channelData.title,
    url: `${YOUTUBE_URL}/@${handle}`,
  };

  const saveProgress = (complete) => writeCache(cacheFile, {
    channel: channelInfo,
    lastModified: complete ? sortVideos(videosById)[0]?.publishedAt ?? lastModified : lastModified,
    fetchedAt: new Date().toISOString(),
    complete,
    videos: sortVideos(videosById),
  });

  const uploadsPlaylistId = `UU${channelData.id.slice(2)}`;
  let page = 0;
  const newVideoIds = [];

  for await (const videoIds of source.playlistVideoIds(uploadsPlaylistId)) {
    page += 1;
    let reachedKnownVideos = false;
    const unknownIds = videoIds.filter((id) => !videosById.has(id));

    if (lastModifiedTime !== null && videoIds.some((id) => {
      const publishedAt = videosById.get(id)?.publishedAt;
      return publishedAt && Date.parse(publishedAt) <= lastModifiedTime;
    })) {
      reachedKnownVideos = true;
    }

    const videos = await source.videos(unknownIds);
    for (const video of videos) {
      if (!video) {
        continue;
      }
      if (lastModifiedTime !== null && video.publishedAt && Date.parse(video.publishedAt) <= lastModifiedTime) {
        reachedKnownVideos = true;
      }
      videosById.set(video.id, video);
      newVideoIds.push(video.id);
    }

    log(`Seite ${page}: ${videoIds.length} Videos gelesen, ${videos.filter(Boolean).length} neu geladen.`);
    await saveProgress(false);

    if (reachedKnownVideos) {
      break;
    }
  }

  await saveProgress(true);
  log(`${newVideoIds.length} neue Videos gespeichert, insgesamt ${videosById.size}: ${cacheFile}`);
  return { ...(await readCache(cacheFile)), newVideos: newVideoIds.length, newVideoIds };
}

// Lets the Actions workflow skip the playlist step or limit it to the new videos.
export async function writeNewVideosOutput(result, outputFile = process.env.GITHUB_OUTPUT) {
  if (!outputFile || !Number.isInteger(result?.newVideos)) return;
  await appendFile(outputFile, `new-videos=${result.newVideos}\nnew-video-ids=${(result.newVideoIds ?? []).join(",")}\n`);
}

export async function runCli() {
  const { runVideosCli } = await import("./fetch-youtube.mjs");
  await runVideosCli();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // The coordinator imports this module, so its CLI import must not block module evaluation.
  runCli();
}
