let youtubeApi;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeApi) {
    youtubeApi = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const finish = (error) => {
        clearTimeout(timer);
        if (window.onYouTubeIframeAPIReady === ready) delete window.onYouTubeIframeAPIReady;
        if (error) {
          script.remove();
          reject(error);
        } else resolve(window.YT);
      };
      const ready = () => finish();
      const timer = setTimeout(() => finish(new Error("Zeitüberschreitung beim Laden der YouTube-IFrame-API.")), 10000);
      window.onYouTubeIframeAPIReady = ready;
      script.src = "https://www.youtube.com/iframe_api";
      script.addEventListener("error", () => finish(new Error("YouTube-IFrame-API konnte nicht geladen werden.")), { once: true });
      document.head.append(script);
    });
  }
  return youtubeApi;
}

for (const series of document.querySelectorAll("[data-video-series]")) {
  const panels = [...series.querySelectorAll("[data-video-panel]")];
  const links = [...series.querySelectorAll("[data-video-link]")];
  let player = series.querySelector("iframe");
  const menu = series.querySelector(".episode-menu");
  const reset = series.querySelector("[data-player-reset]");
  const notice = series.querySelector("[data-player-notice]");
  const preferenceNote = series.querySelector("[data-player-preference-note]");
  const previewNote = series.querySelector("[data-player-preview-note]");
  const autoNext = series.querySelector("[data-auto-next]");
  const manualPlay = series.querySelector("[data-player-play]");
  const controls = series.querySelector("[data-player-controls]");
  const externalVideo = series.querySelector("[data-player-external] a");
  const hints = [...series.querySelectorAll("[data-chapter-hint]")];
  const preferenceKey = "pretty-old-pixel:youtube-player-enabled";
  const autoNextKey = "pretty-old-pixel:youtube-auto-next";
  const narrow = matchMedia("(max-width: 767px)");
  let active;
  let enabled = false;
  let controller;
  let ready = false;
  let played = false;
  let revision = 0;
  let readyTimer;
  let pendingSeek;
  let autoNextEnabled = false;

  function timestampAddress(panel, seconds, replace = false) {
    const url = new URL(location.href);
    url.searchParams.delete("t");
    if (seconds !== undefined) url.searchParams.set("t", seconds);
    url.hash = panel.id;
    history[replace ? "replaceState" : "pushState"](null, "", url.href);
  }

  function report(message, error) {
    console.warn(message, error ?? "");
    notice.textContent = message;
    notice.hidden = false;
  }

  function storageError(error) {
    report("Die Player-Einstellungen sind in diesem Browser nicht verfügbar. Änderungen gelten möglicherweise nur auf dieser Seite.", error);
  }

  try {
    enabled = localStorage.getItem(preferenceKey) === "true";
    if (autoNext) autoNextEnabled = localStorage.getItem(autoNextKey) === "true";
  } catch (error) {
    storageError(error);
  }

  const videoId = (panel) => panel.id.slice("video-".length);
  const plainClick = (event) => event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;

  function apiAvailable(value) {
    ready = value;
    if (autoNext) {
      autoNext.disabled = !value;
      autoNext.checked = value && autoNextEnabled;
    }
    for (const hint of hints) hint.textContent = value
      ? "Kapitel im Player anspringen. Mit Strg-/Befehl-Klick öffnen Sie YouTube."
      : "Ohne aktivierte Player-Steuerung öffnen die Links das Video auf YouTube.";
  }

  function replacePlayer() {
    clearTimeout(readyTimer);
    const replacement = player.cloneNode(false);
    player.replaceWith(replacement);
    controller?.destroy();
    controller = undefined;
    player = replacement;
    player.addEventListener("load", connectPoster);
    apiAvailable(false);
  }

  function blocked() {
    if (autoNext) autoNext.checked = false;
    manualPlay.hidden = false;
    report("Die Wiedergabe wurde vom Browser blockiert. Bitte starten Sie das Video manuell.");
  }

  function attachApi(version) {
    loadYouTubeApi().then((api) => {
      if (!enabled || version !== revision) return;
      controller = new api.Player(player, {
        events: {
          onReady: (event) => {
            if (enabled && event.target === controller) {
              clearTimeout(readyTimer);
              apiAvailable(true);
              if (pendingSeek !== undefined) {
                try {
                  controller.cueVideoById({ videoId: videoId(active), startSeconds: pendingSeek });
                } catch (error) {
                  report("Die verlinkte Zeitmarke konnte nicht angesprungen werden. Wählen Sie das Kapitel oder den externen YouTube-Link.", error);
                }
                pendingSeek = undefined;
              }
            }
          },
          onStateChange: (event) => {
            if (!enabled || !ready || event.target !== controller
              || event.target.getVideoData().video_id !== videoId(active)) return;
            if (event.data === api.PlayerState.PLAYING) {
              played = true;
              manualPlay.hidden = true;
            }
            if (event.data !== api.PlayerState.ENDED) return;
            const started = played;
            played = false;
            if (!started || !autoNext?.checked) return;
            const next = panels[panels.indexOf(active) + 1];
            if (!active.dataset.dated || !next?.dataset.dated) {
              autoNext.checked = false;
              notice.textContent = next ? "Videos ohne Veröffentlichungsdatum wählen Sie bitte manuell." : "Sie haben das Ende dieser Videoreihe erreicht.";
              notice.hidden = false;
              return;
            }
            timestampAddress(next);
            select(false, true);
          },
          onAutoplayBlocked: (event) => {
            if (enabled && event.target === controller) blocked();
          },
          onError: (event) => {
            if (!enabled || event.target !== controller) return;
            clearTimeout(readyTimer);
            apiAvailable(false);
            played = false;
            report(`Der YouTube-Player meldet Fehler ${event.data}. Nutzen Sie bei Bedarf den Link „Video auf YouTube ansehen“.`);
          },
        },
      });
      readyTimer = setTimeout(() => {
        if (!enabled || version !== revision || ready) return;
        apiAvailable(false);
        report("Der YouTube-Player antwortet nicht. Kapitel öffnen weiterhin YouTube; versuchen Sie bei Bedarf den direkten Videolink.");
      }, 10000);
    }).catch((error) => {
      if (!enabled || version !== revision) return;
      apiAvailable(false);
      report("Die YouTube-Steuerung ist nicht verfügbar. Kapitel öffnen weiterhin YouTube; den Player können Sie manuell bedienen.", error);
    });
  }

  function loadPlayer(panel, autoplay = false) {
    reset.hidden = false;
    previewNote.hidden = true;
    if (ready) {
      try {
        if (autoplay) controller.loadVideoById(videoId(panel));
        else controller.cueVideoById(videoId(panel));
        return;
      } catch (error) {
        report("Das Video konnte nicht über die YouTube-Steuerung geladen werden. Bitte starten Sie es manuell.", error);
      }
    }
    if (controller) replacePlayer();
    player.removeAttribute("srcdoc");
    const url = new URL(panel.dataset.playerUrl);
    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("origin", location.origin);
    url.searchParams.set("playsinline", "1");
    player.src = url.href;
    attachApi(revision);
  }

  function activate(event) {
    if (!plainClick(event)) return;
    event.preventDefault();
    if (enabled) return;
    enabled = true;
    try {
      localStorage.setItem(preferenceKey, "true");
    } catch (error) {
      storageError(error);
    }
    revision += 1;
    loadPlayer(active);
  }

  function connectPoster() {
    player.contentDocument?.querySelector("a")?.addEventListener("click", activate);
  }

  for (const panel of panels) {
    for (const item of panel.querySelectorAll("[data-chapter-seconds]")) {
      item.querySelector("a").addEventListener("click", (event) => {
        if (!plainClick(event) || !enabled || !ready || panel !== active) return;
        try {
          const seconds = Number(item.dataset.chapterSeconds);
          const state = controller.getPlayerState();
          if (state === window.YT.PlayerState.PLAYING || state === window.YT.PlayerState.PAUSED) {
            controller.seekTo(seconds, true);
          } else controller.cueVideoById({ videoId: videoId(active), startSeconds: seconds });
          timestampAddress(panel, item.dataset.chapterSeconds, true);
          event.preventDefault();
        } catch (error) {
          apiAvailable(false);
          report("Das Kapitel konnte nicht im Player geöffnet werden. Der Link öffnet YouTube.", error);
        }
      });
    }
  }
  player.addEventListener("load", connectPoster);
  preferenceNote.hidden = false;
  controls.hidden = false;
  autoNext?.addEventListener("change", () => {
    autoNextEnabled = autoNext.checked;
    try {
      localStorage.setItem(autoNextKey, String(autoNextEnabled));
    } catch (error) {
      storageError(error);
    }
  });
  manualPlay.addEventListener("click", () => {
    if (!ready) return;
    try {
      controller.playVideo();
    } catch (error) {
      report("Das Video konnte nicht gestartet werden. Nutzen Sie den Startknopf im Player oder den YouTube-Link.", error);
    }
  });
  reset.addEventListener("click", () => {
    try {
      localStorage.removeItem(preferenceKey);
    } catch (error) {
      storageError(error);
    }
    enabled = false;
    played = false;
    pendingSeek = undefined;
    revision += 1;
    if (controller) replacePlayer();
    apiAvailable(false);
    player.removeAttribute("src");
    player.srcdoc = active.dataset.poster;
    reset.hidden = true;
    previewNote.hidden = false;
    manualPlay.hidden = true;
  });

  function select(focus = false, autoplay = false) {
    const panel = panels.find((item) => `#${item.id}` === location.hash) ?? panels[0];
    if (panel === active) return;
    const previous = active;
    active = panel;
    if (externalVideo) externalVideo.href = panel.dataset.videoUrl;
    pendingSeek = undefined;
    if (!previous && location.hash === `#${panel.id}`) {
      const time = new URL(location.href).searchParams.get("t");
      if (time !== null && /^(?:0|[1-9]\d*)$/u.test(time)
        && [...panel.querySelectorAll("[data-chapter-seconds]")].some((item) => item.dataset.chapterSeconds === time)) {
        pendingSeek = Number(time);
      }
    } else if (previous) timestampAddress(panel, undefined, true);
    revision += 1;
    played = false;
    manualPlay.hidden = true;
    for (const item of panels) item.hidden = item !== panel;
    for (const link of links) {
      if (link.hash === `#${panel.id}`) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
    if (enabled) loadPlayer(panel, autoplay);
    else if (previous || panel !== panels[0]) player.srcdoc = panel.dataset.poster;
    player.title = `YouTube-Video: ${panel.querySelector("h2").textContent}`;
    document.title = `${series.dataset.title} – ${panel.querySelector("h2").textContent} | Pretty Old Pixel`;
    if (narrow.matches) menu.open = false;
    // Native fragment scrolling can run after the module during initial navigation.
    panel.style.scrollMarginTop = `${panel.getBoundingClientRect().top - player.getBoundingClientRect().top}px`;
    if (focus) {
      panel.focus({ preventScroll: true });
      player.scrollIntoView({ block: "start" });
    }
  }

  menu.open = !narrow.matches;
  narrow.addEventListener("change", () => { menu.open = !narrow.matches; });
  select();
  connectPoster();
  if (location.hash === `#${active.id}`) {
    const showPlayer = () => requestAnimationFrame(() => player.scrollIntoView({ block: "start" }));
    if (document.readyState === "complete") showPlayer();
    else addEventListener("load", showPlayer, { once: true });
  }
  series.classList.add("enhanced");
  addEventListener("hashchange", () => select(true));
  addEventListener("popstate", () => select(true));
}
