import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import {
  createYoutubeSources,
  syncYoutube as syncSharedYoutube,
} from "../shared/fetch-youtube.mjs";
import { YOUTUBE_API_KEY_VARIABLE } from "../shared/youtube-data-api.mjs";
import {
  parseChannelHandle,
  syncYoutubeVideos as syncVideos,
  writeNewVideosOutput,
} from "./fetch-youtube-videos.mjs";
import {
  parseVideoIds,
  playlistCacheReady,
  syncYoutubePlaylists as syncPlaylists,
} from "./fetch-youtube-playlists.mjs";

export { createYoutubeSources };

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

export async function syncYoutubeVideos(options) {
  return syncVideos({ ...options, source: createYoutubeSources(options).videos });
}

export async function syncYoutubePlaylists(options) {
  return syncPlaylists({ ...options, source: createYoutubeSources(options).playlists });
}

export async function syncYoutube({
  videosCacheFile = fileURLToPath(new URL("../../cache/youtube-videos.json", import.meta.url)),
  playlistsCacheFile = fileURLToPath(new URL("../../cache/youtube-playlists.json", import.meta.url)),
  videos = syncVideos,
  playlists = syncPlaylists,
  playlistsReady = playlistCacheReady,
  ...options
}) {
  return syncSharedYoutube({
    ...options,
    videosCacheFile,
    playlistsCacheFile,
    videos,
    playlists,
    playlistsReady,
  });
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
