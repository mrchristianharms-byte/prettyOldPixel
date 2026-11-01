import { escapeHtml } from "../site-html.mjs";

export function metadata(fields, className = "") {
  const classes = ["detail-meta", className].filter(Boolean).map(escapeHtml).join(" ");
  return `<dl class="${classes}">${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
}
