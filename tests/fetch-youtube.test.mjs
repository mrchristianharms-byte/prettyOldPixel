import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { syncYoutube } from "../src/fetch-channel/fetch-youtube.mjs";
import { playlistCacheReady } from "../src/fetch-channel/fetch-youtube-playlists.mjs";
import { syncYoutubeVideos, writeNewVideosOutput } from "../src/fetch-channel/fetch-youtube-videos.mjs";

function createRun({ newVideos, ready }) {
  const ids = Array.from({ length: newVideos }, (_, index) => `v${index}`);
  const calls = [];
  const messages = [];
  const run = () => syncYoutube({
    channel: "PrettyOldPixel",
    apiKey: "key",
    log: (message) => messages.push(message),
    videos: async (options) => { calls.push(["videos", options.apiKey]); return { newVideos, newVideoIds: ids }; },
    playlists: async (options) => { calls.push(["playlists", options.apiKey, options.newVideoIds]); return { complete: true }; },
    playlistsReady: async () => { calls.push(["ready"]); return ready; },
  });
  return { run, calls, messages };
}

test("fetch:all lädt Playlists erst nach den Videos und nur bei neuen Videos", async () => {
  const withNew = createRun({ newVideos: 2, ready: true });
  assert.deepEqual(await withNew.run(), { videos: { newVideos: 2, newVideoIds: ["v0", "v1"] }, playlists: { complete: true } });
  assert.deepEqual(withNew.calls, [["videos", "key"], ["playlists", "key", ["v0", "v1"]]]);

  const unchanged = createRun({ newVideos: 0, ready: true });
  assert.deepEqual(await unchanged.run(), { videos: { newVideos: 0, newVideoIds: [] }, playlists: null });
  assert.deepEqual(unchanged.calls, [["videos", "key"], ["ready"]]);
  assert.match(unchanged.messages.join("\n"), /Playlist-Abruf übersprungen/u);

  const incomplete = createRun({ newVideos: 0, ready: false });
  await incomplete.run();
  assert.deepEqual(incomplete.calls, [["videos", "key"], ["ready"], ["playlists", "key", []]]);
});

test("fetch:all startet keine Playlists, wenn der Videoabruf fehlschlägt", async () => {
  let playlists = false;
  await assert.rejects(syncYoutube({
    channel: "PrettyOldPixel",
    log: () => {},
    videos: async () => { throw new Error("HTTP 429"); },
    playlists: async () => { playlists = true; },
  }), /HTTP 429/u);
  assert.equal(playlists, false);
});

test("Playlist-Cache gilt nur vollständig und für denselben Kanal als aktuell", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "youtube-playlist-ready-"));
  try {
    const cacheFile = path.join(directory, "playlists.json");
    assert.equal(await playlistCacheReady("PrettyOldPixel", cacheFile), false);
    await writeFile(cacheFile, JSON.stringify({ channel: { handle: "PrettyOldPixel" }, complete: false }));
    assert.equal(await playlistCacheReady("PrettyOldPixel", cacheFile), false);
    await writeFile(cacheFile, JSON.stringify({ channel: { handle: "PrettyOldPixel" }, complete: true }));
    assert.equal(await playlistCacheReady("https://www.youtube.com/@prettyoldpixel", cacheFile), true);
    assert.equal(await playlistCacheReady("OtherChannel", cacheFile), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Videoabruf meldet neue Videos als GitHub-Actions-Output", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "youtube-output-"));
  try {
    const outputFile = path.join(directory, "output");
    await writeFile(outputFile, "other=1\n");
    await writeNewVideosOutput({ newVideos: 0 }, outputFile);
    await writeNewVideosOutput({ newVideos: 2, newVideoIds: ["a", "b"] }, outputFile);
    await writeNewVideosOutput({}, outputFile);
    await writeNewVideosOutput({ newVideos: 1 }, undefined);
    assert.equal(await readFile(outputFile, "utf8"), "other=1\nnew-videos=0\nnew-video-ids=\nnew-videos=2\nnew-video-ids=a,b\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("syncYoutubeVideos liefert die Zahl neuer Videos, ohne sie zu speichern", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "youtube-new-videos-"));
  try {
    const cacheFile = path.join(directory, "videos.json");
    await writeFile(cacheFile, JSON.stringify({
      channel: { id: "UCrFoFXdc15HN5aRXpr_ic0w", handle: "PrettyOldPixel", title: "Pretty Old Pixel" },
      lastModified: "2026-01-01T00:00:00Z",
      complete: true,
      videos: [{ id: "a", publishedAt: "2026-01-01T00:00:00Z" }],
    }));
    const fetchImpl = async (url) => {
      const target = new URL(url);
      assert.equal(target.pathname, "/youtube/v3/playlistItems");
      return { ok: true, status: 200, json: async () => ({ items: [{ contentDetails: { videoId: "a" } }] }) };
    };
    const result = await syncYoutubeVideos({
      channel: "PrettyOldPixel", cacheFile, apiKey: "key", fetchImpl, log: () => {}, sleep: async () => {},
    });
    assert.equal(result.newVideos, 0);
    assert.deepEqual(result.newVideoIds, []);
    assert.equal("newVideos" in JSON.parse(await readFile(cacheFile, "utf8")), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
