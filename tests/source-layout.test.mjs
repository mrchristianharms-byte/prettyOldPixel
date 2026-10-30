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
  ["evaluate-game-discussions.mjs", "extra-data"],
  ["build-game-title-index.mjs", "fetch-game"],
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

test("Pages-Jobs installieren Build-Abhängigkeiten vor Tests und Seitengenerierung", async () => {
  const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  for (const [job, command] of [["test", "npm test"], ["build", "npm run generate:site"]]) {
    const steps = workflow.match(new RegExp(`^  ${job}:\\n([\\s\\S]*?)(?=^  \\w+:|(?![\\s\\S]))`, "mu"))?.[1];
    assert.ok(steps, job);
    const install = steps.indexOf("run: npm ci --ignore-scripts --omit=dev");
    const run = steps.indexOf(`run: ${command}`);
    assert.ok(install >= 0 && run > install, job);
  }
});

test("src enthält nur Fachordner und die beiden Hauptaufgaben-Starter", async () => {
  const entries = await readdir(source, { withFileTypes: true });
  assert.deepEqual(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(), [
    "ai-bot-generation", "app-generation", "content-data", "data", "extra-data", "fetch-channel", "fetch-game", "fetch-magazine", "shared", "site-generation",
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

test("Tests spiegeln die Quellverzeichnisse; nur übergreifende Strukturtests liegen an der Wurzel", async () => {
  const tests = new URL("./", import.meta.url);
  const entries = await readdir(tests, { withFileTypes: true });
  assert.deepEqual(entries.filter((entry) => entry.isFile()).map((entry) => entry.name), ["source-layout.test.mjs"]);
  const directories = entries.filter((entry) => entry.isDirectory() && entry.name !== "fixtures").map((entry) => entry.name).sort();
  assert.deepEqual(directories, [
    "ai-bot-generation", "app-generation", "content-data", "extra-data",
    "fetch-channel", "fetch-game", "fetch-magazine", "site-generation",
  ]);
  async function checkDirectory(relative) {
    const sourceEntries = await readdir(new URL(relative, source), { withFileTypes: true });
    const testEntries = await readdir(new URL(relative, tests), { withFileTypes: true });
    assert.ok(testEntries.length > 0, relative);
    for (const entry of testEntries) {
      if (entry.isDirectory()) {
        assert.ok(sourceEntries.some((item) => item.isDirectory() && item.name === entry.name), `${relative}${entry.name}`);
        await checkDirectory(`${relative}${entry.name}/`);
      } else {
        assert.ok(entry.isFile() && entry.name.endsWith(".test.mjs"), `${relative}${entry.name}`);
      }
    }
  }
  for (const directory of directories) await checkDirectory(`${directory}/`);
});

test("CLI-Module lassen sich außerhalb des Projektordners ohne Ausführung importieren", async () => {
  const imports = cliModules.map(([file]) => `await import(${JSON.stringify(new URL(cliPath(file), source).href)});`).join("\n");
  const { stdout, stderr } = await execute(process.execPath, ["--input-type=module", "-e", imports], {
    cwd: tmpdir(), timeout: 10_000,
  });

  assert.equal(stdout, "");
  assert.doesNotMatch(stderr, /Aufruf|fehlgeschlagen|Error/u);
});

test("Agentengenerierung liegt separat und HTML lädt nur den Markdown-Pfadhelfer", async () => {
  const modules = await readdir(new URL("ai-bot-generation/", source));
  assert.deepEqual(modules.sort(), [
    "cloudflare-discovery-rule.json",
    "generate-ai-bot.mjs", "markdown-path.mjs", "site-api.mjs", "site-markdown.mjs",
  ]);
  const siteModules = await readdir(new URL("site-generation/", source));
  assert.ok(!siteModules.includes("site-api.mjs"));
  assert.ok(!siteModules.includes("site-markdown.mjs"));
  const renderer = await readFile(new URL("site-generation/site-render.mjs", source), "utf8");
  assert.match(renderer, /from "\.\.\/ai-bot-generation\/markdown-path\.mjs"/u);
  assert.doesNotMatch(renderer, /from "[^"]*(?:site-markdown|site-api|generate-ai-bot|turndown)/u);
  const generator = await readFile(new URL("site-generation/generate-site.mjs", source), "utf8");
  assert.match(generator, /generateAiBot\(model, config, pages\)/u);
  assert.doesNotMatch(generator, /assets\.set\("llms\.txt"/u);
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
    "verify-game-dump.mjs", "evaluate-game-discussions.mjs", "build-game-title-index.mjs"].map((file) => [file, "--invalid", /Aufruf/u]),
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
