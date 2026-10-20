import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { generateCss } from "../src/site-generation/generate-css.mjs";

test("erzeugt das versionierte Pico-Stylesheet reproduzierbar aus den aktuellen Templates und Browser-Skripten", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "pixel-css-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outputFile = path.join(directory, "pico.css");
  await generateCss({ outputFile, logger: { log() {} } });
  const generated = await readFile(outputFile, "utf8");
  const committed = await readFile(new URL("../src/site-generation/vendor/pico-2.1.1.site.min.css", import.meta.url), "utf8");
  assert.equal(committed, generated, "Nach Templateänderungen npm run dev:generate:css ausführen.");
});
