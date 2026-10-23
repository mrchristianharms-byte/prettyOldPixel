import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractVideoDetails } from "../src/site-generation/site-video-details.mjs";
import { normalizeSources } from "../src/site-generation/site-data.mjs";
import { createSiteConfig } from "../src/site-generation/site-config.mjs";
import { renderSite } from "../src/site-generation/site-render.mjs";
import { validateSite } from "../src/site-generation/generate-site.mjs";
import { descriptionHtml } from "../src/site-generation/widget/video-panel.mjs";

const channel = { id: "UC-own", handle: "PrettyOldPixel", title: "Pretty Old Pixel" };
const id = "a0000000000";
const video = (description, durationSeconds = 7200) => ({
  id, url: `https://www.youtube.com/watch?v=${id}`, description, durationSeconds,
});
const details = (description, duration) => extractVideoDetails(video(description, duration), channel);

test("verlinkt Handles und bekannte Playlists lesbar ohne E-Mail-Adressen oder fremde URLs umzudeuten", () => {
  const playlists = [{ id: "PL-test", title: 're.play - Spiel & "Demo"' }];
  const html = descriptionHtml('Gast: @retrokompott. Kontakt: mail@example.com\n\nPlaylist: https://www.youtube.com/playlist?list=PL-test).', playlists);
  assert.ok(html.includes('href="https://www.youtube.com/@retrokompott" rel="external">@retrokompott '));
  assert.ok(html.includes("mail@example.com"));
  assert.ok(!html.includes("youtube.com/@example.com"));
  assert.ok(html.includes('rel="external">re.play - Spiel &amp; &quot;Demo&quot; '));
  assert.ok(html.endsWith("</a>).</p>"));
  for (const url of [
    "https://youtube.com.evil.test/playlist?list=PL-test",
    "https://youtube.com/playlist?list=PL-unknown",
    "https://example.com/@Guest",
  ]) {
    const result = descriptionHtml(url, playlists);
    assert.ok(result.includes(`rel="external">${url} `));
    assert.equal((result.match(/<a /gu) ?? []).length, 1);
  }
  assert.equal(descriptionHtml("<script> & Test"), "<p>&lt;script&gt; &amp; Test</p>");
});

test("zeigt die Beschreibung vor den Kapiteln und lässt die doppelte Spiel-/Playlistzeile weg", () => {
  const { pages } = rendered("Gast: @retrokompott\n\n00:00 Intro\n01:30 Spiel\n\nSpiel: Ein Spiel\n\nPlaylist zum Spiel: https://www.youtube.com/playlist?list=PL-test");
  const html = pages.get("spiele/ein-spiel/index.html").html;
  const panel = html.match(/<article id="video-a0000000000"[\s\S]*?<\/article>/u)[0];
  assert.ok(panel.indexOf('class="description"') < panel.indexOf('class="video-chapters"'));
  assert.ok(!panel.includes("<p>Spiel: <a"));
  assert.ok(panel.includes('<p>Spiel: Ein Spiel</p>'));
  assert.ok(panel.includes('rel="external">Ein Spiel <span'));
  assert.equal((panel.match(/playlist\?list=PL-test/gu) ?? []).length, 1);
});

test("entfernt nur tatsächlich erkannte Kapitelzeilen samt Überschrift und erhält den übrigen Text", () => {
  const source = "Einleitung\n\nKapitel:\n00:00 Intro\n01:30 Spiel\n02:00 Außerhalb\n\nKontakt und Hinweise";
  const result = details(source, 120);
  assert.equal(result.descriptionWithoutChapters, "Einleitung\n\n02:00 Außerhalb\n\nKontakt und Hinweise");
  for (const text of ["20:00 Aufnahmebeginn\n21:00 Twitch", "Kapitel:\n00:00 Intro\n00:00 Doppelt", "Kapitel:\n99:00 Außerhalb"]) {
    assert.equal(details(text, 120).descriptionWithoutChapters, text);
  }
});

test("entfernt gültige eigene Zeitlinks einschließlich Duplikaten, nicht deren Begleittext oder fremde und ungültige Links", () => {
  const own = `https://www.youtube.com/watch?v=${id}&t=90`;
  const other = "https://www.youtube.com/watch?v=b0000000000&t=90";
  const invalid = `https://www.youtube.com/watch?v=${id}&t=7200`;
  const result = details(`Hinweis: ${own}\n${own}\n${other}\n${invalid}\nhttps://youtube.com/@Guest`);
  assert.ok(!result.descriptionWithoutChapters.includes(own));
  for (const text of ["Hinweis:", other, invalid, "https://youtube.com/@Guest"]) {
    assert.ok(result.descriptionWithoutChapters.includes(text));
  }
  assert.equal(result.chapters.length, 1);
});

test("liest aufsteigende Kapitelblöcke mit Nullbeginn, Stunden und Trennzeichen", () => {
  const result = details("Einleitungstext\n\n00:00:00 - Intro\n00:01:30 Gameplay\n01:02:03 | Schluss\n\nWeitere Angaben");
  assert.deepEqual(result.chapters.map(({ seconds, label }) => [seconds, label]), [
    [0, "Intro"], [90, "Gameplay"], [3723, "Schluss"],
  ]);
  assert.equal(result.chapters[1].url, `https://www.youtube.com/watch?v=${id}&t=90s`);
});

test("verlangt für Zeitzeilen ohne Nullbeginn einen ausdrücklichen Kapitelkontext", () => {
  assert.deepEqual(details("20:00 Aufnahmebeginn\n21:00 Twitch-Stream").chapters, []);
  assert.deepEqual(details("01:30 Gameplay").chapters, []);
  assert.deepEqual(details("Kapitel:\n01:30 Gameplay\n02:20 Schluss").chapters.map((chapter) => chapter.seconds), [90, 140]);
  assert.deepEqual(details("Zeitmarken:\n01:30 Gameplay").chapters.map((chapter) => chapter.seconds), [90]);
});

test("verwirft ungültige Zeitblöcke und Marken außerhalb bekannter Videolängen", () => {
  assert.deepEqual(details("00:00 Intro\n02:00 Spiel\n01:30 Rückwärts").chapters, []);
  assert.deepEqual(details("00:00 Intro\n00:00 Doppelt").chapters, []);
  assert.deepEqual(details("Kapitel:\n00:99 Fehler\n01:60:00 Fehler").chapters, []);
  assert.deepEqual(details("00:00 Intro\n01:30 Schluss\n02:00 Ende", 120).chapters.map((chapter) => chapter.seconds), [0, 90]);
  assert.deepEqual(details("00:00 Intro\n01:30 Schluss", 0).chapters, []);
  assert.equal(details("00:00 Intro\n99:59 Spät", null).chapters.at(-1).seconds, 5999);
});

test("liest Zeitlinks nur zum aktuellen Video und dedupliziert nach Sekunden", () => {
  const result = details([
    "00:00 Intro", "01:30 Gameplay", "",
    `https://www.youtube.com/watch?v=${id}&t=90`,
    `https://youtu.be/${id}?t=1m30s`,
    `https://m.youtube.com/watch?v=${id}&start=180`,
    `https://www.youtube.com/embed/${id}?t=1h2m3s`,
    `https://www.youtube.com/watch?v=${id}#t=240`,
    "https://www.youtube.com/watch?v=b0000000000&t=300",
    `https://youtube.com.evil.test/watch?v=${id}&t=301`,
    `https://www.youtube.com/watch?v=${id}&t=-1`,
    `https://www.youtube.com/watch?v=${id}&t=NaN`,
    `https://www.youtube.com/watch?v=${id}&t=9999999999999999999999`,
    `https://www.youtube.com/watch?v=${id}&t=7200`,
  ].join("\n"));
  assert.deepEqual(result.chapters.map((chapter) => chapter.seconds), [0, 90, 180, 240, 3723]);
  assert.equal(result.chapters[1].label, "Gameplay");
});

test("extrahiert explizite Kanal-URLs ohne Eigenkanal, Nachladebedarf oder erfundene Namen", () => {
  const result = details([
    "Gast: (https://www.youtube.com/@Guest).",
    "https://m.youtube.com/@guest?sub_confirmation=1",
    "https://youtube.com/channel/UC-external/",
    "https://youtube.com/c/OtherChannel",
    "https://youtube.com/user/OldChannel",
    "https://youtube.com/@PrettyOldPixel",
    "https://youtube.com/c/PrettyOldPixel",
    "https://youtube.com/user/PrettyOldPixel",
    "https://youtube.com/channel/UC-own",
    "https://youtube.com.evil.test/@Guest2",
    "https://youtube.com@evil.test/@Guest3",
    "http://youtube.com/@Insecure",
    "https://www.youtube.com:444/@Port",
    "https://youtu.be/a0000000000",
    "https://youtube.com/playlist?list=PL-test",
    "https://youtube.com/watch?v=a0000000000",
    "https://youtube.com/shorts/a0000000000",
    "https://youtube.com/@Guest/videos",
    "https://youtube.com/@Bad%2FName",
    "https://youtube.com/@Bad%00Name",
    "https://youtube.com/@Bad%",
  ].join("\n"));
  assert.deepEqual(result.mentionedChannels, [
    { label: "@Guest", url: "https://www.youtube.com/@Guest" },
    { label: "UC-external", url: "https://www.youtube.com/channel/UC-external" },
    { label: "OtherChannel", url: "https://www.youtube.com/c/OtherChannel" },
    { label: "OldChannel", url: "https://www.youtube.com/user/OldChannel" },
  ]);
});

test("behandelt Kanal-IDs case-sensitiv und dedupliziert Handles ohne Beachtung der Großschreibung", () => {
  assert.equal(details("https://youtube.com/channel/UC-OWN").mentionedChannels.length, 1);
  assert.equal(details("https://youtube.com/@Guest\nhttps://youtube.com/@GUEST").mentionedChannels.length, 1);
});

function rendered(description, durationSeconds = 600) {
  const first = { id, title: "Ein Spiel #1", description, publishedAt: "2020-01-01T00:00:00Z", durationSeconds };
  const second = { ...first, id: "b0000000000", title: "Ein Spiel #2", description: "" };
  const input = {
    videos: { channel, complete: true, videos: [first, second] },
    playlists: { channel, complete: true, playlists: [{
      id: "PL-test", title: "Ein Spiel", videos: [first, second].map((entry, index) => ({
        videoId: entry.id, position: index + 1, availability: "listed",
      })),
    }] },
    magazines: { channel, videos: [{ id, magazines: [{
      name: "Power Play", issue: { label: "10/1990", year: 1990, months: [10], number: null, special: false },
    }] }] },
  };
  const model = normalizeSources(input, {
    games: [{ id: "ein-spiel", name: "Ein Spiel", playlistIds: ["PL-test"], videoIds: [], platforms: [], aliases: [] }],
    sections: [],
  });
  const config = createSiteConfig();
  const assets = new Map([["assets/site.css", ""], ["assets/video-series.js", ""], ["assets/game-table.js", ""], ["assets/theme.js", ""], ["favicon.webp", ""], ["apple-touch-icon.png", ""]]);
  const pages = renderSite(model, config, "assets/site.css");
  validateSite(pages, assets, config);
  return { pages, model };
}

test("rendert Kapitel und Kanäle in Spiel- und Ausgabepanels ohne neue Skripte oder Player", () => {
  const { pages } = rendered("00:00 Intro\n01:30 <Gameplay>\n\nhttps://youtube.com/@Guest");
  for (const file of ["spiele/ein-spiel/index.html", "zeitschriften/power-play/power-play-10-1990/index.html"]) {
    const html = pages.get(file).html;
    assert.ok(html.includes('<body class="detail-page">'));
    assert.ok(html.includes('class="detail-layout">\n<div class="detail-main">\n<h1 class="detail-heading"'));
    assert.ok(html.indexOf('class="detail-player" data-video-widget') < html.indexOf('class="detail-information"'));
    assert.ok(!html.includes("<h2>YouTube-Einbindung</h2>"));
    assert.ok(!html.includes("Mit Video 1/"));
    assert.ok(!html.includes("Die Videos beginnen mit der ältesten Veröffentlichung."));
    assert.ok(!html.includes("Die vollständige Videoliste beginnt mit dem ältesten Video."));
    assert.ok(html.includes("</dl>\n<hr>"));
    assert.ok(html.match(/<footer[\s\S]*?<\/footer>/u)[0].includes(">YouTube-Einbindung und Datenschutz</a>"));
    assert.ok(html.indexOf('class="detail-player" data-video-widget') < html.indexOf('<dl class="detail-meta">'));
    assert.equal((html.match(/class="episode-menu"/gu) ?? []).length, 1);
    assert.ok(html.includes("Kapitel und Zeitmarken"));
    assert.ok(html.includes("1:30 · &lt;Gameplay&gt;"));
    const description = html.match(/<div class="description">([\s\S]*?)<\/div>/u)[1];
    assert.ok(!description.includes("Intro") && !description.includes("Gameplay"));
    assert.ok(description.includes("https://youtube.com/@Guest"));
    assert.ok(html.includes(`watch?v=${id}&amp;t=90s" rel="external"`));
    assert.ok(html.includes('data-chapter-seconds="90"'));
    assert.ok(html.includes('data-chapter-hint'));
    assert.ok(html.includes("Erwähnte Kanäle / Partner"));
    assert.ok(html.includes("Eine Erwähnung bedeutet nicht, dass eine bezahlte Zusammenarbeit besteht."));
    assert.equal((html.match(/<iframe /gu) ?? []).length, 1);
    assert.equal((html.match(/<script/gu) ?? []).length, 3);
    assert.ok(!html.includes("iframe_api"));
  }
  assert.ok(!pages.get("news/index.html").html.includes("Kapitel und Zeitmarken"));
  assert.ok(![...pages.keys()].some((file) => file.startsWith("videos/")));
});

test("veröffentlicht Clip-Metadaten mit echten Zeitlinks, Grenzen und sichtbaren Beschriftungen", () => {
  const { pages } = rendered("00:00 Intro\n01:30 <Gameplay>\n10:00 Ungültig");
  for (const file of ["spiele/ein-spiel/index.html", "zeitschriften/power-play/power-play-10-1990/index.html"]) {
    const html = pages.get(file).html;
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)[1]);
    const videos = schema["@graph"].filter((item) => item["@type"] === "VideoObject");
    assert.deepEqual(videos[0].hasPart, [
      { "@type": "Clip", name: "Intro", startOffset: 0, endOffset: 90, url: `./?t=0#video-${id}` },
      { "@type": "Clip", name: "<Gameplay>", startOffset: 90, endOffset: 600, url: `./?t=90#video-${id}` },
    ]);
    assert.ok(videos[0].url.endsWith(`#video-${id}`));
    if (videos[1]) assert.equal(videos[1].hasPart, undefined);
    for (const clip of videos[0].hasPart) {
      assert.ok(clip.endOffset > clip.startOffset && clip.endOffset <= 600);
      assert.ok(html.includes(`data-chapter-seconds="${clip.startOffset}"`));
    }
    assert.equal(html.includes('data-auto-next disabled'), videos.length > 1);
    const controls = html.match(/<div class="player-controls meta"[^>]*>[\s\S]*?<\/div>/u)[0];
    assert.ok(controls.includes("data-player-reset hidden"));
    assert.equal(controls.includes("data-auto-next disabled"), videos.length > 1);
    assert.ok(controls.includes('data-player-external'));
    assert.ok(!html.includes("YouTube-Player hier aktivieren"));
    assert.ok(controls.includes(`href="https://www.youtube.com/watch?v=${id}" rel="external"`));
    assert.ok(html.includes(`<noscript><p><a href="https://www.youtube.com/watch?v=${id}"`));
    assert.ok(!controls.includes("data-player-controls hidden"));
    assert.equal((html.match(/data-video-widget/gu) ?? []).length, 1);
    assert.equal((html.match(/data-player-reset/gu) ?? []).length, 1);
    assert.ok(!html.includes('data-auto-next checked'));
  }
  const unknown = rendered("00:00 Intro\n01:30 Gameplay", null).pages.get("spiele/ein-spiel/index.html").html;
  const schema = JSON.parse(unknown.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)[1]);
  assert.equal(schema["@graph"].find((item) => item["@type"] === "VideoObject").hasPart.at(-1).endOffset, undefined);
  const empty = rendered("").pages.get("spiele/ein-spiel/index.html").html;
  assert.ok(!empty.includes('"hasPart"'));
});

test("setzt dasselbe Video-Widget genau einmal auf jeder Playerseite ein", () => {
  const { pages } = rendered("");
  const widgets = [];
  for (const [file, { html }] of pages) {
    const count = (html.match(/data-video-widget/gu) ?? []).length;
    assert.equal(count, html.includes("<iframe ") ? 1 : 0, file);
    if (!count) continue;
    const widget = html.match(/<div class="detail-player" data-video-widget>[\s\S]*?<\/div><\/div>/u)[0];
    for (const selector of ["data-player-reset", "data-player-external", "data-player-play"]) {
      assert.equal((widget.match(new RegExp(selector, "gu")) ?? []).length, 1, `${file}: ${selector}`);
    }
    const videoCount = (html.match(/data-video-panel /gu) ?? []).length;
    assert.equal(widget.includes("data-auto-next"), videoCount > 1, file);
    widgets.push(widget.replace(/<label><input type="checkbox" data-auto-next disabled> Nächste Folge automatisch<\/label>/u, ""));
  }
  assert.equal(widgets.length, 2);
  assert.equal(widgets[0], widgets[1]);
});

test("lässt leere Kapitel- und Kanalsektionen weg und aktualisiert sie aus Beschreibungen", () => {
  const empty = rendered("").pages.get("spiele/ein-spiel/index.html").html;
  assert.ok(!empty.includes("Kapitel und Zeitmarken"));
  assert.ok(!empty.includes("Erwähnte Kanäle / Partner"));
  const updated = rendered("Kapitel:\n01:30 Gameplay").pages.get("spiele/ein-spiel/index.html").html;
  assert.notEqual(updated, empty);
  assert.ok(updated.includes("t=90s"));
  assert.ok(!updated.includes("Erwähnte Kanäle / Partner"));
});

test("liest reale Kapitel und Gastkanäle aus dem Cache", async () => {
  const cache = JSON.parse(await readFile(new URL("../cache/youtube-videos.json", import.meta.url), "utf8"));
  const cadaver = cache.videos.find((entry) => entry.id === "wrVPWvnk2BI");
  const result = extractVideoDetails({ ...cadaver, url: `https://www.youtube.com/watch?v=${cadaver.id}` }, cache.channel);
  assert.deepEqual(result.chapters.map((chapter) => chapter.seconds), [0, 90, 2035]);
  const interview = cache.videos.find((entry) => entry.id === "c30vh1Qw6v8");
  assert.deepEqual(extractVideoDetails({ ...interview, url: `https://www.youtube.com/watch?v=${interview.id}` }, cache.channel).mentionedChannels,
    [{ label: "@MagisthansSpielekiste", url: "https://www.youtube.com/@MagisthansSpielekiste" }]);
});
