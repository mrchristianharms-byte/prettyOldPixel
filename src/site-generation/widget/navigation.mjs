import { escapeHtml } from "../site-html.mjs";

export function navigation(entries, route, config, trailingHtml = "") {
  const selected = entries.map((entry) => entry.route).find((prefix) => prefix && route.startsWith(prefix)) ?? route;
  return `<nav aria-label="Hauptnavigation"><details class="navigation-menu"><summary>Menü</summary><ul>${entries.map(({ route: target, name }, index) => {
    const control = trailingHtml && index === entries.length - 1;
    return `<li${control ? ' class="navigation-control"' : ""}><a href="${config.href(target)}"${selected === target ? ' aria-current="page"' : ""}>${escapeHtml(name)}</a>${control ? trailingHtml : ""}</li>`;
  }).join("")}</ul></details></nav>`;
}
