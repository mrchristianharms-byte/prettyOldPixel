for (const series of document.querySelectorAll("[data-video-series]")) {
  const panels = [...series.querySelectorAll("[data-video-panel]")];
  const links = [...series.querySelectorAll("[data-video-link]")];
  const player = series.querySelector("iframe");
  const menu = series.querySelector(".episode-menu");
  const narrow = matchMedia("(max-width: 767px)");
  let active;

  function select(focus = false) {
    const panel = panels.find((item) => `#${item.id}` === location.hash) ?? panels[0];
    if (panel === active) return;
    for (const item of panels) item.hidden = item !== panel;
    for (const link of links) {
      if (link.hash === `#${panel.id}`) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
    if (active || panel !== panels[0]) player.srcdoc = panel.dataset.poster;
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
  if (location.hash === `#${active.id}`) {
    const showPlayer = () => requestAnimationFrame(() => player.scrollIntoView({ block: "start" }));
    if (document.readyState === "complete") showPlayer();
    else addEventListener("load", showPlayer, { once: true });
  }
  series.classList.add("enhanced");
  addEventListener("hashchange", () => select(true));
}
