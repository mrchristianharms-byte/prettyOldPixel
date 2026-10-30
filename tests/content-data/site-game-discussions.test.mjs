import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { loadContentData } from "../../src/content-data/content-data.mjs";
import { createSiteConfig } from "../../src/site-generation/site-config.mjs";
import { renderSite } from "../../src/site-generation/site-render.mjs";
import { generateSite } from "../../src/site-generation/generate-site.mjs";
import { gameDiscussions } from "../../src/site-generation/widget/game-discussions.mjs";
import { unreviewedPreviewVariable } from "../../src/content-data/site-game-discussions.mjs";
import { videoPanel } from "../../src/site-generation/widget/video-panel.mjs";

const videoId = "d0000000000";
const issueRoute = /^zeitschriften\/(?!gaeste\/|videos\/)[^/]+\/(?!seite\/)[^/]+\/index\.html$/u;
const discussion = {
  title: "Spiel & <Demo>", startMs: 12_500, endMs: 30_000,
  firstSegmentId: 0, lastSegmentId: 1, confidence: "medium",
};

function previewUnreviewed(t) {
  const previous = process.env[unreviewedPreviewVariable];
  process.env[unreviewedPreviewVariable] = "1";
  t.after(() => {
    if (previous === undefined) delete process.env[unreviewedPreviewVariable];
    else process.env[unreviewedPreviewVariable] = previous;
  });
}

async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), "pixel-game-discussions-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "cache");
  await mkdir(directory);
  const channel = { id: "UC-discussions", title: "Pretty Old Pixel" };
  for (const [name, data] of [
    ["youtube-videos", { channel, complete: true, videos: [
      { id: videoId, title: "Blätterabend", durationSeconds: 120, publishedAt: "2020-01-01T00:00:00Z" },
      { id: "d0000000001", title: "Sonstiges", durationSeconds: 120 },
    ] }],
    ["youtube-playlists", { channel, complete: true, playlists: [] }],
    ["blaetterabend-videos", { channel, videos: [{ id: videoId, magazines: [
      { name: "PC Games", issue: { label: "1/1996", year: 1996, number: 1, months: [1], special: false } },
    ] }] }],
  ]) await writeFile(path.join(directory, `${name}.json`), JSON.stringify(data));
  await mkdir(path.join(directory, "youtube-transcripts"));
  await mkdir(path.join(directory, "game-discussions"));
  const transcript = JSON.stringify({
    status: "available", videoId, segments: [
      { startMs: 12_500, durationMs: 4500, text: "Das ist Spiel Demo" },
      { startMs: 20_000, durationMs: 10_000, text: "Besprechung" },
    ],
  });
  await writeFile(path.join(directory, "youtube-transcripts", `${videoId}.json`), transcript);
  const analysis = {
    version: 1, videoId, status: "needs-review",
    transcriptHash: createHash("sha256").update(transcript).digest("hex"),
    discussions: [discussion],
  };
  const file = path.join(directory, "game-discussions", `${videoId}.json`);
  return { directory, analysis, file };
}

test("lädt nur abgeschlossene Analysen mit passendem Transkript und zeigt Sprungmarken nur auf Ausgabenseiten", async (t) => {
  previewUnreviewed(t);
  const { directory, analysis, file } = await setup(t);
  await writeFile(file, JSON.stringify(analysis));
  const model = await loadContentData(directory);
  assert.equal(model.videoById.get(videoId).gameDiscussions.length, 1);
  const config = createSiteConfig();
  const pages = renderSite(model, config, "assets/test.css");
  const issue = [...pages].find(([name]) => issueRoute.test(name))[1].html;
  assert.ok(issue.includes('<section class="game-discussions">'));
  assert.ok(issue.includes("Spielebesprechungen im Video"));
  assert.ok(issue.includes("Spielnamen und Zeitmarken können ungenau sein."));
  assert.doesNotMatch(issue, /Automatisch erkannte|Erkannte Spielebesprechungen/u);
  assert.ok(issue.includes(`<li data-chapter-seconds="12" data-unreviewed-video="${videoId}">`));
  assert.ok(issue.includes(`href="https://www.youtube.com/watch?v=${videoId}&amp;t=12s"`));
  assert.ok(issue.includes("0:12 · Spiel &amp; &lt;Demo&gt; (1 min) "));
  assert.ok(!issue.includes("0:30"));
  for (const route of ["index.html", "news/index.html", "zeitschriften/pc-games/index.html"]) {
    assert.ok(!pages.get(route).html.includes('<section class="game-discussions">'));
  }
  assert.ok(!issue.includes("transcriptHash"));
  assert.ok(!issue.includes("Das ist Spiel Demo"));
  const gamePanel = videoPanel(model.videoById.get(videoId), config, {
    index: 0, total: 1, game: { name: "Demo", route: "spiele/demo/", playlists: [] },
    entry: { phase: { label: "Spiel" } }, run: { label: "Reihe" },
  });
  assert.ok(!gamePanel.includes('<section class="game-discussions">'));
});

test("veröffentlicht ohne Vorschau-Schalter nur geprüfte Analysen als Ganzes, validiert aber alle", async (t) => {
  const { directory, analysis, file } = await setup(t);
  analysis.discussions = [discussion,
    { ...discussion, title: "Zweites Spiel", startMs: 20_000, endMs: null, firstSegmentId: 1, lastSegmentId: 1 }];
  await writeFile(file, JSON.stringify(analysis));
  const unreviewedOnly = await loadContentData(directory);
  assert.equal(unreviewedOnly.videoById.get(videoId).gameDiscussions, undefined);
  assert.equal(gameDiscussions(unreviewedOnly.videoById.get(videoId)), "");

  analysis.status = "reviewed";
  analysis.discussions[1] = { ...analysis.discussions[1], reviewed: false };
  await writeFile(file, JSON.stringify(analysis));
  const html = gameDiscussions((await loadContentData(directory)).videoById.get(videoId));
  assert.equal((html.match(/data-chapter-seconds=/gu) ?? []).length, 2, "veraltetes reviewed je Abschnitt wird ignoriert");
  assert.ok(html.includes("Zweites Spiel"));
  assert.ok(!html.includes("data-unreviewed-video"));
  assert.ok(!html.includes("Spielnamen und Zeitmarken können ungenau sein."));

  analysis.discussions[1] = { ...analysis.discussions[1], startMs: 13_000 };
  await writeFile(file, JSON.stringify(analysis));
  await assert.rejects(loadContentData(directory), /Besprechungszeit/u);
});

test("Fensterzwischenstände und fehlende Analysen erzeugen kein Widget", async (t) => {
  const { directory, analysis } = await setup(t);
  await writeFile(path.join(directory, "game-discussions", `${videoId}.window-0.json`), JSON.stringify(analysis));
  const model = await loadContentData(directory);
  assert.equal(gameDiscussions(model.videoById.get(videoId)), "");
  assert.equal(gameDiscussions({}), "");
});

test("validiert vorhandene Analysen, Quellenhash und Abschnittszeiten ausdrücklich", async (t) => {
  const { directory, analysis, file } = await setup(t);
  for (const data of [
    { ...analysis, transcriptHash: "outdated" },
    { ...analysis, videoId: "d0000000001" },
    { ...analysis, discussions: [{ ...discussion, startMs: -1 }] },
    { ...analysis, discussions: [{ ...discussion, startMs: 13_000 }] },
    { ...analysis, discussions: [{ ...discussion, endMs: 200_000 }] },
    { ...analysis, discussions: [{ ...discussion, firstSegmentId: 99 }] },
    { ...analysis, status: "approved" },
    { ...analysis, discussions: [{ ...discussion, confidence: undefined }] },
    { ...analysis, discussions: [{ ...discussion, developers: "Firma" }] },
    { ...analysis, discussions: [{ ...discussion, publishers: [""] }] },
    { ...analysis, discussions: [{ ...discussion, firstYear: "1988" }] },
  ]) {
    await writeFile(file, JSON.stringify(data));
    await assert.rejects(loadContentData(directory), /game-discussions/u);
  }
  await writeFile(file, JSON.stringify(analysis));
  await rm(path.join(directory, "youtube-transcripts", `${videoId}.json`));
  await assert.rejects(loadContentData(directory), /Transkript fehlt/u);
});

test("zeigt geprüfte und offene Zeitbereiche ohne erfundene Endzeit oder falschen Prüfstatus", () => {
  const html = gameDiscussions({
    url: `https://www.youtube.com/watch?v=${videoId}`,
    gameDiscussions: [{ ...discussion, endMs: null, reviewed: true }],
  });
  assert.ok(html.includes("0:12 · Spiel &amp; &lt;Demo&gt;"));
  assert.ok(!html.includes("Spielnamen und Zeitmarken können ungenau sein."));
});

test("ergänzt Erscheinungsjahr, Entwickler und Publisher in Klammern hinter dem Link", () => {
  const html = (extra) => gameDiscussions({
    url: `https://www.youtube.com/watch?v=${videoId}`,
    gameDiscussions: [{ ...discussion, reviewed: true, firstYear: null, developers: [], publishers: [], ...extra }],
  });
  assert.match(html({ firstYear: 1988, developers: ["Realtime Games"], publishers: ["Rainbird & Co"] }),
    /<\/a> <span class="meta">\(1988, Entwickler: Realtime Games, Publisher: Rainbird &amp; Co\)<\/span><\/li>/u);
  assert.ok(html({ firstYear: 1986, developers: ["MicroProse"], publishers: ["MicroProse"] })
    .includes("(1986, Entwickler und Publisher: MicroProse)"));
  assert.ok(html({ publishers: ["A", "B", "C"] }).includes("(Publisher: A, B u. a.)"));
  assert.ok(html({ firstYear: 1987 }).includes('<span class="meta">(1987)</span>'));
  assert.ok(!html({}).includes('<span class="meta">('));
});

test("behält wiederholte Besprechungen desselben Spiels als einzelne Zeitmarken", async (t) => {
  previewUnreviewed(t);
  const { directory, analysis, file } = await setup(t);
  analysis.discussions.push({
    ...discussion, startMs: 20_000, endMs: null, firstSegmentId: 1, lastSegmentId: 1,
  });
  await writeFile(file, JSON.stringify(analysis));
  const model = await loadContentData(directory);
  const html = gameDiscussions(model.videoById.get(videoId));
  assert.equal((html.match(/data-chapter-seconds=/gu) ?? []).length, 2);
  assert.ok(html.includes('data-chapter-seconds="20"'));
  assert.ok(/0:20 · Spiel &amp; &lt;Demo&gt; [^(]/u.test(html), "offenes Ende ohne Längenangabe");
});

test("Änderungen an Spielebesprechungen aktualisieren den offline generierten Ausgabeinhalt", async (t) => {
  const { directory, analysis, file } = await setup(t);
  analysis.status = "reviewed";
  const outputDirectory = path.join(path.dirname(directory), "docs");
  const options = { cacheDirectory: directory, outputDirectory, logger: { log() {}, warn() {} } };
  await generateSite(options);
  const pages = renderSite(await loadContentData(directory), createSiteConfig(), "assets/test.css");
  const route = [...pages.keys()].find((file) => issueRoute.test(file));
  const before = await readFile(path.join(outputDirectory, route), "utf8");
  assert.ok(!before.includes("Spielebesprechungen im Video"));
  await writeFile(file, JSON.stringify(analysis));
  await generateSite(options);
  const after = await readFile(path.join(outputDirectory, route), "utf8");
  assert.ok(after.includes("Spielebesprechungen im Video"));
  const repeat = await generateSite(options);
  assert.equal(repeat.files, repeat.reused);
});

test("Build listet am Ende alle Seiten mit ungeprüften Sprungmarken", async (t) => {
  const { directory, analysis, file } = await setup(t);
  analysis.discussions = [discussion,
    { ...discussion, startMs: 20_000, endMs: null, firstSegmentId: 1, lastSegmentId: 1 }];
  await writeFile(file, JSON.stringify(analysis));
  const lines = [];
  const options = { cacheDirectory: directory, outputDirectory: path.join(path.dirname(directory), "docs"),
    logger: { log: (line) => lines.push(line), warn() {} } };

  const published = await generateSite(options);
  assert.deepEqual(published.unreviewedPages, []);
  assert.ok(!lines.join("\n").includes(unreviewedPreviewVariable), "regulärer Build ohne Vorschaubericht");
  const pages = renderSite(await loadContentData(directory), createSiteConfig(), "assets/test.css");
  const [issueFile, issuePage] = [...pages].find(([name]) => issueRoute.test(name));
  const reviewedHtml = await readFile(path.join(options.outputDirectory, issueFile), "utf8");
  assert.ok(!reviewedHtml.includes("data-chapter-seconds"), "ungeprüfte Analyse bleibt im regulären Build unsichtbar");

  previewUnreviewed(t);
  lines.length = 0;
  const preview = await generateSite(options);
  assert.deepEqual(preview.unreviewedPages.map((entry) => [entry.route, entry.videos]), [[
    issuePage.route, [{ id: videoId, count: 2, title: "Blätterabend" }],
  ]]);
  const report = lines.at(-1);
  assert.match(report, /2 ungeprüfte Sprungmarken auf 1 Seite/u);
  assert.ok(report.includes(`  http://127.0.0.1:8000/${issuePage.route}\n`));
  assert.match(report, new RegExp(`${videoId}: 2 ungeprüft · Blätterabend`, "u"));
  assert.match(report, /status: "reviewed"/u);

  analysis.status = "reviewed";
  await writeFile(file, JSON.stringify(analysis));
  lines.length = 0;
  await generateSite(options);
  assert.match(lines.at(-1), /keine ungeprüften Spielebesprechungen/u);
});
