import { escapeHtml, externalLink } from "../site-html.mjs";

export function magazineLogo(magazine, config) {
  if (!magazine.logo) return "";
  return `<figure class="magazine-logo"><img src="${config.href(magazine.logo.asset)}" alt="${escapeHtml(magazine.name)} – Zeitschriftenlogo" decoding="async"><figcaption>${externalLink(magazine.logo.sourceUrl, `Logoquelle: ${magazine.logo.sourceLabel ?? "kultmags.com"}`)}</figcaption></figure>`;
}
