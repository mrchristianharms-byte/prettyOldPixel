import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { collectNewGameCandidates, extractGameTitle, findGameCandidates } from "../../src/fetch-game/new-game-candidates.mjs";

const starTrek = { id: 699, title: "Star Trek: Generations", firstYear: 1997, alternativeTitles: [] };
const index = { version: 4, source: { sha256: "a".repeat(64) }, games: [starTrek] };
const video = (id, title = "Star Trek Generations") => ({ id, description: `Einleitung\r\nSpiel: ${title}\r\nWeitere Angaben` });

test("Spiel-Zeile wird vollständig gelesen; fehlende oder mehrere Zeilen liefern keinen Titel", () => {
  assert.equal(extractGameTitle(video("one").description), "Star Trek Generations");
  assert.equal(extractGameTitle(" Spiel: Star Trek: Generations \n"), "Star Trek: Generations");
  for (const description of [undefined, "Kein Spiel", "Spiel: ", "Spiel: A\nSpiel: B"]) {
    assert.equal(extractGameTitle(description), null);
  }
});

test("Star Trek wird ohne Katalogeintrag gefunden; IDs statt Aliasse bestimmen Eindeutigkeit", () => {
  const lookup = findGameCandidates({ ...index, games: [{ ...starTrek, alternativeTitles: [{ title: "Star Trek Generations" }] }] });
  assert.deepEqual(lookup("Star Trek Generations"), [starTrek.id]);
  assert.deepEqual(lookup("Star Trek"), []);
  assert.deepEqual(lookup("Unbekannt"), []);
  assert.deepEqual(findGameCandidates({ games: [starTrek, { ...starTrek, id: 700 }] })("Star Trek Generations"), [699, 700]);
});

async function fixture(t) {
  const cacheDirectory = await mkdtemp(path.join(tmpdir(), "pop-candidates-"));
  t.after(() => rm(cacheDirectory, { recursive: true, force: true }));
  const titleIndexFile = path.join(cacheDirectory, "index.json");
  await writeFile(titleIndexFile, JSON.stringify(index));
  const saveVideos = (videos, complete = true) => writeFile(path.join(cacheDirectory, "youtube-videos.json"),
    JSON.stringify({ complete, channel: { id: "channel" }, videos }));
  await writeFile(path.join(cacheDirectory, "youtube-playlists.json"), JSON.stringify({ playlists: [] }));
  const messages = [];
  const options = { cacheDirectory, titleIndexFile, games: [], log: (message) => messages.push(message) };
  return { cacheDirectory, titleIndexFile, saveVideos, options, messages };
}

test("Sammler speichert Belege, ist idempotent und nimmt später hinzugekommene Videos auf", async (t) => {
  const { cacheDirectory, saveVideos, options } = await fixture(t);
  await saveVideos([video("X_oKNsvMVqg")]);
  await writeFile(path.join(cacheDirectory, "game-metadata-ready-sentinel"), "unverändert");
  const first = await collectNewGameCandidates(options);
  assert.equal(first.candidates.length, 1);
  assert.deepEqual(first.candidates[0], {
    mobyid: 699, title: starTrek.title, firstYear: 1997,
    evidence: [{ videoId: "X_oKNsvMVqg", title: "Star Trek Generations", indexHash: index.source.sha256 }],
  });
  const file = path.join(cacheDirectory, "game-metadata/new-candidates.json");
  const saved = await readFile(file, "utf8");
  await collectNewGameCandidates(options);
  assert.equal(await readFile(file, "utf8"), saved);
  await saveVideos([video("X_oKNsvMVqg"), video("next-video")]);
  const next = await collectNewGameCandidates(options);
  assert.equal(next.candidates[0].evidence.length, 2);
  assert.equal(await readFile(path.join(cacheDirectory, "game-metadata-ready-sentinel"), "utf8"), "unverändert");
});

test("Bestätigte Playlists, Zusatzvideos und ausgeschlossene Videos erzeugen keine Kandidaten", async (t) => {
  const { cacheDirectory, saveVideos, options } = await fixture(t);
  await saveVideos([video("playlist-video"), video("explicit-video"), video("excluded")]);
  await writeFile(path.join(cacheDirectory, "youtube-playlists.json"), JSON.stringify({ playlists: [
    { id: "known", videos: ["playlist-video", "excluded"].map((videoId) => ({ videoId, availability: "listed", position: 1 })) },
  ] }));
  const result = await collectNewGameCandidates({ ...options, games: [
    { playlistIds: ["known"], videoIds: ["explicit-video"], excludedVideoIds: ["excluded"] },
  ] });
  assert.deepEqual(result.candidates, []);
});

test("Mehrdeutige und fehlende Treffer bleiben prüfbar und werden bei neuem Index erneut gesucht", async (t) => {
  const { saveVideos, titleIndexFile, options, messages } = await fixture(t);
  await writeFile(titleIndexFile, JSON.stringify({ ...index, games: [starTrek, { ...starTrek, id: 700 }] }));
  await saveVideos([video("ambiguous"), video("missing", "Anderes Spiel"), { id: "no-title" }]);
  const result = await collectNewGameCandidates(options);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.unresolved.map(({ reason }) => reason), ["ambiguous", "no-match", "no-title"]);
  assert.ok(messages.some((message) => message.includes("699, 700")));
  await writeFile(titleIndexFile, JSON.stringify(index));
  assert.equal((await collectNewGameCandidates(options)).candidates.length, 1);
});

test("Unvollständige Caches, fehlende/veraltete Indizes und fremde Kanäle ändern keine Ausgabe", async (t) => {
  const { cacheDirectory, saveVideos, titleIndexFile, options } = await fixture(t);
  await saveVideos([video("one")]);
  await collectNewGameCandidates(options);
  const file = path.join(cacheDirectory, "game-metadata/new-candidates.json");
  const saved = await readFile(file, "utf8");
  await saveVideos([video("two")], false);
  await assert.rejects(collectNewGameCandidates(options), /vollständig/u);
  await saveVideos([video("two")]);
  await writeFile(titleIndexFile, JSON.stringify({ ...index, version: 1 }));
  await assert.rejects(collectNewGameCandidates(options), /veraltet/u);
  await rm(titleIndexFile);
  await assert.rejects(collectNewGameCandidates(options), { code: "ENOENT" });
  await writeFile(titleIndexFile, JSON.stringify(index));
  await writeFile(path.join(cacheDirectory, "youtube-videos.json"), JSON.stringify({
    complete: true, channel: { id: "other" }, videos: [video("two")],
  }));
  await assert.rejects(collectNewGameCandidates(options), /Kanal/u);
  assert.equal(await readFile(file, "utf8"), saved);
});
