import { httpUrl } from "../../shared/http-url.mjs";
import { escapeHtml, externalLink } from "../site-html.mjs";
import { durationLabel, videoDate } from "../site-format.mjs";
import { magazineLinks, sectionLinks } from "../site-video-links.mjs";
import { metadata } from "./metadata.mjs";
import { playerPoster } from "./video.mjs";
import { archiveLinks } from "./archive-links.mjs";
import { gameDiscussions } from "./game-discussions.mjs";

export function descriptionHtml(description, playlists = []) {
  return description.split(/\n{2,}/u).map((paragraph) => {
    let result = "";
    let offset = 0;
    for (const match of paragraph.matchAll(/https?:\/\/[^\s<>"']+|(?<![\p{L}\p{N}_.@/+-])@[\p{L}\p{N}_](?:[\p{L}\p{N}_.-]*[\p{L}\p{N}_-])?/gu)) {
      const text = match[0].replace(/[.,;!?)\]]+$/u, "");
      result += escapeHtml(paragraph.slice(offset, match.index));
      if (text.startsWith("@")) {
        result += externalLink(`https://www.youtube.com/@${encodeURIComponent(text.slice(1))}`, text);
      } else if (httpUrl(text)) {
        const url = new URL(text);
        const playlist = url.protocol === "https:" && !url.username && !url.password && !url.port
          && ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname) && url.pathname === "/playlist"
          ? playlists.find((playlist) => playlist.id === url.searchParams.get("list")) : null;
        result += externalLink(text, playlist?.title ?? text);
      } else result += escapeHtml(text);
      offset = match.index + text.length;
    }
    return `<p>${result}${escapeHtml(paragraph.slice(offset))}</p>`;
  }).join("\n");
}

function magazineDetails(video, config) {
  if (!video.magazines.length) return "";
  return `<section><h3>Zeitschriften und Ausgaben</h3>
${video.magazines.map((magazine) => `<section><h4>${escapeHtml(magazine.name)}${magazine.issue ? ` – ${escapeHtml(magazine.issue.label)}` : ""}</h4>
<p>${magazineLinks(magazine, config)}</p>
${!magazine.issue?.route ? "<p>Die genaue Heftausgabe ist unbekannt.</p>" : ""}
${archiveLinks(magazine.archives)}</section>`).join("")}</section>`;
}

export function videoPanel(video, config, { index, total, previous, next, game, entry, run }) {
  const description = video.descriptionWithoutChapters ?? video.description;
  return `<article id="video-${video.id}" data-video-panel${video.publishedAt ? ' data-dated="true"' : ""} data-player-url="${video.embedUrl}" data-video-url="${escapeHtml(video.url)}" data-poster="${escapeHtml(playerPoster(video))}" tabindex="-1">
<h2>Video ${index + 1}/${total}: ${escapeHtml(video.title)}</h2>
${metadata([
  ["Veröffentlicht", videoDate(video)],
  ...(video.durationSeconds !== null ? [["Länge", durationLabel(video.durationSeconds)]] : []),
  ...(game ? [["Abschnitt", escapeHtml(entry.phase.label)], ["Reihe", escapeHtml(run.label)]] : []),
])}
<hr>
${sectionLinks(video, config)}
<noscript><p>${externalLink(video.url, "Video auf YouTube ansehen")}</p></noscript>
${!game && (video.blaetterabend || video.magazines.length) ? gameDiscussions(video) : ""}
<div class="description">${description ? descriptionHtml(description, video.playlists) : video.description ? "<p>Die Beschreibung enthält ausschließlich die unten aufgeführten Kapitel und Zeitmarken.</p>" : "<p>Für dieses Video ist keine Beschreibung vorhanden.</p>"}</div>
${video.chapters.length ? `<section class="video-chapters"><h3>Kapitel und Zeitmarken</h3><p class="meta" data-chapter-hint>Ohne aktivierte Player-Steuerung öffnen die Links das Video auf YouTube.</p><ol>${video.chapters.map((chapter) => `<li data-chapter-seconds="${chapter.seconds}">${externalLink(chapter.url, `${durationLabel(chapter.seconds)} · ${chapter.label}`)}</li>`).join("")}</ol></section>` : ""}
${video.mentionedChannels.length ? `<section class="mentioned-channels"><h3>Erwähnte Kanäle und Partner</h3><p class="meta">Diese YouTube-Kanäle werden in der Videobeschreibung erwähnt. Eine Erwähnung bedeutet nicht, dass eine bezahlte Zusammenarbeit besteht.</p><ul>${video.mentionedChannels.map((channel) => `<li>${externalLink(channel.url, channel.label)}</li>`).join("")}</ul></section>` : ""}
${video.magazines.length > 1 || (video.magazines.length === 1 && !video.magazines[0].issue?.route) ? magazineDetails(video, config) : ""}
<nav aria-label="Videoteile">${previous ? `<a href="#video-${previous.id}">← Vorheriger Teil</a>` : ""}
${next ? `<a href="#video-${next.id}">Nächster Teil →</a>` : ""}</nav></article>`;
}
