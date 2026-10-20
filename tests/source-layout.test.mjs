import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const source = new URL("../src/", import.meta.url);
const cliModules = [
  ["fetch-amr.mjs", "fetch-magazine"],
  ["fetch-archives.mjs", "fetch-magazine"],
  ["fetch-pcgamesdatabase.mjs", "fetch-magazine"],
  ["fetch-youtube-playlists.mjs", "fetch-channel"],
  ["fetch-youtube-transcripts.mjs", "extra-data"],
  ["fetch-youtube-videos.mjs", "fetch-channel"],
  ["fetch-youtube.mjs", "fetch-channel"],
  ["game-metadata-ready.mjs", "fetch-game"],
  ["generate-blaetterabend.mjs", "extra-data"],
  ["generate-game-metadata-review.mjs", "fetch-game"],
  ["generate-games-from-transcript.mjs", "extra-data"],
  ["generate-site.mjs", "site-generation"],
  ["generate-css.mjs", "site-generation"],
  ["import-game-dump.mjs", "fetch-game"],
  ["verify-game-dump.mjs", "fetch-game"],
];
const starters = cliModules.filter(([file]) => ["fetch-youtube.mjs", "generate-site.mjs"].includes(file));
const cliPath = (file) => {
  if (starters.some(([name]) => name === file)) return file;
  const entry = cliModules.find(([name]) => name === file);
  assert.ok(entry, `Unbekanntes CLI-Modul: ${file}`);
  return `${entry[1]}/${file}`;
};

test("src enthält nur Fachordner und die beiden Hauptaufgaben-Starter", async () => {
  const entries = await readdir(source, { withFileTypes: true });
  assert.deepEqual(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(), [
    "data", "extra-data", "fetch-channel", "fetch-game", "fetch-magazine", "shared", "site-generation",
  ]);
  assert.deepEqual(entries.filter((entry) => !entry.isDirectory()).map((entry) => entry.name).sort(),
    starters.map(([file]) => file).sort());
  for (const [file, folder] of starters) {
    const content = await readFile(new URL(file, source), "utf8");
    assert.ok(content.includes(`import { runCli } from "./${folder}/${file}";`), file);
    assert.match(content, /await runCli\(\);/u);
    assert.ok(content.trim().split("\n").length <= 7, file);
    const implementation = await import(new URL(`${folder}/${file}`, source));
    assert.equal(typeof implementation.runCli, "function", file);
  }
});

test("CLI-Module lassen sich außerhalb des Projektordners ohne Ausführung importieren", async () => {
  const imports = cliModules.map(([file]) => `await import(${JSON.stringify(new URL(cliPath(file), source).href)});`).join("\n");
  const { stdout, stderr } = await execute(process.execPath, ["--input-type=module", "-e", imports], {
    cwd: tmpdir(), timeout: 10_000,
  });

  assert.equal(stdout, "");
  assert.doesNotMatch(stderr, /Aufruf|fehlgeschlagen|Error/u);
});

test("npm-Aufgaben verwenden Hauptstarter oder direkt ausführbare Fachmodule", async () => {
  const { scripts } = JSON.parse(await readFile(new URL("../package.json", source), "utf8"));
  const tasks = Object.entries(scripts).filter(([, command]) => command.startsWith("node src/"));
  for (const [name, command] of tasks) {
    const file = command.split(" ")[1].slice("src/".length);
    if (name === "fetch:all") assert.equal(file, "fetch-youtube.mjs");
    else if (name === "generate:site") assert.equal(file, "generate-site.mjs");
    else assert.ok(file.includes("/"), name);
    assert.ok(cliModules.some(([module]) => cliPath(module) === file), name);
    await readFile(new URL(file, source));
  }
});

const invalidCalls = [
  ...["fetch-amr.mjs", "fetch-archives.mjs", "fetch-pcgamesdatabase.mjs",
    "fetch-youtube-transcripts.mjs", "game-metadata-ready.mjs", "generate-blaetterabend.mjs",
    "generate-game-metadata-review.mjs", "generate-site.mjs", "generate-css.mjs",
    "verify-game-dump.mjs"].map((file) => [file, "--invalid", /Aufruf/u]),
  ...["fetch-youtube-playlists.mjs", "fetch-youtube-videos.mjs", "fetch-youtube.mjs"]
    .map((file) => [file, "https://example.invalid/channel", /Keine YouTube-URL/u]),
  ["import-game-dump.mjs", "--invalid", /Spieledump: Unbekannte oder doppelte Option: --invalid/u],
];

for (const [file, argument, message] of invalidCalls) {
  test(`${file}: CLI meldet ungültige Argumente ohne Netzwerkzugriff`, async () => {
    await assert.rejects(execute(process.execPath, [fileURLToPath(new URL(cliPath(file), source)), argument], {
      cwd: tmpdir(), timeout: 10_000,
    }), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, message);
      assert.equal(error.stdout, "");
      return true;
    });
  });
}
