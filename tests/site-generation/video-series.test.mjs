import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../../src/site-generation/video-series.js", import.meta.url), "utf8");
const preferenceKey = "pretty-old-pixel:youtube-player-enabled";
const autoNextKey = "pretty-old-pixel:youtube-auto-next";
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

function setup({ values = new Map(), storage, hash = "", search = "", videoIds = ["first", "second", "third"], undated = [], apiFails = false, playerReady = true, timestampSeconds = "90" } = {}) {
  const posterLink = new Element();
  const reset = new Element();
  const notice = new Element();
  const preferenceNote = new Element();
  const previewNote = new Element();
  previewNote.hidden = false;
  const autoNext = new Element();
  const manualPlay = new Element();
  const controls = new Element();
  const externalVideo = new Element();
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
  const panels = videoIds.map((id, index) => {
    const panel = new Element();
    panel.id = `video-${id}`;
    panel.dataset = {
      poster: `poster-${id}`, playerUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      videoUrl: `https://www.youtube.com/watch?v=${id}`,
      ...(undated.includes(index) ? {} : { dated: "true" }),
    };
    const chapterLink = new Element();
    chapterLinks.push(chapterLink);
    const chapter = new Element();
    chapter.dataset.chapterSeconds = timestampSeconds;
    chapter.querySelector = () => chapterLink;
    panel.querySelectorAll = () => [chapter];
    panel.querySelector = () => ({ textContent: id });
    return panel;
  });
  const links = panels.map((panel) => Object.assign(new Element(), { hash: `#${panel.id}` }));
  const list = new Element();
  list.scrollTop = 0;
  list.getBoundingClientRect = () => ({ top: 100, bottom: 300 });
  menu.querySelector = () => list;
  links.forEach((link, index) => {
    link.closest = () => ({
      getBoundingClientRect: () => ({
        top: 100 + index * 60 - list.scrollTop,
        bottom: 160 + index * 60 - list.scrollTop,
      }),
    });
  });
  slot.player.srcdoc = panels[0].dataset.poster;
  const series = {
    dataset: { title: "Spiel" },
    querySelectorAll: (selector) => ({
      "[data-video-panel]": panels, "[data-video-link]": links,
      "[data-chapter-hint]": [hint],
    })[selector],
    querySelector: (selector) => ({
      iframe: slot.player, ".episode-menu": menu,
      "[data-player-reset]": reset, "[data-player-notice]": notice,
      "[data-player-preference-note]": preferenceNote, "[data-auto-next]": autoNext,
      "[data-player-preview-note]": previewNote,
      "[data-player-play]": manualPlay, "[data-player-controls]": controls,
      "[data-player-external] a": externalVideo,
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
    posterLink, reset, notice, preferenceNote, previewNote, values, panels, warnings,
    autoNext, manualPlay, controls, externalVideo, hint, chapterLinks, requests, calls, instances, location, links, window, menu, list,
    expire: () => { for (const callback of [...timers.values()]) callback(); },
    select: (index, eventName = "hashchange") => {
      location.hash = `#${panels[index].id}`;
      events.dispatchEvent(new Event(eventName));
    },
    activate: async () => { click(posterLink); await flush(); },
  };
}

test("markiert Hash-Einstiege und hält aktive Folgen in langen Listen sichtbar", () => {
  const videoIds = Array.from({ length: 60 }, (_, index) => `part-${index}`);
  const state = setup({ videoIds, hash: "#video-part-49" });
  assert.equal(state.links[49].attributes.get("aria-current"), "true");
  assert.equal(state.list.scrollTop, 2800);
  assert.equal(state.panels[49].hidden, false);
  assert.equal(state.requests.length, 0);
  state.select(0);
  assert.equal(state.list.scrollTop, 0);
  assert.equal(state.links[49].attributes.get("aria-current"), undefined);
  assert.equal(state.links[0].attributes.get("aria-current"), "true");
  state.select(59, "popstate");
  assert.equal(state.list.scrollTop, 3400);
  state.list.scrollTop = 0;
  state.menu.open = true;
  state.menu.dispatchEvent(new Event("toggle"));
  assert.equal(state.list.scrollTop, 3400);
});

test("lädt ohne Aktivierung keine API und nur Vorschaubilder, auch bei Fragmentwechseln", () => {
  const state = setup();
  assert.equal(state.player.src, "");
  assert.equal(state.player.srcdoc, "poster-first");
  assert.equal(state.reset.hidden, true);
  assert.equal(state.preferenceNote.hidden, false);
  assert.equal(state.previewNote.hidden, false);
  state.select(1);
  assert.equal(state.externalVideo.href, "https://www.youtube.com/watch?v=second");
  assert.equal(state.player.src, "");
  assert.equal(state.player.srcdoc, "poster-second");
  assert.equal(state.values.size, 0);
  assert.deepEqual(state.requests, []);
  assert.equal(state.autoNext.checked, false);
  assert.equal(state.autoNext.disabled, true);
  assert.equal(click(state.chapterLinks[1]).defaultPrevented, false);
});

test("aktualisiert den YouTube-Link bei Auswahl, Zurücknavigation und automatischer Folge", async () => {
  const state = setup();
  assert.equal(state.externalVideo.href, "https://www.youtube.com/watch?v=first");
  state.select(2);
  assert.equal(state.externalVideo.href, "https://www.youtube.com/watch?v=third");
  state.select(0, "popstate");
  assert.equal(state.externalVideo.href, "https://www.youtube.com/watch?v=first");
  await state.activate();
  state.autoNext.checked = true;
  state.api.emit("onStateChange", 1);
  state.api.emit("onStateChange", 0);
  assert.equal(state.externalVideo.href, "https://www.youtube.com/watch?v=second");
});

test("merkt Ein- und Ausschalten der Folgenfortsetzung über Seitenaufrufe ohne Startautoplay", async () => {
  const state = setup();
  await state.activate();
  state.autoNext.checked = true;
  state.autoNext.dispatchEvent(new Event("change"));
  assert.equal(state.values.get(autoNextKey), "true");
  const next = setup({ values: state.values });
  await flush();
  assert.equal(next.autoNext.checked, true);
  assert.equal(next.autoNext.disabled, false);
  assert.deepEqual(next.calls, []);
  assert.equal(new URL(next.player.src).searchParams.has("autoplay"), false);
  next.autoNext.checked = false;
  next.autoNext.dispatchEvent(new Event("change"));
  assert.equal(next.values.get(autoNextKey), "false");
  const off = setup({ values: state.values });
  await flush();
  assert.equal(off.autoNext.checked, false);
  const issue = setup({ values: state.values, videoIds: ["issue-first", "issue-second"] });
  await flush();
  assert.equal(issue.autoNext.checked, false);
  assert.equal(issue.externalVideo.href, "https://www.youtube.com/watch?v=issue-first");
});

test("ändert gespeicherte Folgenauswahl nicht bei Sicherheitsstopps und Aktivierungsreset", async () => {
  const values = new Map([[preferenceKey, "true"], [autoNextKey, "true"]]);
  const state = setup({ values });
  await flush();
  state.api.emit("onAutoplayBlocked");
  assert.equal(state.autoNext.checked, false);
  assert.equal(values.get(autoNextKey), "true");
  click(state.reset);
  assert.equal(values.has(preferenceKey), false);
  assert.equal(values.get(autoNextKey), "true");
  state.player.dispatchEvent(new Event("load"));
  await state.activate();
  assert.equal(state.autoNext.checked, true);
  state.select(2);
  state.api.emit("onStateChange", 1);
  state.api.emit("onStateChange", 0);
  assert.equal(state.autoNext.checked, false);
  assert.equal(values.get(autoNextKey), "true");
});

test("meldet Fehler beim Speichern der Folgenauswahl und behält sie auf der Seite", async () => {
  const state = setup({ storage: {
    getItem: (key) => key === preferenceKey ? "true" : null,
    setItem: () => { throw new Error("Storage full"); },
    removeItem() {},
  } });
  await flush();
  state.autoNext.checked = true;
  state.autoNext.dispatchEvent(new Event("change"));
  assert.equal(state.autoNext.checked, true);
  assert.equal(state.notice.hidden, false);
  assert.equal(state.warnings.length, 1);
});

test("merkt Aktivierung und lädt spätere Seiten sowie Fragmente ohne Autoplay", async () => {
  const state = setup();
  await state.activate();
  assert.equal(state.previewNote.hidden, true);
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

test("aktiviert über das Vorschaubild, aber nicht bei Klick mit Zusatztaste", async () => {
  const state = setup();
  assert.equal(click(state.posterLink, { ctrlKey: true }).defaultPrevented, false);
  assert.equal(state.values.size, 0);
  click(state.posterLink);
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

test("Spielebesprechungs-Sprungmarken nutzen die gemeinsame Zeitmarkensteuerung ohne zusätzliche Freigabe", async () => {
  const state = setup({ timestampSeconds: "12" });
  assert.equal(click(state.chapterLinks[0]).defaultPrevented, false);
  assert.equal(state.values.size, 0);
  await state.activate();
  state.api.emit("onStateChange", 1);
  assert.equal(click(state.chapterLinks[0]).defaultPrevented, true);
  assert.deepEqual(state.calls, [["seek", 12, true]]);
  assert.equal(state.location.search, "?t=12");
  assert.equal(click(state.chapterLinks[0], { ctrlKey: true }).defaultPrevented, false);
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
  assert.equal(state.previewNote.hidden, false);
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
  const issue = setup({ videoIds: ["issue-first", "issue-second"] });
  await issue.activate();
  issue.api.emit("onStateChange", 1);
  issue.api.emit("onStateChange", 0);
  assert.deepEqual(issue.calls, []);
});

test("setzt dieselbe gemerkte Option in Heftausgaben ein und stoppt nach deren letztem Videoteil", async () => {
  const values = new Map([[preferenceKey, "true"], [autoNextKey, "true"]]);
  const issue = setup({ values, videoIds: ["issue-first", "issue-second"] });
  await flush();
  assert.equal(issue.autoNext.checked, true);
  assert.deepEqual(issue.calls, []);
  issue.api.emit("onStateChange", 1);
  issue.api.emit("onStateChange", 0);
  assert.deepEqual(issue.calls, [["load", "issue-second"]]);
  assert.equal(issue.externalVideo.href, "https://www.youtube.com/watch?v=issue-second");
  issue.api.emit("onStateChange", 1);
  issue.api.emit("onStateChange", 0);
  assert.equal(issue.calls.length, 1);
  assert.equal(issue.autoNext.checked, false);
  assert.ok(issue.notice.textContent.includes("Ende dieser Videoreihe"));
  assert.equal(values.get(autoNextKey), "true");
  const single = setup({ values, videoIds: ["only-issue-video"] });
  await flush();
  single.api.emit("onStateChange", 1);
  single.api.emit("onStateChange", 0);
  assert.deepEqual(single.calls, []);
  assert.equal(single.autoNext.checked, false);
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
