import { httpUrl } from "../shared/http-url.mjs";
import { escapeHtml, externalLink } from "./site-html.mjs";

export function magazineLinks(magazine, config) {
  return `<a href="${config.href(magazine.route)}">${escapeHtml(magazine.name)}</a>${magazine.yearAnchor
    ? ` · <a href="${config.href(magazine.route)}#${magazine.yearAnchor}">Jahrgang ${magazine.issue.year}</a>` : ""}${magazine.issue
    ? ` · ${magazine.issue.route ? `<a href="${config.href(magazine.issue.route)}">${escapeHtml(magazine.issue.label)}</a>` : escapeHtml(magazine.issue.label)}` : ""}`;
}

export function sectionLinks(video, config) {
  return video.sections.length ? `<p class="topics">Bereiche: ${video.sections.map((section) => `<a href="${config.href(section.route)}">${escapeHtml(section.name)}</a>`).join(" · ")}</p>` : "";
}

export function videoHref(video, config, issueRoute) {
  const route = issueRoute ?? video.magazines.find((magazine) => magazine.issue?.route)?.issue.route ?? video.games[0]?.route ?? video.detailRoute;
  return route ? `${config.href(route)}#video-${video.id}` : video.url;
}

export function videoLink(video, config, label = video.title, issueRoute) {
  const href = videoHref(video, config, issueRoute);
  return httpUrl(href)
    ? externalLink(href, label) : `<a href="${href}">${escapeHtml(label)}</a>`;
}
