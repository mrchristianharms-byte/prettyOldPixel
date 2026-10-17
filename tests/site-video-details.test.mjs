import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractVideoDetails } from "../src/site-video-details.mjs";
import { normalizeSources } from "../src/site-data.mjs";
import { createSiteConfig } from "../src/site-config.mjs";
import { renderSite } from "../src/site-render.mjs";
import { validateSite } from "../src/generate-site.mjs";

const channel = { id: "UC-own", handle: "PrettyOldPixel", title: "Pretty Old Pixel" };
const id = "a0000000000";
const video = (description, durationSeconds = 7200) => ({
  id, url: `https://www.youtube.com/watch?v=${id}`, description, durationSeconds,
});
const details = (description, duration) => extractVideoDetails(video(description, duration), channel);

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

function rendered(description) {
  const first = { id, title: "Ein Spiel #1", description, publishedAt: "2020-01-01T00:00:00Z", durationSeconds: 600 };
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
  const assets = new Map([["assets/site.css", ""], ["assets/video-series.js", ""]]);
  const pages = renderSite(model, config, "assets/site.css");
  validateSite(pages, assets, config);
  return { pages, model };
}

test("rendert Kapitel und Kanäle in Spiel- und Ausgabepanels ohne neue Skripte oder Player", () => {
  const { pages } = rendered("00:00 Intro\n01:30 <Gameplay>\n\nhttps://youtube.com/@Guest");
  for (const file of ["spiele/ein-spiel/index.html", "zeitschriften/power-play/ausgaben/power-play-10-1990/index.html"]) {
    const html = pages.get(file).html;
    assert.ok(html.includes('<body class="detail-page">'));
    assert.ok(html.includes('class="detail-layout">\n<div class="detail-main">\n<h1 class="detail-heading"'));
    assert.ok(html.indexOf('class="detail-player"') < html.indexOf('class="detail-information"'));
    assert.ok(html.indexOf('class="detail-player"') < html.indexOf('<dl class="detail-meta">'));
    assert.equal((html.match(/class="episode-menu"/gu) ?? []).length, 1);
    assert.ok(html.includes("Kapitel und Zeitmarken"));
    assert.ok(html.includes("1:30 · &lt;Gameplay&gt;"));
    assert.ok(html.includes(`watch?v=${id}&amp;t=90s" rel="external"`));
    assert.ok(html.includes("Erwähnte Kanäle / Partner"));
    assert.ok(html.includes("Eine Erwähnung bedeutet nicht, dass eine bezahlte Zusammenarbeit besteht."));
    assert.equal((html.match(/<iframe /gu) ?? []).length, 1);
    assert.equal((html.match(/<script/gu) ?? []).length, 2);
    assert.ok(!html.includes("iframe_api"));
  }
  assert.ok(!pages.get("news/index.html").html.includes("Kapitel und Zeitmarken"));
  assert.ok(![...pages.keys()].some((file) => file.startsWith("videos/")));
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
