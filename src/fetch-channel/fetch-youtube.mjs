import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import {
  createYoutubeScraper,
  parseChannelHandle,
  syncYoutubeVideos as syncVideos,
  writeNewVideosOutput,
} from "./fetch-youtube-videos.mjs";
import {
  createPlaylistScraper,
  orderByLastUpdate,
  parseVideoIds,
  playlistCacheReady,
  syncYoutubePlaylists as syncPlaylists,
} from "./fetch-youtube-playlists.mjs";
import { createYoutubeDataApi, YOUTUBE_API_KEY_VARIABLE } from "./youtube-data-api.mjs";

const defaultEnvFile = fileURLToPath(new URL("../../.env", import.meta.url));

export function resolveYoutubeApiKey({ env = process.env, envFile = defaultEnvFile } = {}) {
  const fromEnvironment = env[YOUTUBE_API_KEY_VARIABLE]?.trim();
  if (fromEnvironment) return { apiKey: fromEnvironment, origin: "Umgebungsvariable" };
  let content;
  try {
    content = readFileSync(envFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { apiKey: null, origin: null };
    throw error;
  }
  const fromFile = parseEnv(content)[YOUTUBE_API_KEY_VARIABLE]?.trim() || null;
  return { apiKey: fromFile, origin: fromFile ? ".env" : null };
}

function youtubeAccessMessage(origin) {
  return origin
    ? `YouTube-Abruf: offizielle YouTube Data API v3 (${YOUTUBE_API_KEY_VARIABLE} aus ${origin}).`
    : `YouTube-Abruf: anonyme Fetch-Skripte über öffentliche YouTube-Seiten (${YOUTUBE_API_KEY_VARIABLE} nicht gesetzt).`;
}

function apiPlaylists(api) {
  return {
    async channelPlaylists(handle) {
      const channel = await api.channel(handle);
      return { channel, entries: await api.channelPlaylists(channel.id) };
    },
    // The API cannot sort playlists, so the cached change dates decide.
    async* recentPlaylists(handle, oldById, channelId) {
      const entries = await api.channelPlaylists(channelId ?? (await api.channel(handle)).id);
      yield* orderByLastUpdate(entries, oldById);
    },
    async playlist(entry) {
      const videos = (await api.playlistItems(entry.id)).map((video, index) => ({ position: index + 1, ...video }));
      return {
        id: entry.id,
        title: entry.title,
        description: entry.description ?? "",
        url: `https://www.youtube.com/playlist?list=${encodeURIComponent(entry.id)}`,
        videoCount: videos.length,
        videos,
      };
    },
  };
}

export function createYoutubeSources({
  apiKey = null,
  fetchImpl = fetch,
  log = console.log,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const options = { fetchImpl, log, sleep };
  const videos = apiKey ? createYoutubeDataApi({ ...options, apiKey }) : createYoutubeScraper(options);
  const playlists = apiKey ? apiPlaylists(videos) : createPlaylistScraper(options);
  const label = apiKey ? "YouTube Data API v3" : "anonymer Abruf öffentlicher YouTube-Seiten";
  return {
    videos: { ...videos, label },
    playlists: { ...playlists, mode: videos.mode, label },
  };
}

export async function syncYoutubeVideos(options) {
  return syncVideos({ ...options, source: createYoutubeSources(options).videos });
}

export async function syncYoutubePlaylists(options) {
  return syncPlaylists({ ...options, source: createYoutubeSources(options).playlists });
}

// Playlists only change with new uploads, so a complete playlist cache is kept when no video was added;
// otherwise the playlist run only searches until the new videos are found.
export async function syncYoutube({
  channel,
  apiKey = null,
  fetchImpl = fetch,
  sleep,
  log = console.log,
  videos = syncVideos,
  playlists = syncPlaylists,
  playlistsReady = playlistCacheReady,
}) {
  const sources = createYoutubeSources({ apiKey, fetchImpl, sleep, log });
  const videoResult = await videos({ channel, source: sources.videos, log });
  if (videoResult.newVideos === 0 && await playlistsReady(channel)) {
    log("Keine neuen Videos; Playlist-Abruf übersprungen.");
    return { videos: videoResult, playlists: null };
  }
  return { videos: videoResult, playlists: await playlists({ channel, source: sources.playlists, log, newVideoIds: videoResult.newVideoIds ?? [] }) };
}

export async function startYoutubeCli(task, {
  channel = process.argv[2] ?? process.env.YOUTUBE_CHANNEL ?? "PrettyOldPixel",
  resolveKey = resolveYoutubeApiKey,
  log = console.log,
  logError = console.error,
} = {}) {
  try {
    parseChannelHandle(channel);
    const { apiKey, origin } = resolveKey();
    log(youtubeAccessMessage(origin));
    return await task({ channel, apiKey });
  } catch (error) {
    logError(error.message);
    process.exitCode = 1;
    return null;
  }
}

export async function runVideosCli() {
  return startYoutubeCli(async (options) => {
    const result = await syncYoutubeVideos(options);
    await writeNewVideosOutput(result);
    return result;
  });
}

export async function runPlaylistsCli() {
  const newVideoIds = parseVideoIds(process.env.YOUTUBE_NEW_VIDEO_IDS);
  return startYoutubeCli((options) => syncYoutubePlaylists({ ...options, newVideoIds }));
}

export async function runCli() {
  await startYoutubeCli(syncYoutube);
}
