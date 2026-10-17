for (const series of document.querySelectorAll("[data-video-series]")) {
  const panels = [...series.querySelectorAll("[data-video-panel]")];
  const links = [...series.querySelectorAll("[data-video-link]")];
  const player = series.querySelector("iframe");
  const menu = series.querySelector(".episode-menu");
  const reset = series.querySelector("[data-player-reset]");
  const notice = series.querySelector("[data-player-notice]");
  const preferenceNote = series.querySelector("[data-player-preference-note]");
  const preferenceKey = "pretty-old-pixel:youtube-player-enabled";
  const narrow = matchMedia("(max-width: 767px)");
  let active;
  let enabled = false;

  function storageError(error) {
    console.warn("YouTube-Player-Einstellung konnte nicht gespeichert oder gelesen werden.", error);
    notice.textContent = "Die Player-Einstellung ist in diesem Browser nicht verfügbar. Änderungen gelten möglicherweise nur auf dieser Seite.";
    notice.hidden = false;
  }

  try {
    enabled = localStorage.getItem(preferenceKey) === "true";
  } catch (error) {
    storageError(error);
  }

  function loadPlayer(panel = active) {
    player.removeAttribute("srcdoc");
    player.src = panel.dataset.playerUrl;
    reset.hidden = false;
  }

  function activate(event) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    enabled = true;
    try {
      localStorage.setItem(preferenceKey, "true");
    } catch (error) {
      storageError(error);
    }
    loadPlayer();
  }

  function connectPoster() {
    player.contentDocument?.querySelector("a")?.addEventListener("click", activate);
  }

  player.addEventListener("load", connectPoster);
  for (const link of series.querySelectorAll("[data-player-activate]")) link.addEventListener("click", activate);
  preferenceNote.hidden = false;
  reset.addEventListener("click", () => {
    try {
      localStorage.removeItem(preferenceKey);
    } catch (error) {
      storageError(error);
    }
    enabled = false;
    player.removeAttribute("src");
    player.srcdoc = active.dataset.poster;
    reset.hidden = true;
  });

  function select(focus = false) {
    const panel = panels.find((item) => `#${item.id}` === location.hash) ?? panels[0];
    if (panel === active) return;
    for (const item of panels) item.hidden = item !== panel;
    for (const link of links) {
      if (link.hash === `#${panel.id}`) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
    if (enabled) {
      loadPlayer(panel);
    } else if (active || panel !== panels[0]) {
      player.srcdoc = panel.dataset.poster;
    }
    player.title = `YouTube-Video: ${panel.querySelector("h2").textContent}`;
    document.title = `${series.dataset.title} – ${panel.querySelector("h2").textContent} | Pretty Old Pixel`;
    active = panel;
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
}
