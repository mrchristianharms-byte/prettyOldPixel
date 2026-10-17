import assert from "node:assert/strict";
import test from "node:test";
import { videoWidget, playerPoster } from "../src/widget/video.mjs";
import { episodeList } from "../src/widget/episode-list.mjs";
import { catalogGrid } from "../src/widget/catalog-grid.mjs";
import { metadata } from "../src/widget/metadata.mjs";
import { videoList, videoListEntry } from "../src/widget/video-entry.mjs";
import { normalizeSources } from "../src/site-data.mjs";
import { createSiteConfig } from "../src/site-config.mjs";
import { renderSite } from "../src/site-render.mjs";

const video = {
  id: "a0000000000", title: "Spiel & <Demo>",
  url: "https://www.youtube.com/watch?v=a0000000000",
  embedUrl: "https://www.youtube-nocookie.com/embed/a0000000000",
  thumbnailUrl: "https://i.ytimg.com/vi/a0000000000/default.jpg",
  durationSeconds: 929, publishedAt: "2016-11-23T17:42:00.000Z",
  description: "", games: [], magazines: [], sections: [], blaetterabend: false,
};

test("Video-Widget enthält genau einen Player und alle gemeinsamen Bedienelemente", () => {
  const html = videoWidget(video);
  assert.equal((html.match(/<iframe /gu) ?? []).length, 1);
  assert.ok(html.includes('title="YouTube-Video: Spiel &amp; &lt;Demo&gt;"'));
  assert.ok(html.includes("srcdoc="));
  assert.ok(!html.includes('<iframe class="video-player" src='));
  for (const attribute of ["data-player-reset", "data-auto-next", "data-player-external", "data-player-play", "data-player-preview-note"]) {
    assert.equal((html.match(new RegExp(attribute, "gu")) ?? []).length, 1);
  }
  assert.ok(html.includes(`href="${video.url}" rel="external"`));
  assert.ok(html.includes("data-auto-next disabled"));
  assert.ok(playerPoster(video).includes(`href="${video.embedUrl}" rel="external"`));
});

test("Folgenlisten-Widget zeigt Heftvideos in übergebener Reihenfolge mit kompakten Metadaten", () => {
  const second = { ...video, id: "b0000000000", title: "Zweiter Teil", durationSeconds: null, publishedAt: null };
  const html = episodeList([video, second]);
  assert.ok(html.startsWith('<details class="episode-menu" open>'));
  assert.ok(html.includes('<nav aria-label="Videos zur Ausgabe" tabindex="0">'));
  assert.ok(html.includes(`href="#video-${video.id}">1/2: Spiel &amp; &lt;Demo&gt;</a>`));
  assert.ok(html.includes('aria-label="Laufzeit">15:29</span>'));
  assert.ok(html.includes('datetime="2016-11-23T17:42:00.000Z">23.11.2016</time>'));
  assert.ok(html.includes("Laufzeit unbekannt · Datum unbekannt"));
  assert.ok(html.indexOf(`#video-${video.id}`) < html.indexOf(`#video-${second.id}`));
});

test("Folgenlisten-Widget ergänzt Spielabschnitt und Reihe ohne zweite Navigation", () => {
  const game = { series: {
    entries: [{ videoId: video.id, phase: { label: "Intro & <Unboxing>" }, runId: "first" }],
    runs: [{ id: "first", label: "re.play & <Demo>" }],
  } };
  const html = episodeList([video], game);
  assert.ok(html.includes('aria-label="Videos zum Spiel"'));
  assert.ok(html.includes("<br>Intro &amp; &lt;Unboxing&gt; · re.play &amp; &lt;Demo&gt;"));
  assert.equal((html.match(/data-video-link/gu) ?? []).length, 1);
});

test("Kachel- und Metadaten-Widgets behalten sichere Texte und getrennte Fakten", () => {
  const html = catalogGrid([{ route: "demo/", name: "Spiel & <Demo>", facts: ["1 Video", "2:13 h"] }], {
    href: (route) => `../${route}`,
  });
  assert.ok(html.includes('href="../demo/">Spiel &amp; &lt;Demo&gt;</a>'));
  assert.ok(html.includes('<p class="meta">1 Video</p><p class="meta">2:13 h</p>'));
  assert.equal(metadata([["Titel & <Name>", "Spiel &amp; Demo"]]),
    '<dl class="detail-meta"><div><dt>Titel &amp; &lt;Name&gt;</dt><dd>Spiel &amp; Demo</dd></div></dl>');
});

test("Listen-Eintrag kombiniert sichere Titel, kompakte Metadaten und redaktionelle Angaben", () => {
    const config = createSiteConfig().forPage("interviews/");
    const html = videoListEntry({ ...video, description: "Text <script>alert(1)</script>" }, config, {
      people: ["Person & <Gast>"], topic: "Thema & <Details>", note: "<Hinweis>",
    }, 3);
    assert.ok(html.startsWith("<li><article>\n<h3>"));
    assert.ok(html.indexOf("</h3>") < html.indexOf('class="video-entry-thumbnail"'));
    assert.ok(html.includes('<div class="video-entry-content">\n<p class="meta">'));
    assert.ok(html.includes(`class="video-entry-thumbnail" href="${video.url}" rel="external"`));
    assert.ok(html.includes('aria-label="Spiel &amp; &lt;Demo&gt; (externe Website)"'));
    assert.ok(html.includes(`src="${video.thumbnailUrl}" width="320" height="180" alt="" loading="lazy" decoding="async"`));
    assert.ok(html.includes(`href="${video.url}" rel="external">Spiel &amp; &lt;Demo&gt;`));
    assert.ok(html.includes(">23.11.2016, 18:42</time> · 15:29"));
    assert.ok(html.includes("Im Gespräch: Person &amp; &lt;Gast&gt; · Thema: Thema &amp; &lt;Details&gt;"));
    assert.ok(html.includes('<p class="meta">&lt;Hinweis&gt;</p>'));
    assert.ok(html.includes("Text &lt;script&gt;alert(1)&lt;/script&gt;"));
    const unknown = videoListEntry({ ...video, publishedAt: null, durationSeconds: null, description: "" }, config);
    assert.ok(unknown.includes('<p class="meta">Veröffentlichungsdatum unbekannt</p>'));
    assert.ok(!unknown.includes("Im Gespräch:"));
    assert.ok(!unknown.includes("<time"));
    assert.ok(!unknown.includes("Videoplayer"));
  });

  test("Listen-Eintrag erhält interne Videoziele, Themenlinks und die gekürzte Beschreibung", () => {
    const config = createSiteConfig().forPage("news/");
    const html = videoListEntry({
      ...video, description: "x".repeat(221), blaetterabend: true,
      games: [{ name: "Spiel", route: "spiele/demo/" }],
      sections: [{ name: "Hardware", route: "hardware/" }],
      magazines: [{ name: "Magazin", route: "zeitschriften/demo/", yearRoute: "zeitschriften/demo/1996/",
        issue: { year: 1996, label: "1/1996", route: "zeitschriften/demo/ausgaben/1-1996/" } }],
    }, config);
    assert.ok(html.includes('href="../zeitschriften/demo/ausgaben/1-1996/#video-a0000000000"'));
    assert.ok(html.includes('class="video-entry-thumbnail" href="../zeitschriften/demo/ausgaben/1-1996/#video-a0000000000" aria-label="Spiel &amp; &lt;Demo&gt;"'));
    assert.ok(html.includes('href="../spiele/demo/">Spiel</a>'));
    assert.ok(html.includes('href="../hardware/">Hardware</a>'));
    assert.ok(html.includes('href="../zeitschriften/demo/1996/">Jahrgang 1996</a>'));
    assert.ok(html.includes(`<p>${"x".repeat(219)}…</p>`));
    assert.equal(videoList([], config), "<p>Noch keine Videos mit bekanntem Veröffentlichungsdatum.</p>");
    assert.equal(videoList([video], config), `<ol class="video-list">${videoListEntry(video, config)}</ol>`);
  });

  test("News, Hardware, Retrospektiven und Interviews verwenden dasselbe Eintrags-Widget", () => {
    const channel = { id: "UC-widget", title: "Pretty Old Pixel" };
    const input = {
      videos: { channel, complete: true, videos: [video] },
      playlists: { channel, complete: true, playlists: [] },
      magazines: { channel, videos: [] },
    };
    const sections = ["hardware", "retrospektiven", "interviews"].map((id) => ({
      id, name: id, description: "Beschreibung", playlistIds: [], excludedVideoIds: [],
      videos: [{ id: video.id, topic: "Thema", order: 0, people: ["Gast"], note: "Hinweis" }],
    }));
    const model = normalizeSources(input, { games: [], sections });
    const config = createSiteConfig();
    const pages = renderSite(model, config, "assets/site.css");
    for (const id of ["news", "hardware", "retrospektiven", "interviews"]) {
      const section = model.sections.find((entry) => entry.id === id);
      const entry = section?.entries[0];
      const expected = videoListEntry(model.videos[0], config.forPage(`${id}/`), entry, id === "retrospektiven" ? 3 : 2);
      const html = pages.get(`${id}/index.html`).html;
      assert.ok(html.includes(`<ol class="video-list">${expected}</ol>`), id);
      assert.equal((html.match(/<li><article>/gu) ?? []).length, 1, id);
    }
  });
