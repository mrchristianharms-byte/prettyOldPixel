import { startYoutubeCli, syncYoutubeVideos } from "./fetch-youtube-videos.mjs";
import { syncYoutubePlaylists } from "./fetch-youtube-playlists.mjs";

export async function syncYoutube({ channel, apiKey = null, log = console.log }) {
  const results = await Promise.allSettled([
    syncYoutubeVideos({ channel, apiKey, log }),
    syncYoutubePlaylists({ channel, apiKey, log }),
  ]);
  const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
  if (errors.length) {
    throw new AggregateError(errors, errors.map((error) => error.message).join("\n"));
  }
  return { videos: results[0].value, playlists: results[1].value };
}

export async function runCli() {
  await startYoutubeCli(syncYoutube);
}
