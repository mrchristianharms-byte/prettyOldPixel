import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeJson } from "../src/archive-cache.mjs";
import { buildReadyGameMetadata, loadReadyGameMetadata } from "../src/game-metadata-ready.mjs";
import { renderGameMetadataReview } from "../src/generate-game-metadata-review.mjs";
import { gameDefinitions } from "../src/data-games.mjs";
import { platformMatches } from "../src/game-dump-matching.mjs";

test("freigegebene Originalspiele und beschreibungsbelegte Plattformen bleiben eindeutig zugeordnet", async () => {
  const reader = await loadReadyGameMetadata();
  for (const [id, mobyid, platforms] of [
    ["labyrinth", 12175, ["C64"]],
    ["rogue", 1743, ["MS-DOS"]],
    ["worms", 340, ["MS-DOS"]],
    ["elite-plus-ms-dos", 3433, ["MS-DOS"]],
    ["bedlam-ms-dos", 3244, ["MS-DOS"]],
    ["strike-commander-ms-dos", 1365, ["MS-DOS"]],
    ["super-mario-bros-2-nes", 7299, ["NES"]],
    ["magic-carpet-ms-dos", 361, ["MS-DOS"]],
    ["populous", 613, ["MS-DOS"]],
    ["tom-clancy-s-endwar", 49906, ["PSP"]],
    ["akalabeth-world-of-doom", 1256, ["Apple II"]],
  ]) {
    const record = reader.get(id);
    assert.equal(record.status, "ready", id);
    assert.equal(record.data.identity.id, mobyid, id);
    assert.deepEqual(record.data.scope.platforms, platforms, id);
    assert.deepEqual(gameDefinitions.find((game) => game.id === id).platforms, platforms, id);
  }
});

test("vollständige Dump-Titel lösen die 13 bestätigten Spiele mit plattformgebundenen Werten auf", async () => {
  const reader = await loadReadyGameMetadata();
  const report = JSON.parse(await readFile(new URL("../cache/game-metadata/local-dump/report.json", import.meta.url), "utf8"));
  for (const [id, mobyid, platforms] of [
    ["b-s-s-jane-seymour", 3066, ["MS-DOS", "Amiga"]],
    ["chip-n-dale-nes", 10070, ["NES"]],
    ["darkwing-duck-nes", 8623, ["NES"]],
    ["dogfight-air-duel-ms-dos", 4226, ["MS-DOS"]],
    ["duck-tales-nes", 8606, ["NES"]],
    ["little-nemo-nes", 7879, ["NES"]],
    ["need-for-speed-3-hot-pursuit-pc", 636, ["Windows"]],
    ["star-control-ii-ur-quan-masters", 179, ["MS-DOS"]],
    ["terror-from-the-deep", 543, ["MS-DOS"]],
    ["they-stole-a-million-c64", 21773, ["C64"]],
    ["tmnt-2-the-arcade-game-nes", 7470, ["NES"]],
    ["wario-blast-game-boy", 11293, ["Game Boy"]],
    ["wing-commander-ii", 823, ["MS-DOS"]],
  ]) {
    const record = reader.get(id);
    assert.equal(record.status, "ready", id);
    assert.equal(record.data.identity.id, mobyid, id);
    assert.deepEqual(record.data.scope.platforms, platforms, id);
    assert.deepEqual(gameDefinitions.find((game) => game.id === id).platforms, platforms, id);
    const candidate = report.games.find((game) => game.gameId === id).candidates.find((entry) => entry.mobyid === mobyid);
    const releases = candidate.releases.filter((release) => platformMatches(platforms, release.platform));
    assert.deepEqual(record.data.releases.map((release) => release.sourceReleaseId),
      releases.map((release) => release.mobyreleaseid), id);
    for (const [index, release] of record.data.releases.entries()) {
      assert.equal(release.year, releases[index].year, id);
      assert.equal(release.developer, releases[index].developer, id);
      assert.equal(release.publisher, releases[index].publisher, id);
    }
    assert.ok(record.data.releases.some((release) => release.developer), id);
    assert.ok(record.data.releases.some((release) => release.publisher), id);
    assert.ok(record.data.genres.length > 0, id);
  }
});

test("alle Katalogspiele sind zugeordnet; letzte drei Spiele behalten Plattform und Dump-Jahr", async () => {
  const reader = await loadReadyGameMetadata();
  for (const definition of gameDefinitions) {
    assert.equal(reader.get(definition.id).status, "ready", definition.id);
  }
  for (const [id, sourceId, platform, year] of [
    ["a-boy-and-his-blob-nes", 14618, "NES", 1990],
    ["airships-conquer-the-skies", 112651, "Windows", 2018],
    ["hyperspace-delivery-service", 143640, "Windows", 2019],
  ]) {
    const record = reader.get(id);
    assert.equal(record.data.identity.id, sourceId);
    assert.deepEqual(record.data.scope.platforms, [platform]);
    assert.equal(record.data.releaseYear, year);
    assert.ok(record.data.releases.every((release) => release.platform === platform));
  }
  const airships = reader.get("airships-conquer-the-skies");
  assert.equal(airships.data.releases[0].developer, null);
  assert.equal(airships.data.releases[0].publisher, null);
});

async function fixture(t) {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "pixel-ready-test-"));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const games = [
    { id: "game", name: "Test II", aliases: [], platforms: ["C64"] },
    { id: "open", name: "Open", aliases: [], platforms: [] },
  ];
  const report = { version: 1, provider: "mobygames-local-dump", importedAt: "2026-10-18",
    source: { sha256: "a".repeat(64) }, games: [
      { gameId: "game", title: "Test II", platforms: ["C64"], candidates: [{
        mobyid: 10, title: "Test II", genres: ["Action", "Simulation"], alternativeTitles: [],
        releases: [
          { mobyid: 10, mobyreleaseid: 100, platform: "Commodore 64", year: 1985,
            developer: "Studio", publisher: "First", countries: "Germany", publabel: null },
          { mobyid: 10, mobyreleaseid: 101, platform: "Commodore 64", year: 1988,
            developer: "Studio", publisher: "Reissue", countries: null, publabel: null },
          { mobyid: 10, mobyreleaseid: 102, platform: "Amiga", year: 1990,
            developer: "Other", publisher: "Port", countries: null, publabel: null },
        ],
      }] },
      { gameId: "open", title: "Open", platforms: [], candidates: [] },
    ] };
  await writeJson(path.join(cacheDir, "local-dump/report.json"), report);
  return { options: { cacheDir, games, reviewedDecisions: {} }, report };
}

test("Dump allein erzeugt Plattformdaten und Jahresauswahl; gesperrte Titel bleiben ohne Daten", async (t) => {
  const { options } = await fixture(t);
  const cache = await buildReadyGameMetadata(options);
  assert.equal(cache.version, 3);
  assert.deepEqual(cache.summary, { games: 2, ready: 1, blocked: 1 });
  const reader = await loadReadyGameMetadata(options);
  const record = reader.get("game");
  assert.equal(record.data.releaseYear, 1985);
  assert.deepEqual(record.data.releases.map((release) => release.publisher), ["First", "Reissue"]);
  assert.equal(record.data.identity.basis, "dump-title-and-platform");
  assert.ok(!("wikidataId" in record.data.identity));
  assert.ok(!("entityCache" in record.data.evidence));
  assert.equal(reader.get("open").data, null);
  record.data.genres.push("Mutation");
  assert.equal(reader.get("game").data.genres.length, 2);
  assert.throws(() => reader.get("unknown"), /Unbekannte Spiel-ID/u);
  const html = renderGameMetadataReview(reader, options.games);
  assert.match(html, /1 nutzbar/u);
  assert.match(html, /1 unverifiziert/u);
  await rm(path.join(options.cacheDir, "local-dump/report.json"));
  assert.equal((await loadReadyGameMetadata(options)).get("game").status, "ready");
});

test("fehlendes Jahr und Mehrfachplattform wählen kein pauschales Erscheinungsjahr", async (t) => {
  const { options, report } = await fixture(t);
  const file = path.join(options.cacheDir, "local-dump/report.json");
  report.games[0].candidates[0].releases[1].year = null;
  await writeJson(file, report);
  assert.equal((await buildReadyGameMetadata(options)).games[0].data.releaseYear, null);
  report.games[0].platforms = ["C64", "Amiga"];
  options.games[0].platforms = ["C64", "Amiga"];
  report.games[0].candidates[0].releases[1].year = 1988;
  await writeJson(file, report);
  assert.equal((await buildReadyGameMetadata(options)).games[0].data.releaseYear, null);
});

test("normalisiert bestehende Rohreports bei der Aufbereitung und verlangt den aktuellen Aliasstand", async (t) => {
  const { options, report } = await fixture(t);
  const release = report.games[0].candidates[0].releases[0];
  release.developer = "Blue Byte Software GmbH & Co. KG";
  release.publisher = "Sierra On-Line, Inc.";
  const file = path.join(options.cacheDir, "local-dump/report.json");
  await writeJson(file, report);
  const original = await readFile(file, "utf8");
  const cache = await buildReadyGameMetadata(options);
  const normalized = cache.games[0].data.releases[0];
  assert.equal(normalized.developer, "Blue Byte Studio GmbH");
  assert.equal(normalized.publisher, "Sierra");
  assert.equal(normalized.sourceDeveloper, release.developer);
  assert.equal(normalized.sourcePublisher, release.publisher);
  assert.equal(await readFile(file, "utf8"), original);
  assert.equal((await loadReadyGameMetadata(options)).get("game").data.releases[0].publisher, "Sierra");
  const { contentHash, ...payload } = cache;
  payload.companyNamesHash = "a".repeat(64);
  await writeJson(path.join(options.cacheDir, "ready.json"), {
    ...payload, contentHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  });
  await assert.rejects(loadReadyGameMetadata(options), /beschädigt oder veraltet/u);
});

test("Prüfentscheidung kann bekannte Dump-Mehrdeutigkeit auflösen, nie eine fehlende Plattform", async (t) => {
  const { options, report } = await fixture(t);
  const other = structuredClone(report.games[0].candidates[0]);
  other.mobyid = 20;
  for (const release of other.releases) release.mobyid = 20;
  report.games[0].candidates.push(other);
  await writeJson(path.join(options.cacheDir, "local-dump/report.json"), report);
  assert.equal((await buildReadyGameMetadata(options)).games[0].status, "blocked");
  options.reviewedDecisions = { game: { mobyid: 10, reviewedAt: "2026-10-18", note: "Original geprüft." } };
  assert.equal((await buildReadyGameMetadata(options)).games[0].data.identity.id, 10);
  report.games[0].candidates[0].releases = [report.games[0].candidates[0].releases[2]];
  await writeJson(path.join(options.cacheDir, "local-dump/report.json"), report);
  await assert.rejects(buildReadyGameMetadata(options), /nicht mehr belegt/u);
});

test("offene Plattform wählt DOS nur im Metadatenumfang und lässt Katalog unverändert", async (t) => {
  const { options, report } = await fixture(t);
  options.games[0].platforms = [];
  report.games[0].platforms = [];
  report.games[0].candidates[0].releases.push({
    ...report.games[0].candidates[0].releases[0], mobyreleaseid: 999, platform: "DOS", year: 1987,
  });
  await writeJson(path.join(options.cacheDir, "local-dump/report.json"), report);
  const record = (await buildReadyGameMetadata(options)).games[0];
  assert.deepEqual(record.platforms, []);
  assert.deepEqual(record.data.scope.platforms, ["MS-DOS"]);
  assert.equal(record.data.releaseYear, 1987);
});

test("NES und SNES behalten Entwickler und Publisher im lesbaren fertigen Cache", async (t) => {
  for (const [platform, sourcePlatform, cataloguePlatforms] of [
    ["NES", "Nintendo Entertainment System", []],
    ["SNES", "Super Nintendo Entertainment System", []],
    ["SNES", "SNES", ["SNES"]],
  ]) {
    await t.test(`${sourcePlatform}, Katalog: ${cataloguePlatforms.join(", ") || "offen"}`, async (t) => {
      const { options, report } = await fixture(t);
      options.games[0].platforms = [...cataloguePlatforms];
      report.games[0].platforms = [...cataloguePlatforms];
      const candidate = report.games[0].candidates[0];
      candidate.releases = [{
        ...candidate.releases[0], platform: sourcePlatform, year: 1991,
        developer: "Console Studio", publisher: "Console Publisher",
      }];
      await writeJson(path.join(options.cacheDir, "local-dump/report.json"), report);
      await buildReadyGameMetadata(options);
      const record = (await loadReadyGameMetadata(options)).get("game");
      assert.deepEqual(record.platforms, cataloguePlatforms);
      assert.deepEqual(record.data.scope.platforms, [platform]);
      assert.equal(record.data.scope.platformBasis,
        cataloguePlatforms.length ? "catalogue" : "dos-amiga-c64-nes-snes-priority");
      assert.equal(record.data.releases.length, 1);
      assert.equal(record.data.releases[0].developer, "Console Studio");
      assert.equal(record.data.releases[0].publisher, "Console Publisher");
      assert.equal(record.data.releaseYear, 1991);
      assert.equal(record.data.quality.credits, "not-available");
    });
  }
});

test("Adapter weist fehlende, beschädigte, veraltete und unzulässige Jahresdaten explizit zurück", async (t) => {
  const { options } = await fixture(t);
  await assert.rejects(loadReadyGameMetadata(options), { code: "ENOENT" });
  const cache = await buildReadyGameMetadata(options);
  const file = path.join(options.cacheDir, "ready.json");
  await writeJson(file, { ...cache, contentHash: "wrong" });
  await assert.rejects(loadReadyGameMetadata(options), /beschädigt oder veraltet/u);
  await writeJson(file, cache);
  await assert.rejects(loadReadyGameMetadata({ ...options, reviewedDecisions: { other: {} } }), /veraltet/u);
  const { contentHash, ...payload } = cache;
  payload.games[0].data.releaseYear = 1999;
  await writeJson(file, { ...payload, contentHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex") });
  await assert.rejects(loadReadyGameMetadata(options), /Jahresauswahl/u);
  assert.ok((await readFile(file, "utf8")).includes("1999"));
});
