import {
  createYoutubeScraper,
  syncYoutubeVideos as syncVideos,
} from "./fetch-youtube-videos.mjs";
import {
  createPlaylistScraper,
  orderByLastUpdate,
  playlistCacheReady,
  syncYoutubePlaylists as syncPlaylists,
} from "./fetch-youtube-playlists.mjs";
import { createYoutubeDataApi } from "./youtube-data-api.mjs";

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
  videosCacheFile,
  playlistsCacheFile,
  apiKey = null,
  fetchImpl = fetch,
  sleep,
  log = console.log,
  videos = syncVideos,
  playlists = syncPlaylists,
  playlistsReady = playlistCacheReady,
}) {
  if (!videosCacheFile || !playlistsCacheFile) {
    throw new Error("videosCacheFile und playlistsCacheFile sind erforderlich.");
  }
  const sources = createYoutubeSources({ apiKey, fetchImpl, sleep, log });
  const videoResult = await videos({ channel, cacheFile: videosCacheFile, source: sources.videos, log });
  if (videoResult.newVideos === 0 && await playlistsReady(channel, playlistsCacheFile)) {
    log("Keine neuen Videos; Playlist-Abruf übersprungen.");
    return { videos: videoResult, playlists: null };
  }
  return {
    videos: videoResult,
    playlists: await playlists({
      channel,
      cacheFile: playlistsCacheFile,
      source: sources.playlists,
      log,
      newVideoIds: videoResult.newVideoIds ?? [],
    }),
  };
}
