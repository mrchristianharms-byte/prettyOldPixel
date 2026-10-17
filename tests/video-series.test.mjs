import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../src/video-series.js", import.meta.url), "utf8");
const preferenceKey = "pretty-old-pixel:youtube-player-enabled";
const flush = () => new Promise((resolve) => setImmediate(resolve));

class Element extends EventTarget {
  attributes = new Map();
  dataset = {};
  style = {};
  hidden = true;
  checked = false;
  disabled = true;
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
  remove() {}
}

function click(element, modifiers = {}) {
  const event = new Event("click", { cancelable: true });
  Object.assign(event, { button: 0, ...modifiers });
  element.dispatchEvent(event);
  return event;
}

function setup({ values = new Map(), storage, hash = "", search = "", game = true, undated = [], apiFails = false, playerReady = true } = {}) {
  const posterLink = new Element();
  const activationLink = new Element();
  const reset = new Element();
  const notice = new Element();
  const preferenceNote = new Element();
  const autoNext = game ? new Element() : null;
  const manualPlay = new Element();
  const controls = new Element();
  const hint = new Element();
  const menu = new Element();
  const events = new EventTarget();
  const warnings = [];
  const requests = [];
  const calls = [];
  const timers = new Map();
  const instances = [];
  const window = {};
  const slot = {};
  const location = {
    hash, origin: "https://example.com", search,
    get href() { return `${this.origin}/spiele/test/${this.search}${this.hash}`; },
  };
  const updateAddress = (_state, _title, value) => {
    const url = new URL(value, location.href);
    location.hash = url.hash;
    location.search = url.search;
  };
  function makePlayer(attributes = new Map()) {
    const player = new Element();
    player.attributes = new Map(attributes);
    Object.defineProperty(player, "contentDocument", {
      get: () => player.src ? null : { querySelector: () => posterLink },
    });
    player.cloneNode = () => makePlayer(player.attributes);
    player.replaceWith = (replacement) => { slot.player = replacement; };
    return player;
  }
  slot.player = makePlayer();
  const chapterLinks = [];
  const panels = ["first", "second", "third"].map((id, index) => {
    const panel = new Element();
    panel.id = `video-${id}`;
    panel.dataset = {
      poster: `poster-${id}`, playerUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      ...(undated.includes(index) ? {} : { dated: "true" }),
    };
    const chapterLink = new Element();
    chapterLinks.push(chapterLink);
    const chapter = new Element();
    chapter.dataset.chapterSeconds = "90";
    chapter.querySelector = () => chapterLink;
    panel.querySelectorAll = () => [chapter];
    panel.querySelector = () => ({ textContent: id });
    return panel;
  });
  const links = panels.map((panel) => Object.assign(new Element(), { hash: `#${panel.id}` }));
  slot.player.srcdoc = panels[0].dataset.poster;
  const series = {
    dataset: { title: "Spiel" },
    querySelectorAll: (selector) => ({
      "[data-video-panel]": panels, "[data-video-link]": links,
      "[data-player-activate]": [{ querySelector: () => activationLink }], "[data-chapter-hint]": [hint],
    })[selector],
    querySelector: (selector) => ({
      iframe: slot.player, ".episode-menu": menu,
      "[data-player-reset]": reset, "[data-player-notice]": notice,
      "[data-player-preference-note]": preferenceNote, "[data-auto-next]": autoNext,
      "[data-player-play]": manualPlay, "[data-player-controls]": controls,
    })[selector],
    classList: { add() {} },
  };
  class Player {
    constructor(frame, { events: callbacks }) {
      this.callbacks = callbacks;
      this.id = new URL(frame.src).pathname.split("/").at(-1);
      this.state = -1;
      instances.push(this);
      if (playerReady) queueMicrotask(() => this.emit("onReady"));
    }
    emit(name, data) {
      if (name === "onStateChange") this.state = data;
      this.callbacks[name]?.({ target: this, data });
    }
    getVideoData() { return { video_id: this.id }; }
    getPlayerState() { return this.state; }
    cueVideoById(value) { this.id = typeof value === "string" ? value : value.videoId; this.state = 5; calls.push(["cue", value]); }
    loadVideoById(id) { this.id = id; calls.push(["load", id]); }
    seekTo(seconds, allowSeekAhead) { calls.push(["seek", seconds, allowSeekAhead]); }
    playVideo() { calls.push(["play"]); }
    destroy() { calls.push(["destroy"]); }
  }
  const scripts = [];
  runInNewContext(script, {
    window, URL,
    document: {
      querySelectorAll: () => [series], readyState: "complete",
      createElement: () => new Element(),
      head: { append(element) {
        scripts.push(element);
        requests.push(element.src);
        queueMicrotask(() => {
          if (apiFails) element.dispatchEvent(new Event("error"));
          else {
            window.YT = { Player, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 } };
            window.onYouTubeIframeAPIReady?.();
          }
        });
      } },
    },
    localStorage: storage ?? {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    location,
    history: { pushState: updateAddress, replaceState: updateAddress },
    matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
    requestAnimationFrame: (callback) => callback(),
    addEventListener: events.addEventListener.bind(events),
    console: { warn: (...args) => warnings.push(args) },
    setTimeout: (callback) => { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  return {
    get player() { return slot.player; },
    get api() { return instances.at(-1); },
    posterLink, activationLink, reset, notice, preferenceNote, values, panels, warnings,
    autoNext, manualPlay, controls, hint, chapterLinks, requests, calls, instances, location, links, window,
    expire: () => { for (const callback of [...timers.values()]) callback(); },
    select: (index, eventName = "hashchange") => {
      location.hash = `#${panels[index].id}`;
      events.dispatchEvent(new Event(eventName));
    },
    activate: async () => { click(posterLink); await flush(); },
  };
}

test("lädt ohne Aktivierung keine API und nur Vorschaubilder, auch bei Fragmentwechseln", () => {
  const state = setup();
  assert.equal(state.player.src, "");
  assert.equal(state.player.srcdoc, "poster-first");
  assert.equal(state.reset.hidden, true);
  assert.equal(state.preferenceNote.hidden, false);
  state.select(1);
  assert.equal(state.player.src, "");
  assert.equal(state.player.srcdoc, "poster-second");
  assert.equal(state.values.size, 0);
  assert.deepEqual(state.requests, []);
  assert.equal(state.autoNext.checked, false);
  assert.equal(state.autoNext.disabled, true);
  assert.equal(click(state.chapterLinks[1]).defaultPrevented, false);
});

test("merkt Aktivierung und lädt spätere Seiten sowie Fragmente ohne Autoplay", async () => {
  const state = setup();
  await state.activate();
  assert.equal(state.values.get(preferenceKey), "true");
  assert.equal(state.player.srcdoc, "");
  const url = new URL(state.player.src);
  assert.equal(url.origin, "https://www.youtube-nocookie.com");
  assert.equal(url.searchParams.get("enablejsapi"), "1");
  assert.equal(url.searchParams.get("origin"), "https://example.com");
  assert.equal(url.searchParams.has("autoplay"), false);
  assert.equal(state.reset.hidden, false);
  state.select(1);
  assert.deepEqual(state.calls, [["cue", "second"]]);
  assert.equal(state.autoNext.checked, false);
  assert.equal(state.autoNext.disabled, false);
  const nextPage = setup({ values: state.values, hash: "#video-second" });
  await flush();
  assert.equal(new URL(nextPage.player.src).pathname, "/embed/second");
  assert.equal(nextPage.player.srcdoc, "");
  assert.equal(nextPage.autoNext.checked, false);
  assert.deepEqual(nextPage.calls, []);
});

test("aktiviert über den Textlink, aber nicht bei Klick mit Zusatztaste", async () => {
  const state = setup();
  assert.equal(click(state.activationLink, { ctrlKey: true }).defaultPrevented, false);
  assert.equal(state.values.size, 0);
  click(state.activationLink);
  await flush();
  assert.equal(state.values.get(preferenceKey), "true");
  assert.equal(new URL(state.player.src).pathname, "/embed/first");
});

test("Kapitel steuern nur den bereiten aktiven Player und behalten externe Fallbacks", async () => {
  const state = setup();
  assert.equal(click(state.chapterLinks[0]).defaultPrevented, false);
  await state.activate();
  assert.equal(click(state.chapterLinks[0], { metaKey: true }).defaultPrevented, false);
  assert.equal(click(state.chapterLinks[1]).defaultPrevented, false);
  state.api.emit("onStateChange", 2);
  assert.equal(click(state.chapterLinks[0]).defaultPrevented, true);
  assert.deepEqual(state.calls, [["seek", 90, true]]);
  assert.equal(state.location.search, "?t=90");
  assert.ok(state.hint.textContent.includes("im Player"));
  state.api.seekTo = () => { throw new Error("Seek failed"); };
  assert.equal(click(state.chapterLinks[0]).defaultPrevented, false);
  assert.ok(state.notice.textContent.includes("Link öffnet YouTube"));
});

test("ein Kapitelsprung im noch nicht gestarteten Player cue't nur und startet nicht", async () => {
  const state = setup();
  await state.activate();
  assert.equal(click(state.chapterLinks[0]).defaultPrevented, true);
  assert.equal(state.calls[0][0], "cue");
  assert.equal(state.calls[0][1].videoId, "first");
  assert.equal(state.calls[0][1].startSeconds, 90);
  assert.ok(!state.calls.some(([method]) => method === "play" || method === "load"));
});

test("eigene Clip-URLs springen nur zu validierten Marken des gewählten Videos, ohne Autoplay", async () => {
  const state = setup({ hash: "#video-second", search: "?t=90" });
  assert.equal(state.player.src, "");
  await state.activate();
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0][0], "cue");
  assert.equal(state.calls[0][1].videoId, "second");
  assert.equal(state.calls[0][1].startSeconds, 90);
  state.select(0);
  assert.equal(state.location.search, "");
  assert.deepEqual(state.calls.at(-1), ["cue", "first"]);
  for (const search of ["?t=-1", "?t=NaN", "?t=100000", "?t=91", "?t=090"]) {
    const invalid = setup({ values: new Map([[preferenceKey, "true"]]), hash: "#video-first", search });
    await flush();
    assert.deepEqual(invalid.calls, []);
  }
});

test("setzt Aktivierung zurück, zerstört den alten Player und verhindert späte API-Ereignisse", async () => {
  const state = setup();
  await state.activate();
  const old = state.api;
  state.select(1);
  state.autoNext.checked = true;
  click(state.reset);
  assert.equal(state.values.has(preferenceKey), false);
  assert.equal(state.player.src, "");
  assert.equal(state.player.srcdoc, "poster-second");
  assert.equal(state.reset.hidden, true);
  assert.equal(state.autoNext.checked, false);
  old.emit("onReady");
  old.emit("onStateChange", 1);
  old.emit("onStateChange", 0);
  assert.equal(state.autoNext.disabled, true);
  state.select(0);
  assert.equal(state.player.srcdoc, "poster-first");
  await state.activate();
  assert.equal(state.requests.length, 1);
  assert.equal(state.instances.length, 2);
  assert.deepEqual(state.calls, [["cue", "second"], ["destroy"]]);
});

test("meldet gesperrten Speicher, API-Ladefehler und nicht antwortende Player explizit", async () => {
  const blocked = () => { throw new Error("Storage blocked"); };
  const state = setup({ storage: { getItem: blocked, setItem: blocked, removeItem: blocked } });
  assert.equal(state.notice.hidden, false);
  assert.ok(state.notice.textContent.includes("nicht verfügbar"));
  assert.equal(state.warnings.length, 1);
  await state.activate();
  assert.equal(new URL(state.player.src).pathname, "/embed/first");
  assert.equal(state.warnings.length, 2);
  click(state.reset);
  assert.equal(state.player.src, "");
  assert.equal(state.warnings.length, 3);
  const failed = setup({ apiFails: true });
  await failed.activate();
  assert.equal(failed.autoNext.disabled, true);
  assert.ok(failed.notice.textContent.includes("nicht verfügbar"));
  assert.equal(click(failed.chapterLinks[0]).defaultPrevented, false);
  assert.ok(failed.player.src.includes("youtube-nocookie.com"));
  const stalled = setup({ playerReady: false });
  await stalled.activate();
  stalled.expire();
  assert.equal(stalled.autoNext.disabled, true);
  assert.ok(stalled.notice.textContent.includes("antwortet nicht"));
});

test("setzt ausschließlich nach Start, Opt-in und echtem ENDED in derselben datierten Spielereihe fort", async () => {
  const state = setup();
  await state.activate();
  state.api.emit("onStateChange", 1);
  state.api.emit("onStateChange", 0);
  assert.deepEqual(state.calls, []);
  state.select(0);
  state.autoNext.checked = true;
  state.api.emit("onStateChange", 0);
  assert.deepEqual(state.calls, []);
  state.api.emit("onStateChange", 1);
  state.api.emit("onStateChange", 2);
  assert.deepEqual(state.calls, []);
  state.api.emit("onStateChange", 0);
  assert.deepEqual(state.calls, [["load", "second"]]);
  assert.equal(state.location.hash, "#video-second");
  assert.equal(state.panels[0].hidden, true);
  assert.equal(state.panels[1].hidden, false);
  assert.equal(state.links[1].attributes.get("aria-current"), "true");
  state.api.emit("onStateChange", 0);
  assert.equal(state.calls.length, 1);
  state.api.emit("onStateChange", 1);
  state.api.emit("onStateChange", 0);
  assert.deepEqual(state.calls.at(-1), ["load", "third"]);
  state.api.emit("onStateChange", 1);
  state.api.emit("onStateChange", 0);
  assert.equal(state.calls.length, 2);
  assert.equal(state.autoNext.checked, false);
  assert.ok(state.notice.textContent.includes("Ende"));
});

test("respektiert Ausschalten, manuelle Auswahl, Zurücknavigation und unbekannte Datumswerte", async () => {
  const state = setup({ undated: [2] });
  await state.activate();
  state.autoNext.checked = true;
  state.api.emit("onStateChange", 1);
  state.autoNext.checked = false;
  state.api.emit("onStateChange", 0);
  assert.deepEqual(state.calls, []);
  state.autoNext.checked = true;
  state.select(1);
  state.api.emit("onStateChange", 0);
  assert.deepEqual(state.calls, [["cue", "second"]]);
  state.api.emit("onStateChange", 1);
  state.api.emit("onStateChange", 0);
  assert.equal(state.autoNext.checked, false);
  assert.ok(state.notice.textContent.includes("ohne Veröffentlichungsdatum"));
  state.select(0, "popstate");
  assert.deepEqual(state.calls.at(-1), ["cue", "first"]);
  const issue = setup({ game: false });
  await issue.activate();
  issue.api.emit("onStateChange", 1);
  issue.api.emit("onStateChange", 0);
  assert.deepEqual(issue.calls, []);
});

test("behandelt Autoplay-Sperren und Playerfehler ohne Weiterleitungsschleife", async () => {
  const state = setup();
  await state.activate();
  state.autoNext.checked = true;
  state.api.emit("onStateChange", 1);
  state.api.emit("onStateChange", 0);
  state.api.emit("onAutoplayBlocked");
  assert.equal(state.autoNext.checked, false);
  assert.equal(state.manualPlay.hidden, false);
  assert.ok(state.notice.textContent.includes("blockiert"));
  click(state.manualPlay);
  assert.deepEqual(state.calls.at(-1), ["play"]);
  state.api.emit("onStateChange", 1);
  assert.equal(state.manualPlay.hidden, true);
  state.api.emit("onError", 150);
  assert.equal(state.autoNext.disabled, true);
  assert.ok(state.notice.textContent.includes("150"));
  state.api.emit("onStateChange", 0);
  assert.equal(state.location.hash, "#video-second");
});

test("ignoriert überholte API-Initialisierung bei schneller Auswahl oder Zurücksetzen", async () => {
  const state = setup();
  click(state.posterLink);
  state.select(1);
  await flush();
  assert.equal(state.instances.length, 1);
  assert.equal(state.api.id, "second");
  assert.equal(state.requests.length, 1);
  const reset = setup();
  click(reset.posterLink);
  click(reset.reset);
  await flush();
  assert.equal(reset.instances.length, 0);
  assert.equal(reset.player.src, "");
});

test("behandelt API-Ladezeitüberschreitungen und Ereignisse fremder Videos ohne Fortsetzung", async () => {
  const timedOut = setup();
  click(timedOut.posterLink);
  timedOut.expire();
  await flush();
  assert.equal(timedOut.autoNext.disabled, true);
  assert.ok(timedOut.notice.textContent.includes("nicht verfügbar"));
  assert.equal(click(timedOut.chapterLinks[0]).defaultPrevented, false);
  const state = setup();
  await state.activate();
  state.autoNext.checked = true;
  state.api.id = "stale";
  state.api.emit("onStateChange", 1);
  state.api.emit("onStateChange", 0);
  assert.deepEqual(state.calls, []);
  assert.equal(state.location.hash, "");
});
