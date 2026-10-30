import { updatePreview } from "./preview.mjs";

let apiPromise;
async function youtubeApi() {
  if (globalThis.YT?.Player) return globalThis.YT;
  if (!apiPromise) apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const previous = globalThis.onYouTubeIframeAPIReady;
    const finish = (error) => {
      clearTimeout(timer);
      if (globalThis.onYouTubeIframeAPIReady === ready) globalThis.onYouTubeIframeAPIReady = previous;
      if (error) { script.remove(); apiPromise = undefined; reject(error); }
      else resolve(globalThis.YT);
    };
    const ready = () => { previous?.(); finish(); };
    const timer = setTimeout(() => finish(new Error("YouTube antwortet nicht. Bitte versuche es erneut.")), 10000);
    globalThis.onYouTubeIframeAPIReady = ready;
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => finish(new Error("YouTube-Player konnte nicht geladen werden."));
    document.head.append(script);
  });
  return apiPromise;
}

export function setupPlayer(view, preferences, next) {
  const root = document.querySelector("#app-player");
  if (!root) return () => {};
  const enable = document.querySelector("#app-player-enable");
  const reset = document.querySelector("#app-player-reset");
  const auto = document.querySelector("#app-auto-next");
  const notice = document.querySelector("#app-player-notice");
  let controller;
  let disposed = false;
  let busy = false;
  let readyTimer;
  let played = false;
  let revision = 0;
  function report(error) { console.warn(error); notice.textContent = error.message; }
  function preview() {
    root.innerHTML = '<img width="320" height="180" alt="Videovorschau">';
    notice.textContent = navigator.onLine ? "Der Player wird erst nach der Aktivierung geladen. Videos benötigen eine Internetverbindung." : "Du bist offline. Gespeicherte Vorschaubilder sind verfügbar. Videos benötigen eine Internetverbindung.";
    const image = root.querySelector("img");
    if (image) updatePreview(image, view.selected.thumbnailUrl);
    image?.addEventListener("error", () => {
      notice.textContent = "Das Vorschaubild ist nicht erreichbar. Bitte prüfe deine Internetverbindung.";
    }, { once: true });
    enable.hidden = false;
    reset.hidden = true;
  }
  async function activate() {
    if (busy || disposed) return;
    if (!navigator.onLine) { preview(); return; }
    busy = true;
    const request = ++revision;
    enable.disabled = true;
    notice.textContent = "YouTube-Player wird geladen …";
    try {
      const YT = await youtubeApi();
      if (disposed || request !== revision) return;
      root.innerHTML = "<div id=\"app-youtube-frame\"></div>";
      controller = new YT.Player("app-youtube-frame", {
        host: "https://www.youtube-nocookie.com", videoId: view.selected.id,
        playerVars: { autoplay: 0, start: view.seconds ?? 0, origin: location.origin, playsinline: 1 },
        events: {
          onReady() {
            clearTimeout(readyTimer);
            if (disposed || request !== revision) return;
            notice.textContent = "";
            enable.hidden = true;
            reset.hidden = false;
            if (auto) auto.disabled = false;
            if (view.autoplay) controller.playVideo();
          },
          onStateChange(event) {
            if (event.data === 1) played = true;
            if (event.data === 0 && played && auto?.checked && !disposed && request === revision) next();
          },
          onError() {
            if (disposed || request !== revision) return;
            clearTimeout(readyTimer);
            report(new Error("Das Video konnte nicht abgespielt werden. Versuche es erneut oder nutze den YouTube-Link."));
            controller?.destroy(); controller = undefined;
            enable.hidden = false;
          },
        },
      });
      readyTimer = setTimeout(() => {
        if (disposed) return;
        controller?.destroy(); controller = undefined;
        enable.hidden = false;
        report(new Error("Der Player konnte nicht rechtzeitig gestartet werden. Bitte versuche es erneut."));
      }, 15000);
    } catch (error) { report(error); }
    finally { busy = false; enable.disabled = false; }
  }
  enable.addEventListener("click", () => { preferences.set("player", true); activate(); });
  reset.addEventListener("click", () => {
    revision += 1;
    clearTimeout(readyTimer);
    preferences.set("player", false);
    controller?.destroy(); controller = undefined;
    if (auto) auto.disabled = true;
    preview();
  });
  if (auto) {
    auto.checked = preferences.get("autonext") === true;
    auto.disabled = true;
    auto.addEventListener("change", () => preferences.set("autonext", auto.checked));
  }
  const connectivity = () => {
    if (!navigator.onLine) {
      controller?.destroy(); controller = undefined; clearTimeout(readyTimer);
      if (auto) auto.disabled = true;
      preview();
    } else if (!controller) preview();
  };
  addEventListener("offline", connectivity);
  addEventListener("online", connectivity);
  preview();
  if (preferences.get("player") === true) activate();
  return () => {
    disposed = true;
    clearTimeout(readyTimer);
    controller?.destroy();
    removeEventListener("offline", connectivity);
    removeEventListener("online", connectivity);
  };
}
