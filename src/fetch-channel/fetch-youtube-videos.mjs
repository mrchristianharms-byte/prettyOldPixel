import { appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncYoutubeVideos as syncSharedYoutubeVideos } from "../shared/fetch-youtube-videos.mjs";

export {
  createYoutubeScraper,
  extractJsonAssignment,
  extractPlaylistPage,
  fetchHtml,
  findClientVersion,
  findContinuationToken,
  mapWithConcurrency,
  parseChannelHandle,
  postInnertube,
  secondsToIsoDuration,
} from "../shared/fetch-youtube-videos.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultCacheFile = path.join(projectRoot, "cache", "youtube-videos.json");

export async function syncYoutubeVideos({
  cacheFile = defaultCacheFile,
  ...options
}) {
  return syncSharedYoutubeVideos({ ...options, cacheFile });
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
