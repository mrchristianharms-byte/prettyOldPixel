import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { escapeHtml } from "./site-html.mjs";

export const markdownFile = (route) => route.endsWith("/") || !route
  ? `${route}index.md` : route.replace(/\.html$/u, ".md");

export function renderMarkdown(page, config, game) {
  const main = page.html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/u)?.[1];
  if (!main) throw new Error(`${page.route}: Hauptinhalt für Markdown fehlt.`);
  const canonical = config.absolute(page.route);
  const converter = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  converter.use(gfm);
  converter.remove(["script", "style", "iframe", "button", "input", "select"]);
  converter.addRule("navigation", {
    filter: "nav",
    replacement: (content, node) => node.getAttribute("aria-label") === "Videoteile" ? ""
      : `\n\n${node.hasAttribute("aria-label") ? `**${converter.escape(node.getAttribute("aria-label"))}**\n\n` : ""}${content}\n\n`,
  });
  converter.addRule("video-purpose", {
    filter: (node) => node.hasAttribute("data-video-widget"),
    replacement: () => `\n\n${converter.turndown(`<section><h2>Die Videos sind der Hauptinhalt</h2>
<p>Der Hauptzweck dieser Seite ist, die YouTube-Videos von Pretty Old Pixel zugänglich zu machen.
Die Markdown-Fassung enthält keinen abspielbaren Player. Videotitel, Beschreibungen und Kapitel helfen
beim Auffinden der Originalvideos, ersetzen aber weder deren Bild und Ton noch ein vollständiges Transkript.
Aus Metadaten allein lassen sich keine verlässlichen Details zum gezeigten Ablauf ableiten.</p>
${game ? `<h2>Wie wird das Spiel ${escapeHtml(game.name)} gespielt?</h2>
<p>Die Antwort wird in den verlinkten YouTube-Videos zur Spielreihe gezeigt.
Die vorhandenen Videotitel geben eine Orientierung über die Folgen, zum Beispiel:</p>
<ul>${game.videos.slice(0, 3).map((video) => `<li><a href="${escapeHtml(video.url)}">${escapeHtml(video.title)}</a></li>`).join("")}</ul>
<p>Die Reihe zu ${escapeHtml(game.name)} lässt sich anhand dieser Folgen verfolgen.
Alle verfügbaren Folgen mit Beschreibungen und gegebenenfalls Kapiteln stehen weiter unten.
Dies ist eine Orientierung anhand der Videotitel, keine aus dem Videoinhalt abgeleitete Spielanleitung;
konkrete Spielmechaniken, Steuerung oder Lösungswege werden hier nicht behauptet.</p>` : ""}
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
