import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  extractPlaylistPage,
  extractJsonAssignment,
  parseChannelHandle,
  secondsToIsoDuration,
  syncYoutubeVideos,
} from "../src/fetch-channel/fetch-youtube-videos.mjs";

const CHANNEL_ID = "UCrFoFXdc15HN5aRXpr_ic0w";

const htmlResponse = (html) => ({ ok: true, status: 200, text: async () => html });
const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body });
const pageHtml = (data) => `<script>var ytInitialData = ${JSON.stringify(data)};</script>
<script>ytcfg.set({"INNERTUBE_CLIENT_VERSION":"2.20261016.01.00"});</script>`;

const lockup = (id) => ({ richItemRenderer: { content: { lockupViewModel: { contentId: id, contentType: "LOCKUP_CONTENT_TYPE_VIDEO" } } } });
const continuationItem = (token) => ({
  continuationItemViewModel: { continuationCommand: { innertubeCommand: { continuationCommand: { token } } } },
});
const playlistPage = (ids, token) => ({ contents: [...ids.map(lockup), ...(token ? [continuationItem(token)] : [])] });

const playerResponse = (id, publishDate) => ({
  videoDetails: {
    videoId: id,
    title: `Titel ${id}`,
    shortDescription: `Beschreibung ${id}\nmit Zeilenumbruch`,
    lengthSeconds: "3723",
  },
  microformat: { playerMicroformatRenderer: { publishDate, isUnlisted: false } },
});

function createFetch({ firstPage, continuations = {}, videos }) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(url);
    requests.push(target.pathname);
    if (target.pathname === "/@PrettyOldPixel") {
      return htmlResponse(pageHtml({ metadata: { channelMetadataRenderer: { externalId: CHANNEL_ID, title: "Pretty Old Pixel" } } }));
    }
    if (target.pathname === "/playlist") {
      assert.equal(target.searchParams.get("list"), `UU${CHANNEL_ID.slice(2)}`);
      return htmlResponse(pageHtml(firstPage));
    }
    const body = init.body ? JSON.parse(init.body) : {};
    if (target.pathname === "/youtubei/v1/browse") {
      return jsonResponse({ onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: continuations[body.continuation].contents } }] });
    }
    if (target.pathname === "/youtubei/v1/player") {
      return jsonResponse(videos[body.videoId]);
    }
    throw new Error(`Unerwarteter Request: ${url}`);
  };
  return { fetchImpl, requests };
}

test("parst Kanal-URLs und Handles", () => {
  assert.equal(parseChannelHandle("https://www.youtube.com/@PrettyOldPixel"), "PrettyOldPixel");
  assert.equal(parseChannelHandle("https://www.youtube.com/@PrettyOldPixel/videos"), "PrettyOldPixel");
  assert.equal(parseChannelHandle("PrettyOldPixel"), "PrettyOldPixel");
  assert.equal(parseChannelHandle("@PrettyOldPixel"), "PrettyOldPixel");
});

test("formatiert Sekunden als ISO-8601-Dauer", () => {
  assert.equal(secondsToIsoDuration(3723), "PT1H2M3S");
  assert.equal(secondsToIsoDuration(60), "PT1M");
  assert.equal(secondsToIsoDuration(0), "PT0S");
});

test("liest Video-IDs und Fortsetzungs-Token aus einer Playlist-Seite", () => {
  assert.deepEqual(extractPlaylistPage(playlistPage(["a", "b"], "next")), { videoIds: ["a", "b"], continuation: "next" });
});

test("liest direkte Seitendaten und das alternative application/json-Element", () => {
  const data = { title: "Spiel 'Text' \"Zitat\"", contents: [{ value: "{Text}" }] };
  const json = JSON.stringify(data);
  assert.deepEqual(extractJsonAssignment(pageHtml(data), "ytInitialData"), data);
  const html = `<script type="application/json" id="yt-initial-data">${json}</script>
    <script>window['ytInitialData'] = JSON.parse(ytDataEl.textContent);</script>`;
  assert.deepEqual(extractJsonAssignment(html, "ytInitialData"), data);
});

test("lädt alle Seiten ohne API-Key und danach nur neuere Videos", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "youtube-cache-"));
  const cacheFile = path.join(directory, "videos.json");
  const options = { channel: "PrettyOldPixel", cacheFile, log: () => {}, sleep: async () => {} };
  try {
    const first = createFetch({
      firstPage: playlistPage(["b", "unlisted"], "page-2"),
      continuations: { "page-2": playlistPage(["a"]) },
      videos: {
        a: playerResponse("a", "2026-01-01T10:00:00-07:00"),
        b: playerResponse("b", "2026-02-01T10:00:00-07:00"),
        unlisted: { ...playerResponse("unlisted", "2026-01-15T10:00:00-07:00"), microformat: { playerMicroformatRenderer: { isUnlisted: true } } },
      },
    });
    await syncYoutubeVideos({ ...options, fetchImpl: first.fetchImpl });

    let cache = JSON.parse(await readFile(cacheFile, "utf8"));
    assert.equal(cache.complete, true);
    assert.equal(cache.channel.id, CHANNEL_ID);
    assert.equal(cache.lastModified, "2026-02-01T10:00:00-07:00");
    assert.deepEqual(cache.videos.map(({ id }) => id), ["b", "a"]);
    assert.deepEqual(cache.videos[0], {
      id: "b",
      title: "Titel b",
      description: "Beschreibung b\nmit Zeilenumbruch",
      duration: "PT1H2M3S",
      durationSeconds: 3723,
      publishedAt: "2026-02-01T10:00:00-07:00",
    });

    cache.fetchedAt = "2020-01-01T00:00:00Z";
    await writeFile(cacheFile, JSON.stringify(cache));
    const second = createFetch({
      firstPage: playlistPage(["c", "b"], "page-2"),
      videos: { c: playerResponse("c", "2026-03-01T10:00:00-07:00") },
    });
    await syncYoutubeVideos({ ...options, channel: "https://www.youtube.com/@PrettyOldPixel", fetchImpl: second.fetchImpl });

    cache = JSON.parse(await readFile(cacheFile, "utf8"));
    assert.deepEqual(cache.videos.map(({ id }) => id), ["c", "b", "a"]);
    assert.equal(cache.lastModified, "2026-03-01T10:00:00-07:00");
    assert.equal(second.requests.filter((pathname) => pathname === "/youtubei/v1/browse").length, 0);
    assert.equal(second.requests.filter((pathname) => pathname === "/youtubei/v1/player").length, 1);
    assert.deepEqual(second.requests, ["/playlist", "/youtubei/v1/player"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
