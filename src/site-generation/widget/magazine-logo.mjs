import { escapeHtml, externalLink } from "../site-html.mjs";

export function magazineLogo(magazine, config) {
  if (!magazine.logo) return "";
  const sources = (magazine.logo.candidates ?? []).map((candidate) => `<source type="${candidate.type}" srcset="${config.href(candidate.asset)}">`).join("");
  return `<figure class="magazine-logo"><picture>${sources}<img src="${config.href(magazine.logo.asset)}" alt="${escapeHtml(magazine.name)} – Zeitschriftenlogo" decoding="async"></picture><figcaption>${externalLink(magazine.logo.sourceUrl, `Logoquelle: ${magazine.logo.sourceLabel ?? "kultmags.com"}`)}</figcaption></figure>`;
}
