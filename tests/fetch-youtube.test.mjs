import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { createYoutubeSources, syncYoutube, syncYoutubeVideos } from "../src/fetch-channel/fetch-youtube.mjs";
import { playlistCacheReady } from "../src/fetch-channel/fetch-youtube-playlists.mjs";
import { writeNewVideosOutput } from "../src/fetch-channel/fetch-youtube-videos.mjs";

const execute = promisify(execFile);

function createRun({ newVideos, ready }) {
  const ids = Array.from({ length: newVideos }, (_, index) => `v${index}`);
  const calls = [];
  const messages = [];
  const run = () => syncYoutube({
    channel: "PrettyOldPixel",
    apiKey: "key",
    log: (message) => messages.push(message),
    videos: async (options) => { calls.push(["videos", options.source.mode]); return { newVideos, newVideoIds: ids }; },
    playlists: async (options) => { calls.push(["playlists", options.source.mode, options.newVideoIds]); return { complete: true }; },
    playlistsReady: async () => { calls.push(["ready"]); return ready; },
  });
  return { run, calls, messages };
}

test("zentrale Quellenwahl verwendet für Videos und Playlists denselben Abrufweg", async () => {
  for (const [apiKey, mode, label] of [
    [null, "scraper", "anonymer Abruf öffentlicher YouTube-Seiten"],
    ["key", "api", "YouTube Data API v3"],
  ]) {
    const sources = createYoutubeSources({
      apiKey,
      fetchImpl: async () => assert.fail("Quellenwahl benötigt keinen Netzwerkzugriff"),
    });
    assert.equal(sources.videos.mode, mode);
    assert.equal(sources.playlists.mode, mode);
    assert.equal(sources.videos.label, label);
    assert.equal(sources.playlists.label, label);
    assert.equal(typeof sources.videos.playlistVideoIds, "function");
    assert.equal(typeof sources.videos.videos, "function");
    assert.equal(typeof sources.playlists.recentPlaylists, "function");
    assert.equal(typeof sources.playlists.playlist, "function");

    const calls = [];
    await syncYoutube({
      channel: "PrettyOldPixel",
      apiKey,
      log: () => {},
      videos: async ({ source }) => {
        calls.push(source.mode);
        return { newVideos: 1, newVideoIds: ["new"] };
      },
      playlists: async ({ source, newVideoIds }) => {
        calls.push(source.mode);
        assert.deepEqual(newVideoIds, ["new"]);
        return { complete: true };
      },
    });
    assert.deepEqual(calls, [mode, mode]);
  }
});

test("API-Fehler lösen keinen stillen Wechsel zum anonymen Abruf aus", async () => {
  const requests = [];
  const sources = createYoutubeSources({
    apiKey: "key",
    fetchImpl: async (url) => {
      requests.push(new URL(url).origin);
      return { ok: false, status: 403, json: async () => ({ error: { message: "Forbidden" } }) };
    },
  });
  await assert.rejects(sources.videos.channel("PrettyOldPixel"), /YouTube Data API channels fehlgeschlagen/u);
  assert.deepEqual(requests, ["https://www.googleapis.com"]);
});

test("alle drei CLI-Einstiege verwenden die zentrale Auswahl mit und ohne API-Key", async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "youtube-cli-routing-")));
  try {
    await cp(new URL("../src/fetch-channel/", import.meta.url), path.join(directory, "src/fetch-channel"), { recursive: true });
    await mkdir(path.join(directory, "src/shared"), { recursive: true });
    await cp(new URL("../src/shared/archive-cache.mjs", import.meta.url), path.join(directory, "src/shared/archive-cache.mjs"));
    await cp(new URL("../src/fetch-youtube.mjs", import.meta.url), path.join(directory, "src/fetch-youtube.mjs"));
    const preload = `
      globalThis.fetch = async (url, init) => {
        const target = new URL(url);
        const api = process.env.TEST_API === "true";
        if (target.origin !== (api ? "https://www.googleapis.com" : "https://www.youtube.com")) {
          throw new Error("Falscher Abrufweg: " + url);
        }
        if (api) {
          if (init.headers["x-goog-api-key"] !== "fixture-key") throw new Error("API-Key fehlt");
          return { ok: true, json: async () => ({
            items: target.pathname.endsWith("/channels")
              ? [{ id: "UCfixture", snippet: { title: "Fixture" } }] : [],
          }) };
        }
        const data = {
          metadata: { channelMetadataRenderer: { externalId: "UCfixture", title: "Fixture" } },
          contents: { twoColumnBrowseResultsRenderer: { tabs: [
            { tabRenderer: { selected: true, content: { contents: [] } } },
          ] } },
        };
        return { ok: true, text: async () => "<script>var ytInitialData = " + JSON.stringify(data) + ";</script>" };
      };
    `;
    for (const api of [false, true]) {
      await writeFile(path.join(directory, ".env"), api ? "GOOGLE_YT_DATA_API_KEY=fixture-key\n" : "");
      for (const [entry, caches] of [
        ["fetch-youtube.mjs", ["videos", "playlists"]],
        ["fetch-channel/fetch-youtube-videos.mjs", ["videos"]],
        ["fetch-channel/fetch-youtube-playlists.mjs", ["playlists"]],
      ]) {
        await rm(path.join(directory, "cache"), { recursive: true, force: true });
        const outputFile = path.join(directory, "github-output");
        await writeFile(outputFile, "");
        const { stdout, stderr } = await execute(process.execPath, [
          "--import", `data:text/javascript,${encodeURIComponent(preload)}`,
          path.join(directory, "src", entry), "Fixture",
        ], {
          cwd: tmpdir(),
          timeout: 10_000,
          env: {
            ...process.env,
            GOOGLE_YT_DATA_API_KEY: "",
            YOUTUBE_NEW_VIDEO_IDS: "",
            GITHUB_OUTPUT: outputFile,
            TEST_API: String(api),
          },
        });
        assert.equal(stderr, "");
        assert.equal((stdout.match(/YouTube-Abruf:/gu) ?? []).length, 1);
        assert.match(stdout, api ? /offizielle YouTube Data API v3.*aus \.env/u : /anonyme Fetch-Skripte/u);
        assert.doesNotMatch(stdout, /fixture-key/u);
        for (const cache of caches) {
          const data = JSON.parse(await readFile(path.join(directory, `cache/youtube-${cache}.json`), "utf8"));
          assert.equal(data.complete, true, `${entry}: ${cache}`);
        }
        assert.equal(await readFile(outputFile, "utf8"), entry.endsWith("fetch-youtube-videos.mjs")
          ? "new-videos=0\nnew-video-ids=\n" : "");
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fetch:all lädt Playlists erst nach den Videos und nur bei neuen Videos", async () => {
  const withNew = createRun({ newVideos: 2, ready: true });
  assert.deepEqual(await withNew.run(), { videos: { newVideos: 2, newVideoIds: ["v0", "v1"] }, playlists: { complete: true } });
  assert.deepEqual(withNew.calls, [["videos", "api"], ["playlists", "api", ["v0", "v1"]]]);

  const unchanged = createRun({ newVideos: 0, ready: true });
  assert.deepEqual(await unchanged.run(), { videos: { newVideos: 0, newVideoIds: [] }, playlists: null });
  assert.deepEqual(unchanged.calls, [["videos", "api"], ["ready"]]);
  assert.match(unchanged.messages.join("\n"), /Playlist-Abruf übersprungen/u);

  const incomplete = createRun({ newVideos: 0, ready: false });
  await incomplete.run();
  assert.deepEqual(incomplete.calls, [["videos", "api"], ["ready"], ["playlists", "api", []]]);
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
