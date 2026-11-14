import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { baselineWidgetCount, calculateCssGzipBudget, cssGzipBudget, sharedLayoutRules, widgetCssRules } from "../../../src/site-generation/widget/css-budget.mjs";

const widgetDirectory = new URL("../../../src/site-generation/widget/", import.meta.url);
const css = await readFile(new URL("../site.css", widgetDirectory), "utf8");
const classNames = (text) => [...text.matchAll(/\.([a-zA-Z_][\w-]*)/gu)].map((match) => match[1]);

// Selectors precede declarations, including inside media blocks.
const selectors = [...css.replace(/\/\*[\s\S]*?\*\//gu, "").matchAll(/([^{}]+)\{/gu)]
  .map((match) => match[1].trim()).filter((selector) => !selector.startsWith("@"));

test("führt jedes Rendering-Widget genau einmal auf, ohne das Budgetmodul mitzuzählen", async () => {
  const files = (await readdir(widgetDirectory)).filter((file) => file.endsWith(".mjs") && file !== "css-budget.mjs");
  assert.deepEqual(widgetCssRules.map((row) => row.file).sort(), files.sort());
});

test("berechnet 12 KiB für 15 Widgets und 13 KiB für 16 Widgets aus derselben Tabelle", () => {
  assert.equal(baselineWidgetCount, 15);
  assert.equal(calculateCssGzipBudget(Array.from({ length: 15 }, () => ({}))), 12288);
  const additionalWidget = { file: "additional-widget.mjs", selectors: [] };
  assert.equal(calculateCssGzipBudget(Array.from({ length: 16 }, () => additionalWidget)), 13312);
  assert.equal(cssGzipBudget, calculateCssGzipBudget(widgetCssRules));
  assert.equal(calculateCssGzipBudget([...widgetCssRules, additionalWidget]), cssGzipBudget + 1024);
});

test("verweist für Widgets und gemeinsames Layout nur auf vorhandene CSS-Selektoren", () => {
  const entries = [...widgetCssRules, { file: "sharedLayoutRules", selectors: sharedLayoutRules }];
  for (const entry of entries) {
    for (const selector of entry.selectors) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const pattern = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "u");
      assert.ok(selectors.some((rule) => pattern.test(rule)), `${entry.file}: CSS-Selektor fehlt: ${selector}`);
    }
  }
});

test("ordnet jede Klasse aus site.css einem Widget oder dem gemeinsamen Layout zu", () => {
  const assigned = new Set(classNames([...widgetCssRules.flatMap((row) => row.selectors), ...sharedLayoutRules].join("\n")));
  const unassigned = [...new Set(classNames(selectors.join("\n")))].filter((name) => !assigned.has(name));
  assert.deepEqual(unassigned, [], `Nicht zugeordnete CSS-Klassen: ${unassigned.join(", ")}`);
});
