import { httpUrl } from "./site-data.mjs";

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

const externalMark = '<span aria-hidden="true">↗</span><span class="visually-hidden"> (externe Website)</span>';

export function externalLink(url, label, target = "", icon = "", { visibleLabel = false } = {}) {
  const safe = httpUrl(url);
  if (!safe) throw new Error(`Ungültiger externer Link: ${url}`);
  return `<a href="${escapeHtml(safe)}" rel="external"${target ? ` target="${escapeHtml(target)}"` : ""}${icon ? ` class="archive-icon${visibleLabel ? " archive-icon-labelled" : ""}" title="${escapeHtml(label)} (externe Website)"` : ""}>${icon ? `${icon}<span${visibleLabel ? "" : ' class="visually-hidden"'}>${escapeHtml(label)}</span>` : escapeHtml(label)} ${externalMark}</a>`;
}
