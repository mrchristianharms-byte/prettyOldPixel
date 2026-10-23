import assert from "node:assert/strict";
import test from "node:test";
import { videoWidget, playerPoster } from "../src/site-generation/widget/video.mjs";
import { episodeList } from "../src/site-generation/widget/episode-list.mjs";
import { catalogGrid } from "../src/site-generation/widget/catalog-grid.mjs";
import { metadata } from "../src/site-generation/widget/metadata.mjs";
import { videoList, videoListEntry } from "../src/site-generation/widget/video-entry.mjs";
import { pagination } from "../src/site-generation/widget/pagination.mjs";
import { archiveLinks } from "../src/site-generation/widget/archive-links.mjs";
import { videoPanel } from "../src/site-generation/widget/video-panel.mjs";
import { navigation } from "../src/site-generation/widget/navigation.mjs";
import { themeToggle } from "../src/site-generation/widget/theme-toggle.mjs";
import { magazineLogo } from "../src/site-generation/widget/magazine-logo.mjs";
import { normalizeSources } from "../src/site-generation/site-data.mjs";
import { createSiteConfig } from "../src/site-generation/site-config.mjs";
import { renderSite } from "../src/site-generation/site-render.mjs";

const video = {
  id: "a0000000000", title: "Spiel & <Demo>",
  url: "https://www.youtube.com/watch?v=a0000000000",
  embedUrl: "https://www.youtube-nocookie.com/embed/a0000000000",
  thumbnailUrl: "https://i.ytimg.com/vi/a0000000000/default.jpg",
  durationSeconds: 929, publishedAt: "2016-11-23T17:42:00.000Z",
  description: "", games: [], magazines: [], sections: [], blaetterabend: false,
};

test("Hauptnavigation erhält Reihenfolge, relative Links, sichere Namen und aktive Bereiche auf Unterseiten", () => {
  const entries = [{ route: "news/", name: "News" }, { route: "spiele/", name: "Spiele & <Demo>" }, { route: "sonstiges/", name: "Sonstiges" }];
  for (const route of ["", "news/", "spiele/demo/", "sonstiges/seite/2/", "datenschutz/"]) {
    const config = createSiteConfig().forPage(route);
    const html = navigation(entries, route, config);
    assert.ok(html.startsWith('<nav aria-label="Hauptnavigation"><ul>'));
    assert.equal((html.match(/<li>/gu) ?? []).length, entries.length);
    assert.ok(html.includes("Spiele &amp; &lt;Demo&gt;"));
    for (const { route: target } of entries) {
      const active = route.startsWith(target);
      assert.ok(html.includes(`href="${config.href(target)}"${active ? ' aria-current="page"' : ""}>`));
    }
    assert.equal((html.match(/aria-current="page"/gu) ?? []).length,
      entries.some((entry) => route.startsWith(entry.route)) ? 1 : 0);
    assert.ok(html.indexOf(">News</a>") < html.indexOf(">Spiele &amp;"));
  }
});

test("alle generierten Seiten verwenden das Hauptnavigations-Widget mit den vorhandenen Bereichen", () => {
  const channel = { id: "UC-navigation", title: "Pretty Old Pixel" };
  const model = normalizeSources({
    videos: { channel, complete: true, videos: [video] },
    playlists: { channel, complete: true, playlists: [] },
    magazines: { channel, videos: [] },
  }, { games: [], sections: [] });
  const config = createSiteConfig();
  assert.deepEqual(model.navigation, [{ route: "news/", name: "News" },
    ...model.sections.map((section) => ({ route: section.route, name: section.navigationName, separator: true }))]);
  for (const { html, route } of renderSite(model, config, "assets/site.css").values()) {
    assert.ok(html.includes(navigation(model.navigation, route, config.forPage(route), themeToggle())), route);
    assert.equal((html.match(/aria-label="Hauptnavigation"/gu) ?? []).length, 1);
  }
});

test("Seitennavigation behandelt einzelne, erste, mittlere und letzte Seiten mit relativen Links", () => {
  assert.equal(pagination("spiele/", 1, 1, createSiteConfig().forPage("spiele/")), "");
  for (const page of [1, 2, 3]) {
    const route = page === 1 ? "spiele/" : `spiele/seite/${page}/`;
    const config = createSiteConfig().forPage(route);
    const html = pagination("spiele/", page, 3, config);
    assert.equal(html.includes('rel="prev"'), page > 1);
    assert.equal(html.includes('rel="next"'), page < 3);
    assert.ok(html.includes(`Seite ${page} von 3`));
    assert.ok(html.includes(`href="${config.href(route)}" aria-current="page">Seite ${page}</a>`));
    assert.equal((html.match(/<li>/gu) ?? []).length, 3);
  }
});

test("Archivlinks behalten Listen-, Inline- und Leerzustand sowie ausgabenspezifische Ziele", () => {
  const archive = {
    provider: "kultmags", match: "issue", pageUrl: "https://example.org/archive/",
    readerUrl: "https://example.org/read/", downloadUrl: "https://example.org/download/",
  };
  assert.equal(archiveLinks([]), "<p>Kein passender Archivlink vorhanden.</p>");
  const html = archiveLinks([archive]);
  assert.ok(html.startsWith('<ul class="archive-links"'));
  for (const label of ["Archivordner zur Ausgabe", "Heft lesen", "Heft herunterladen"]) {
    assert.ok(html.includes(label));
  }
  assert.equal((html.match(/rel="external"/gu) ?? []).length, 3);
  const labelled = archiveLinks([archive], false, { visibleLabel: true });
  assert.ok(labelled.includes('<span>kultmags: Heft lesen</span>'));
  assert.ok(labelled.includes('class="archive-icon archive-icon-labelled"'));
  assert.ok(html.includes('<span class="visually-hidden">kultmags: Heft lesen</span>'));
  assert.ok(archiveLinks([archive], true).startsWith('<span class="archive-links" aria-label="Archivlinks">('));
  const overview = archiveLinks([{ ...archive, match: "magazine" }]);
  assert.ok(overview.includes("Zeitschriftenübersicht"));
  assert.ok(!overview.includes(archive.readerUrl));
  assert.ok(!overview.includes(archive.downloadUrl));
});

test("Videoinformationen behalten Kapitel, Partner, Beschreibung und benachbarte Teile", () => {
  const config = createSiteConfig().forPage("spiele/demo/");
  const html = videoPanel({
    ...video, description: "Text <Demo>\n\nhttps://example.org/",
    chapters: [{ seconds: 60, label: "Start & Demo", url: `${video.url}&t=60` }],
    mentionedChannels: [{ label: "Gast & Demo", url: "https://www.youtube.com/@demo" }],
  }, config, { index: 1, total: 3, previous: { id: "previous" }, next: { id: "next" } });
  assert.ok(html.includes('data-video-panel data-dated="true"'));
  assert.ok(html.includes("Video 2/3: Spiel &amp; &lt;Demo&gt;"));
  assert.ok(html.includes('data-chapter-seconds="60"'));
  assert.ok(html.includes("1:00 · Start &amp; Demo"));
  assert.ok(html.includes("Gast &amp; Demo"));
  assert.ok(html.includes("<p>Text &lt;Demo&gt;</p>"));
  assert.ok(html.includes('href="#video-previous"'));
  assert.ok(html.includes('href="#video-next"'));
  assert.ok(html.includes("<noscript>"));
  const empty = videoPanel({
    ...video, publishedAt: null, durationSeconds: null, chapters: [], mentionedChannels: [],
  }, config, { index: 0, total: 1 });
  assert.ok(empty.includes("Für dieses Video ist keine Beschreibung vorhanden."));
  for (const absent of ["data-dated", "data-chapter-seconds", "mentioned-channels", "Vorheriger Teil", "Nächster Teil"]) {
    assert.ok(!empty.includes(absent));
  }
});

test("Video-Widget enthält genau einen Player und alle gemeinsamen Bedienelemente", () => {
  const html = videoWidget(video, 2);
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
  assert.ok(playerPoster(video).includes('alt="Videovorschau: Spiel &amp; &lt;Demo&gt;"'));
});

test("escapet kurze Bildbeschreibungen für Videovorschauen und Zeitschriftenlogos", () => {
  const title = 'Spiel mit "Titel" & <Demo>';
  const preview = { ...video, title };
  const config = createSiteConfig();
  for (const html of [playerPoster(preview), videoListEntry(preview, config)]) {
    assert.ok(html.includes('alt="Videovorschau: Spiel mit &quot;Titel&quot; &amp; &lt;Demo&gt;"'));
  }
  const logo = magazineLogo({
    name: 'Magazin "Retro" & <Spiele>',
    logo: { asset: "assets/logo.webp", sourceUrl: "https://www.kultmags.com/" },
  }, config);
  assert.ok(logo.includes('alt="Magazin &quot;Retro&quot; &amp; &lt;Spiele&gt; – Zeitschriftenlogo"'));
});

test("zeigt automatische Folgenfortsetzung nur bei mehr als einem zugeordneten Video", () => {
  for (const count of [1, 2, 3]) {
    const html = videoWidget(video, count);
    assert.equal(html.includes("data-auto-next"), count > 1);
    assert.equal(html.includes("Nächste Folge automatisch"), count > 1);
    assert.ok(html.includes("data-player-external"));
  }
  assert.ok(!videoWidget(video).includes("data-auto-next"));
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
  const game = { playlists: [], series: {
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
    assert.ok(html.includes(`src="${video.thumbnailUrl}" width="320" height="180" alt="Videovorschau: Spiel &amp; &lt;Demo&gt;" loading="lazy" decoding="async"`));
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
      magazines: [{ name: "Magazin", route: "zeitschriften/demo/", yearAnchor: "jahr-1996",
        issue: { year: 1996, label: "1/1996", route: "zeitschriften/demo/1-1996/" } }],
    }, config);
    assert.ok(html.includes('href="../zeitschriften/demo/1-1996/#video-a0000000000"'));
    assert.ok(html.includes('class="video-entry-thumbnail" href="../zeitschriften/demo/1-1996/#video-a0000000000" aria-label="Spiel &amp; &lt;Demo&gt;"'));
    assert.ok(html.includes('href="../spiele/demo/">Spiel</a>'));
    assert.ok(html.includes('href="../hardware/">Hardware</a>'));
    assert.ok(html.includes('href="../zeitschriften/demo/#jahr-1996">Jahrgang 1996</a>'));
    assert.ok(html.includes(`<p>${"x".repeat(219)}…</p>`));
    assert.equal(videoList([], config), "<p>Noch keine Videos mit bekanntem Veröffentlichungsdatum.</p>");
    assert.equal(videoList([video], config), `<ol class="video-list">${videoListEntry(video, config)}</ol>`);
  });

  test("Listen-Eintrag verlinkt Titel und Thumbnail im ausdrücklich übergebenen Ausgabenkontext", () => {
    const config = createSiteConfig().forPage("zeitschriften/zweites/");
    const html = videoListEntry({
      ...video, magazines: [{ issue: { route: "zeitschriften/erstes/1/" } }],
    }, config, undefined, 4, {
      label: "Teil 2: Spiel & <Demo>", issueRoute: "zeitschriften/zweites/2/",
    });
    const href = "2/#video-a0000000000";
    assert.ok(html.includes(`<h4><a href="${href}">Teil 2: Spiel &amp; &lt;Demo&gt;</a></h4>`));
    assert.ok(html.includes(`class="video-entry-thumbnail" href="${href}" aria-label="Teil 2: Spiel &amp; &lt;Demo&gt;"`));
    assert.ok(!html.includes("erstes/1"));
  });

  test("News und alle Themenbereiche verwenden dasselbe Eintrags-Widget und interne Detailziele", () => {
    const channel = { id: "UC-widget", title: "Pretty Old Pixel" };
    const input = {
      videos: { channel, complete: true, videos: [
        { ...video, title: `${video.title} [re.consider]` },
        { ...video, id: "other000001", title: "Weiterer Beitrag" },
      ] },
      playlists: { channel, complete: true, playlists: [] },
      magazines: { channel, videos: [] },
    };
    const sections = ["hardware", "retrospektiven", "interviews"].map((id) => ({
      id, name: id, navigationName: id, olderFormat: true, description: "Beschreibung", playlistIds: [], excludedVideoIds: [],
      videos: [{ id: video.id, topic: "Thema", order: 0, people: ["Gast"], note: "Hinweis" }],
    }));
    const model = normalizeSources(input, { games: [], sections });
    const config = createSiteConfig();
    const pages = renderSite(model, config, "assets/site.css");
    for (const id of ["news", "hardware", "retrospektiven", "interviews", "reconsider", "sonstiges"]) {
      const section = model.sections.find((entry) => entry.id === id);
      const entry = section?.entries[0];
      const selected = entry ? model.videoById.get(entry.videoId) : model.news[0];
      const expected = videoListEntry(selected, config.forPage(`${id}/`), entry?.topic !== undefined ? entry : undefined, id === "retrospektiven" ? 3 : 2);
      const html = pages.get(`${id}/index.html`).html;
      assert.ok(html.includes(expected), id);
      const detail = pages.get(`${selected.detailRoute}index.html`).html;
      assert.ok(detail.includes(`id="video-${selected.id}"`));
      assert.ok(!expected.includes('rel="external"'));
      assert.ok(expected.includes(`#video-${selected.id}`));
      assert.equal((html.match(/<li><article>/gu) ?? []).length, id === "news" ? 2 : 1, id);
    }
  });
