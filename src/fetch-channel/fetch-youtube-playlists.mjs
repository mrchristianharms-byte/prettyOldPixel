import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "../shared/archive-cache.mjs";
import {
  extractJsonAssignment,
  fetchHtml,
  findClientVersion,
  findContinuationToken,
  mapWithConcurrency,
  parseChannelHandle,
  postInnertube,
} from "./fetch-youtube-videos.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultCacheFile = path.join(projectRoot, "cache", "youtube-playlists.json");
const YOUTUBE_URL = "https://www.youtube.com";
const PLAYLIST_CONCURRENCY = 3;

function text(value) {
  return value?.simpleText ?? value?.content ?? value?.runs?.map((run) => run.text).join("") ?? "";
}

function visit(node, handler) {
  if (!node || typeof node !== "object" || handler(node)) return;
  Object.values(node).forEach((child) => visit(child, handler));
}

function primaryContent(data) {
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs;
  const tab = tabs?.find((entry) => entry.tabRenderer?.selected)?.tabRenderer
    ?? (tabs?.length === 1 ? tabs[0].tabRenderer : null);
  if (!tab?.content) {
    throw new Error("YouTube: Hauptinhalt fehlt; Playlist-Antwort kann nicht gelesen werden.");
  }
  return tab.content;
}

function checkResponse(data) {
  if (!data || data.error) {
    throw new Error(`YouTube: Ungültige Playlist-Antwort${data?.error?.message ? `: ${data.error.message}` : "."}`);
  }
  visit(data.alerts, (node) => {
    if (node.alertRenderer?.type === "ERROR") {
      throw new Error(`YouTube: ${text(node.alertRenderer.text)}`);
    }
    return false;
  });
}

function continuationContent(data, optional = false) {
  checkResponse(data);
  const content = data.onResponseReceivedActions ?? data.onResponseReceivedEndpoints ?? data.continuationContents;
  if (!content && !optional) {
    throw new Error("YouTube: Playlist-Fortsetzung enthält keine Daten.");
  }
  return content ?? null;
}

export function extractChannelPlaylistsPage(content) {
  const playlists = [];
  let continuation = null;
  visit(content, (node) => {
    if (node.continuationItemRenderer || node.continuationItemViewModel) {
      continuation ??= findContinuationToken(node);
      return true;
    }
    const lockup = node.lockupViewModel;
    const renderer = node.gridPlaylistRenderer ?? node.playlistRenderer;
    if (lockup?.contentType === "LOCKUP_CONTENT_TYPE_PLAYLIST") {
      if (!lockup.contentId || !text(lockup.metadata?.lockupMetadataViewModel?.title)) {
        throw new Error("YouTube: Playlist-Karte ohne ID oder Titel.");
      }
      playlists.push({ id: lockup.contentId, title: text(lockup.metadata.lockupMetadataViewModel.title) });
      return true;
    }
    if (renderer) {
      if (!renderer.playlistId || !text(renderer.title)) {
        throw new Error("YouTube: Playlist-Karte ohne ID oder Titel.");
      }
      playlists.push({ id: renderer.playlistId, title: text(renderer.title) });
      return true;
    }
    return false;
  });
  return { playlists, continuation };
}

export function extractPlaylistMembersPage(content) {
  const videos = [];
  let continuation = null;
  visit(content, (node) => {
    if (node.continuationItemRenderer || node.continuationItemViewModel) {
      continuation ??= findContinuationToken(node);
      return true;
    }
    const lockup = node.lockupViewModel;
    const renderer = node.playlistVideoRenderer;
    if (lockup?.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") {
      if (!lockup.contentId) throw new Error("YouTube: Playlist-Video ohne ID.");
      videos.push({
        videoId: lockup.contentId,
        title: text(lockup.metadata?.lockupMetadataViewModel?.title),
        availability: "listed",
      });
      return true;
    }
    if (renderer) {
      videos.push({
        videoId: renderer.videoId ?? null,
        title: text(renderer.title),
        availability: renderer.isPlayable === false ? "unavailable" : "listed",
      });
      return true;
    }
    return false;
  });
  return { videos, continuation };
}

function membershipContent(data, playlistId) {
  let content;
  visit(primaryContent(data), (node) => {
    if (node.itemSectionRenderer?.targetId === playlistId) {
      content = node.itemSectionRenderer.contents;
      return true;
    }
    if (node.playlistVideoListRenderer) {
      content = node.playlistVideoListRenderer.contents;
      return true;
    }
    return false;
  });
  if (!content) {
    throw new Error(`YouTube: Mitgliederliste fehlt: ${playlistId}`);
  }
  return content;
}

// Lazy, so a caller that stops early never requests the remaining continuation pages.
// endWithoutData: scheduled, not yet public playlist entries leave a continuation whose response has no items.
async function* pageStream(initial, extract, options, endWithoutData = false) {
  let page = extract(initial);
  const seen = new Set();
  yield page;
  while (page.continuation) {
    const token = page.continuation;
    if (seen.has(token)) throw new Error("YouTube: Wiederholtes Playlist-Fortsetzungstoken.");
    seen.add(token);
    const content = continuationContent(await postInnertube("browse", { continuation: token }, options), endWithoutData);
    if (!content) return;
    page = extract(content);
    yield page;
  }
}

async function allPages(initial, extract, options, endWithoutData = false) {
  const pages = [];
  for await (const page of pageStream(initial, extract, options, endWithoutData)) pages.push(page);
  return pages;
}

async function fetchPlaylist(entry, options) {
  const html = await fetchHtml(`${YOUTUBE_URL}/playlist?list=${encodeURIComponent(entry.id)}`, options);
  const data = extractJsonAssignment(html, "ytInitialData");
  checkResponse(data);
  const metadata = data.metadata?.playlistMetadataRenderer;
  if (!metadata?.title) throw new Error(`YouTube: Playlist-Metadaten fehlen: ${entry.id}`);
  const playlistOptions = { ...options, clientVersion: findClientVersion(html) };
  const pages = await allPages(membershipContent(data, entry.id), extractPlaylistMembersPage, playlistOptions, true);
  let sidebar;
  visit(data.sidebar, (node) => {
    if (node.playlistSidebarPrimaryInfoRenderer) {
      sidebar = node.playlistSidebarPrimaryInfoRenderer;
      return true;
    }
    return false;
  });
  const videos = pages.flatMap((page) => page.videos).map((video, index) => ({ position: index + 1, ...video }));
  return {
    id: entry.id,
    title: metadata.title,
    description: metadata.description ?? text(sidebar?.description),
    url: `${YOUTUBE_URL}/playlist?list=${encodeURIComponent(entry.id)}`,
    videoCount: videos.length,
    videos,
  };
}

function playlistData({ checkedAt, lastModified, ...data }) {
  return data;
}

// Newly listed playlists first, then by the cached change date; equal ranks keep the listing order.
// The API itemCount is no signal: it already includes scheduled, not yet public entries.
export function orderByLastUpdate(entries, oldById) {
  const time = (entry) => (oldById.has(entry.id) ? Date.parse(oldById.get(entry.id).lastModified ?? "") || 0 : Infinity);
  return entries
    .map((entry, index) => ({ entry, index, time: time(entry) }))
    .sort((a, b) => (b.time - a.time) || (a.index - b.index))
    .map(({ entry }) => entry);
}

export function createPlaylistScraper(options) {
  async function channelPage(handle, query = "") {
    const html = await fetchHtml(`${YOUTUBE_URL}/@${encodeURIComponent(handle)}/playlists${query}`, options);
    const data = extractJsonAssignment(html, "ytInitialData");
    checkResponse(data);
    const metadata = data.metadata?.channelMetadataRenderer;
    if (!metadata?.externalId) throw new Error(`YouTube-Kanal nicht gefunden: @${handle}`);
    options.clientVersion = findClientVersion(html);
    return { data, metadata };
  }
  return {
    async channelPlaylists(handle) {
      const { data, metadata } = await channelPage(handle);
      const pages = await allPages(primaryContent(data), extractChannelPlaylistsPage, options);
      return {
        channel: { id: metadata.externalId, title: metadata.title ?? handle },
        entries: pages.flatMap((page) => page.playlists),
      };
    },
    // YouTube's "Last video added" order; it omits empty playlists, so it only suits the targeted search.
    async* recentPlaylists(handle) {
      const { data } = await channelPage(handle, "?view=1&sort=lad");
      for await (const page of pageStream(primaryContent(data), extractChannelPlaylistsPage, options)) {
        yield* page.playlists;
      }
    },
    playlist: (entry) => fetchPlaylist(entry, options),
  };
}

export async function playlistCacheReady(channel, cacheFile = defaultCacheFile) {
  const cached = await readJson(cacheFile);
  return Boolean(cached?.complete) && cached.channel?.handle?.toLowerCase() === parseChannelHandle(channel).toLowerCase();
}

export function parseVideoIds(value) {
  return [...new Set(String(value ?? "").split(/[\s,]+/u).filter(Boolean))];
}

// With known new video IDs and a complete cache, playlists are checked one by one, most recently
// updated first, and the run stops as soon as every new video was found in a playlist.
export async function syncYoutubePlaylists({
  channel,
  cacheFile = defaultCacheFile,
  source,
  newVideoIds = [],
  log = console.log,
  now = () => new Date().toISOString(),
}) {
  const handle = parseChannelHandle(channel);
  const cached = await readJson(cacheFile);
  const previous = cached?.channel?.handle?.toLowerCase() === handle.toLowerCase() ? cached : null;
  const pending = new Set(newVideoIds ?? []);
  const targeted = pending.size > 0 && Boolean(previous?.complete) && Boolean(previous.channel?.id);
  const checkedAt = now();
  log(`Playlists über ${source.label}${targeted ? `; gezielte Suche nach ${pending.size} neuen Videos` : ""}.`);
  const oldById = new Map((previous?.playlists ?? []).map((playlist) => [playlist.id, playlist]));
  const byId = new Map(oldById);
  let channelInfo = previous?.channel ?? null;
  let added = 0;
  let updated = 0;
  let removed = 0;
  let writes = Promise.resolve();
  const save = (complete) => {
    const snapshot = {
      channel: channelInfo,
      fetchedAt: checkedAt,
      lastModified: complete && (added || updated || removed || !previous?.lastModified || !previous.complete)
        ? checkedAt : previous?.lastModified ?? null,
      complete,
      playlists: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    };
    writes = writes.then(() => writeJson(cacheFile, snapshot));
    return writes;
  };
  const failures = [];
  const refresh = async (entry) => {
    try {
      const fresh = await source.playlist(entry);
      const old = oldById.get(entry.id);
      const changed = !old || JSON.stringify(playlistData(old)) !== JSON.stringify(fresh);
      if (!old) added += 1;
      else if (changed) updated += 1;
      byId.set(entry.id, {
        ...fresh,
        lastModified: changed ? checkedAt : old.lastModified,
        checkedAt,
      });
      await save(false);
      log(`Playlist: ${fresh.title} (${fresh.videoCount} Einträge, ${!old ? "neu" : changed ? "geändert" : "unverändert"}).`);
      return fresh;
    } catch (error) {
      failures.push(new Error(`${entry.id}: ${error.message}`, { cause: error }));
      log(`Playlist-Abruf fehlgeschlagen: ${entry.id}: ${error.message}`);
      return null;
    }
  };
  const finish = async () => {
    if (failures.length) {
      throw new AggregateError(failures, `${failures.length} Playlists konnten nicht aktualisiert werden. Cache bleibt unvollständig; nächster Lauf prüft erneut.`);
    }
    await save(true);
  };

  if (targeted) {
    const total = pending.size;
    const visited = new Set();
    for await (const entry of source.recentPlaylists(handle, oldById, previous.channel.id)) {
      if (visited.has(entry.id)) continue;
      visited.add(entry.id);
      const fresh = await refresh(entry);
      for (const video of fresh?.videos ?? []) pending.delete(video.videoId);
      if (!pending.size) break;
    }
    await finish();
    log(`${total - pending.size} von ${total} neuen Videos nach ${visited.size} Playlists gefunden${pending.size ? ` (ohne Playlist: ${[...pending].join(", ")})` : ""}; ${added} neue, ${updated} geänderte Playlists: ${cacheFile}`);
    return readJson(cacheFile);
  }

  const { channel: channelData, entries: listed } = await source.channelPlaylists(handle);
  const entries = [...new Map(listed.map((entry) => [entry.id, entry])).values()];
  channelInfo = {
    id: channelData.id,
    handle,
    title: channelData.title,
    url: `${YOUTUBE_URL}/@${handle}`,
  };
  const currentIds = new Set(entries.map((entry) => entry.id));
  removed = [...oldById.keys()].filter((id) => !currentIds.has(id)).length;
  await save(false);
  await mapWithConcurrency(entries, PLAYLIST_CONCURRENCY, refresh);
  for (const id of byId.keys()) {
    if (!currentIds.has(id)) byId.delete(id);
  }
  await finish();
  log(`${added} neue, ${updated} geänderte, ${removed} nicht mehr gelistete Playlists; insgesamt ${byId.size}: ${cacheFile}`);
  return readJson(cacheFile);
}

export async function runCli() {
  const { runPlaylistsCli } = await import("./fetch-youtube.mjs");
  await runPlaylistsCli();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // The coordinator imports this module, so its CLI import must not block module evaluation.
  runCli();
}
