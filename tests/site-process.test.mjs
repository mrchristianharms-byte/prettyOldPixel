import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { siteProcess, processNodes, processEdges, processColors, processConnections } from "../src/content-data/site-process.mjs";
import { processDiagram } from "../src/site-generation/widget/process-diagram.mjs";
import { loadContentData } from "../src/content-data/content-data.mjs";
import { createSiteConfig } from "../src/site-generation/site-config.mjs";
import { renderSite } from "../src/site-generation/site-render.mjs";
import { renderView } from "../src/app-generation/app-views.mjs";
import { renderMarkdown } from "../src/ai-bot-generation/site-markdown.mjs";

test("Bewegungsreduktion während eines manuellen Ablaufs gibt den YouTube-Zyklus wieder frei", async () => {
  const listeners = new Map();
  let cleared = 0;
  let manual = true;
  const diagram = {
    querySelector: () => ({ replaceChildren: () => { cleared++; } }),
    classList: { remove: (name) => { assert.equal(name, "process-manual-active"); manual = false; } },
  };
  const source = await readFile(new URL("../src/site-generation/process-diagram.js", import.meta.url), "utf8");
  runInNewContext(source, {
    matchMedia: () => ({ addEventListener: (name, handler) => listeners.set(name, handler) }),
    document: { addEventListener() {}, querySelectorAll: () => [diagram] },
  });
  listeners.get("change")({ matches: false });
  assert.equal(manual, true);
  listeners.get("change")({ matches: true });
  assert.equal(manual, false);
  assert.equal(cleared, 1);
});

test("Prozessgrafik trennt Daten, Trigger, Quellen und lokale Speicher", () => {
  const diagram = processDiagram();
  const ids = [...diagram.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, marker] of diagram.matchAll(/marker-end="url\(#([^)]*)\)"/gu)) assert.ok(ids.includes(marker));
  assert.ok(diagram.includes('aria-labelledby="process-title process-desc"'));
  assert.ok(diagram.includes('role="region"'));
  assert.ok(diagram.includes('tabindex="0"'));
  assert.ok(diagram.includes("Simple Icons (CC0-1.0)"));
  assert.doesNotMatch(diagram, /stroke-dasharray|Gestrichelt/u);
  assert.equal(processEdges.find((edge) => edge.id === "deploy").d, "M570 925V975");
  assert.match(diagram, /data-process-play="dev"/u);
  assert.match(diagram, /data-process-play="archive"/u);
  assert.match(diagram, /<g class="process-manual" aria-hidden="true">/u);
  assert.doesNotMatch(diagram, /<script|<iframe|<img|<use|<image/u);
  const nodes = new Map(processNodes.map((node) => [node[0], node]));
  assert.ok(nodes.get("db")[1] < nodes.get("youtube")[1]);
  assert.ok(nodes.get("visitor")[2] > Math.max(...processNodes.filter(([id]) => id !== "visitor").map((node) => node[2])));
  assert.ok(nodes.get("visitor")[1] > nodes.get("pages")[1]);
  for (const node of processNodes) assert.ok(processColors[node[5]]);
  for (const edge of processEdges) {
    const ends = processConnections[edge.id];
    assert.equal(ends.length, 2);
    for (const id of ends.filter(Boolean)) assert.ok(nodes.has(id));
    assert.ok(diagram.includes(`data-process-from="${ends[0] ?? ""}" data-process-to="${ends[1] ?? ""}"`));
  }
  for (const id of ["workflow", "player", "dev-db", "channel-cache"]) assert.ok(!processEdges.some((edge) => edge.id === id));
  assert.equal(processEdges.find((edge) => edge.id === "dev-push").d, "M130 85H112V435H130");
  assert.ok(processNodes.every((node) => node[3] === (["html", "app", "ai"].includes(node[0]) ? 165 : 330)));
  const center = (id) => nodes.get(id)[1] + nodes.get(id)[3] / 2;
  assert.equal(center("app"), center("site"));
  assert.equal(nodes.get("repo")[1], nodes.get("site")[1]);
  assert.equal(center("app"), center("artifact"));
  assert.equal(center("app") - center("html"), center("ai") - center("app"));
  for (const chain of [["dev", "archive", "db", "push", "repo", "site", "app", "artifact", "pages"], ["youtube", "fetch", "cache", "repo"], ["cloudflare", "visitor"]]) {
    for (let i = 1; i < chain.length; i++) {
      const previous = nodes.get(chain[i - 1]);
      assert.equal(nodes.get(chain[i])[2] - previous[2] - previous[4], 50, `${chain[i - 1]} → ${chain[i]}`);
    }
  }
  assert.ok(nodes.get("repo")[2] > Math.max(...["push", "cache"].map((id) => nodes.get(id)[2] + nodes.get(id)[4])));
  assert.equal(processColors.yt, "#A16207");
  assert.equal(nodes.get("pages")[5], "web");
  for (const id of ["fetch", "site"]) assert.equal(nodes.get(id)[6], "workflow");
  for (const [id, count] of [["html", 680], ["app", 90], ["ai", 620]]) {
    assert.equal(processEdges.find((edge) => edge.id === `${id}-artifact`).label, `Dateien speichern · ca. ${count}`);
  }
  for (const [id, label] of [["html", "HTML Generierung starten"], ["app", "App Daten starten"], ["ai", "Markdown Daten starten"]]) {
    assert.equal(processEdges.find((edge) => edge.id === `build-${id}`).label, label);
  }
  assert.ok(nodes.get("pages").includes("github.io Pages"));
  assert.ok(!diagram.includes("mrchristianharms-byte.github.io"));
  assert.ok(processNodes.every((node) => node[4] <= 100));
  assert.match(diagram, /viewBox="0 0 1280 1190"/u);
  assert.ok(!processEdges.find((edge) => edge.id === "cache-repo").trigger);
  for (const branch of ["html", "app", "ai"]) {
    assert.ok(processEdges.some((edge) => edge.id === `build-${branch}`));
    assert.ok(processEdges.some((edge) => edge.id === `${branch}-artifact`));
  }
});

test("deklarative Animation hat korrekte Intervalle, endlichen Push und vollständige Pausensteuerung", () => {
  const diagram = processDiagram();
  assert.match(diagram, /process-once \{ animation:process-travel \.6s linear 1/u);
  assert.match(diagram, /process-youtube \{ animation:process-poll 20s linear infinite/u);
  assert.match(diagram, /process-fresh-youtube \{ animation:process-new-cycle 20s linear infinite/u);
  assert.match(diagram, /process-active \{[^}]*animation:process-activate 20s linear infinite/u);
  assert.match(diagram, /class="process-active"[^>]*animation-delay:20s/u);
  assert.match(diagram, /@keyframes process-poll[^}]*0% \{ opacity:1; offset-distance:0% \} 2\.7% \{ opacity:1 \} 3% \{ opacity:0; offset-distance:100%/u);
  assert.match(diagram, /@keyframes process-new-cycle \{ 0% \{ opacity:\.7 \} 10%,100% \{ opacity:0/u);
  assert.ok(siteProcess.legend.some((item) => item.includes("automatische YouTube-Abruf erfolgt täglich.")));
  assert.match(diagram, /process-visitor \{ animation:process-visit 3s linear infinite/u);
  assert.equal(processEdges.find((edge) => edge.id === "push-repo").push, 5);
  for (const [id, delay] of [["fetch-channel", 21], ["fetch-cache", 22], ["cache-repo", 23], ["repo-site", 24]]) {
    assert.equal(processEdges.find((edge) => edge.id === id).yt, delay);
  }
  assert.equal(processEdges.find((edge) => edge.id === "fetch-cache").d, "M905 335V385");
  assert.match(diagram, /process-origin \{ animation:process-origin 6s linear infinite/u);
  assert.equal(processEdges.find((edge) => edge.id === "origin-get").origin, 3.8);
  assert.equal(processEdges.find((edge) => edge.id === "origin-response").origin, 4.8);
  assert.equal(processEdges.find((edge) => edge.id === "origin-get").d, "M870 1020H735");
  assert.equal(processEdges.find((edge) => edge.id === "origin-response").d, "M735 990H870");
  const response = processEdges.find((edge) => edge.id === "visitor-response");
  assert.equal(response.cacheResponse, 1);
  assert.equal(response.origin, 5.8);
  assert.equal(response.visitor, undefined);
  assert.equal(processEdges.find((edge) => edge.id === "deploy").push, 10.2);
  assert.equal(processEdges.find((edge) => edge.id === "deploy").yt, 28.2);
  assert.match(diagram, /process-fresh-once \{ animation:process-new 2s/u);
  const highlights = [...diagram.matchAll(/class="process-highlight process-highlight-([^"]+)" data-process-highlight="([^"]+)"[^>]*animation-delay:([^;"]+)s/gu)];
  assert.equal(highlights.length, new Set(highlights.map((match) => match.slice(1).join(":"))).size);
  assert.ok(highlights.length > 40);
  assert.match(diagram, /data-process-highlight="repo"[^>]*animation-delay:5\.6s/u);
  for (const [incoming, outgoing] of [["push-repo", "repo-site"], ["repo-site", "build-out"], ["build-html", "html-artifact"], ["app-artifact", "deploy"]]) {
    assert.ok(processEdges.find((edge) => edge.id === outgoing).push - processEdges.find((edge) => edge.id === incoming).push >= 0.99);
  }
  assert.equal(processEdges.filter((edge) => processConnections[edge.id][0] === "site").length, 1);
  assert.equal(processEdges.filter((edge) => processConnections[edge.id][1] === "artifact").length, 3);
  for (const [id, target] of [["html", 455], ["app", 570], ["ai", 685]]) {
    assert.ok(processEdges.find((edge) => edge.id === `${id}-artifact`).d.endsWith(`H${target}V865`));
  }
  assert.match(diagram, /process-highlight-youtube \{ animation:process-highlight-youtube 20s linear infinite/u);
  assert.match(diagram, /process-highlight-visitor \{ animation:process-highlight-visitor 3s linear infinite/u);
  assert.match(diagram, /process-highlight-origin \{ animation:process-highlight-origin 6s linear infinite/u);
  assert.match(diagram, /\.process-manual-active \.process-youtube,[^\n]*\.process-active \{ animation-play-state:paused \}/u);
  assert.doesNotMatch(diagram, /[^\n]*process-youtube[^\n]*visibility:hidden/u);
  assert.match(diagram, /:checked ~ \.process-scroll \* \{ animation-play-state:paused !important/u);
  assert.match(diagram, /prefers-reduced-motion:reduce[\s\S]*animation:none !important; opacity:0 !important/u);
});

test("Prozessseite und Diensteverweise funktionieren in Website, Markdown und Offline-App", async () => {
  const model = await loadContentData(new URL("../cache/", import.meta.url).pathname);
  for (const base of ["https://prettyoldpixel.com/", "https://example.org/projekt/"]) {
    const config = createSiteConfig(base);
    const pages = renderSite(model, config, "assets/site.css");
    const page = pages.get(`${siteProcess.route}index.html`);
    const view = renderView(model, { route: siteProcess.route });
    const markdown = renderMarkdown(page, config);
    assert.equal(view.title, siteProcess.title);
    assert.equal((page.html.match(/<h1\b/gu) ?? []).length, 1);
    assert.ok(page.html.includes(`rel="canonical" href="${base}${siteProcess.route}"`));
    for (const flow of siteProcess.flows) for (const item of flow.items) {
      assert.ok(view.body.includes(item));
      assert.ok(markdown.includes(item.replace(/([_*[\]])/gu, "\\$1")) || markdown.includes(item), item);
    }
    for (const route of ["ueber/", "kontakt/", "datenschutz/"]) {
      assert.ok(pages.get(`${route}index.html`).html.includes(`href="${config.href(siteProcess.route, route)}"`));
      assert.ok(renderView(model, { route }).body.includes(`href="#/${siteProcess.route}"`));
    }
    assert.ok(markdown.includes("F1 · Entwicklung"));
    assert.ok(markdown.includes("Keine echten Anfragen"));
    assert.doesNotMatch(markdown, /process-arrow|offset-path|process-pause|\nAnimation pausieren\n|<svg/u);
    assert.ok(view.body.includes('class="process-svg"'));
    assert.ok(view.body.includes(siteProcess.introduction));
    assert.ok(markdown.includes(siteProcess.introduction));
    assert.match(page.html, /<h2>Simulation im Diagramm<\/h2>\s*<ul><li>Besucher:/u);
    assert.match(page.html, /<script defer src="[^"]*process-diagram\.js"><\/script>/u);
  }
});
