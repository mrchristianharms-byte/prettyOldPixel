import assert from "node:assert/strict";
import test from "node:test";
import { setupPlayer } from "../src/app-generation/player.js";
import { setupOffline } from "../src/app-generation/offline.js";
import { updatePreview, offlinePreview } from "../src/app-generation/preview.mjs";

function globals(values) {
  const previous = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  return () => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
}

class Element extends EventTarget {
  hidden = false;
  disabled = false;
  checked = false;
  textContent = "";
  innerHTML = "";
  attributes = new Map();
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  querySelector() { return null; }
}

test("App-Player startet nicht beim Seitenaufruf und setzt Folgen erst nach Wiedergabe fort", async () => {
  const elements = new Map(["#app-player", "#app-player-enable", "#app-player-reset", "#app-auto-next", "#app-player-notice"]
    .map((selector) => [selector, new Element()]));
  let events, starts = 0, next = 0, destroyed = 0;
  const restore = globals({
    document: { querySelector: (selector) => elements.get(selector) },
    navigator: { onLine: true }, location: { origin: "https://example.com" },
    addEventListener() {}, removeEventListener() {},
    YT: { Player: class {
      constructor(id, config) { events = config.events; assert.equal(config.playerVars.autoplay, 0); }
      playVideo() { starts++; }
      destroy() { destroyed++; }
    } },
  });
  const stored = new Map([["player", true], ["autonext", true]]);
  const preferences = { get: (key) => stored.get(key), set: (key, value) => stored.set(key, value) };
  let dispose;
  try {
    dispose = setupPlayer({ selected: { id: "abcdefghijk", thumbnailUrl: "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg" } }, preferences, () => next++);
    await Promise.resolve();
    events.onReady();
    assert.equal(starts, 0);
    events.onStateChange({ data: 0 });
    assert.equal(next, 0);
    events.onStateChange({ data: 1 });
    events.onStateChange({ data: 0 });
    assert.equal(next, 1);
    elements.get("#app-player-reset").dispatchEvent(new Event("click"));
    assert.equal(stored.get("player"), false);
    events.onStateChange({ data: 0 });
    assert.equal(next, 1, "Verspätete Ereignisse nach Reset dürfen nicht fortsetzen");
    assert.equal(destroyed, 1);
  } finally { dispose?.(); restore(); }
});

test("Offline-Kaltstart prüft vorhandenen Cache ohne eine Netz-Updateprüfung vorauszusetzen", async () => {
  const status = new Element(), message = new Element(), retry = new Element(), update = new Element();
  const listeners = new Map(), messages = [];
  let registers = 0;
  const scope = "https://example.com/project/app/";
  const restore = globals({
    document: { querySelector: (selector) => ({ "#offline-status": status, "#offline-message": message, "#offline-retry": retry, "#offline-update": update })[selector] },
    location: { href: scope },
    navigator: {
      onLine: false,
      serviceWorker: {
        controller: { postMessage: (message) => messages.push(message) },
        addEventListener: (event, callback) => listeners.set(event, callback),
        async getRegistration() { return { active: true, scope }; },
        async register() { registers++; throw new Error("Keine Netzverbindung"); },
      },
    },
    addEventListener() {},
  });

  try {
    await setupOffline("v1", () => {});
    assert.equal(registers, 0);
    assert.ok(messages.some((message) => message.type === "STATUS"));
    listeners.get("message")({ data: { type: "STATUS", version: "v1", ready: true } });
    assert.equal(status.textContent, "📴");
    assert.equal(status.attributes.get("aria-label"), "Offline bereit");
    assert.equal(message.textContent, "");
    assert.equal(retry.hidden, true);
    listeners.get("message")({ data: { type: "STATUS", version: "v1", ready: true, thumbnails: { completed: 1, total: 2 } } });
    assert.equal(status.textContent, "📴");
    assert.equal(status.attributes.get("aria-label"), "Offline bereit");
    assert.equal(retry.hidden, false);
    assert.equal(messages.some((message) => message.type === "REPAIR"), false);
    navigator.onLine = true;
    listeners.get("message")({ data: { type: "STATUS", version: "v1", ready: true, thumbnails: { completed: 1, total: 2 } } });
    assert.equal(messages.some((message) => message.type === "REPAIR"), true);
    listeners.get("message")({ data: { type: "STATUS", version: "v1", ready: true, thumbnails: { completed: 2, total: 2 } } });
    assert.equal(retry.hidden, true);
  } finally { restore(); }
});

test("Player-Vorschau bleibt offline lokal und fällt bei Bildfehlern auf denselben Platzhalter zurück", () => {
    const elements = new Map(["#app-player", "#app-player-enable", "#app-player-reset", "#app-auto-next", "#app-player-notice"]
      .map((selector) => [selector, new Element()]));
    const image = new Element();
    elements.get("#app-player").querySelector = () => image;
    const navigatorValue = { onLine: false };
    const restore = globals({
      document: { querySelector: (selector) => elements.get(selector) },
      navigator: navigatorValue,
      addEventListener() {}, removeEventListener() {},
    });
    let dispose;
    try {
      const view = { selected: { id: "abcdefghijk", thumbnailUrl: "https://i.ytimg.com/preview.jpg" } };
      const preferences = { get: () => false };
      dispose = setupPlayer(view, preferences, () => {});
      assert.equal(image.src, view.selected.thumbnailUrl);
      dispose();
      navigatorValue.onLine = true;
      dispose = setupPlayer(view, preferences, () => {});
      assert.equal(image.src, view.selected.thumbnailUrl);
      image.onerror();
      image.dispatchEvent(new Event("error"));
      assert.equal(image.src, offlinePreview);
      assert.match(elements.get("#app-player-notice").textContent, /Vorschaubild nicht erreichbar/u);
    } finally { dispose?.(); restore(); }
  });

test("Reparatur wartet auf eine verzögerte Cache-Prüfung statt auf die schnelle Updateprüfung", async () => {
  const status = new Element(), message = new Element(), retry = new Element(), update = new Element();
    const listeners = new Map(), messages = [];
    let reply;
    let updateFinished = false;
    const worker = {
      postMessage(message) {
        messages.push(message);
        if (message.type === "STATUS" && message.requestId) {
          reply = () => listeners.get("message")({ data: {
            type: "STATUS", requestId: message.requestId, ready: false, version: "v1",
          } });
        }
      },
    };
    const registration = {
      active: worker, addEventListener() {},
      async update() { updateFinished = true; },
    };
    const restore = globals({
      document: { querySelector: (selector) => ({ "#offline-status": status, "#offline-message": message, "#offline-retry": retry, "#offline-update": update })[selector] },
      location: { href: "https://example.com/project/app/" },
      navigator: { onLine: true, serviceWorker: {
        controller: worker,
        addEventListener: (event, callback) => listeners.set(event, callback),
        async getRegistration() { return registration; },
        async register() { return registration; },
      } },
      addEventListener() {},
    });
    try {
      const setup = setupOffline("v1", () => {});
      while (!reply) await new Promise((resolve) => setImmediate(resolve));
      assert.equal(updateFinished, true);
      assert.equal(messages.some((message) => message.type === "REPAIR"), false);
      reply();
      await setup;
      assert.equal(messages.filter((message) => message.type === "REPAIR").length, 1);
    } finally { restore(); }
  });

  test("Vorschau versucht auch offline die Cache-URL und nutzt bei Fehlern den lokalen Platzhalter", () => {
    const image = {};
    updatePreview(image, "https://i.ytimg.com/preview.jpg");
    assert.equal(image.src, "https://i.ytimg.com/preview.jpg");
    image.onerror();
    assert.equal(image.src, offlinePreview);
    assert.equal(image.onerror, null);
    updatePreview(image, "https://i.ytimg.com/preview.jpg");
    assert.equal(image.src, "https://i.ytimg.com/preview.jpg");
    image.onerror();
    assert.equal(image.src, offlinePreview);
    assert.equal(image.onerror, null);
  });
