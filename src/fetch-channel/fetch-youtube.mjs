import { startYoutubeCli, syncYoutubeVideos } from "./fetch-youtube-videos.mjs";
import { playlistCacheReady, syncYoutubePlaylists } from "./fetch-youtube-playlists.mjs";

// Playlists only change with new uploads, so a complete playlist cache is kept when no video was added.
export async function syncYoutube({
  channel,
  apiKey = null,
  log = console.log,
  videos = syncYoutubeVideos,
  playlists = syncYoutubePlaylists,
  playlistsReady = playlistCacheReady,
}) {
  const videoResult = await videos({ channel, apiKey, log });
  if (videoResult.newVideos === 0 && await playlistsReady(channel)) {
    log("Keine neuen Videos; Playlist-Abruf übersprungen.");
    return { videos: videoResult, playlists: null };
  }
  return { videos: videoResult, playlists: await playlists({ channel, apiKey, log }) };
}

export async function runCli() {
  await startYoutubeCli(syncYoutube);
}
