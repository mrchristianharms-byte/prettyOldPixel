import { escapeHtml } from "../site-html.mjs";

export function navigation(entries, route, config, trailingHtml = "") {
  const selected = entries.map((entry) => entry.route).find((prefix) => prefix && route.startsWith(prefix)) ?? route;
  return `<nav aria-label="Hauptnavigation"><details class="navigation-menu"><summary>Menü</summary><ul>${entries.map(({ route: target, name }, index) => {
    const control = trailingHtml && index === entries.length - 1;
    return `<li${control ? ' class="navigation-control"' : ""}><a href="${config.href(target)}"${selected === target ? ' aria-current="page"' : ""}>${escapeHtml(name)}</a>${control ? trailingHtml : ""}</li>`;
  }).join("")}</ul></details></nav>`;
}

export function gamePageNavigation(route, href) {
  const entries = [
    { route: "spiele/", name: "re.play" },
    { route: "spiele/uebersicht/", name: "Alle Spiele als Tabelle" },
    { route: "spiele/statistik/", name: "Spielestatistiken" },
  ];
  return `<nav class="game-page-navigation" aria-label="Spieleübersichten"><ul>${entries.map((entry) =>
    `<li><a href="${href(entry.route)}"${route === entry.route ? ' aria-current="page"' : ""}>${escapeHtml(entry.name)}</a></li>`).join("")}</ul></nav>`;
}
