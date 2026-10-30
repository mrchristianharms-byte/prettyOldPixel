import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const script = await readFile(new URL("../../src/site-generation/game-table.js", import.meta.url), "utf8");

function setup() {
  const entries = [
    ["Beta", 100, 1992, 7200, ["DOS"], ["Adventure"]],
    ["Alpha", 200, 1985, 3600, ["DOS", "Amiga"], ["Action", "Adventure"]],
    ["Gamma", 200, null, 0, ["Amiga"], ["Action"]],
    ["Unbekannt", null, null, null, [], []],
    ["Teilweise", 50, 1990, null, ["DOS"], ["Adventure"]],
  ];
  const elements = entries.map(([title, video, release, duration, platforms, genres]) => ({
    dataset: {
      title, video: video === null ? "" : String(video), release: release === null ? "" : String(release),
      duration: duration === null ? "" : String(duration),
      platforms: JSON.stringify(platforms), genres: JSON.stringify(genres),
    },
    hidden: false,
  }));
  const control = (value) => ({
    value,
    get selectedOptions() {
      const labels = {
        video: "Erstes Video", release: "Erscheinungsjahr des Spiels",
        title: "Titel (Alphabet)", duration: "Videolaufzeit",
      };
      return [{ textContent: labels[this.value] ?? this.value }];
    },
  });
  const buttons = Object.entries({
    video: "Erstes Video", release: "Erscheinungsjahr des Spiels",
    title: "Titel (Alphabet)", duration: "Videolaufzeit",
  }).map(([key, label]) => {
    const button = new EventTarget();
    button.dataset = { gameSort: key, sortLabel: label };
    button.hidden = true;
    button.attributes = {};
    button.setAttribute = (name, value) => { button.attributes[name] = value; };
    button.parentElement = {
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
    };
    button.icon = { textContent: "" };
    button.querySelector = () => button.icon;
    return button;
  });
  const platform = control("");
  const genre = control("");
  const search = new EventTarget();
  search.value = "";
  const reset = new EventTarget();
  const controls = new EventTarget();
  controls.hidden = true;
  const body = {
    rows: [...elements],
    append(element) {
      this.rows.splice(this.rows.indexOf(element), 1);
      this.rows.push(element);
    },
  };
  const count = { textContent: "" };
  const filters = { textContent: "" };
  const sorting = { textContent: "" };
  const empty = { hidden: true };
  const caption = { textContent: "" };
  const nodes = {
    "[data-game-table-controls]": controls,
    "[data-game-platform]": platform,
    "[data-game-genre]": genre,
    "[data-game-search]": search,
    "[data-game-reset]": reset,
    "[data-game-table-count]": count,
    "[data-game-table-filters]": filters,
    "[data-game-table-sort]": sorting,
    "[data-game-table-empty]": empty,
    tbody: body,
    caption,
  };
  runInNewContext(script, { document: { querySelector: () => ({
    querySelector: (selector) => nodes[selector], querySelectorAll: () => buttons,
  }) } });
  return {
    controls, buttons, platform, genre, search, reset, count, filters, sorting, empty, caption,
    sortBy(field, direction) {
      const button = buttons.find((entry) => entry.dataset.gameSort === field);
      if (button.parentElement.attributes["aria-sort"] !== (direction === "asc" ? "ascending" : "descending")) {
        button.dispatchEvent(new Event("click"));
        if (button.parentElement.attributes["aria-sort"] !== (direction === "asc" ? "ascending" : "descending")) {
          button.dispatchEvent(new Event("click"));
        }
      }
    },
    update() { controls.dispatchEvent(new Event("change")); },
    visible() { return body.rows.filter((row) => !row.hidden).map((row) => row.dataset.title); },
  };
}

test("sortiert alle vier Felder in beide Richtungen und fehlende Werte immer zuletzt", () => {
  const app = setup();
  assert.equal(app.controls.hidden, false);
  assert.deepEqual(app.visible(), ["Alpha", "Gamma", "Beta", "Teilweise", "Unbekannt"]);
  for (const [field, ascending, descending] of [
    ["video", ["Teilweise", "Beta", "Alpha", "Gamma", "Unbekannt"], ["Alpha", "Gamma", "Beta", "Teilweise", "Unbekannt"]],
    ["release", ["Alpha", "Teilweise", "Beta", "Gamma", "Unbekannt"], ["Beta", "Teilweise", "Alpha", "Gamma", "Unbekannt"]],
    ["title", ["Alpha", "Beta", "Gamma", "Teilweise", "Unbekannt"], ["Unbekannt", "Teilweise", "Gamma", "Beta", "Alpha"]],
    ["duration", ["Gamma", "Alpha", "Beta", "Teilweise", "Unbekannt"], ["Beta", "Alpha", "Gamma", "Teilweise", "Unbekannt"]],
  ]) {
    for (const [direction, expected] of [["asc", ascending], ["desc", descending]]) {
      app.sortBy(field, direction);
      assert.deepEqual(app.visible(), expected, `${field} ${direction}`);
      const active = app.buttons.filter((button) => button.parentElement.attributes["aria-sort"]);
      assert.equal(active.length, 1);
      assert.equal(active[0].dataset.gameSort, field);
      assert.equal(active[0].icon.textContent, direction === "asc" ? "↑" : "↓");
      assert.ok(app.caption.textContent.includes(active[0].dataset.sortLabel));
      const orders = {
        video: ["älteste zuerst", "neueste zuerst"], release: ["älteste zuerst", "neueste zuerst"],
        title: ["A–Z", "Z–A"], duration: ["kürzeste zuerst", "längste zuerst"],
      };
      assert.ok(app.caption.textContent.endsWith(orders[field][direction === "asc" ? 0 : 1]));
      assert.equal(app.sorting.textContent, `Sortierung: ${active[0].dataset.sortLabel}: ${orders[field][direction === "asc" ? 0 : 1]}`);
      assert.equal(app.count.textContent, "5 von 5 Spielen");
    }
  }
});

test("kombiniert System und Genre mit UND, erhält Sortierung und meldet leere Trefferlisten", () => {
  const app = setup();
  app.platform.value = "DOS";
  app.genre.value = "Adventure";
  app.update();
  assert.deepEqual(app.visible(), ["Alpha", "Beta", "Teilweise"]);
  assert.equal(app.count.textContent, "3 von 5 Spielen");
  assert.equal(app.filters.textContent, "Filter: DOS · Adventure");
  assert.equal(app.sorting.textContent, "Sortierung: Erstes Video: neueste zuerst");
  app.sortBy("title", "asc");
  app.genre.value = "Action";
  app.update();
  assert.deepEqual(app.visible(), ["Alpha"]);
  assert.equal(app.count.textContent, "1 von 5 Spielen");
  assert.equal(app.filters.textContent, "Filter: DOS · Action");
  assert.equal(app.sorting.textContent, "Sortierung: Titel (Alphabet): A–Z");
  app.genre.value = "Simulation";
  app.update();
  assert.deepEqual(app.visible(), []);
  assert.equal(app.count.textContent, "0 von 5 Spielen");
  assert.equal(app.filters.textContent, "Filter: DOS · Simulation");
  assert.equal(app.sorting.textContent, "Sortierung: Titel (Alphabet): A–Z");
  assert.equal(app.empty.hidden, false);
  app.platform.value = "";
  app.genre.value = "";
  app.update();
  assert.equal(app.visible().length, 5);
  assert.equal(app.empty.hidden, true);
});

test("Kopf-Schaltflächen wechseln die Richtung und deaktivieren den vorherigen Sortierpfeil", () => {
  const app = setup();
  const video = app.buttons.find((button) => button.dataset.gameSort === "video");
  const title = app.buttons.find((button) => button.dataset.gameSort === "title");
  assert.equal(video.icon.textContent, "↓");
  assert.ok(app.buttons.every((button) => !button.hidden));
  video.dispatchEvent(new Event("click"));
  assert.equal(video.icon.textContent, "↑");
  assert.match(video.attributes["aria-label"], /absteigend sortieren$/u);
  title.dispatchEvent(new Event("click"));
  assert.equal(title.icon.textContent, "↑");
  assert.equal(video.icon.textContent, "↕");
  assert.equal(video.parentElement.attributes["aria-sort"], undefined);
  title.dispatchEvent(new Event("click"));
  assert.equal(title.icon.textContent, "↓");
  assert.match(title.attributes["aria-label"], /aufsteigend sortieren$/u);
});

test("kombiniert Titelsuche mit Filtern und setzt alle Filter ohne Sortieränderung zurück", () => {
  const app = setup();
  app.platform.value = "DOS";
  app.genre.value = "Adventure";
  app.search.value = "  ALP  ";
  app.search.dispatchEvent(new Event("input"));
  assert.deepEqual(app.visible(), ["Alpha"]);
  assert.equal(app.count.textContent, "1 von 5 Spielen");
  assert.equal(app.filters.textContent, "Filter: DOS · Adventure · Titel: ALP");
  app.search.value = "Gamma";
  app.search.dispatchEvent(new Event("input"));
  assert.deepEqual(app.visible(), []);
  assert.equal(app.empty.hidden, false);
  app.sortBy("title", "desc");
  app.reset.dispatchEvent(new Event("click"));
  assert.equal(app.search.value, "");
  assert.equal(app.platform.value, "");
  assert.equal(app.genre.value, "");
  assert.deepEqual(app.visible(), ["Unbekannt", "Teilweise", "Gamma", "Beta", "Alpha"]);
  assert.equal(app.empty.hidden, true);
});

test("filtert unbekannte Metadaten ausdrücklich und ändert sonstige Seiten nicht", () => {
  const app = setup();
  app.platform.value = "__unknown__";
  app.genre.value = "__unknown__";
  app.update();
  assert.deepEqual(app.visible(), ["Unbekannt"]);
  assert.doesNotThrow(() => runInNewContext(script, { document: { querySelector: () => null } }));
});
