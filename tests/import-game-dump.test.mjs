import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { buildGameTitleIndex } from "../src/fetch-game/build-game-title-index.mjs";
import { importGameDump, parseDumpArguments, normalizeDumpTitle } from "../src/fetch-game/import-game-dump.mjs";
import { parseSqlValues, readSqlStatements } from "../src/fetch-game/sql-dump-reader.mjs";

const dump = `-- Dump with comments
/*!40101 SET NAMES utf8mb4 */;
CREATE TABLE ignored (id INTEGER);
INSERT INTO \`mobygames\` (\`mobyid\`, \`title\`, \`mobylink\`, \`genre\`, \`description\`, \`perspective\`, \`gameplay\`, \`interface\`, \`setting\`, \`sport\`, \`misc\`) VALUES
(3, 'Wing Commander', 'https://www.mobygames.com/game/3/', 'Action; Simulation', 'Not exported; a comma, an apostrophe \\' and newline\\n.', NULL, NULL, NULL, NULL, NULL, NULL),
(4, 'Wing Commander II', NULL, 'Simulation', 'Ignored', NULL, NULL, NULL, NULL, NULL, NULL),
(5, 'Wing Commander', NULL, 'Action', 'A different game', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO \`mobygames_alttitles\` (\`mobyid\`, \`title\`, \`info\`) VALUES (3, 'Flügelkommandant', 'German');
INSERT INTO \`mobygames_releases\` (\`mobyid\`, \`mobyreleaseid\`, \`year\`, \`platform\`, \`publisher\`, \`developer\`, \`countries\`, \`publabel\`) VALUES
(3, 30, 1990, 'DOS', 'Origin', 'Origin', 'United States', NULL),
(3, 31, 1992, 'Amiga', 'Other Publisher', 'Other Developer', 'Germany', NULL),
(5, 50, 2004, 'Windows', 'New Publisher', 'New Developer', NULL, NULL);
`;
const games = [
  { id: "wing", name: "Wing Commander", platforms: ["MS-DOS"], aliases: [] },
  { id: "german", name: "Flügelkommandant", platforms: ["Amiga"], aliases: [] },
  { id: "wing-ii", name: "Wing Commander II", platforms: [], aliases: [] },
  { id: "wing-iii", name: "Wing Commander III", platforms: [], aliases: [] },
];

async function fixture(t, text = dump) {
  const dir = await mkdtemp(path.join(tmpdir(), "pixel-dump-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, "gdb.sql");
  const index = path.join(dir, "game-title-index.json.gz");
  const output = path.join(dir, "export.json");
  await writeFile(input, text);
  await buildGameTitleIndex({ input, output: index });
  return { input, index, output, manual: {} };
}

async function textFixture(t, text) {
  const dir = await mkdtemp(path.join(tmpdir(), "pixel-dump-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, "gdb.sql");
  await writeFile(input, text);
  return { input };
}

test("SQL-Werte erhalten Escaping, NULL, Satzzeichen und mehrzeilige Strings", () => {
  assert.deepEqual([...parseSqlValues("(1, 'Sid Meier\\'s; game, II', NULL, 'a''b', 'x\\\\y\\n\\r\\t\\0\\Z', '\\%'), (2, '', -4, 'ä', '', '')", 6)], [
    [1, "Sid Meier's; game, II", null, "a'b", "x\\y\n\r\t\0\x1a", "\\%"],
    [2, "", -4, "ä", "", ""],
  ]);
  for (const text of ["(1, 'open)", "(1, NOW())", "(1),", "(1) garbage", "(1, 2)"]) {
    assert.throws(() => [...parseSqlValues(text, 1)], /Spieledump/u);
  }
});

test("Anweisungsleser trennt nicht innerhalb von Strings und ignoriert Kommentare", async (t) => {
  const { input } = await textFixture(t, "/* comment\n; */ SET x=1; -- comment;\nINSERT INTO `a` VALUES ('a;\nb', 'c\\'d', 'e''f'); # end\n");
  const statements = [];
  for await (const statement of readSqlStatements(input)) statements.push(statement);
  assert.equal(statements.length, 2);
  assert.match(statements[1], /a;\nb/u);
  await writeFile(input, "INSERT INTO a VALUES ('unfinished");
  await assert.rejects(async () => { for await (const statement of readSqlStatements(input)) void statement; }, /Unvollständiger/u);
});

test("Offline-Export aus dem Titelindex enthält nur Katalogtreffer, bewahrt Releases und bestätigt keine Identität", async (t) => {
  const { input, ...options } = await fixture(t);
  const report = await importGameDump({ ...options, games });
  assert.equal(report.source.titleIndex, "game-title-index.json.gz");
  assert.match(report.source.sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(report.importedRows, { mobygames: 3, mobygames_alttitles: 1, mobygames_releases: 3 });
  assert.deepEqual(report.summary, { games: 4, withCandidates: 3, withoutExactMatch: 1, ambiguous: 1 });
  const wing = report.games[0];
  assert.equal(wing.status, "needs-identity-review");
  assert.equal(wing.candidates.length, 2);
  assert.equal(wing.candidates[0].platformMatch, true);
  assert.deepEqual(wing.candidates[0].matchingReleaseIds, [30]);
  assert.equal(wing.candidates[1].platformMatch, false);
  assert.equal(wing.candidates[0].releases.length, 2);
  assert.equal(wing.candidates[0].releases[1].publisher, "Origin");
  assert.deepEqual(wing.candidates[0].releases.map((release) => [release.mobyreleaseid, release.platform, release.countries]),
    [[31, "Amiga", "Germany"], [30, "DOS", "United States"]]);
  assert.deepEqual(wing.candidates[0].alternativeTitles, [{ title: "Flügelkommandant", info: "German" }]);
  assert.deepEqual(wing.candidates[0].genres, ["Action", "Simulation"]);
  assert.equal(report.games[1].candidates[0].mobyid, 3);
  assert.equal(report.games[2].candidates[0].platformMatch, null);
  assert.equal(report.games[3].candidates.length, 0);
  const exported = await readFile(options.output, "utf8");
  assert.ok(!exported.includes("Not exported"));
  assert.deepEqual(JSON.parse(exported), report);
  const html = await readFile(options.output.replace(/\.json$/u, ".html"), "utf8");
  assert.match(html, /3\/4 Spiele mit Kandidaten/u);
  assert.match(html, /keine bestätigten Identitäten/u);
  assert.match(html, /Other Publisher/u);
  assert.ok(!html.includes("Not exported"));
  assert.equal(await readFile(input, "utf8"), dump);
});

test("manuelle Dump-Daten ergänzen Katalogspiele außerhalb des Titelindex, der Index hat Vorrang", async (t) => {
  const { input, ...options } = await fixture(t);
  const release = { mobyreleaseid: 90, year: 2008, platform: "DOS", publisher: "Virgin Games, Inc.",
    developer: "Origin", countries: "United States", publabel: null };
  const manual = {
    "wing-iii": { mobyid: 9, title: "Wing Commander III", genres: ["Action"], alternativeTitles: [], releases: [release] },
    "wing-ii": { mobyid: 4, title: "Wing Commander II", genres: ["Ignoriert"], alternativeTitles: [], releases: [release] },
  };
  const report = await importGameDump({ ...options, games, manual });
  const [wingII, wingIII] = [report.games[2], report.games[3]];
  assert.equal(wingIII.status, "needs-identity-review");
  assert.deepEqual(wingIII.candidates.map((candidate) => [candidate.mobyid, candidate.manual, candidate.matchingReleaseIds]),
    [[9, true, []]]);
  assert.equal(wingIII.candidates[0].releases[0].mobyid, 9);
  assert.equal(wingIII.candidates[0].releases[0].sourcePublisher, "Virgin Games, Inc.");
  assert.deepEqual(wingII.candidates.map((candidate) => [candidate.mobyid, candidate.manual, candidate.genres]),
    [[4, undefined, ["Simulation"]]]);
  assert.match(await readFile(options.output.replace(/\.json$/u, ".html"), "utf8"), /MobyGames 9 · manuell gepflegt/u);
  await assert.rejects(importGameDump({ ...options, games, manual: { unbekannt: manual["wing-iii"] } }), /unbekanntes Spiel/u);
  await assert.rejects(importGameDump({ ...options, games, manual: { "wing-iii": { ...manual["wing-iii"], releases: [] } } }),
    /Ungültige manuelle/u);
  const { publabel, ...incomplete } = release;
  void publabel;
  await assert.rejects(importGameDump({ ...options, games, manual: { "wing-iii": { ...manual["wing-iii"], releases: [incomplete] } } }),
    /Unvollständige manuelle/u);
});

test("Import verlangt aktuellen Titelindex und passenden Plattformindex", async (t) => {
  const options = await fixture(t);
  const platformFile = path.join(path.dirname(options.index), "game-platform-index.json");
  const platforms = JSON.parse(await readFile(platformFile, "utf8"));
  await writeFile(platformFile, JSON.stringify({ ...platforms, source: { ...platforms.source, sha256: "0".repeat(64) } }));
  await assert.rejects(importGameDump({ ...options, games }), /Plattformindex passt nicht/u);
  await rm(platformFile);
  await assert.rejects(importGameDump({ ...options, games }), /Plattformindex fehlt/u);
  const index = JSON.parse(gunzipSync(await readFile(options.index)).toString("utf8"));
  await writeFile(options.index, JSON.stringify({ ...index, version: 2 }));
  await assert.rejects(importGameDump({ ...options, games }), /veraltet.*dev:build:game-title-index/u);
  await assert.rejects(importGameDump({ ...options, output: options.index, games }), /identisch/u);
});

test("Metadaten sind HTML-escaped", async (t) => {
  const options = await fixture(t, dump.replace("'Origin'", "'<script>alert(1)</script>'"));
  await importGameDump({ ...options, games });
  const html = await readFile(options.output.replace(/\.json$/u, ".html"), "utf8");
  assert.match(html, /&lt;script&gt;/u);
  assert.ok(!html.includes("<script>"));
});

test("exportiert freigegebene zusätzliche Veröffentlichungen getrennt von Spielkandidaten", async (t) => {
  const options = await fixture(t);
  const catalogue = [{ ...games[2], additionalReleases: [
    { mobyid: 3, title: "Wing Commander", platforms: ["MS-DOS"] },
  ] }];
  const report = await importGameDump({ ...options, games: catalogue });
  const entry = report.games[0];
  assert.deepEqual(entry.candidates.map((candidate) => candidate.mobyid), [4]);
  assert.equal(entry.additionalReleases[0].releases.length, 1);
  assert.equal(entry.additionalReleases[0].releases[0].mobyreleaseid, 30);
  catalogue[0].additionalReleases[0].platforms = ["NES"];
  await assert.rejects(importGameDump({ ...options, games: catalogue }), /Plattform.*fehlt/u);
  catalogue[0].additionalReleases[0].title = "Other";
  await assert.rejects(importGameDump({ ...options, games: catalogue }), /Titel geändert/u);
});

test("vereinheitlicht Entwickler und Publisher beim Import und erhält ursprüngliche Quellnamen", async (t) => {
  const { input, ...options } = await fixture(t, dump.replace("'Origin', 'Origin'", "'Virgin Games, Inc.', 'MPS Labs'"));
  const report = await importGameDump({ ...options, games });
  const release = report.games[0].candidates[0].releases.find((entry) => entry.mobyreleaseid === 30);
  assert.equal(release.developer, "MicroProse");
  assert.equal(release.publisher, "Virgin");
  assert.equal(release.sourceDeveloper, "MPS Labs");
  assert.equal(release.sourcePublisher, "Virgin Games, Inc.");
  assert.ok((await readFile(input, "utf8")).includes("'Virgin Games, Inc.', 'MPS Labs'"));
});

test("Teilnummern bleiben verschieden, CLI nimmt optional Index- und Ausgabepfad", () => {
  assert.notEqual(normalizeDumpTitle("Game II"), normalizeDumpTitle("Game III"));
  assert.equal(normalizeDumpTitle("Sid Meier’s Game"), normalizeDumpTitle("Sid Meier's Game"));
  assert.deepEqual(parseDumpArguments([]), {});
  assert.deepEqual(parseDumpArguments(["--index", "index.json", "--output", "out.json"]), {
    index: path.resolve("index.json"), output: path.resolve("out.json"),
  });
  for (const args of [["--index"], ["--index", "x", "--index", "y"], ["--input", "gdb.sql"], ["--delete-input"], ["--unknown"]]) {
    assert.throws(() => parseDumpArguments(args), /Spieledump/u);
  }
});
