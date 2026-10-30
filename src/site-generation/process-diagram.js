const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
reducedMotion.addEventListener("change", (event) => {
  if (!event.matches) return;
  for (const diagram of document.querySelectorAll("[data-process-diagram]")) {
    diagram.querySelector(".process-manual").replaceChildren();
    diagram.classList.remove("process-manual-active");
  }
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-process-play]");
  if (!button) return;
  const diagram = button.closest("[data-process-diagram]");
  const layer = diagram.querySelector(".process-manual");
  layer.replaceChildren();
  diagram.classList.remove("process-manual-active");
  if (reducedMotion.matches) return;
  diagram.classList.add("process-manual-active");
  const archive = button.dataset.processPlay === "archive";
  const start = archive ? 2 : 1;
  const steps = archive ? [["archive-db", 0], ["db-push", 1]] : [["dev-push", 0]];
  steps.push(["push-repo", start], ["repo-site", start + 1]);
  steps.push(["build-out", start + 2]);
  for (const id of ["html", "app", "ai"]) {
    steps.push([`build-${id}`, start + 2.6], [`${id}-artifact`, start + 3.6]);
  }
  steps.push(["deploy", start + 5.2]);
  const highlighted = new Set();
  for (const [id, delay] of steps) {
    const edge = diagram.querySelector(`#process-edge-${id}`);
    const pulse = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    pulse.setAttribute("r", "6");
    pulse.setAttribute("fill", edge.getAttribute("stroke"));
    pulse.setAttribute("class", "process-pulse process-once");
    pulse.style.offsetPath = `path('${edge.getAttribute("d")}')`;
    pulse.style.animationDelay = `${delay}s`;
    layer.append(pulse);
    for (const [index, nodeId] of [edge.dataset.processFrom, edge.dataset.processTo].entries()) {
      if (!nodeId) continue;
      const time = Number((delay + index * 0.6).toFixed(1));
      const key = `${nodeId}:${time}`;
      if (highlighted.has(key)) continue;
      highlighted.add(key);
      const node = diagram.querySelector(`#process-node-${nodeId}`);
      const highlight = node.querySelector("rect").cloneNode(false);
      highlight.setAttribute("class", "process-highlight process-highlight-once");
      highlight.setAttribute("data-process-highlight", nodeId);
      highlight.setAttribute("fill", node.style.color);
      highlight.setAttribute("stroke", node.style.color);
      highlight.style.animationDelay = `${time}s`;
      layer.append(highlight);
    }
  }
  for (const original of diagram.querySelectorAll(".process-fresh-once")) {
    const fresh = original.cloneNode(true);
    fresh.style.animationDelay = `${Number.parseFloat(original.style.animationDelay) - 5 + start}s`;
    layer.append(fresh);
    if (original.style.animationDelay === "10.8s") {
      fresh.addEventListener("animationend", () => diagram.classList.remove("process-manual-active"), { once: true });
    }
  }
});
