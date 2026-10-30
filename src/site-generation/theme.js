(() => {
  const key = "pretty-old-pixel:theme";
  const system = matchMedia("(prefers-color-scheme: dark)");
  const root = document.documentElement;
  let preference = null;
  try {
    const saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark") preference = saved;
  } catch (error) {
    console.warn("Darstellungsmodus konnte nicht gelesen werden.", error);
  }
  const apply = () => {
    root.dataset.theme = preference ?? (system.matches ? "dark" : "light");
    const button = document.querySelector("[data-theme-toggle]");
    if (button) {
      const label = root.dataset.theme === "dark" ? "Hellen Modus aktivieren" : "Dunklen Modus aktivieren";
      button.setAttribute("aria-label", label);
      button.title = label;
    }
  };
  apply();
  system.addEventListener("change", apply);
  document.addEventListener("DOMContentLoaded", () => {
    const menu = document.querySelector(".navigation-menu");
    const mobile = matchMedia("(max-width: 1023px)");
    const updateMenu = () => { menu.open = !mobile.matches; };
    updateMenu();
    mobile.addEventListener("change", updateMenu);
    const button = document.querySelector("[data-theme-toggle]");
    apply();
    button.hidden = false;
    button.addEventListener("click", () => {
      preference = root.dataset.theme === "dark" ? "light" : "dark";
      apply();
      try {
        localStorage.setItem(key, preference);
      } catch (error) {
        console.warn("Darstellungsmodus konnte nicht gespeichert werden.", error);
      }
    });
  });
})();
