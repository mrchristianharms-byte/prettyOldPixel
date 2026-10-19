import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { importGameDump, parseDumpArguments, parseSqlValues, readSqlStatements, normalizeDumpTitle } from "../src/import-game-dump.mjs";

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
(5, 50, 2020, 'Windows', 'New Publisher', 'New Developer', NULL, NULL);
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
  const output = path.join(dir, "export.json");
  await writeFile(input, text);
  return { input, output };
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
  const { input } = await fixture(t, "/* comment\n; */ SET x=1; -- comment;\nINSERT INTO `a` VALUES ('a;\nb', 'c\\'d', 'e''f'); # end\n");
  const statements = [];
  for await (const statement of readSqlStatements(input)) statements.push(statement);
  assert.equal(statements.length, 2);
  assert.match(statements[1], /a;\nb/u);
  await writeFile(input, "INSERT INTO a VALUES ('unfinished");
  await assert.rejects(async () => { for await (const statement of readSqlStatements(input)) void statement; }, /Unvollständiger/u);
});

test("Offline-Export enthält nur Katalogtreffer, bewahrt Releases und bestätigt keine Identität", async (t) => {
  const options = await fixture(t);
  const report = await importGameDump({ ...options, games });
  assert.deepEqual(report.summary, { games: 4, withCandidates: 3, withoutExactMatch: 1, ambiguous: 1 });
  const wing = report.games[0];
  assert.equal(wing.status, "needs-identity-review");
  assert.equal(wing.candidates.length, 2);
  assert.equal(wing.candidates[0].platformMatch, true);
  assert.deepEqual(wing.candidates[0].matchingReleaseIds, [30]);
  assert.equal(wing.candidates[1].platformMatch, false);
  assert.equal(wing.candidates[0].releases.length, 2);
  assert.equal(wing.candidates[0].releases[1].publisher, "Origin");
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
  assert.equal(await readFile(options.input, "utf8"), dump);
});

test("Metadaten sind HTML-escaped und ein fehlender Tabellenimport erhält die Eingabe", async (t) => {
  const options = await fixture(t, dump.replace("'Origin'", "'<script>alert(1)</script>'"));
  await importGameDump({ ...options, games });
  const html = await readFile(options.output.replace(/\.json$/u, ".html"), "utf8");
  assert.match(html, /&lt;script&gt;/u);
  assert.ok(!html.includes("<script>"));
  await writeFile(options.input, "SET x=1;");
  await assert.rejects(importGameDump({ ...options, games, deleteInput: true }), /Keine Daten/u);
  await access(options.input);
});

test("vereinheitlicht Entwickler und Publisher beim Import und erhält ursprüngliche Quellnamen", async (t) => {
  const options = await fixture(t, dump.replace("'Origin', 'Origin'", "'Virgin Games, Inc.', 'MPS Labs'"));
  const report = await importGameDump({ ...options, games });
  const release = report.games[0].candidates[0].releases.find((entry) => entry.mobyreleaseid === 30);
  assert.equal(release.developer, "MicroProse");
  assert.equal(release.publisher, "Virgin");
  assert.equal(release.sourceDeveloper, "MPS Labs");
  assert.equal(release.sourcePublisher, "Virgin Games, Inc.");
  assert.ok((await readFile(options.input, "utf8")).includes("'Virgin Games, Inc.', 'MPS Labs'"));
});

test("Löscht ausschließlich die Eingabe nach verifiziertem Export, Fehler erhalten sie", async (t) => {
  const options = await fixture(t);
  await importGameDump({ ...options, games, deleteInput: true });
  await assert.rejects(access(options.input), { code: "ENOENT" });
  assert.ok(JSON.parse(await readFile(options.output, "utf8")).source.sha256);
  await writeFile(options.input, dump.replace("'DOS'", "NOW()"));
  await assert.rejects(importGameDump({ ...options, games, deleteInput: true }), /SQL-Wert/u);
  await access(options.input);
  await assert.rejects(importGameDump({ ...options, output: options.input, games }), /identisch/u);
});

test("Teilnummern bleiben verschieden, CLI verlangt expliziten Eingabepfad", () => {
  assert.notEqual(normalizeDumpTitle("Game II"), normalizeDumpTitle("Game III"));
  assert.equal(normalizeDumpTitle("Sid Meier’s Game"), normalizeDumpTitle("Sid Meier's Game"));
  assert.deepEqual(parseDumpArguments(["--input", "dump.sql", "--delete-input"]), {
    input: path.resolve("dump.sql"), deleteInput: true,
  });
  for (const args of [[], ["--input"], ["--input", "x", "--input", "y"], ["--unknown"]]) {
    assert.throws(() => parseDumpArguments(args), /Spieledump/u);
  }
});
