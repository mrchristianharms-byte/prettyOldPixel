import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "../shared/archive-cache.mjs";
import {
  createYoutubeSource,
  extractJsonAssignment,
  fetchHtml,
  findClientVersion,
  findContinuationToken,
  mapWithConcurrency,
  parseChannelHandle,
  postInnertube,
  sourceLabel,
  startYoutubeCli,
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

function continuationContent(data) {
  checkResponse(data);
  const content = data.onResponseReceivedActions ?? data.onResponseReceivedEndpoints ?? data.continuationContents;
  if (!content) {
    throw new Error("YouTube: Playlist-Fortsetzung enthält keine Daten.");
  }
  return content;
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

async function allPages(initial, extract, options) {
  const pages = [extract(initial)];
  const seen = new Set();
  while (pages.at(-1).continuation) {
    const token = pages.at(-1).continuation;
    if (seen.has(token)) throw new Error("YouTube: Wiederholtes Playlist-Fortsetzungstoken.");
    seen.add(token);
    pages.push(extract(continuationContent(await postInnertube("browse", { continuation: token }, options))));
  }
  return pages;
}

async function fetchPlaylist(entry, options) {
  const html = await fetchHtml(`${YOUTUBE_URL}/playlist?list=${encodeURIComponent(entry.id)}`, options);
  const data = extractJsonAssignment(html, "ytInitialData");
  checkResponse(data);
  const metadata = data.metadata?.playlistMetadataRenderer;
  if (!metadata?.title) throw new Error(`YouTube: Playlist-Metadaten fehlen: ${entry.id}`);
  const playlistOptions = { ...options, clientVersion: findClientVersion(html) };
  const pages = await allPages(membershipContent(data, entry.id), extractPlaylistMembersPage, playlistOptions);
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

function playlistUrl(id) {
  return `${YOUTUBE_URL}/playlist?list=${encodeURIComponent(id)}`;
}

function scraperPlaylists(options) {
  return {
    async channelPlaylists(handle) {
      const html = await fetchHtml(`${YOUTUBE_URL}/@${encodeURIComponent(handle)}/playlists`, options);
      const data = extractJsonAssignment(html, "ytInitialData");
      checkResponse(data);
      const metadata = data.metadata?.channelMetadataRenderer;
      if (!metadata?.externalId) throw new Error(`YouTube-Kanal nicht gefunden: @${handle}`);
      options.clientVersion = findClientVersion(html);
      const pages = await allPages(primaryContent(data), extractChannelPlaylistsPage, options);
      return {
        channel: { id: metadata.externalId, title: metadata.title ?? handle },
        entries: pages.flatMap((page) => page.playlists),
      };
    },
    playlist: (entry) => fetchPlaylist(entry, options),
  };
}

function apiPlaylists(api) {
  return {
    async channelPlaylists(handle) {
      const channel = await api.channel(handle);
      return { channel, entries: await api.channelPlaylists(channel.id) };
    },
    async playlist(entry) {
      const videos = (await api.playlistItems(entry.id)).map((video, index) => ({ position: index + 1, ...video }));
      return {
        id: entry.id,
        title: entry.title,
        description: entry.description ?? "",
        url: playlistUrl(entry.id),
        videoCount: videos.length,
        videos,
      };
    },
  };
}

export async function playlistCacheReady(channel, cacheFile = defaultCacheFile) {
  const cached = await readJson(cacheFile);
  return Boolean(cached?.complete) && cached.channel?.handle?.toLowerCase() === parseChannelHandle(channel).toLowerCase();
}

export async function syncYoutubePlaylists({
  channel,
  cacheFile = defaultCacheFile,
  apiKey = null,
  fetchImpl = fetch,
  log = console.log,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = () => new Date().toISOString(),
}) {
  const handle = parseChannelHandle(channel);
  const cached = await readJson(cacheFile);
  const previous = cached?.channel?.handle?.toLowerCase() === handle.toLowerCase() ? cached : null;
  const checkedAt = now();
  const youtube = createYoutubeSource({ apiKey, fetchImpl, log, sleep });
  log(`Playlists über ${sourceLabel(youtube)}.`);
  const source = youtube.mode === "api" ? apiPlaylists(youtube) : scraperPlaylists({ fetchImpl, sleep, log });
  const { channel: channelData, entries: listed } = await source.channelPlaylists(handle);
  const entries = [...new Map(listed.map((entry) => [entry.id, entry])).values()];
  const oldById = new Map((previous?.playlists ?? []).map((playlist) => [playlist.id, playlist]));
  const byId = new Map(oldById);
  const channelInfo = {
    id: channelData.id,
    handle,
    title: channelData.title,
    url: `${YOUTUBE_URL}/@${handle}`,
  };
  let added = 0;
  let updated = 0;
  const removed = [...oldById.keys()].filter((id) => !entries.some((entry) => entry.id === id)).length;
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
  await save(false);
  const failures = [];
  await mapWithConcurrency(entries, PLAYLIST_CONCURRENCY, async (entry) => {
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
    } catch (error) {
      failures.push(new Error(`${entry.id}: ${error.message}`, { cause: error }));
      log(`Playlist-Abruf fehlgeschlagen: ${entry.id}: ${error.message}`);
    }
  });
  if (failures.length) {
    throw new AggregateError(failures, `${failures.length} Playlists konnten nicht aktualisiert werden. Cache bleibt unvollständig; nächster Lauf prüft erneut.`);
  }
  const currentIds = new Set(entries.map((entry) => entry.id));
  for (const id of byId.keys()) {
    if (!currentIds.has(id)) byId.delete(id);
  }
  await save(true);
  log(`${added} neue, ${updated} geänderte, ${removed} nicht mehr gelistete Playlists; insgesamt ${byId.size}: ${cacheFile}`);
  return readJson(cacheFile);
}

export async function runCli() {
  await startYoutubeCli(syncYoutubePlaylists);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
