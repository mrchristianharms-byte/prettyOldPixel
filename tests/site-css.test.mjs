import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import test from "node:test";

const vendor = new URL("../src/site-generation/vendor/", import.meta.url);
const original = await readFile(new URL("pico-2.1.1.min.css", vendor), "utf8");
const reduced = await readFile(new URL("pico-2.1.1.site.min.css", vendor), "utf8");
const custom = await readFile(new URL("../src/site-generation/site.css", import.meta.url), "utf8");

test("reduziert die übertragenen CSS-Bytes um mindestens 30 Prozent ohne Build-Abhängigkeiten", () => {
  const before = gzipSync(`${original}\n${custom}`).length;
  const after = gzipSync(`${reduced}\n${custom}`).length;
  assert.ok(after <= before * .7, `${before} → ${after} Bytes gzip`);
  assert.ok(after < 10 * 1024, `${after} Bytes gzip`);
  assert.match(reduced, /Pico CSS/u);
  assert.doesNotMatch(reduced, /sourceMappingURL|@import/u);
  for (const selector of ["[data-tooltip]", "dialog{", "progress{"]) {
    assert.ok(!reduced.includes(selector), `Ungenutzte Komponente: ${selector}`);
  }
});

test("erhält Themen, responsive Regeln, Überschriftenabstände und interaktive Zustände", () => {
  for (const selector of ["[data-theme=light]", "[data-theme=dark]", "prefers-color-scheme:dark",
    ":focus", ":checked", "[disabled]", "details", "summary", "table", "~:is(h1,h2,h3,h4,h5,h6)"]) {
    assert.ok(reduced.includes(selector), `Benötigte Regel fehlt: ${selector}`);
  }
  for (const [, name] of custom.matchAll(/var\((--[\w-]+)/gu)) {
    assert.ok(reduced.includes(`${name}:`) || custom.includes(`${name}:`), `CSS-Variable fehlt: ${name}`);
  }
});
