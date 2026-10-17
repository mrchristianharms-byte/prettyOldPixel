import { fileURLToPath } from "node:url";
import { syncYoutubeVideos } from "./fetch-youtube-videos.mjs";
import { syncYoutubePlaylists } from "./fetch-youtube-playlists.mjs";

export async function syncYoutube({ channel, log = console.log }) {
  const results = await Promise.allSettled([
    syncYoutubeVideos({ channel, log }),
    syncYoutubePlaylists({ channel, log }),
  ]);
  const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
  if (errors.length) {
    throw new AggregateError(errors, errors.map((error) => error.message).join("\n"));
  }
  return { videos: results[0].value, playlists: results[1].value };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const channel = process.argv[2] ?? process.env.YOUTUBE_CHANNEL ?? "PrettyOldPixel";
  syncYoutube({ channel }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
