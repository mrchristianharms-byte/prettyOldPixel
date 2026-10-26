import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { syncYoutubePlaylists } from "../src/fetch-channel/fetch-youtube-playlists.mjs";
import { startYoutubeCli, syncYoutubeVideos } from "../src/fetch-channel/fetch-youtube-videos.mjs";
import {
  apiVideoToVideo,
  createYoutubeDataApi,
  isoDurationToSeconds,
  resolveYoutubeApiKey,
  youtubeApiKey,
} from "../src/fetch-channel/youtube-data-api.mjs";

const CHANNEL_ID = "UCrFoFXdc15HN5aRXpr_ic0w";
const UPLOADS_ID = `UU${CHANNEL_ID.slice(2)}`;
const API_KEY = "test-key";
const quiet = { log: () => {}, sleep: async () => {} };
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Headers() });

const apiVideo = (id, publishedAt, overrides = {}) => ({
  id,
  snippet: { title: `Titel ${id}`, description: `Beschreibung ${id}`, publishedAt, liveBroadcastContent: "none" },
  contentDetails: { duration: "PT1H2M3S" },
  status: { privacyStatus: "public" },
  ...overrides,
});

function createApi({ uploads = [], videos = [], playlists = [], items = {} }) {
  const requests = [];
  const byId = new Map(videos.map((video) => [video.id, video]));
  const paged = (list, token) => {
    const index = token ? Number(token) : 0;
    const page = list[index] ?? [];
    return { items: page, ...(index + 1 < list.length ? { nextPageToken: String(index + 1) } : {}) };
  };
  const fetchImpl = async (url, init) => {
    const target = new URL(url);
    assert.equal(target.origin, "https://www.googleapis.com");
    assert.equal(init.headers["x-goog-api-key"], API_KEY);
    assert.equal(target.searchParams.get("key"), null);
    const resource = target.pathname.replace("/youtube/v3/", "");
    const params = Object.fromEntries(target.searchParams);
    requests.push({ resource, params });
    if (resource === "channels") {
      assert.equal(params.forHandle, "@PrettyOldPixel");
      return json({ items: [{ id: CHANNEL_ID, snippet: { title: "Pretty Old Pixel" } }] });
    }
    if (resource === "videos") {
      return json({ items: params.id.split(",").map((id) => byId.get(id)).filter(Boolean) });
    }
    if (resource === "playlists") {
      assert.equal(params.channelId, CHANNEL_ID);
      return json(paged(playlists, params.pageToken));
    }
    if (resource === "playlistItems" && params.playlistId === UPLOADS_ID) {
      return json(paged(uploads.map((page) => page.map((videoId) => ({ contentDetails: { videoId } }))), params.pageToken));
    }
    if (resource === "playlistItems") {
      return json(paged(items[params.playlistId], params.pageToken));
    }
    throw new Error(`Unerwartete Anfrage: ${url}`);
  };
  return { fetchImpl, requests };
}

test("API-Key kommt aus der Umgebung oder ersatzweise aus der .env-Datei", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "youtube-api-key-"));
  try {
    const envFile = path.join(directory, ".env");
    await writeFile(envFile, "OTHER=1\nGOOGLE_YT_DATA_API_KEY=from-file\n");
    assert.equal(youtubeApiKey({ env: { GOOGLE_YT_DATA_API_KEY: "from-env" }, envFile }), "from-env");
    assert.equal(youtubeApiKey({ env: { GOOGLE_YT_DATA_API_KEY: "  " }, envFile }), "from-file");
    assert.equal(youtubeApiKey({ env: {}, envFile }), "from-file");
    await writeFile(envFile, "GOOGLE_YT_DATA_API_KEY=\n");
    assert.equal(youtubeApiKey({ env: {}, envFile }), null);
    assert.equal(youtubeApiKey({ env: {}, envFile: path.join(directory, "missing.env") }), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI nennt beim Start den Abrufweg und die Schlüsselquelle, nie den Schlüssel", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "youtube-api-cli-"));
  const exitCode = process.exitCode;
  try {
    const envFile = path.join(directory, ".env");
    await writeFile(envFile, "GOOGLE_YT_DATA_API_KEY=secret-from-file\n");
    const cases = [
      [{ GOOGLE_YT_DATA_API_KEY: "secret-from-env" }, envFile, "secret-from-env", /offizielle YouTube Data API v3 \(GOOGLE_YT_DATA_API_KEY aus Umgebungsvariable\)/u],
      [{}, envFile, "secret-from-file", /offizielle YouTube Data API v3 \(GOOGLE_YT_DATA_API_KEY aus \.env\)/u],
      [{}, path.join(directory, "missing.env"), null, /anonyme Fetch-Skripte.*nicht gesetzt/u],
    ];
    for (const [env, file, expectedKey, message] of cases) {
      const lines = [];
      const calls = [];
      const result = await startYoutubeCli(async (options) => { calls.push(options); return "ok"; }, {
        channel: "PrettyOldPixel",
        resolveKey: () => resolveYoutubeApiKey({ env, envFile: file }),
        log: (line) => lines.push(line),
        logError: (line) => lines.push(line),
      });
      assert.equal(result, "ok");
      assert.deepEqual(calls, [{ channel: "PrettyOldPixel", apiKey: expectedKey }]);
      assert.equal(lines.length, 1);
      assert.match(lines[0], message);
      assert.doesNotMatch(lines[0], /secret/u);
    }

    const lines = [];
    let resolved = false;
    await startYoutubeCli(async () => assert.fail("darf nicht starten"), {
      channel: "https://example.invalid/channel",
      resolveKey: () => { resolved = true; return { apiKey: null, origin: null }; },
      log: (line) => lines.push(line),
      logError: (line) => lines.push(line),
    });
    assert.equal(resolved, false);
    assert.equal(process.exitCode, 1);
    assert.match(lines.join("\n"), /Keine YouTube-URL/u);
  } finally {
    process.exitCode = exitCode;
    await rm(directory, { recursive: true, force: true });
  }
});

test("wandelt API-Dauern und Videos in das Cacheformat", () => {
  assert.equal(isoDurationToSeconds("PT1H2M3S"), 3723);
  assert.equal(isoDurationToSeconds("P1DT1S"), 86401);
  assert.equal(isoDurationToSeconds("P0D"), 0);
  assert.equal(isoDurationToSeconds("invalid"), null);
  assert.deepEqual(apiVideoToVideo(apiVideo("a", "2026-01-01T10:00:00Z")), {
    id: "a",
    title: "Titel a",
    description: "Beschreibung a",
    duration: "PT1H2M3S",
    durationSeconds: 3723,
    publishedAt: "2026-01-01T10:00:00Z",
  });
  assert.equal(apiVideoToVideo(apiVideo("b", null, { status: { privacyStatus: "unlisted" } })), null);
  assert.equal(apiVideoToVideo(apiVideo("c", null, { snippet: { title: "c", liveBroadcastContent: "upcoming" } })), null);
  assert.equal(apiVideoToVideo(undefined), null);
});

test("meldet API-Fehler ohne Schlüssel und wiederholt Rate-Limits", async () => {
  const delays = [];
  let calls = 0;
  const api = createYoutubeDataApi({
    apiKey: API_KEY,
    log: () => {},
    sleep: async (delay) => { delays.push(delay); },
    fetchImpl: async () => (++calls === 1
      ? json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, 403)
      : json({ items: [{ id: CHANNEL_ID, snippet: { title: "Pretty Old Pixel" } }] })),
  });
  assert.deepEqual(await api.channel("PrettyOldPixel"), { id: CHANNEL_ID, title: "Pretty Old Pixel" });
  assert.deepEqual(delays, [1000]);

  const failing = createYoutubeDataApi({
    apiKey: API_KEY,
    ...quiet,
    fetchImpl: async () => json({ error: { message: "Quota", errors: [{ reason: "quotaExceeded" }] } }, 403),
  });
  await assert.rejects(failing.channel("PrettyOldPixel"), (error) => {
    assert.match(error.message, /403, quotaExceeded.*Tageskontingent/u);
    assert.doesNotMatch(error.message, new RegExp(API_KEY));
    return true;
  });
  assert.throws(() => createYoutubeDataApi({ apiKey: "" }), /GOOGLE_YT_DATA_API_KEY fehlt/u);
});

test("lädt Videos mit API-Key über die Data API und stoppt inkrementell", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "youtube-api-videos-"));
  try {
    const cacheFile = path.join(directory, "videos.json");
    const first = createApi({
      uploads: [["c", "b"], ["a"]],
      videos: [
        apiVideo("a", "2026-01-01T10:00:00Z"),
        apiVideo("b", "2026-01-02T10:00:00Z"),
        apiVideo("c", "2026-01-03T10:00:00Z", { status: { privacyStatus: "private" } }),
      ],
    });
    const result = await syncYoutubeVideos({ ...quiet, channel: "PrettyOldPixel", cacheFile, apiKey: API_KEY, fetchImpl: first.fetchImpl });
    assert.equal(result.complete, true);
    assert.deepEqual(result.channel, { id: CHANNEL_ID, handle: "PrettyOldPixel", title: "Pretty Old Pixel", url: "https://www.youtube.com/@PrettyOldPixel" });
    assert.deepEqual(result.videos.map((video) => video.id), ["b", "a"]);
    assert.equal(result.lastModified, "2026-01-02T10:00:00Z");
    assert.deepEqual(first.requests.map((request) => request.resource), ["channels", "playlistItems", "videos", "playlistItems", "videos"]);

    const second = createApi({
      uploads: [["d", "b"], ["a"]],
      videos: [apiVideo("d", "2026-01-04T10:00:00Z")],
    });
    const updated = await syncYoutubeVideos({ ...quiet, channel: "PrettyOldPixel", cacheFile, apiKey: API_KEY, fetchImpl: second.fetchImpl });
    assert.deepEqual(updated.videos.map((video) => video.id), ["d", "b", "a"]);
    assert.deepEqual(second.requests.map((request) => request.resource), ["playlistItems", "videos"]);
    assert.equal(second.requests[1].params.id, "d");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("sortiert gemischte Zeitzonen aus Scraper und API nach Zeitpunkt", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "youtube-api-sort-"));
  try {
    const cacheFile = path.join(directory, "videos.json");
    await writeFile(cacheFile, JSON.stringify({
      channel: { id: CHANNEL_ID, handle: "PrettyOldPixel", title: "Pretty Old Pixel" },
      lastModified: "2026-01-01T20:00:00-07:00",
      complete: true,
      videos: [{ id: "old", publishedAt: "2026-01-01T20:00:00-07:00" }],
    }));
    const api = createApi({ uploads: [["new", "old"]], videos: [apiVideo("new", "2026-01-02T01:00:00Z")] });
    const result = await syncYoutubeVideos({ ...quiet, channel: "PrettyOldPixel", cacheFile, apiKey: API_KEY, fetchImpl: api.fetchImpl });
    assert.deepEqual(result.videos.map((video) => video.id), ["old", "new"]);
    assert.equal(result.lastModified, "2026-01-01T20:00:00-07:00");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("lädt Playlists mit API-Key über die Data API", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "youtube-api-playlists-"));
  try {
    const cacheFile = path.join(directory, "playlists.json");
    const item = (videoId, privacyStatus = "public") => ({
      snippet: { title: `Titel ${videoId}`, resourceId: { videoId } },
      status: { privacyStatus },
    });
    const api = createApi({
      playlists: [[{ id: "PL2", snippet: { title: "Zwei", description: "Text" } }], [{ id: "PL1", snippet: { title: "Eins" } }]],
      items: { PL1: [[item("a"), item("b", "privacyStatusUnspecified")], [item("c", "unlisted")]], PL2: [[]] },
    });
    const result = await syncYoutubePlaylists({
      ...quiet, channel: "PrettyOldPixel", cacheFile, apiKey: API_KEY, fetchImpl: api.fetchImpl, now: () => "2026-01-01T00:00:00.000Z",
    });
    assert.equal(result.complete, true);
    assert.equal(result.channel.id, CHANNEL_ID);
    assert.deepEqual(result.playlists, [
      {
        id: "PL1",
        title: "Eins",
        description: "",
        url: "https://www.youtube.com/playlist?list=PL1",
        videoCount: 2,
        videos: [
          { position: 1, videoId: "a", title: "Titel a", availability: "listed" },
          { position: 2, videoId: "c", title: "Titel c", availability: "listed" },
        ],
        lastModified: "2026-01-01T00:00:00.000Z",
        checkedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "PL2",
        title: "Zwei",
        description: "Text",
        url: "https://www.youtube.com/playlist?list=PL2",
        videoCount: 0,
        videos: [],
        lastModified: "2026-01-01T00:00:00.000Z",
        checkedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const saved = JSON.parse(await readFile(cacheFile, "utf8"));
    assert.deepEqual(saved, result);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("gezielte Playlist-Suche über die API prüft zuletzt geänderte Playlists zuerst und stoppt nach dem Fund", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "youtube-api-targeted-"));
  try {
    const cacheFile = path.join(directory, "playlists.json");
    const cached = (id, videoIds, lastModified) => ({
      id, title: id, description: "", url: `https://www.youtube.com/playlist?list=${id}`, videoCount: videoIds.length,
      videos: videoIds.map((videoId, index) => ({ position: index + 1, videoId, title: `Titel ${videoId}`, availability: "listed" })),
      lastModified, checkedAt: lastModified,
    });
    await writeFile(cacheFile, JSON.stringify({
      channel: { id: CHANNEL_ID, handle: "PrettyOldPixel", title: "Pretty Old Pixel", url: "https://www.youtube.com/@PrettyOldPixel" },
      fetchedAt: "2026-01-01T00:00:00.000Z", lastModified: "2026-01-01T00:00:00.000Z", complete: true,
      playlists: [cached("PL1", ["a"], "2026-01-01T00:00:00.000Z"), cached("PL2", ["b"], "2026-03-01T00:00:00.000Z")],
    }));
    const item = (videoId) => ({ snippet: { title: `Titel ${videoId}`, resourceId: { videoId } }, status: { privacyStatus: "public" } });
    const api = createApi({
      playlists: [[
        { id: "PL1", snippet: { title: "PL1" } },
        { id: "PL2", snippet: { title: "PL2" } },
      ]],
      items: { PL2: [[item("b"), item("new")]] },
    });
    const result = await syncYoutubePlaylists({
      ...quiet, channel: "PrettyOldPixel", cacheFile, apiKey: API_KEY, fetchImpl: api.fetchImpl,
      newVideoIds: ["new"], now: () => "2026-04-01T00:00:00.000Z",
    });
    assert.deepEqual(api.requests.map((request) => [request.resource, request.params.playlistId ?? request.params.part]), [
      ["playlists", "snippet"], ["playlistItems", "PL2"],
    ]);
    assert.equal(result.complete, true);
    assert.deepEqual(result.playlists.find((entry) => entry.id === "PL2").videos.map((entry) => entry.videoId), ["b", "new"]);
    assert.equal(result.playlists.find((entry) => entry.id === "PL1").checkedAt, "2026-01-01T00:00:00.000Z");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("leere Seite mit wiederholtem Token beendet die Playlist (geplante Einträge), sonst Fehler", async () => {
  const pages = (second) => async (url) => {
    const token = new URL(url).searchParams.get("pageToken");
    return json(token ? second : { items: [{ contentDetails: { videoId: "a" } }], nextPageToken: "T" });
  };
  const ids = async (fetchImpl) => {
    const api = createYoutubeDataApi({ apiKey: API_KEY, fetchImpl, ...quiet });
    const result = [];
    for await (const page of api.playlistVideoIds("PL")) result.push(...page);
    return result;
  };
  assert.deepEqual(await ids(pages({ items: [], nextPageToken: "T" })), ["a"]);
  await assert.rejects(ids(pages({ items: [{ contentDetails: { videoId: "b" } }], nextPageToken: "T" })), /Wiederholtes Seitentoken/u);
});
