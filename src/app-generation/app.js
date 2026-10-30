import { hydrateAppData } from "./app-model.mjs";
import { renderView, parseAppRoute, publicAddress, appHref, filterGames, gameCards, gameTableBody } from "./app-views.mjs";
import { escapeHtml } from "../site-generation/site-html.mjs";
import { setupOffline } from "./offline.js";
import { setupPlayer } from "./player.js";
import { updatePreview } from "./preview.mjs";
import "../site-generation/process-diagram.js";

const main = document.querySelector("main");
const release = new URL(document.body.dataset.release, location.href);
const notices = document.querySelector("#offline-message");
const report = (message) => { notices.textContent = message; };
const showError = (error) => {
  console.error(error);
  main.innerHTML = `<h1>App konnte nicht geladen werden</h1><p role="alert">${escapeHtml(error.message)}</p>
<p><a href="#/">Zur App-Startseite</a> · <a href="../">Öffentliche Website</a></p>`;
};
const memory = new Map();
const preferences = {
  get(key) {
    if (memory.has(key)) return memory.get(key);
    try {
      const value = localStorage.getItem(`pretty-old-pixel:app:${key}`);
      return value === null ? undefined : JSON.parse(value);
    } catch (error) {
      console.warn(error);
      report("App-Einstellungen konnten nicht gelesen werden. Änderungen gelten nur für diese Sitzung.");
      return undefined;
    }
  },
  set(key, value) {
    memory.set(key, value);
    try { localStorage.setItem(`pretty-old-pixel:app:${key}`, JSON.stringify(value)); }
    catch (error) {
      console.warn(error);
      report("App-Einstellungen konnten nicht gespeichert werden. Änderungen gelten nur für diese Sitzung.");
    }
  },
};
const theme = preferences.get("theme");
if (["light", "dark"].includes(theme)) document.documentElement.dataset.theme = theme;
else document.documentElement.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
const themeButton = document.querySelector("#app-theme");
function updateThemeButton() {
  const label = document.documentElement.dataset.theme === "dark" ? "Hellen Modus aktivieren" : "Dunklen Modus aktivieren";
  themeButton.setAttribute("aria-label", label);
  themeButton.title = label;
}
updateThemeButton();
themeButton.addEventListener("click", () => {
  const value = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = value;
  updateThemeButton();
  preferences.set("theme", value);
});

const initializing = () => report("Offline-Verwaltung wird noch initialisiert. Bitte kurz warten.");
let offline = { check: initializing, persist: initializing, clear: initializing };
let dispose = () => {};
let current;
let model;
let state;
let autoStartId;
function onlineImages() {
  for (const image of main.querySelectorAll("[data-online-src]")) {
    updatePreview(image, image.dataset.onlineSrc);
  }
}
addEventListener("online", onlineImages);
addEventListener("offline", onlineImages);

function wireGames(view) {
  const form = document.querySelector("#app-game-filters");
  if (!form) return;
  let sort = "video", direction = -1;
  function update() {
    const matches = filterGames(view.games, Object.fromEntries(new FormData(form)));
    document.querySelector("#app-game-count").textContent = `${matches.length} von ${view.games.length} Spielen${matches.length ? "" : " – Keine Treffer"}`;
    document.querySelector("#app-game-results").innerHTML = view.table ? gameTableBody(matches, model, sort, direction) : gameCards(matches, model);
    onlineImages();
    for (const button of main.querySelectorAll("[data-sort]")) button.parentElement.setAttribute("aria-sort",
      button.dataset.sort === sort ? direction === 1 ? "ascending" : "descending" : "none");
  }
  form.addEventListener("input", update);
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("reset", () => setTimeout(update));
  for (const button of main.querySelectorAll("[data-sort]")) button.addEventListener("click", () => {
    direction = sort === button.dataset.sort ? -direction : 1;
    sort = button.dataset.sort;
    update();
  });
}

function render() {
  try {
    const parsed = parseAppRoute(location.hash);
    if (parsed === null && current) { main.focus(); return; }
    state = parsed ?? { route: "", videoId: null, seconds: undefined };
    dispose();
    const view = renderView(model, state);
    view.autoplay = view.selected?.id === autoStartId;
    autoStartId = undefined;
    current = view;
    document.title = `${view.title} | Pretty Old Pixel Offline`;
    main.innerHTML = `<h1>${escapeHtml(view.title)}</h1><p><a href="${escapeHtml(publicAddress(model, state, view))}" rel="external">Auf Website öffnen / Link teilen ↗</a></p>${view.body}`;
    main.focus({ preventScroll: true });
    scrollTo(0, 0);
    for (const image of main.querySelectorAll("[data-local-src]")) {
      if (image.dataset.localSrc) image.src = new URL(`shared/${image.dataset.localSrc}`, release).href;
    }
    onlineImages();
    wireGames(view);
    document.querySelector("#app-video-select")?.addEventListener("change", (event) => {
      location.hash = appHref(state.route, event.target.value);
    });
    const next = () => {
      const index = view.videos.indexOf(view.selected);
      const following = view.videos[index + 1];
      if (view.selected.publishedAt && following?.publishedAt && navigator.onLine) {
        autoStartId = following.id;
        location.hash = appHref(state.route, following.id);
      }
    };
    dispose = setupPlayer(view, preferences, next);
    for (const [selector, action] of [
      ["#app-check-update", () => offline.check?.()],
      ["#app-request-storage", () => offline.persist?.()],
      ["#app-clear", () => offline.clear?.()],
    ]) document.querySelector(selector)?.addEventListener("click", () => Promise.resolve().then(action).catch((error) => {
      console.error(error); report(error.message);
    }));
  } catch (error) { dispose(); showError(error); }
}

document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
});

try {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 20000);
  let response;
  try { response = await fetch(new URL("data.json", release), { signal: abort.signal }); }
  finally { clearTimeout(timer); }
  if (!response.ok) throw new Error(`Katalog konnte nicht geladen werden (HTTP ${response.status}). Bitte mit Internet erneut öffnen.`);
  model = hydrateAppData(await response.json());
  document.querySelector("#app-nav").innerHTML = model.navigation.map((entry) =>
    `<a href="${escapeHtml(appHref(entry.route))}">${escapeHtml(entry.name)}</a>`).join("");
  addEventListener("hashchange", render);
  render();
} catch (error) { showError(error); }
setupOffline(document.body.dataset.version, report).then((controls) => { offline = controls; }).catch((error) => {
  console.error(error);
  report(`Offline-Verwaltung fehlgeschlagen: ${error.message}`);
});
