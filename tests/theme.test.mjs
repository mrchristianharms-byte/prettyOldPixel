import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../src/theme.js", import.meta.url), "utf8");
const key = "pretty-old-pixel:theme";

function setup({ dark = false, saved = null, blocked = false } = {}) {
  const system = new EventTarget();
  system.matches = dark;
  const button = new EventTarget();
  button.hidden = true;
  button.setAttribute = (name, value) => { button[name] = value; };
  const status = { textContent: "" };
  const document = new EventTarget();
  document.documentElement = { dataset: {} };
  document.querySelector = (selector) => selector === "[data-theme-toggle]" ? button : status;
  const values = new Map(saved === null ? [] : [[key, saved]]);
  const warnings = [];
  runInNewContext(script, {
    document, matchMedia: () => system,
    console: { warn: (...args) => warnings.push(args) },
    localStorage: {
      getItem(name) {
        if (blocked) throw new Error("blocked");
        return values.get(name) ?? null;
      },
      setItem(name, value) {
        if (blocked) throw new Error("blocked");
        values.set(name, value);
      },
    },
  });
  const theme = () => document.documentElement.dataset.theme;
  document.dispatchEvent(new Event("DOMContentLoaded"));
  return { system, button, status, values, warnings, theme };
}

test("folgt Hell-/Dunkel-Browsereinstellung und Änderungen ohne automatisch zu speichern", () => {
  for (const dark of [false, true]) {
    const app = setup({ dark });
    assert.equal(app.theme(), dark ? "dark" : "light");
    assert.equal(app.button.hidden, false);
    assert.equal(app.button["aria-label"], dark ? "Hellen Modus aktivieren" : "Dunklen Modus aktivieren");
    app.system.matches = !dark;
    app.system.dispatchEvent(new Event("change"));
    assert.equal(app.theme(), dark ? "light" : "dark");
    assert.equal(app.values.size, 0);
  }
});

test("manuelle Auswahl hat Vorrang, schaltet in beide Richtungen und wird wiederhergestellt", () => {
  const app = setup({ dark: true, saved: "light" });
  assert.equal(app.theme(), "light");
  app.button.dispatchEvent(new Event("click"));
  assert.equal(app.theme(), "dark");
  assert.equal(app.values.get(key), "dark");
  app.system.matches = false;
  app.system.dispatchEvent(new Event("change"));
  assert.equal(app.theme(), "dark");
  assert.equal(setup({ saved: app.values.get(key) }).theme(), "dark");
  app.button.dispatchEvent(new Event("click"));
  assert.equal(app.theme(), "light");
  assert.equal(app.values.get(key), "light");
});

test("ignoriert ungültige Speicherwerte und meldet blockierten Speicher ohne Umschaltung zu verhindern", () => {
  assert.equal(setup({ dark: true, saved: "invalid" }).theme(), "dark");
  const app = setup({ blocked: true });
  assert.equal(app.warnings.length, 1);
  app.button.dispatchEvent(new Event("click"));
  assert.equal(app.theme(), "dark");
  assert.equal(app.warnings.length, 2);
  assert.match(app.status.textContent, /nicht dauerhaft gespeichert/u);
});
