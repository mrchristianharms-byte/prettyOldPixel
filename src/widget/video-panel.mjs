import { httpUrl } from "../site-data.mjs";
import { escapeHtml, externalLink } from "../site-html.mjs";
import { durationLabel, videoDate } from "../site-format.mjs";
import { magazineLinks, sectionLinks } from "../site-video-links.mjs";
import { metadata } from "./metadata.mjs";
import { playerPoster } from "./video.mjs";
import { archiveLinks } from "./archive-links.mjs";
import { gameDiscussions } from "./game-discussions.mjs";

export function descriptionHtml(description) {
  return description.split(/\n{2,}/u).map((paragraph) => {
    let result = "";
    let offset = 0;
    for (const match of paragraph.matchAll(/https?:\/\/[^\s<>"']+/gu)) {
      const url = match[0].replace(/[.,;!?)\]]+$/u, "");
      result += escapeHtml(paragraph.slice(offset, match.index));
      result += httpUrl(url) ? externalLink(url, url) : escapeHtml(url);
      offset = match.index + url.length;
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
${game ? `<p>Spiel: <a href="${config.href(game.route)}">${escapeHtml(game.name)}</a>${game.playlists.filter((playlist) => video.playlists.some((source) => source.id === playlist.id)).map((playlist) => ` · ${externalLink(playlist.url, playlist.title)}`).join("")}</p>` : ""}
<noscript><p>${externalLink(video.url, "Video auf YouTube ansehen")}</p></noscript>
${!game && (video.blaetterabend || video.magazines.length) ? gameDiscussions(video) : ""}
${video.chapters.length ? `<section class="video-chapters"><h3>Kapitel und Zeitmarken</h3><p class="meta" data-chapter-hint>Ohne aktivierte Player-Steuerung öffnen die Links das Video auf YouTube.</p><ol>${video.chapters.map((chapter) => `<li data-chapter-seconds="${chapter.seconds}">${externalLink(chapter.url, `${durationLabel(chapter.seconds)} · ${chapter.label}`)}</li>`).join("")}</ol></section>` : ""}
${video.mentionedChannels.length ? `<section class="mentioned-channels"><h3>Erwähnte Kanäle / Partner</h3><p class="meta">YouTube-Kanäle aus der Videobeschreibung. Eine Erwähnung bedeutet nicht, dass eine bezahlte Zusammenarbeit besteht.</p><ul>${video.mentionedChannels.map((channel) => `<li>${externalLink(channel.url, channel.label)}</li>`).join("")}</ul></section>` : ""}
<section><h3>Videobeschreibung</h3><div class="description">${description ? descriptionHtml(description) : video.description ? "<p>Die Beschreibung enthält ausschließlich die oben aufgeführten Kapitel und Zeitmarken.</p>" : "<p>Für dieses Video ist keine Beschreibung vorhanden.</p>"}</div></section>
${video.magazines.length > 1 || (video.magazines.length === 1 && !video.magazines[0].issue?.route) ? magazineDetails(video, config) : ""}
<nav aria-label="Videoteile">${previous ? `<a href="#video-${previous.id}">← Vorheriger Teil</a>` : ""}
${next ? `<a href="#video-${next.id}">Nächster Teil →</a>` : ""}</nav></article>`;
}
