import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { createYoutubeSources, syncYoutube, syncYoutubePlaylists, syncYoutubeVideos } from "../../src/shared/fetch-youtube.mjs";
import { createYoutubeScraper } from "../../src/shared/fetch-youtube-videos.mjs";
import { createPlaylistScraper } from "../../src/shared/fetch-youtube-playlists.mjs";

const execute = promisify(execFile);
const files = ["archive-cache.mjs", "fetch-youtube.mjs", "fetch-youtube-videos.mjs", "fetch-youtube-playlists.mjs", "youtube-data-api.mjs"];

async function runConsumer() {
  const assert = (await import("node:assert/strict")).default;
  const { join } = await import("node:path");
  globalThis.fetch = async () => assert.fail("Import und Quellenwahl dürfen keine Anfragen starten");
  const module = await import(process.argv[1]);
  const api = process.argv[3] === "api";
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(url);
    requests.push(target.pathname);
    assert.equal(target.origin, api ? "https://www.googleapis.com" : "https://www.youtube.com");
    const snippet = { title: "Fixture", description: "Description", publishedAt: "2026-01-01T00:00:00Z" };
    if (api) {
      assert.equal(init.headers["x-goog-api-key"], "fixture-key");
      const resource = target.pathname.split("/").at(-1);
      const items = {
        channels: [{ id: "UCfixture", snippet }],
        videos: [{ id: "video", snippet, contentDetails: { duration: "PT1M" }, status: { privacyStatus: "public" } }],
        playlists: [{ id: "PLfixture", snippet }],
        playlistItems: [{ contentDetails: { videoId: "video" }, snippet: { ...snippet, resourceId: { videoId: "video" } }, status: { privacyStatus: "public" } }],
      }[resource];
      assert.ok(items, resource);
      return { ok: true, json: async () => ({ items }) };
    }
    if (target.pathname === "/youtubei/v1/player") {
      return { ok: true, json: async () => ({
        videoDetails: { videoId: "video", title: "Fixture", lengthSeconds: "60" },
        microformat: { playerMicroformatRenderer: { publishDate: snippet.publishedAt } },
      }) };
    }
    const contents = target.pathname.endsWith("/playlists")
      ? [{ playlistRenderer: { playlistId: "PLfixture", title: { simpleText: "Fixture" } } }]
      : [{ playlistVideoListRenderer: { contents: [{ playlistVideoRenderer: { videoId: "video", title: { simpleText: "Fixture" } } }] } }];
    const data = {
      metadata: { channelMetadataRenderer: { externalId: "UCfixture", title: "Fixture" }, playlistMetadataRenderer: snippet },
      contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, content: { contents } } }] } },
    };
    return { ok: true, text: async () => `<script>var ytInitialData = ${JSON.stringify(data)};</script>` };
  };
  const options = {
    channel: "https://www.youtube.com/@Fixture",
    videosCacheFile: join(process.argv[2], "videos.json"),
    playlistsCacheFile: join(process.argv[2], "playlists.json"),
    apiKey: api ? "fixture-key" : null,
    fetchImpl,
    log: () => {},
  };
  const first = await module.syncYoutube(options);
  assert.equal(first.videos.channel.handle, "Fixture");
  assert.deepEqual(first.videos.newVideoIds, ["video"]);
  assert.equal(first.videos.videos[0].duration, "PT1M");
  assert.equal(first.playlists.complete, true);
  assert.equal(first.playlists.playlists[0].videos[0].videoId, "video");
  requests.length = 0;
  const second = await module.syncYoutube(options);
  assert.equal(second.videos.newVideos, 0);
  assert.equal(second.playlists, null);
  assert.equal(requests.length, 1);
}

test("gemeinsames YouTube-Modul funktioniert isoliert in einem anderen Projekt mit und ohne API-Key", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "youtube-shared-"));
  try {
    for (const file of files) await cp(new URL(`../../src/shared/${file}`, import.meta.url), path.join(directory, file));
    await writeFile(path.join(directory, ".env"), "GOOGLE_YT_DATA_API_KEY=must-not-be-read\n");
    for (const mode of ["scraper", "api"]) {
      const { stdout, stderr } = await execute(process.execPath, [
        "--input-type=module", "-e", `await (${runConsumer.toString()})();`,
        path.join(directory, "fetch-youtube.mjs"), path.join(directory, mode), mode,
      ], { cwd: tmpdir(), timeout: 10_000 });
      assert.equal(stdout, "");
      assert.equal(stderr, "");
    }
    assert.deepEqual((await readdir(directory)).sort(), [...files, ".env", "api", "scraper"].sort());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("gemeinsame Synchronisation verlangt explizite Cachepfade vor dem Abruf", async () => {
  const options = { channel: "Fixture", fetchImpl: async () => assert.fail("Kein Abruf ohne Cachepfad") };
  await assert.rejects(syncYoutubeVideos(options), /cacheFile fehlt/u);
  await assert.rejects(syncYoutubePlaylists(options), /cacheFile fehlt/u);
  await assert.rejects(syncYoutube(options), /videosCacheFile und playlistsCacheFile/u);
  await assert.rejects(syncYoutube({ ...options, videosCacheFile: "unused.json" }), /playlistsCacheFile/u);
});

test("gemeinsame Quellen und einzelne Scraper lassen sich ohne Optionen erzeugen", () => {
  assert.equal(createYoutubeSources().videos.mode, "scraper");
  assert.equal(createYoutubeScraper().mode, "scraper");
  assert.equal(typeof createPlaylistScraper().playlist, "function");
});
