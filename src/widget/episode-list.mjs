import { escapeHtml, externalLink } from "../site-html.mjs";
import { dateLabel, durationLabel } from "../site-format.mjs";

export function episodeList(videos, game) {
  const entries = new Map(game?.series.entries.map((entry) => [entry.videoId, entry]) ?? []);
  const runs = new Map(game?.series.runs.map((run) => [run.id, run]) ?? []);
  function context(video) {
    const entry = entries.get(video.id);
    return `${escapeHtml(entry.phase.label)} · ${escapeHtml(runs.get(entry.runId).label)}`;
  }
  const standalone = videos.length === 1 && Boolean(videos[0].detailRoute);
  return `<details class="episode-menu" open><summary>☰ Videos ${game ? "zu diesem Spiel" : standalone ? "auf dieser Seite" : "zu dieser Ausgabe"} (${videos.length})</summary>
<nav aria-label="Videos ${game ? "zum Spiel" : standalone ? "auf dieser Seite" : "zur Ausgabe"}" tabindex="0"><ol>${videos.map((video, index) => `<li><a data-video-link href="#video-${video.id}">${index + 1}/${videos.length}: ${escapeHtml(video.title)}</a>
<p class="meta">${video.durationSeconds !== null ? `<span aria-label="Laufzeit">${durationLabel(video.durationSeconds)}</span>` : "Laufzeit unbekannt"} · ${video.publishedAt ? `<time datetime="${video.publishedAt}">${dateLabel(video.publishedAt, false)}</time>` : "Datum unbekannt"}${game ? `<br>${context(video)}` : ""}</p></li>`).join("")}</ol></nav>
${game?.playlists.length ? `<div class="episode-playlists">${game.playlists.map((playlist) => externalLink(playlist.url, playlist.title)).join("\n")}</div>` : ""}</details>`;
}
