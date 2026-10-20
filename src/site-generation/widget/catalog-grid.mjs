import { escapeHtml } from "../site-html.mjs";

export function catalogGrid(entries, config) {
  return `<ul class="catalog-grid">${entries.map((entry) => `<li><h2><a href="${config.href(entry.route)}">${escapeHtml(entry.name)}</a></h2>${entry.facts.map((fact) => `<p class="meta">${escapeHtml(fact)}</p>`).join("")}</li>`).join("")}</ul>`;
}
