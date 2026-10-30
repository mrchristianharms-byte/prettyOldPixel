import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  extractChannelPlaylistsPage,
  extractPlaylistMembersPage,
  orderByLastUpdate,
  parseVideoIds,
} from "../../src/fetch-channel/fetch-youtube-playlists.mjs";
import { syncYoutubePlaylists } from "../../src/fetch-channel/fetch-youtube.mjs";

const CHANNEL_ID = "UCrFoFXdc15HN5aRXpr_ic0w";
const continuation = (token) => ({
  continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } },
});
const playlist = (id, title = id) => ({
  lockupViewModel: {
    contentId: id,
    contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST",
    metadata: { lockupMetadataViewModel: { title: { content: title } } },
  },
});
const video = (id, title = id) => ({
  lockupViewModel: {
    contentId: id,
    contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
    metadata: { lockupMetadataViewModel: { title: { content: title } } },
  },
});
const tabs = (contents) => ({
  twoColumnBrowseResultsRenderer: {
    tabs: [
      { tabRenderer: { content: { contents: [playlist("unselected")] } } },
      { tabRenderer: { selected: true, content: { sectionListRenderer: { contents } } } },
    ],
  },
});
const html = (data) => `<script>var ytInitialData = ${JSON.stringify(data)};</script>
<script>ytcfg.set({"INNERTUBE_CLIENT_VERSION":"2.test"});</script>`;
const response = (data) => ({ ok: true, status: 200, text: async () => html(data), json: async () => data });
const quiet = { log: () => {}, sleep: async () => {} };

function mockFetch({ entries, details, continuations = {}, fail = new Set() }) {
  const requests = [];
  let active = 0;
  let maxActive = 0;
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(url);
    requests.push({ path: target.pathname, search: target.search, id: target.searchParams.get("list") });
    if (target.pathname === "/@PrettyOldPixel/playlists") {
      return response({
        metadata: { channelMetadataRenderer: { externalId: CHANNEL_ID, title: "Pretty Old Pixel" } },
        contents: tabs(entries),
      });
    }
    if (target.pathname === "/playlist") {
      const id = target.searchParams.get("list");
      if (fail.has(id)) return { ok: false, status: 403 };
      assert.ok(details[id], `Unexpected playlist ${id}`);
      active += 1;
      maxActive = Math.max(active, maxActive);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return response({
        metadata: { playlistMetadataRenderer: { title: details[id].title ?? id, description: details[id].description ?? "" } },
        contents: tabs([
          { itemSectionRenderer: { targetId: id, contents: details[id].contents } },
          continuation("recommendations-must-not-be-fetched"),
          { itemSectionRenderer: { targetId: "recommendations", contents: [video("recommended-video")] } },
        ]),
        sidebar: { contents: [playlist("recommendation")] },
      });
    }
    if (target.pathname === "/youtubei/v1/browse") {
      const body = JSON.parse(init.body);
      assert.equal(body.context.client.clientVersion, "2.test");
      assert.ok(continuations[body.continuation], `Unexpected continuation ${body.continuation}`);
      return response({
        onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: continuations[body.continuation] } }],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return { fetchImpl, requests, maxActive: () => maxActive };
}

async function withCache(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), "youtube-playlists-"));
  try {
    await callback(path.join(directory, "playlists.json"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("parst moderne und klassische Playlist-Karten und Fortsetzungen", () => {
  assert.deepEqual(extractChannelPlaylistsPage([
    playlist("p", "Spielereihe"),
    { gridPlaylistRenderer: { playlistId: "q", title: { runs: [{ text: "Klassisch" }] } } },
    continuation("next"),
  ]), {
    playlists: [{ id: "p", title: "Spielereihe" }, { id: "q", title: "Klassisch" }],
    continuation: "next",
  });
});

test("behält Reihenfolge, Duplikate und nicht verfügbare Einträge bei", () => {
  assert.deepEqual(extractPlaylistMembersPage([
    video("a"), video("a"),
    { playlistVideoRenderer: { videoId: "b", title: { simpleText: "Privates Video" }, isPlayable: false } },
    continuation("next"),
  ]), {
    videos: [
      { videoId: "a", title: "a", availability: "listed" },
      { videoId: "a", title: "a", availability: "listed" },
      { videoId: "b", title: "Privates Video", availability: "unavailable" },
    ],
    continuation: "next",
  });
});

test("lädt alle Playlist- und Videoseiten parallel, ohne Video-Details erneut abzurufen", async () => {
  await withCache(async (cacheFile) => {
    const first = mockFetch({
      entries: [playlist("p"), continuation("more-playlists")],
      details: {
        p: { title: "Spiel", description: "Vollständige Beschreibung", contents: [video("a"), continuation("more-videos")] },
        q: { contents: [video("c")] },
        r: { contents: [] },
        s: { contents: [video("d")] },
      },
      continuations: {
        "more-playlists": [playlist("q"), playlist("r"), playlist("s"), playlist("p")],
        "more-videos": [video("b"), video("a")],
      },
    });
    const result = await syncYoutubePlaylists({
      ...quiet, channel: "https://www.youtube.com/@PrettyOldPixel", cacheFile, fetchImpl: first.fetchImpl,
      now: () => "2026-10-17T10:00:00Z",
    });
    assert.equal(result.complete, true);
    assert.equal(result.channel.id, CHANNEL_ID);
    assert.equal(result.playlists.length, 4);
    assert.equal(first.maxActive(), 3);
    assert.equal(first.requests.filter((request) => request.path === "/playlist").length, 4);
    const p = result.playlists.find((entry) => entry.id === "p");
    assert.equal(p.description, "Vollständige Beschreibung");
    assert.deepEqual(p.videos.map((entry) => [entry.position, entry.videoId]), [[1, "a"], [2, "b"], [3, "a"]]);
    assert.equal(p.videoCount, 3);
    assert.ok(first.requests.every((request) => !request.path.includes("player") && !request.path.includes("watch")));
  });
});

test("erkennt inkrementell neue, geänderte, umsortierte und entfernte Einträge", async () => {
  await withCache(async (cacheFile) => {
    const run = async (time, config) => {
      const mock = mockFetch(config);
      return syncYoutubePlaylists({ ...quiet, channel: "PrettyOldPixel", cacheFile, fetchImpl: mock.fetchImpl, now: () => time });
    };
    const initial = {
      entries: [playlist("p"), playlist("q"), playlist("removed")],
      details: { p: { contents: [video("a"), video("b")] }, q: { contents: [video("c")] }, removed: { contents: [] } },
    };
    await run("2026-10-17T10:00:00Z", initial);
    const unchanged = await run("2026-10-17T11:00:00Z", initial);
    assert.equal(unchanged.lastModified, "2026-10-17T10:00:00Z");
    assert.equal(unchanged.playlists[0].lastModified, "2026-10-17T10:00:00Z");
    assert.equal(unchanged.playlists[0].checkedAt, "2026-10-17T11:00:00Z");
    const updated = await run("2026-10-17T12:00:00Z", {
      entries: [playlist("p"), playlist("q"), playlist("new")],
      details: {
        p: { title: "Neuer Titel", contents: [video("b"), video("a"), video("d")] },
        q: { contents: [] },
        new: { contents: [video("e")] },
      },
    });
    assert.deepEqual(updated.playlists.map((entry) => entry.id), ["new", "p", "q"]);
    assert.equal(updated.lastModified, "2026-10-17T12:00:00Z");
    assert.equal(updated.playlists[1].title, "Neuer Titel");
    assert.deepEqual(updated.playlists[1].videos.map((entry) => entry.videoId), ["b", "a", "d"]);
    assert.deepEqual(updated.playlists[2].videos, []);
  });
});

test("behält bei Fehlern den letzten Playlist-Stand und setzt den Lauf nicht vollständig", async () => {
  await withCache(async (cacheFile) => {
    const config = { entries: [playlist("p"), playlist("q")], details: { p: { contents: [video("a")] }, q: { contents: [] } } };
    const run = (mock) => syncYoutubePlaylists({ ...quiet, channel: "PrettyOldPixel", cacheFile, fetchImpl: mock.fetchImpl });
    await run(mockFetch(config));
    await assert.rejects(run(mockFetch({ ...config, fail: new Set(["p"]) })), /1 Playlists/);
    const partial = JSON.parse(await readFile(cacheFile, "utf8"));
    assert.equal(partial.complete, false);
    assert.equal(partial.playlists[0].videos[0].videoId, "a");
    assert.equal((await run(mockFetch(config))).complete, true);
  });
});

test("Fehlerhafte Antworten überschreiben keinen erfolgreichen Cache", async () => {
  await withCache(async (cacheFile) => {
    const mock = mockFetch({ entries: [], details: {} });
    await syncYoutubePlaylists({ ...quiet, channel: "PrettyOldPixel", cacheFile, fetchImpl: mock.fetchImpl });
    const before = await readFile(cacheFile, "utf8");
    await assert.rejects(syncYoutubePlaylists({
      ...quiet, channel: "PrettyOldPixel", cacheFile, fetchImpl: async () => response({}),
    }), /Kanal nicht gefunden/);
    assert.equal(await readFile(cacheFile, "utf8"), before);
  });
});

test("wiederholte Fortsetzungstokens führen zu einem expliziten Fehler", async () => {
  await withCache(async (cacheFile) => {
    const mock = mockFetch({ entries: [continuation("loop")], details: {}, continuations: { loop: [continuation("loop")] } });
    await assert.rejects(syncYoutubePlaylists({
      ...quiet, channel: "PrettyOldPixel", cacheFile, fetchImpl: mock.fetchImpl,
    }), /Wiederholtes Playlist-Fortsetzungstoken/);
  });
});

test("gezielte Suche prüft zuletzt aktualisierte Playlists und endet nach dem Fund aller neuen Videos", async () => {
  await withCache(async (cacheFile) => {
    const base = {
      entries: [playlist("p"), playlist("q"), playlist("r")],
      details: { p: { contents: [video("a")] }, q: { contents: [video("b")] }, r: { contents: [video("c")] } },
    };
    const run = (config, newVideoIds, time) => {
      const mock = mockFetch(config);
      const result = syncYoutubePlaylists({
        ...quiet, channel: "PrettyOldPixel", cacheFile, fetchImpl: mock.fetchImpl, newVideoIds, now: () => time,
      });
      return result.then((value) => ({ value, requests: mock.requests }));
    };
    await run(base, [], "2026-10-17T10:00:00Z");

    // "Last video added" order: q, p, r on the first page, more only on demand.
    const one = await run({
      entries: [playlist("q"), playlist("p"), continuation("more")],
      details: { q: { contents: [video("b"), video("new1")] }, p: base.details.p },
      continuations: {},
    }, ["new1"], "2026-10-18T10:00:00Z");
    assert.deepEqual(one.requests.map((request) => request.id ?? `${request.path}${request.search}`), [
      "/@PrettyOldPixel/playlists?view=1&sort=lad", "q",
    ]);
    assert.equal(one.value.complete, true);
    assert.equal(one.value.lastModified, "2026-10-18T10:00:00Z");
    const byId = Object.fromEntries(one.value.playlists.map((entry) => [entry.id, entry]));
    assert.deepEqual(byId.q.videos.map((entry) => entry.videoId), ["b", "new1"]);
    assert.equal(byId.p.checkedAt, "2026-10-17T10:00:00Z");
    assert.equal(byId.r.checkedAt, "2026-10-17T10:00:00Z");

    // Two new videos: stops after the playlist with the second one, loading the next page lazily.
    const two = await run({
      entries: [playlist("q"), continuation("more")],
      details: { q: { contents: [video("b"), video("new1"), video("new2")] }, r: { contents: [video("new3"), video("c")] } },
      continuations: { more: [playlist("r"), playlist("p"), continuation("never")] },
    }, ["new2", "new3"], "2026-10-19T10:00:00Z");
    assert.deepEqual(two.requests.map((request) => request.id ?? request.path), [
      "/@PrettyOldPixel/playlists", "q", "/youtubei/v1/browse", "r",
    ]);
    assert.equal(two.value.playlists.length, 3);
  });
});

test("gezielte Suche ohne vollständigen Cache prüft alle Playlists", async () => {
  await withCache(async (cacheFile) => {
    const mock = mockFetch({ entries: [playlist("p"), playlist("q")], details: { p: { contents: [video("n")] }, q: { contents: [] } } });
    const result = await syncYoutubePlaylists({
      ...quiet, channel: "PrettyOldPixel", cacheFile, fetchImpl: mock.fetchImpl, newVideoIds: ["n"],
    });
    assert.equal(mock.requests[0].search, "");
    assert.equal(result.playlists.length, 2);
  });
});

test("ordnet Playlists nach neu und letztem Änderungsdatum, nicht nach API-Videozahl", () => {
  const old = new Map([
    ["old", { videoCount: 1, lastModified: "2026-01-01T00:00:00Z" }],
    ["recent", { videoCount: 1, lastModified: "2026-03-01T00:00:00Z" }],
    ["grown", { videoCount: 1, lastModified: "2026-01-01T00:00:00Z" }],
  ]);
  assert.deepEqual(orderByLastUpdate([
    { id: "old", itemCount: 1 }, { id: "recent", itemCount: 1 }, { id: "grown", itemCount: 2 }, { id: "fresh" },
  ], old).map((entry) => entry.id), ["fresh", "recent", "old", "grown"]);
  assert.deepEqual(parseVideoIds(" a,b  a\nc "), ["a", "b", "c"]);
  assert.deepEqual(parseVideoIds(undefined), []);
});

test("Fortsetzung ohne Daten beendet die Mitgliederliste (geplante Einträge)", async () => {
  await withCache(async (cacheFile) => {
    const mock = mockFetch({
      entries: [playlist("p")],
      details: { p: { contents: [video("a"), continuation("scheduled")] } },
    });
    const fetchImpl = async (url, init) => (new URL(url).pathname === "/youtubei/v1/browse"
      ? response({ contents: {}, metadata: {} })
      : mock.fetchImpl(url, init));
    const result = await syncYoutubePlaylists({ ...quiet, channel: "PrettyOldPixel", cacheFile, fetchImpl });
    assert.equal(result.complete, true);
    assert.deepEqual(result.playlists[0].videos.map((entry) => entry.videoId), ["a"]);
  });
});
