import { escapeHtml } from "../site-html.mjs";

export function navigation(entries, route, config) {
  const selected = entries.map(([target]) => target).find((prefix) => prefix && route.startsWith(prefix)) ?? route;
  return `<nav aria-label="Hauptnavigation"><ul>${entries.map(([target, name, separator]) => `${separator ? '<li class="navigation-separator" aria-hidden="true">|</li>' : ""}<li><a href="${config.href(target)}"${selected === target ? ' aria-current="page"' : ""}>${escapeHtml(name)}</a></li>`).join("")}</ul></nav>`;
}
