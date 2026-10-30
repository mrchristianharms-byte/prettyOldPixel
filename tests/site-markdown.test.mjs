import assert from "node:assert/strict";
import test from "node:test";
import { markdownFile, renderMarkdown } from "../src/ai-bot-generation/site-markdown.mjs";
import { createSiteConfig } from "../src/site-generation/site-config.mjs";

test("bildet kollisionsfreie Markdown-Ziele für Verzeichnisse und Fehlerseite", () => {
  assert.equal(markdownFile(""), "index.md");
  assert.equal(markdownFile("spiele/test/"), "spiele/test/index.md");
  assert.equal(markdownFile("404.html"), "404.md");
});

test("erhält Haupttext, Tabellen und Quellen mit absoluten Links ohne Interaktionsmarkup", () => {
  const page = { route: "spiele/test/", html: `<main><nav>Navigation</nav><h1>Testspiel</h1>
<p>Text mit <a href="?t=12#video-test">Kapitel</a> und <a href="https://www.youtube.com/watch?v=test">Quelle</a>.</p>
<table><thead><tr><th>System</th><th>Jahr</th></tr></thead><tbody><tr><td>DOS</td><td>1993</td></tr></tbody></table>
<img src="../../favicon.webp" alt="Logo"><button>Aktivieren</button><script>secret()</script></main>` };
  for (const base of ["https://prettyoldpixel.com/", "https://example.org/projekt/"]) {
    const config = createSiteConfig(base);
    const markdown = renderMarkdown(page, config);
    assert.ok(markdown.includes("# Testspiel"));
    assert.ok(markdown.includes(`${base}spiele/test/?t=12#video-test`));
    assert.ok(markdown.includes("https://www.youtube.com/watch?v=test"));
    assert.match(markdown, /\| System \| Jahr \|/u);
    assert.match(markdown, /\| DOS \| 1993 \|/u);
    assert.ok(markdown.includes(`${base}favicon.webp`));
    assert.ok(markdown.includes(`HTML-Original: <${base}spiele/test/>`));
    assert.ok(markdown.includes("Navigation"));
    for (const excluded of ["Aktivieren", "secret()"]) assert.ok(!markdown.includes(excluded));
  }
  assert.throws(() => renderMarkdown({ route: "", html: "" }, createSiteConfig()), /Hauptinhalt/u);
});

test("zeigt Seitennavigation, Brotkrümel, Folgen und Fußlinks auch unter einem Basispfad", () => {
  const page = { route: "spiele/test/", html: `<header><nav aria-label="Hauptnavigation"><ul>
<li><a href="../../spiele/">Spiele</a></li><li><button>Darstellung</button></li></ul></nav></header>
<main><nav aria-label="Brotkrümelnavigation"><a href="../../">Startseite</a> → Testspiel</nav>
<h1>Testspiel</h1><nav aria-label="Videos zum Spiel"><a href="#video-test">Folge 1</a></nav>
<nav aria-label="Videoteile"><a href="#video-test">Nächster Teil</a></nav></main>
<footer><a href="../../contact/">Kontakt und Quellen</a></footer>` };
  const markdown = renderMarkdown(page, createSiteConfig("https://example.org/projekt/"));
  for (const text of ["## Seitenstruktur", "**Hauptnavigation**", "**Brotkrümelnavigation**",
    "**Videos zum Spiel**", "https://example.org/projekt/spiele/",
    "https://example.org/projekt/spiele/test/#video-test", "https://example.org/projekt/contact/"]) {
    assert.ok(markdown.includes(text), text);
  }
  for (const text of ["Darstellung", "Nächster Teil"]) assert.ok(!markdown.includes(text));
});

test("ersetzt ausschließlich im Markdown den Player durch Zweck und titelgestützte Spielorientierung", () => {
  const html = `<main><h1>Testspiel</h1><div data-video-widget><iframe></iframe>
<p>Vorschaubild von YouTube</p><button>Aktivieren</button></div>
<article><h2>Video 1: Einstieg</h2><noscript><a href="https://youtube.com/watch?v=1">Originalvideo</a></noscript>
<p>Vorhandene Beschreibung.</p></article></main>`;
  const page = { route: "spiele/test/", html };
  const game = { name: "Test [II] & <DOS>", videos: [
    { title: "Test [II] – Der Einstieg", url: "https://youtube.com/watch?v=1" },
    { title: "Test II – Das Fazit", url: "https://youtube.com/watch?v=2" },
  ] };
  const markdown = renderMarkdown(page, createSiteConfig(), game);
  assert.ok(markdown.includes("## Wie wird das Spiel Test \\[II\\] & <DOS> gespielt?"));
  for (const text of ["## Die Videos sind der Hauptinhalt", "YouTube-Videos", "noch ein vollständiges Transkript",
    "Test \\[II\\] – Der Einstieg", "Test II – Das Fazit", "https://youtube.com/watch?v=2",
    "keine aus dem Videoinhalt abgeleitete Spielanleitung", "Originalvideo", "Vorhandene Beschreibung."]) {
    assert.ok(markdown.replace(/\s+/gu, " ").includes(text), text);
  }
  for (const text of ["Vorschaubild von YouTube", "Aktivieren", "<iframe"]) assert.ok(!markdown.includes(text));
  assert.equal(page.html, html);
  const magazine = renderMarkdown(page, createSiteConfig());
  assert.ok(magazine.includes("## Die Videos sind der Hauptinhalt"));
  assert.ok(!magazine.includes("Wie wird das Spiel"));
  assert.ok(!renderMarkdown({ route: "", html: "<main><h1>Übersicht</h1></main>" },
    createSiteConfig(), game).includes("Wie wird das Spiel"));
});
