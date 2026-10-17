import { escapeHtml } from "../site-html.mjs";

export function metadata(fields) {
  return `<dl class="detail-meta">${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
}
