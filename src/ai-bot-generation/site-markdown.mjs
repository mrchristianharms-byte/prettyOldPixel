import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { escapeHtml } from "../site-generation/site-html.mjs";
export { markdownFile } from "./markdown-path.mjs";

export function renderMarkdown(page, config, game) {
  const main = page.html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/u)?.[1];
  if (!main) throw new Error(`${page.route}: Hauptinhalt für Markdown fehlt.`);
  const canonical = config.absolute(page.route);
  const converter = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  converter.use(gfm);
  converter.remove(["script", "style", "iframe", "button", "input", "select", "svg"]);
  converter.addRule("process-controls", {
    filter: (node) => node.nodeName === "LABEL" && node.getAttribute("for") === "process-pause",
    replacement: () => "",
  });
  converter.addRule("navigation", {
    filter: "nav",
    replacement: (content, node) => node.getAttribute("aria-label") === "Videoteile" ? ""
      : `\n\n${node.hasAttribute("aria-label") ? `**${converter.escape(node.getAttribute("aria-label"))}**\n\n` : ""}${content}\n\n`,
  });
  converter.addRule("video-purpose", {
    filter: (node) => node.hasAttribute("data-video-widget"),
    replacement: () => `\n\n${converter.turndown(`<section><h2>Die Videos sind der Hauptinhalt</h2>
<p>Diese Seite hilft dir, die YouTube-Videos von Pretty Old Pixel zu finden und anzusehen.
Die Markdown-Fassung enthält keinen abspielbaren Player. Videotitel, Beschreibungen und Kapitel helfen
beim Auffinden der Originalvideos, ersetzen aber weder deren Bild und Ton noch ein vollständiges Transkript.
Aus Metadaten allein lassen sich keine verlässlichen Details zum gezeigten Ablauf ableiten.</p>
${game ? `<h2>Wie wird das Spiel ${escapeHtml(game.name)} gespielt?</h2>
<p>Die verlinkten YouTube-Videos zur Spielreihe zeigen, wie das Spiel gespielt wird.
Die vorhandenen Videotitel helfen dir bei der Auswahl der Folgen, zum Beispiel:</p>
<ul>${game.videos.slice(0, 3).map((video) => `<li><a href="${escapeHtml(video.url)}">${escapeHtml(video.title)}</a></li>`).join("")}</ul>
<p>Die Reihe zu ${escapeHtml(game.name)} lässt sich anhand dieser Folgen verfolgen.
Alle verfügbaren Folgen mit Beschreibungen und gegebenenfalls Kapiteln stehen weiter unten.
Die Angaben dienen zur Orientierung anhand der Videotitel. Sie sind keine aus dem Videoinhalt
abgeleitete Spielanleitung und enthalten keine Aussagen über konkrete Spielmechaniken,
die Steuerung oder Lösungswege.</p>` : ""}
</section>`)}\n\n`,
  });
  converter.addRule("absolute-links", {
    filter: (node) => node.nodeName === "A" && node.hasAttribute("href"),
    replacement: (content, node) => {
      const url = new URL(node.getAttribute("href"), canonical);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${page.route}: Ungültiger Markdown-Link.`);
      return `[${content.replace(/\n/gu, " ")}](<${url.href}>)`;
    },
  });
  converter.addRule("absolute-images", {
    filter: "img",
    replacement: (_content, node) => {
      const url = new URL(node.getAttribute("src"), canonical);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${page.route}: Ungültiges Markdown-Bild.`);
      return `![${(node.getAttribute("alt") ?? "").replace(/[[\]]/gu, "\\$&")}](<${url.href}>)`;
    },
  });
  const body = converter.turndown(main);
  if (!body.trim()) throw new Error(`${page.route}: Markdown-Hauptinhalt ist leer.`);
  const header = page.html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/u)?.[1];
  const navigation = header?.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/u)?.[0] ?? "";
  const footer = page.html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/u)?.[1] ?? "";
  const structure = converter.turndown(`${navigation}${footer}`);
  return `${body}${structure ? `\n\n## Seitenstruktur\n\n${structure}` : ""}\n\n---\n\nHTML-Original: <${canonical}>\n`;
}
