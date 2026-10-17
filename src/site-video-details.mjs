function timestampSeconds(value) {
  if (/^\d+$/u.test(value)) return Number(value);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/u.exec(value);
  if (!match || !match[0]) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function youtubeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname) ? url : null;
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

export function extractVideoDetails(video, channel) {
  const chapters = new Map();
  const removed = [];
  const addChapter = (seconds, label) => {
    if (!Number.isSafeInteger(seconds) || seconds < 0
      || (video.durationSeconds !== null && seconds >= video.durationSeconds)) return false;
    if (!chapters.has(seconds)) chapters.set(seconds, {
      seconds, label, url: `${video.url}&t=${seconds}s`,
    });
    return true;
  };
  const lines = video.description.split("\n");
  let block = [];
  let chapterContext = false;
  let headingRange;
  function finishBlock() {
    if (block.length && (chapterContext || (block.length >= 2 && block[0].seconds === 0))
      && block.every((entry, index) => index === 0 || entry.seconds > block[index - 1].seconds)) {
      let recognized = false;
      for (const entry of block) {
        if (addChapter(entry.seconds, entry.label)) {
          removed.push(entry.range);
          recognized = true;
        }
      }
      if (recognized && headingRange) removed.push(headingRange);
    }
    block = [];
  }
  let offset = 0;
  for (const line of lines) {
    const range = [offset, offset + line.length + (offset + line.length < video.description.length ? 1 : 0)];
    offset += line.length + 1;
    const match = /^\s*(?:(\d{1,3}):)?(\d{1,2}):([0-5]\d)\s+(?:[-–—|]\s*)?(\S.*)$/u.exec(line);
    if (!match || (match[1] !== undefined && Number(match[2]) >= 60)) {
      finishBlock();
      chapterContext = /^\s*(?:kapitel|chapters|zeitmarken|timestamps|timecodes)\s*:?\s*$/iu.test(line);
      headingRange = chapterContext ? range : undefined;
      continue;
    }
    block.push({ seconds: Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]), label: match[4].trim(), range });
  }
  finishBlock();

  const channels = new Map();
  const own = new Set([channel.handle?.replace(/^@/u, ""), channel.title?.replace(/\s/gu, "")]
    .filter(Boolean).map((value) => value.toLowerCase()));
  for (const match of video.description.matchAll(/https?:\/\/[^\s<>"']+/gu)) {
    const raw = match[0].replace(/[.,;!?)\]]+$/u, "");
    const url = youtubeUrl(raw);
    if (!url) continue;
    const videoId = url.hostname === "youtu.be" ? /^\/([A-Za-z0-9_-]{11})\/?$/u.exec(url.pathname)?.[1]
      : url.pathname === "/watch" ? url.searchParams.get("v")
        : /^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/u.exec(url.pathname)?.[1];
    if (videoId === video.id) {
      const time = url.searchParams.get("t") ?? url.searchParams.get("start")
        ?? /^#t=(.+)$/u.exec(url.hash)?.[1];
      const seconds = time === null || time === undefined ? null : timestampSeconds(time);
      if (seconds !== null && addChapter(seconds, `Zeitmarke ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`)) {
        removed.push([match.index, match.index + raw.length]);
      }
    }
    if (url.hostname === "youtu.be") continue;
    const identity = /^\/(@[^/?#]+|(?:channel|c|user)\/[^/?#]+)\/?$/u.exec(url.pathname)?.[1];
    if (!identity) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(identity);
    } catch (error) {
      if (error instanceof URIError) continue;
      throw error;
    }
    const label = decoded.replace(/^(?:channel|c|user)\//u, "");
    if (!/^@?[\p{L}\p{N}_.-]+$/u.test(label)) continue;
    if (decoded.startsWith("channel/") ? label === channel.id
      : own.has(label.replace(/^@/u, "").toLowerCase())) continue;
    const key = decoded.startsWith("channel/") ? decoded : decoded.toLowerCase();
    if (!channels.has(key)) channels.set(key, { label, url: `https://www.youtube.com/${identity}` });
  }
  let descriptionWithoutChapters = "";
  let cursor = 0;
  for (const [start, end] of removed.sort((a, b) => a[0] - b[0])) {
    if (start > cursor) descriptionWithoutChapters += video.description.slice(cursor, start);
    cursor = Math.max(cursor, end);
  }
  descriptionWithoutChapters += video.description.slice(cursor);
  return {
    descriptionWithoutChapters: descriptionWithoutChapters.trim(),
    chapters: [...chapters.values()].sort((a, b) => a.seconds - b.seconds),
    mentionedChannels: [...channels.values()],
  };
}
