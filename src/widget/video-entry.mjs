import { escapeHtml } from "../site-html.mjs";
import { durationLabel, videoDate } from "../site-format.mjs";
import { magazineLinks, sectionLinks, videoHref, videoLink } from "../site-video-links.mjs";
import { httpUrl } from "../site-data.mjs";

function excerpt(text, length = 220) {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 1).trimEnd()}…` : normalized;
}

function topics(video, config) {
  const games = video.games.length ? `<p class="topics">Spiele: ${video.games.map((game) => `<a href="${config.href(game.route)}">${escapeHtml(game.name)}</a>`).join(" · ")}</p>` : "";
  if (!video.blaetterabend) return `${games}${sectionLinks(video, config)}`;
  return `${games}${sectionLinks(video, config)}<p class="topics"><a href="${config.href("zeitschriften/")}">Blätterabend / Zeitschriften</a>: ${video.magazines.length
    ? video.magazines.map((magazine) => magazineLinks(magazine, config)).join(" · ")
    : "Zeitschrift ungeklärt"}</p>`;
}

export function videoListEntry(video, config, entry, headingLevel = 2, { label = video.title, issueRoute } = {}) {
  const href = videoHref(video, config, issueRoute);
  const external = Boolean(httpUrl(href));
  return `<li><article>
<h${headingLevel}>${videoLink(video, config, label, issueRoute)}</h${headingLevel}>
<a class="video-entry-thumbnail" href="${escapeHtml(href)}"${external ? ' rel="external"' : ""} aria-label="${escapeHtml(label)}${external ? " (externe Website)" : ""}"><img src="${escapeHtml(video.thumbnailUrl)}" width="320" height="180" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>
<div class="video-entry-content">
<p class="meta">${videoDate(video)}${video.durationSeconds !== null ? ` · ${durationLabel(video.durationSeconds)}` : ""}</p>
${entry ? `<p class="meta">${entry.people.length ? `Im Gespräch: ${escapeHtml(entry.people.join(", "))} · ` : ""}Thema: ${escapeHtml(entry.topic)}</p>${entry.note ? `<p class="meta">${escapeHtml(entry.note)}</p>` : ""}` : ""}
${topics(video, config)}
${video.description ? `<p>${escapeHtml(excerpt(video.description))}</p>` : ""}
</div></article></li>`;
}

export function videoList(videos, config, entries = new Map(), headingLevel = 2) {
  if (!videos.length) return "<p>Noch keine Videos mit bekanntem Veröffentlichungsdatum.</p>";
  return `<ol class="video-list">${videos.map((video) => videoListEntry(video, config, entries.get(video.id), headingLevel)).join("\n")}</ol>`;
}
