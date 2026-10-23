import { escapeHtml, externalLink } from "../site-html.mjs";
import { durationLabel } from "../site-format.mjs";

const MAX_COMPANIES = 2;

function companies(names) {
  return names.length > MAX_COMPANIES ? `${names.slice(0, MAX_COMPANIES).join(", ")} u. a.` : names.join(", ");
}

// "(1988, Entwickler: X, Publisher: Y)"; identical companies are named once.
export function gameDiscussionMeta({ firstYear = null, developers = [], publishers = [] }) {
  const same = developers.length > 0 && developers.length === publishers.length
    && developers.every((name) => publishers.includes(name));
  const parts = [
    ...(firstYear === null ? [] : [String(firstYear)]),
    ...(same ? [`Entwickler und Publisher: ${companies(developers)}`] : [
      ...(developers.length ? [`Entwickler: ${companies(developers)}`] : []),
      ...(publishers.length ? [`Publisher: ${companies(publishers)}`] : []),
    ]),
  ];
  return parts.length ? ` <span class="meta">(${escapeHtml(parts.join(", "))})</span>` : "";
}

export function gameDiscussions(video) {
  if (!video.gameDiscussions?.length) return "";
  return `<section class="game-discussions"><h3>Spielebesprechungen im Video</h3>
${video.gameDiscussions.some((discussion) => !discussion.reviewed) ? '<p class="meta">Spielnamen und Zeitmarken können ungenau sein.</p>' : ""}
<p class="meta" data-chapter-hint>Ohne aktivierte Player-Steuerung öffnen die Links das Video auf YouTube.</p>
<ol>${video.gameDiscussions.map((discussion) => {
    const seconds = Math.floor(discussion.startMs / 1000);
    const time = durationLabel(seconds);
    const length = discussion.endMs === null ? ""
      : ` (${Math.max(1, Math.round((discussion.endMs - discussion.startMs) / 60_000))} min)`;
    const url = new URL(video.url);
    url.searchParams.set("t", `${seconds}s`);
    // Marker lets the build list preview pages; reviewed entries never carry it.
    const marker = discussion.reviewed ? "" : ` data-unreviewed-video="${escapeHtml(video.id)}"`;
    return `<li data-chapter-seconds="${seconds}"${marker}>${externalLink(url.href, `${time} · ${discussion.title}${length}`)}${gameDiscussionMeta(discussion)}</li>`;
  }).join("")}</ol></section>`;
}
