import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../src/video-series.js", import.meta.url), "utf8");
const preferenceKey = "pretty-old-pixel:youtube-player-enabled";

class Element extends EventTarget {
  attributes = new Map();
  dataset = {};
  style = {};
  hidden = true;
  textContent = "";
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  get src() { return this.attributes.get("src") ?? ""; }
  set src(value) { this.setAttribute("src", value); }
  get srcdoc() { return this.attributes.get("srcdoc") ?? ""; }
  set srcdoc(value) { this.setAttribute("srcdoc", value); }
  getBoundingClientRect() { return { top: 100 }; }
  focus() {}
  scrollIntoView() {}
}

function click(element, modifiers = {}) {
  const event = new Event("click", { cancelable: true });
  Object.assign(event, { button: 0, ...modifiers });
  element.dispatchEvent(event);
  return event;
}

function setup({ values = new Map(), storage, hash = "" } = {}) {
  const player = new Element();
  const posterLink = new Element();
  const activationLink = new Element();
  const reset = new Element();
  const notice = new Element();
  const preferenceNote = new Element();
  const menu = new Element();
  const events = new EventTarget();
  const warnings = [];
  const panels = ["first", "second"].map((id) => {
    const panel = new Element();
    panel.id = `video-${id}`;
    panel.dataset = { poster: `poster-${id}`, playerUrl: `https://www.youtube-nocookie.com/embed/${id}` };
    panel.querySelector = () => ({ textContent: id });
    return panel;
  });
  const links = panels.map((panel) => Object.assign(new Element(), { hash: `#${panel.id}` }));
  player.srcdoc = panels[0].dataset.poster;
  Object.defineProperty(player, "contentDocument", {
    get: () => player.src ? null : { querySelector: () => posterLink },
  });
  const series = {
    dataset: { title: "Spiel" },
    querySelectorAll: (selector) => ({
      "[data-video-panel]": panels, "[data-video-link]": links, "[data-player-activate]": [activationLink],
    })[selector],
    querySelector: (selector) => ({
      iframe: player, ".episode-menu": menu,
      "[data-player-reset]": reset, "[data-player-notice]": notice,
      "[data-player-preference-note]": preferenceNote,
    })[selector],
    classList: { add() {} },
  };
  const location = { hash };
  runInNewContext(script, {
    document: { querySelectorAll: () => [series], readyState: "complete" },
    localStorage: storage ?? {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    location,
    matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
    requestAnimationFrame: (callback) => callback(),
    addEventListener: events.addEventListener.bind(events),
    console: { warn: (...args) => warnings.push(args) },
  });
  return {
    player, posterLink, activationLink, reset, notice, preferenceNote, values, panels, warnings,
    select: (index) => {
      location.hash = `#${panels[index].id}`;
      events.dispatchEvent(new Event("hashchange"));
    },
  };
}

test("lädt ohne gespeicherte Aktivierung nur Vorschaubilder, auch bei Fragmentwechseln", () => {
  const state = setup();
  assert.equal(state.player.src, "");
  assert.equal(state.player.srcdoc, "poster-first");
  assert.equal(state.reset.hidden, true);
  assert.equal(state.preferenceNote.hidden, false);
  state.select(1);
  assert.equal(state.player.src, "");
  assert.equal(state.player.srcdoc, "poster-second");
  assert.equal(state.values.size, 0);
});

test("merkt die Aktivierung aus dem Vorschaubild und lädt spätere Seiten ohne Autoplay", () => {
  const state = setup();
  assert.equal(click(state.posterLink).defaultPrevented, true);
  assert.equal(state.values.get(preferenceKey), "true");
  assert.equal(state.player.srcdoc, "");
  assert.equal(state.player.src, state.panels[0].dataset.playerUrl);
  assert.equal(state.reset.hidden, false);
  state.select(1);
  assert.equal(state.player.src, state.panels[1].dataset.playerUrl);
  const nextPage = setup({ values: state.values, hash: "#video-second" });
  assert.equal(nextPage.player.src, nextPage.panels[1].dataset.playerUrl);
  assert.equal(nextPage.player.srcdoc, "");
  assert.ok(!nextPage.player.src.includes("autoplay"));
});

test("merkt auch die explizite Aktivierung unter dem Video, aber keinen Klick mit Zusatztaste", () => {
  const state = setup();
  assert.equal(click(state.activationLink, { ctrlKey: true }).defaultPrevented, false);
  assert.equal(state.values.size, 0);
  assert.equal(state.player.src, "");
  click(state.activationLink);
  assert.equal(state.values.get(preferenceKey), "true");
  assert.equal(state.player.src, state.panels[0].dataset.playerUrl);
});

test("setzt die Aktivierung zurück und zeigt auf folgenden Seiten wieder ein Vorschaubild", () => {
  const values = new Map([[preferenceKey, "true"]]);
  const state = setup({ values });
  state.select(1);
  click(state.reset);
  assert.equal(values.has(preferenceKey), false);
  assert.equal(state.player.src, "");
  assert.equal(state.player.srcdoc, "poster-second");
  assert.equal(state.reset.hidden, true);
  state.select(0);
  assert.equal(state.player.srcdoc, "poster-first");
  assert.equal(setup({ values }).player.src, "");
});

test("meldet gesperrten Browser-Speicher und hält die manuelle Wiedergabe nutzbar", () => {
  const blocked = () => { throw new Error("Storage blocked"); };
  const state = setup({ storage: { getItem: blocked, setItem: blocked, removeItem: blocked } });
  assert.equal(state.notice.hidden, false);
  assert.ok(state.notice.textContent.includes("nicht verfügbar"));
  assert.equal(state.warnings.length, 1);
  assert.equal(state.player.src, "");
  click(state.posterLink);
  assert.equal(state.player.src, state.panels[0].dataset.playerUrl);
  assert.equal(state.warnings.length, 2);
  click(state.reset);
  assert.equal(state.player.src, "");
  assert.equal(state.player.srcdoc, "poster-first");
  assert.equal(state.warnings.length, 3);
});
