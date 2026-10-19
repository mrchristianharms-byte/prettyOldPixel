import { escapeHtml } from "../site-html.mjs";

export function navigation(entries, route, config, trailingHtml = "") {
  const selected = entries.map(([target]) => target).find((prefix) => prefix && route.startsWith(prefix)) ?? route;
  return `<nav aria-label="Hauptnavigation"><ul>${entries.map(([target, name, separator], index) => {
    const control = trailingHtml && index === entries.length - 1;
    return `${separator ? '<li class="navigation-separator" aria-hidden="true">|</li>' : ""}<li${control ? ' class="navigation-control"' : ""}><a href="${config.href(target)}"${selected === target ? ' aria-current="page"' : ""}>${escapeHtml(name)}</a>${control ? trailingHtml : ""}</li>`;
  }).join("")}</ul></nav>`;
}
