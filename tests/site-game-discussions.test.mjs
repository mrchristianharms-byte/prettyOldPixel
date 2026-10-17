import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { loadSiteData } from "../src/site-data.mjs";
import { createSiteConfig } from "../src/site-config.mjs";
import { renderSite } from "../src/site-render.mjs";
import { generateSite } from "../src/generate-site.mjs";
import { gameDiscussions } from "../src/widget/game-discussions.mjs";
import { videoPanel } from "../src/widget/video-panel.mjs";

const videoId = "d0000000000";
const discussion = {
  title: "Spiel & <Demo>", startMs: 12_500, endMs: 30_000,
  firstSegmentId: 0, lastSegmentId: 1, confidence: "medium", reviewed: false,
};

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
  const { directory, analysis, file } = await setup(t);
  await writeFile(file, JSON.stringify(analysis));
  const model = await loadSiteData(directory);
  assert.equal(model.videoById.get(videoId).gameDiscussions.length, 1);
  const config = createSiteConfig();
  const pages = renderSite(model, config, "assets/test.css");
  const issue = [...pages].find(([name]) => name.includes("/ausgaben/"))[1].html;
  assert.ok(issue.includes('<section class="game-discussions">'));
  assert.ok(issue.includes("Erkannte Spielebesprechungen"));
  assert.ok(issue.includes("Automatisch erkannte Vorschläge"));
  assert.ok(issue.includes('<li data-chapter-seconds="12">'));
  assert.ok(issue.includes(`href="https://www.youtube.com/watch?v=${videoId}&amp;t=12s"`));
  assert.ok(issue.includes("0:12–0:30 · Spiel &amp; &lt;Demo&gt;"));
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

test("Fensterzwischenstände und fehlende Analysen erzeugen kein Widget", async (t) => {
  const { directory, analysis } = await setup(t);
  await writeFile(path.join(directory, "game-discussions", `${videoId}.window-0.json`), JSON.stringify(analysis));
  const model = await loadSiteData(directory);
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
    { ...analysis, discussions: [{ ...discussion, reviewed: undefined }] },
  ]) {
    await writeFile(file, JSON.stringify(data));
    await assert.rejects(loadSiteData(directory), /game-discussions/u);
  }
  await writeFile(file, JSON.stringify(analysis));
  await rm(path.join(directory, "youtube-transcripts", `${videoId}.json`));
  await assert.rejects(loadSiteData(directory), /Transkript fehlt/u);
});

test("zeigt geprüfte und offene Zeitbereiche ohne erfundene Endzeit oder falschen Prüfstatus", () => {
  const html = gameDiscussions({
    url: `https://www.youtube.com/watch?v=${videoId}`,
    gameDiscussions: [{ ...discussion, endMs: null, reviewed: true }],
  });
  assert.ok(html.includes("0:12 · Spiel &amp; &lt;Demo&gt;"));
  assert.ok(!html.includes("Automatisch erkannte Vorschläge"));
});

test("behält wiederholte Besprechungen desselben Spiels als einzelne Zeitmarken", async (t) => {
  const { directory, analysis, file } = await setup(t);
  analysis.discussions.push({
    ...discussion, startMs: 20_000, endMs: null, firstSegmentId: 1, lastSegmentId: 1,
  });
  await writeFile(file, JSON.stringify(analysis));
  const model = await loadSiteData(directory);
  const html = gameDiscussions(model.videoById.get(videoId));
  assert.equal((html.match(/data-chapter-seconds=/gu) ?? []).length, 2);
  assert.ok(html.includes('data-chapter-seconds="20"'));
});

test("Änderungen an Spielebesprechungen aktualisieren den offline generierten Ausgabeinhalt", async (t) => {
  const { directory, analysis, file } = await setup(t);
  const outputDirectory = path.join(path.dirname(directory), "docs");
  const options = { cacheDirectory: directory, outputDirectory, logger: { log() {}, warn() {} } };
  await generateSite(options);
  const pages = renderSite(await loadSiteData(directory), createSiteConfig(), "assets/test.css");
  const route = [...pages.keys()].find((file) => file.includes("/ausgaben/"));
  const before = await readFile(path.join(outputDirectory, route), "utf8");
  assert.ok(!before.includes("Erkannte Spielebesprechungen"));
  await writeFile(file, JSON.stringify(analysis));
  await generateSite(options);
  const after = await readFile(path.join(outputDirectory, route), "utf8");
  assert.ok(after.includes("Erkannte Spielebesprechungen"));
  const repeat = await generateSite(options);
  assert.equal(repeat.files, repeat.reused);
});
