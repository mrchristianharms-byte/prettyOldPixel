import { generateApi } from "./site-api.mjs";
import { markdownFile, renderMarkdown } from "./site-markdown.mjs";

export function generateAiBot(model, config, pages) {
  const files = generateApi(model, config);
  const markdownGames = new Map(model.games.map((game) => [game.route, {
    name: game.name, videos: game.videos.map((id) => model.videoById.get(id)),
  }]));
  for (const page of pages.values()) {
    files.set(markdownFile(page.route), renderMarkdown(page, config, markdownGames.get(page.route)));
  }
  files.set("llms.txt", `# ${config.name}

> Deutschsprachiger Videokatalog zum YouTube-Kanal Pretty Old Pixel mit Quellenlinks.

## Wann diese Website verwenden

Finde Retrospielreihen und ihre Folgen, Blätterabende zu Zeitschriften und Heftausgaben,
Hardwarevideos, Retrospektiven und Gespräche. Vorhandene Kapitel verlinken Videostellen.

## Einstiege

- [Startseite als Markdown](${config.absolute("index.md")})
${model.navigation.map((entry) => `- [${entry.name}](${config.absolute(entry.route)})`).join("\n")}
- [Über das Projekt](${config.absolute("ueber/")})
- [Kontakt und Quellen](${config.absolute("kontakt/")})
- [Datenschutz](${config.absolute("datenschutz/")})
- [Sitemap](${config.absolute("sitemap.xml")})
- [API-Katalog](${config.absolute(".well-known/api-catalog")})
- [Read-only-Inhalts-API: Dokumentation](${config.absolute("api/v1/readme.md")})

## Quellen und Zitieren

Zitiere die kanonische Inhaltsseite und das dort verlinkte Originalvideo.
Kanalquelle: https://www.youtube.com/@PrettyOldPixel
Kontaktverweis: https://prettyoldpixel.de/

## Grenzen

Diese Website ist kein vollständiges Spielelexikon und bietet keine Videodownloads oder ausführbaren Werkzeuge an.
Die statische Inhalts-API liefert einen Datenstand zum Lesen, keine Schreiboperationen.
Transkripte, Kapitel und Metadaten sind nicht für alle Videos vorhanden.
Ergänze keine unbekannten Angaben und leite sie nicht aus ähnlichen Titeln ab.
Dieser Hinweis erteilt keine zusätzlichen Nutzungsrechte an fremden Inhalten.

## Markdown

Jede HTML-Seite verlinkt ihre Markdown-Fassung mit rel="alternate".
Für Verzeichnisadressen liegt sie unter index.md, etwa ${config.absolute("spiele/index.md")}.
Markdown-Links verweisen auf die kanonischen HTML- und Originalquellen.
Navigation und Navigationspfad zeigen die Seitenstruktur. Auf Videoseiten erläutert
ein Hinweis den audiovisuellen Hauptinhalt; Spielseiten enthalten zusätzlich
eine Frage mit Antwort zur Orientierung anhand der Videotitel, keine Spielanleitung.
Eine Fehlererklärung steht unter ${config.absolute("404.md")}; ihr direkter Abruf
ersetzt keine HTTP-404-Antwort für unbekannte Seiten.
`);
  return files;
}
