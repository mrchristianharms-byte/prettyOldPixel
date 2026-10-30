import { siteProcess, processColors, processNodes, processEdges, processConnections } from "../../content-data/site-process.mjs";
import { escapeHtml, externalLink } from "../site-html.mjs";

// Brand paths: Simple Icons (CC0-1.0); https://github.com/simple-icons/simple-icons.
const brandPaths = {
  github: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  youtube: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  cloudflare: "M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.3154-.2246-.3164-.6045-.499-1.0615-.5205l-8.6592-.1123a.1559.1559 0 0 1-.1333-.0713c-.0283-.042-.0351-.0986-.021-.1553.0278-.084.1123-.1484.2036-.1562l8.7359-.1123c1.0351-.0489 2.1601-.8868 2.5537-1.9136l.499-1.3013c.0215-.0561.0293-.1128.0147-.168-.5625-2.5463-2.835-4.4453-5.5499-4.4453-2.5039 0-4.6284 1.6177-5.3876 3.8614-.4927-.3658-1.1187-.5625-1.794-.499-1.2026.119-2.1665 1.083-2.2861 2.2856-.0283.31-.0069.6128.0635.894C1.5683 13.171 0 14.7754 0 16.752c0 .1748.0142.3515.0352.5273.0141.083.0844.1475.1689.1475h15.9814c.0909 0 .1758-.0645.2032-.1553l.12-.4268zm2.7568-5.5634c-.0771 0-.1611 0-.2383.0112-.0566 0-.1054.0415-.127.0976l-.3378 1.1744c-.1475.5068-.0918.9707.1543 1.3164.2256.3164.6055.498 1.0625.5195l1.8437.1133c.0557 0 .1055.0263.1329.0703.0283.043.0351.1074.0214.1562-.0283.084-.1132.1485-.204.1553l-1.921.1123c-1.041.0488-2.1582.8867-2.5527 1.914l-.1406.3585c-.0283.0713.0215.1416.0986.1416h6.5977c.0771 0 .1474-.0489.169-.126.1122-.4082.1757-.837.1757-1.2803 0-2.6025-2.125-4.727-4.7344-4.727",
  node: "M11.998,24c-0.321,0-0.641-0.084-0.922-0.247l-2.936-1.737c-0.438-0.245-0.224-0.332-0.08-0.383c0.585-0.203,0.703-0.25,1.328-0.604c0.065-0.037,0.151-0.023,0.218,0.017l2.256,1.339c0.082,0.045,0.197,0.045,0.272,0l8.795-5.076c0.082-0.047,0.134-0.141,0.134-0.238V6.921c0-0.099-0.053-0.192-0.137-0.242l-8.791-5.072c-0.081-0.047-0.189-0.047-0.271,0L3.075,6.68C2.99,6.729,2.936,6.825,2.936,6.921v10.15c0,0.097,0.054,0.189,0.139,0.235l2.409,1.392c1.307,0.654,2.108-0.116,2.108-0.89V7.787c0-0.142,0.114-0.253,0.256-0.253h1.115c0.139,0,0.255,0.112,0.255,0.253v10.021c0,1.745-0.95,2.745-2.604,2.745c-0.508,0-0.909,0-2.026-0.551L2.28,18.675c-0.57-0.329-0.922-0.945-0.922-1.604V6.921c0-0.659,0.353-1.275,0.922-1.603l8.795-5.082c0.557-0.315,1.296-0.315,1.848,0l8.794,5.082c0.57,0.329,0.924,0.944,0.924,1.603v10.15c0,0.659-0.354,1.273-0.924,1.604l-8.794,5.078C12.643,23.916,12.324,24,11.998,24zM19.099,13.993c0-1.9-1.284-2.406-3.987-2.763c-2.731-0.361-3.009-0.548-3.009-1.187c0-0.528,0.235-1.233,2.258-1.233c1.807,0,2.473,0.389,2.747,1.607c0.024,0.115,0.129,0.199,0.247,0.199h1.141c0.071,0,0.138-0.031,0.186-0.081c0.048-0.054,0.074-0.123,0.067-0.196c-0.177-2.098-1.571-3.076-4.388-3.076c-2.508,0-4.004,1.058-4.004,2.833c0,1.925,1.488,2.457,3.895,2.695c2.88,0.282,3.103,0.703,3.103,1.269c0,0.983-0.789,1.402-2.642,1.402c-2.327,0-2.839-0.584-3.011-1.742c-0.02-0.124-0.126-0.215-0.253-0.215h-1.137c-0.141,0-0.254,0.112-0.254,0.253c0,1.482,0.806,3.248,4.655,3.248C17.501,17.007,19.099,15.91,19.099,13.993z",
};

function icon(name, x, y) {
  const drawing = brandPaths[name] ? `<path d="${brandPaths[name]}" fill="currentColor" stroke="none"/>`
    : name === "workflow" ? `<circle cx="5" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><path d="M5 8v8M8 5h8v5M13 10h6v6h-6zM16 16v3H8"/><svg x="17" y="17" width="9" height="9" viewBox="0 0 24 24"><path d="${brandPaths.github}" fill="currentColor" stroke="none"/></svg>`
    : name === "db" ? '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>'
    : name === "visitor" ? '<circle cx="12" cy="6" r="4"/><path d="M3 23v-5c0-8 18-8 18 0v5"/>'
    : name === "cache" ? '<path d="M2 5h16v16H2zM6 2h16v15M5 10h10M5 14h10M5 18h6"/>'
    : '<path d="M5 2h10l5 5v15H5zM15 2v6h5M8 12h9M8 16h9"/>';
  return `<svg x="${x}" y="${y}" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">${drawing}</svg>`;
}

function pulse(edge, kind, delay, highlighted) {
  const highlights = processConnections[edge.id].map((id, index) => {
    if (!id) return "";
    const time = Number((delay + index * 0.6).toFixed(1));
    const key = `${kind}:${id}:${time}`;
    if (highlighted.has(key)) return "";
    highlighted.add(key);
    const [, x, y, w, h, color] = processNodes.find(([nodeId]) => nodeId === id);
    return `<rect class="process-highlight process-highlight-${kind}" data-process-highlight="${id}" x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="var(--process-${color})" stroke="var(--process-${color})" style="animation-delay:${Number((delay + index * 0.6).toFixed(1))}s" aria-hidden="true"/>`;
  }).join("");
  return `<circle r="6" fill="var(--process-${edge.color})" class="process-pulse process-${kind}" style="offset-path:path('${edge.d}');animation-delay:${delay}s" aria-hidden="true"/>${highlights}`;
}

function fresh(x, y, w, h, kind, delay) {
  return `<g class="process-fresh process-fresh-${kind}" style="animation-delay:${delay}s" aria-hidden="true"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/><text x="${x + w - 35}" y="${y + h - 10}">neu</text></g>`;
}

const styles = `
.process-diagram { ${Object.entries(processColors).map(([name, color]) => `--process-${name}:${color}`).join(";")} }
[data-theme=dark] .process-diagram { --process-dev:#60a5fa; --process-archive:#c084fc; --process-yt:#eab308; --process-build:#94a3b8; --process-web:#34d399 }
@media (prefers-color-scheme:dark) {
 :root:not([data-theme=light]) .process-diagram { --process-dev:#60a5fa; --process-archive:#c084fc; --process-yt:#eab308; --process-build:#94a3b8; --process-web:#34d399 }
}
.process-scroll { overflow-x:auto; margin-block:1rem; border:1px solid var(--pico-muted-border-color); border-radius:.5rem }
.process-svg { display:block; width:100%; min-width:62rem; height:auto; background:var(--pico-background-color) }
.process-svg text { fill:var(--pico-color); font-family:system-ui,sans-serif; font-size:15px }
.process-svg .process-lane { font-size:17px; font-weight:700 }
.process-svg .process-node-title { font-size:14px; font-weight:700 }
.process-svg .process-node-detail { font-size:12px }
.process-svg .process-node > rect { fill:var(--pico-background-color) }
.process-svg .process-node-dev > rect,.process-svg .process-node-archive > rect,.process-svg .process-node-db > rect,.process-svg .process-node-push > rect { fill:color-mix(in srgb,var(--process-dev) 15%,var(--pico-background-color)) }
.process-svg .process-node-youtube > rect,.process-svg .process-node-fetch > rect,.process-svg .process-node-cache > rect { fill:color-mix(in srgb,var(--process-yt) 15%,var(--pico-background-color)) }
.process-svg .process-node-pages > rect { fill:color-mix(in srgb,var(--process-web) 15%,var(--pico-background-color)) }
.process-svg .process-node > .process-active { fill:var(--process-yt) }
.process-svg .process-edge-label { font-size:13px; paint-order:stroke; stroke:var(--pico-background-color); stroke-width:5px; stroke-linejoin:round }
.process-pause { width:auto; margin-right:.5rem }
.process-pause + label { display:inline }
.process-play { display:flex; align-items:center; justify-content:center; width:100%; height:100%; margin:0; padding:0; border:0; border-radius:0; background:transparent; color:inherit; box-shadow:none; font-size:14px; cursor:pointer }
.process-play:focus-visible { outline:2px solid currentColor; outline-offset:-3px }
.process-legend { display:flex; flex-wrap:wrap; gap:.4rem 1.5rem; list-style:none; padding:0; font-size:.85rem }
.process-pulse,.process-fresh,.process-active,.process-highlight { opacity:0; pointer-events:none }
.process-highlight { stroke-width:4px }
.process-highlight-once { animation:process-highlight .8s ease-out 1 }
.process-highlight-youtube { animation:process-highlight-youtube 20s linear infinite }
.process-highlight-visitor { animation:process-highlight-visitor 3s linear infinite }
.process-highlight-origin { animation:process-highlight-origin 6s linear infinite }
.process-manual-active .process-svg > .process-once,.process-manual-active .process-svg > .process-highlight-once,.process-manual-active .process-svg > .process-fresh-once { visibility:hidden }
.process-manual-active .process-youtube,.process-manual-active .process-highlight-youtube,.process-manual-active .process-fresh-youtube,.process-manual-active .process-active { animation-play-state:paused }
.process-once { animation:process-travel .6s linear 1 }
.process-youtube { animation:process-poll 20s linear infinite }
.process-visitor { animation:process-visit 3s linear infinite }
.process-origin { animation:process-origin 6s linear infinite }
.process-fresh-once { animation:process-new 2s ease-out 1 }
.process-fresh-youtube { animation:process-new-cycle 20s linear infinite }
.process-active { fill:var(--process-yt); stroke:var(--process-yt); stroke-width:5px; animation:process-activate 20s linear infinite }
.process-fresh rect { fill:#047857; stroke:#047857; stroke-width:5px }
.process-svg .process-fresh text { fill:white; font-weight:700 }
.process-pause:checked ~ .process-scroll * { animation-play-state:paused !important }
@keyframes process-travel { 0% { opacity:1; offset-distance:0% } 95% { opacity:1 } 100% { opacity:0; offset-distance:100% } }
@keyframes process-poll { 0% { opacity:1; offset-distance:0% } 2.7% { opacity:1 } 3% { opacity:0; offset-distance:100% } 100% { opacity:0; offset-distance:100% } }
@keyframes process-visit { 0% { opacity:1; offset-distance:0% } 18% { opacity:1 } 20%,100% { opacity:0; offset-distance:100% } }
@keyframes process-origin { 0% { opacity:1; offset-distance:0% } 9% { opacity:1 } 10%,100% { opacity:0; offset-distance:100% } }
@keyframes process-new { 0% { opacity:.7 } 100% { opacity:0 } }
@keyframes process-new-cycle { 0% { opacity:.7 } 10%,100% { opacity:0 } }
@keyframes process-activate { 0% { opacity:.3 } 5%,100% { opacity:0 } }
@keyframes process-highlight { 0% { opacity:.3 } 100% { opacity:0 } }
@keyframes process-highlight-youtube { 0% { opacity:.3 } 4%,100% { opacity:0 } }
@keyframes process-highlight-visitor { 0% { opacity:.3 } 26.667%,100% { opacity:0 } }
@keyframes process-highlight-origin { 0% { opacity:.3 } 13.333%,100% { opacity:0 } }
@media (prefers-reduced-motion:reduce) {
 .process-diagram .process-pulse,.process-diagram .process-fresh,.process-diagram .process-active,.process-diagram .process-highlight { animation:none !important; opacity:0 !important }
}`;

export function processDiagram() {
  const highlighted = new Set();
  const renderPulse = (edge, kind, delay) => pulse(edge, kind, delay, highlighted);
  return `<p>${escapeHtml(siteProcess.introduction)}</p><div class="process-diagram" data-process-diagram>
<style>${styles}</style>
<input type="checkbox" id="process-pause" class="process-pause"><label for="process-pause">Animation pausieren</label>
<div class="process-scroll" tabindex="0" role="region" aria-label="Prozessdiagramm, bei Bedarf horizontal scrollen">
<svg class="process-svg" viewBox="0 0 1280 1190" role="group" aria-labelledby="process-title process-desc">
<title id="process-title">${escapeHtml(siteProcess.title)}</title>
<desc id="process-desc">Links stehen die manuelle Entwicklung und die Zuordnungsdaten, rechts YouTube und die Cache-Aktualisierung. Beide Wege führen über GitHub Actions zur Generierung von Website, App und Agentendaten für GitHub Pages. Besucher greifen unten rechts über Cloudflare zu. Ausführliche Erklärungen folgen unter dem Diagramm.</desc>
<defs>${Object.keys(processColors).map((name) => `<marker id="process-arrow-${name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--process-${name})"/></marker>`).join("")}</defs>
<text x="160" y="30" class="process-lane">F1 · ENTWICKLUNG / MANUELL</text>
<text x="720" y="30" class="process-lane">F2 · YOUTUBE / AUTOMATISCH</text>
${processEdges.map((edge) => `<path id="process-edge-${edge.id}" data-process-from="${processConnections[edge.id][0] ?? ""}" data-process-to="${processConnections[edge.id][1] ?? ""}" d="${edge.d}" fill="none" stroke="var(--process-${edge.color})" stroke-width="2" marker-end="url(#process-arrow-${edge.color})"/>
${edge.label ? `<text class="process-edge-label" x="${edge.x}" y="${edge.y}" text-anchor="middle">${escapeHtml(edge.label)}</text>` : ""}`).join("")}
${processNodes.map(([id, x, y, w, h, color, symbol, ...lines]) => `<g class="process-node process-node-${id}" id="process-node-${id}" style="color:var(--process-${color})">
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" stroke="currentColor" stroke-width="2"/>
${["dev", "archive"].includes(id) ? "" : icon(symbol, x + 10, y + 10)}
${["site", "dev", "archive"].includes(id) ? icon("node", x + w - 38, y + h - 32) : ""}
${lines.map((line, i) => `<text x="${x + 46}" y="${y + 24 + i * 19}" class="${i === 0 ? "process-node-title" : "process-node-detail"}">${escapeHtml(line)}</text>`).join("")}
${id === "fetch" ? `<rect class="process-active" x="${x}" y="${y}" width="${w}" height="${h}" rx="10" style="animation-delay:20s" aria-hidden="true"/>` : ""}
${["dev", "archive"].includes(id) ? `<foreignObject x="${x + 8}" y="${y + 10}" width="30" height="30"><button xmlns="http://www.w3.org/1999/xhtml" type="button" class="process-play" data-process-play="${id}" aria-label="${id === "dev" ? "Entwicklungsablauf" : "Magazin-Fetch"} manuell animieren" title="Animation starten"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4 20 12 7 20Z" fill="currentColor"/></svg></button></foreignObject>` : ""}
</g>`).join("")}
${processEdges.map((edge) => `${edge.push !== undefined ? renderPulse(edge, "once", edge.push) : ""}${edge.yt !== undefined ? renderPulse(edge, "youtube", edge.yt) : ""}${edge.visitor !== undefined ? renderPulse(edge, "visitor", edge.visitor) : ""}${edge.origin !== undefined ? renderPulse(edge, "origin", edge.origin) : ""}${edge.cacheResponse !== undefined ? renderPulse(edge, "origin", edge.cacheResponse) : ""}`).join("")}
${processNodes.filter(([id]) => ["html", "app", "ai", "pages", "cache"].includes(id)).map(([id, x, y, w, h]) =>
    `${id === "cache" ? "" : fresh(x, y, w, h, "once", id === "pages" ? 10.8 : 8.2)}${fresh(x, y, w, h, "youtube", id === "cache" ? 22.6 : id === "pages" ? 28.8 : 26.2)}`).join("")}
<g class="process-manual" aria-hidden="true"></g>
</svg></div>
<ul class="process-legend">${Object.entries({ dev: "DEV · Entwicklung / Zuordnungen", archive: "ARCHIV · Magazinquellen", yt: "YT · YouTube / Caches", build: "BUILD · gemeinsame Verarbeitung", web: "WEB · Besucherzugriff" }).map(([color, label]) => `<li><span style="color:var(--process-${color})">■</span> ${label}</li>`).join("")}</ul>
<h2>Simulation im Diagramm</h2>
<ul>${siteProcess.legend.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}<li>Architekturstand: ${siteProcess.date}. Markenicons: ${externalLink("https://simpleicons.org/", "Simple Icons (CC0-1.0)")}; Markenrechte bleiben bei den jeweiligen Anbietern.</li></ul>
</div>`;
}

export function processExplanation() {
  return siteProcess.flows.map((flow) => `<section><h2>${escapeHtml(flow.title)}</h2><ul>${flow.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`).join("");
}
