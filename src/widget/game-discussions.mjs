import { externalLink } from "../site-html.mjs";
import { durationLabel } from "../site-format.mjs";

export function gameDiscussions(video) {
  if (!video.gameDiscussions?.length) return "";
  return `<section class="game-discussions"><h3>Erkannte Spielebesprechungen</h3>
${video.gameDiscussions.some((discussion) => !discussion.reviewed) ? '<p class="meta">Automatisch erkannte Vorschläge; Spielnamen und Zeitgrenzen können ungenau sein.</p>' : ""}
<p class="meta" data-chapter-hint>Ohne aktivierte Player-Steuerung öffnen die Links das Video auf YouTube.</p>
<ol>${video.gameDiscussions.map((discussion) => {
    const seconds = Math.floor(discussion.startMs / 1000);
    const time = durationLabel(seconds);
    const range = discussion.endMs === null ? time : `${time}–${durationLabel(Math.ceil(discussion.endMs / 1000))}`;
    const url = new URL(video.url);
    url.searchParams.set("t", `${seconds}s`);
    return `<li data-chapter-seconds="${seconds}">${externalLink(url.href, `${range} · ${discussion.title}`)}</li>`;
  }).join("")}</ol></section>`;
}
