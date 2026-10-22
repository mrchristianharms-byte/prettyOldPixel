(() => {
  const root = document.querySelector("[data-game-table]");
  if (!root) return;
  const controls = root.querySelector("[data-game-table-controls]");
  const sortButtons = [...root.querySelectorAll("[data-game-sort]")];
  let key = "video";
  let direction = "desc";
  const platform = root.querySelector("[data-game-platform]");
  const genre = root.querySelector("[data-game-genre]");
  const search = root.querySelector("[data-game-search]");
  const reset = root.querySelector("[data-game-reset]");
  const body = root.querySelector("tbody");
  const rows = [...body.rows].map((element) => ({
    element,
    title: element.dataset.title,
    video: element.dataset.video === "" ? null : Number(element.dataset.video),
    release: element.dataset.release === "" ? null : Number(element.dataset.release),
    duration: element.dataset.duration === "" ? null : Number(element.dataset.duration),
    platforms: JSON.parse(element.dataset.platforms),
    genres: JSON.parse(element.dataset.genres),
  }));
  const compareTitle = (a, b) => a.title.localeCompare(b.title, "de");
  const matches = (values, selected) => !selected || (selected === "__unknown__" ? !values.length : values.includes(selected));
  const update = () => {
    const factor = direction === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (a[key] === null) return b[key] === null ? compareTitle(a, b) : 1;
      if (b[key] === null) return -1;
      return factor * (key === "title" ? compareTitle(a, b) : a[key] - b[key]) || compareTitle(a, b);
    });
    let visible = 0;
    const query = search.value.trim().toLocaleLowerCase("de");
    for (const row of rows) {
      row.element.hidden = !row.title.toLocaleLowerCase("de").includes(query)
        || !matches(row.platforms, platform.value) || !matches(row.genres, genre.value);
      if (!row.element.hidden) visible++;
      body.append(row.element);
    }
    const order = {
      video: { asc: "älteste zuerst", desc: "neueste zuerst" },
      release: { asc: "älteste zuerst", desc: "neueste zuerst" },
      title: { asc: "A–Z", desc: "Z–A" },
      duration: { asc: "kürzeste zuerst", desc: "längste zuerst" },
    }[key][direction];
    for (const button of sortButtons) {
      const active = button.dataset.gameSort === key;
      const nextDirection = active && direction === "asc" ? "absteigend" : "aufsteigend";
      button.setAttribute("aria-label", `${button.dataset.sortLabel}: ${nextDirection} sortieren`);
      if (active) button.parentElement.setAttribute("aria-sort", direction === "asc" ? "ascending" : "descending");
      else button.parentElement.removeAttribute("aria-sort");
      button.querySelector("span").textContent = active ? direction === "asc" ? "↑" : "↓" : "↕";
    }
    const sortLabel = sortButtons.find((button) => button.dataset.gameSort === key).dataset.sortLabel;
    const filters = `${platform.selectedOptions[0].textContent} · ${genre.selectedOptions[0].textContent}${query ? ` · Titel: ${search.value.trim()}` : ""}`;
    const sorting = `${sortLabel}: ${order}`;
    root.querySelector("[data-game-table-count]").textContent = `${visible} von ${rows.length} ${rows.length === 1 ? "Spiel" : "Spielen"}`;
    root.querySelector("[data-game-table-filters]").textContent = `Filter: ${filters}`;
    root.querySelector("[data-game-table-sort]").textContent = `Sortierung: ${sorting}`;
    root.querySelector("[data-game-table-empty]").hidden = visible !== 0;
    root.querySelector("caption").textContent = `${filters} · ${sorting}`;
  };
  controls.addEventListener("change", update);
  search.addEventListener("input", update);
  reset.addEventListener("click", () => {
    search.value = "";
    platform.value = "";
    genre.value = "";
    update();
  });
  for (const button of sortButtons) {
    button.addEventListener("click", () => {
      direction = button.dataset.gameSort === key && direction === "asc" ? "desc" : "asc";
      key = button.dataset.gameSort;
      update();
    });
  }
  update();
  for (const button of sortButtons) button.hidden = false;
  controls.hidden = false;
})();
