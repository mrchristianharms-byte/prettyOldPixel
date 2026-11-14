import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  playlistCacheReady as sharedPlaylistCacheReady,
  syncYoutubePlaylists as syncSharedYoutubePlaylists,
} from "../shared/fetch-youtube-playlists.mjs";

export {
  createPlaylistScraper,
  extractChannelPlaylistsPage,
  extractPlaylistMembersPage,
  orderByLastUpdate,
  parseVideoIds,
} from "../shared/fetch-youtube-playlists.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultCacheFile = path.join(projectRoot, "cache", "youtube-playlists.json");

export async function playlistCacheReady(channel, cacheFile = defaultCacheFile) {
  return sharedPlaylistCacheReady(channel, cacheFile);
}

export async function syncYoutubePlaylists({
  cacheFile = defaultCacheFile,
  ...options
}) {
  return syncSharedYoutubePlaylists({ ...options, cacheFile });
}

export async function runCli() {
  const { runPlaylistsCli } = await import("./fetch-youtube.mjs");
  await runPlaylistsCli();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // The coordinator imports this module, so its CLI import must not block module evaluation.
  runCli();
}
