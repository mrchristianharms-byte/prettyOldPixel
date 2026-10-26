export const YOUTUBE_API_KEY_VARIABLE = "GOOGLE_YT_DATA_API_KEY";
const API_URL = "https://www.googleapis.com/youtube/v3/";
const PAGE_SIZE = 50;
const MAX_RETRIES = 3;
const RETRYABLE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "backendError"]);

export function secondsToIsoDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) {
    return null;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${seconds || (!hours && !minutes) ? `${seconds}S` : ""}`;
}

export function isoDurationToSeconds(value) {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value ?? "");
  if (!match) return null;
  const [days, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
  return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
}

export function apiVideoToVideo(item) {
  const { snippet, contentDetails, status } = item ?? {};
  if (!item?.id || !snippet || snippet.liveBroadcastContent === "upcoming" || status?.privacyStatus !== "public") {
    return null;
  }
  const durationSeconds = isoDurationToSeconds(contentDetails?.duration);
  return {
    id: item.id,
    title: snippet.title,
    description: snippet.description ?? "",
    duration: secondsToIsoDuration(durationSeconds),
    durationSeconds,
    publishedAt: snippet.publishedAt ?? null,
  };
}

function retryDelay(response, attempt) {
  const retryAfter = response.headers?.get?.("retry-after");
  const retryAfterMilliseconds = retryAfter
    ? (/^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now())
    : 0;
  const backoff = (response.status === 429 ? 30000 : 1000) * 2 ** attempt;
  return Math.max(backoff, Number.isFinite(retryAfterMilliseconds) ? retryAfterMilliseconds : 0);
}

export function createYoutubeDataApi({
  apiKey,
  fetchImpl = fetch,
  log = console.log,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  if (!apiKey) {
    throw new Error(`YouTube Data API: ${YOUTUBE_API_KEY_VARIABLE} fehlt.`);
  }

  async function get(resource, params) {
    const url = new URL(resource, API_URL);
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(name, value);
    }
    for (let attempt = 0; ; attempt += 1) {
      // The key travels in a header so it never appears in URLs, logs or error messages.
      const response = await fetchImpl(url.href, { headers: { accept: "application/json", "x-goog-api-key": apiKey } });
      if (response.ok) {
        return response.json();
      }
      const body = await response.json().catch(() => null);
      const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? null;
      const retryable = response.status === 429 || response.status >= 500 || RETRYABLE_REASONS.has(reason);
      if (attempt >= MAX_RETRIES || !retryable) {
        const advice = reason === "quotaExceeded" ? " Tageskontingent der YouTube Data API erschöpft; nach dem Reset erneut versuchen." : "";
        const detail = body?.error?.message ? `: ${body.error.message}` : "";
        throw new Error(`YouTube Data API ${resource} fehlgeschlagen (${response.status}${reason ? `, ${reason}` : ""})${detail}.${advice}`);
      }
      const delay = retryDelay(response, attempt);
      log(`YouTube Data API HTTP ${response.status}: ${resource}; Wiederholung ${attempt + 1}/${MAX_RETRIES} in ${Math.ceil(delay / 1000)} Sekunden.`);
      await sleep(delay);
    }
  }

  async function* pages(resource, params) {
    const seen = new Set();
    let pageToken;
    do {
      const data = await get(resource, { ...params, maxResults: PAGE_SIZE, pageToken });
      const items = data.items ?? [];
      yield items;
      pageToken = data.nextPageToken;
      if (pageToken && seen.has(pageToken)) {
        // Scheduled, not yet public playlist entries are never returned; YouTube then repeats the token on empty pages.
        if (!items.length) break;
        throw new Error(`YouTube Data API: Wiederholtes Seitentoken bei ${resource}.`);
      }
      seen.add(pageToken);
    } while (pageToken);
  }

  async function all(resource, params) {
    const items = [];
    for await (const page of pages(resource, params)) items.push(...page);
    return items;
  }

  return {
    mode: "api",

    async channel(handle) {
      const data = await get("channels", { part: "snippet", forHandle: `@${handle}` });
      const channel = data.items?.[0];
      if (!channel?.id) {
        throw new Error(`YouTube-Kanal nicht gefunden: @${handle}`);
      }
      return { id: channel.id, title: channel.snippet?.title ?? handle };
    },

    async* playlistVideoIds(playlistId) {
      for await (const items of pages("playlistItems", { part: "contentDetails", playlistId })) {
        yield [...new Set(items.map((item) => item.contentDetails?.videoId).filter(Boolean))];
      }
    },

    async videos(ids) {
      const byId = new Map();
      for (let index = 0; index < ids.length; index += PAGE_SIZE) {
        const chunk = ids.slice(index, index + PAGE_SIZE);
        const data = await get("videos", { part: "snippet,contentDetails,status", id: chunk.join(","), maxResults: PAGE_SIZE });
        for (const item of data.items ?? []) byId.set(item.id, item);
      }
      return ids.map((id) => apiVideoToVideo(byId.get(id)));
    },

    async channelPlaylists(channelId) {
      const items = await all("playlists", { part: "snippet", channelId });
      return items.map((item) => {
        if (!item.id || !item.snippet?.title) {
          throw new Error("YouTube Data API: Playlist ohne ID oder Titel.");
        }
        return { id: item.id, title: item.snippet.title, description: item.snippet.description ?? "" };
      });
    },

    async playlistItems(playlistId) {
      const items = await all("playlistItems", { part: "snippet,status", playlistId });
      // Matches the public playlist page, which hides deleted and private entries.
      return items
        .filter((item) => ["public", "unlisted"].includes(item.status?.privacyStatus) && item.snippet?.resourceId?.videoId)
        .map((item) => ({
          videoId: item.snippet.resourceId.videoId,
          title: item.snippet.title ?? "",
          availability: "listed",
        }));
    },
  };
}
