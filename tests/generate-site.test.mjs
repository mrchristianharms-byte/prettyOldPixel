import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { generateSite, validateSite } from "../src/generate-site.mjs";
import { createSiteConfig } from "../src/site-config.mjs";
import { normalizeSources } from "../src/site-data.mjs";
import { descriptionHtml, jsonLd, renderSite } from "../src/site-render.mjs";

const channel = { id: "UC-build", title: "Pretty Old Pixel" };
function fixture(count = 53) {
  const videos = Array.from({ length: count }, (_, index) => ({
    id: `b${String(index).padStart(10, "0")}`, title: `Video ${index} – Retrospiel`,
    description: index === 0 ? "" : `Beschreibung ${index}\n\nWeitere Videos https://www.youtube.com/@PrettyOldPixel`,
    durationSeconds: 60 + index, publishedAt: new Date(Date.UTC(2020, 0, index + 1)).toISOString(),
  }));
  return {
    videos: { channel, complete: true, videos },
    playlists: { channel, complete: true, playlists: [] },
    magazines: { channel, videos: [] },
  };
}

function render(input = fixture(), baseUrl) {
  const config = createSiteConfig(baseUrl);
  const pages = renderSite(normalizeSources(input), config, config.href("assets/site.css"));
  return { pages, config, assets: new Map([["assets/site.css", "body{}"], ["assets/video-series.js", ""], ["assets/theme.js", ""], ["favicon.jpg", "image"]]) };
}

function issueFixture() {
  const input = fixture(2);
  input.magazines.videos = input.videos.videos.map((video) => ({
    id: video.id, magazines: [{ name: "PC Games", issue: {
      label: "11/1992", year: 1992, months: [11], number: null, special: false,
    } }],
  }));
  return input;
}

const issuePage = (pages) => [...pages].find(([file]) => file.includes("/ausgaben/"))[1].html;

test("zeigt auf der Startseite den Markennamen nur im Kopf statt als zusätzliche Überschrift", () => {
  const { pages, config } = render();
  const html = pages.get("index.html").html;
  assert.ok(html.includes(`<a class="brand" href="./"><img class="brand-logo" src="${config.href("favicon.jpg")}" alt="" width="40" height="40">Pretty Old Pixel</a>`));
  assert.ok(!html.includes("<h1>Pretty Old Pixel</h1>"));
  assert.ok(html.includes('<h1 class="visually-hidden">Pretty Old Pixel</h1>'));
  assert.ok(html.includes('<p class="lead">Retrospiele entdecken'));
});

test("entfernt Startseite nur aus der Hauptnavigation und behält Markenlink und Brotkrümel", () => {
  const { pages, config } = render(issueFixture());
  for (const { html, route } of pages.values()) {
    const header = html.match(/<header[\s\S]*?<\/header>/u)[0];
    assert.ok(!header.includes(">Startseite</a>"));
    const pageConfig = config.forPage(route);
    assert.ok(header.includes(`<a class="brand" href="${pageConfig.href()}"><img class="brand-logo" src="${pageConfig.href("favicon.jpg")}" alt="" width="40" height="40">Pretty Old Pixel</a>`));
    assert.equal((header.match(/class="brand-logo"/gu) ?? []).length, 1);
  }
  assert.ok(pages.get("zeitschriften/pc-games/index.html").html.includes('href="../../">Startseite</a>'));
});

test("verlinkt YouTube und Twitch als externe Kanäle in der letzten Fußzeile jeder Seite", () => {
  const { pages } = render(issueFixture());
  for (const { html } of pages.values()) {
    const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/u)[1];
    assert.equal((footer.match(/<p>/gu) ?? []).length, 1);
    const lastParagraph = [...footer.matchAll(/<p>([\s\S]*?)<\/p>/gu)].at(-1)[1];
    assert.ok(lastParagraph.includes('href="https://www.youtube.com/prettyoldpixel" rel="external"'));
    assert.ok(lastParagraph.includes('href="https://www.twitch.tv/prettyoldpixel" rel="external"'));
    assert.ok(lastParagraph.startsWith("Pretty Old Pixel"));
    assert.ok(lastParagraph.includes(">YouTube "));
    assert.ok(lastParagraph.includes(">Twitch "));
    assert.equal((lastParagraph.match(/externe Website/gu) ?? []).length, 2);
  }
});

test("trennt jede Ebene der Brotkrümelnavigation mit einem dekorativen Unicode-Pfeil", () => {
  const { pages } = render(issueFixture());
  for (const { html } of pages.values()) {
    const breadcrumbs = html.match(/<ol class="breadcrumbs">([\s\S]*?)<\/ol>/u)[1];
    const levels = (breadcrumbs.match(/<li>/gu) ?? []).length;
    const separator = '<span class="breadcrumb-separator" aria-hidden="true"> → </span>';
    assert.equal(breadcrumbs.split(separator).length - 1, levels - 1);
    assert.ok(!breadcrumbs.startsWith(`<li>${separator}`));
    assert.equal((breadcrumbs.match(/aria-current="page"/gu) ?? []).length, 1);
    assert.match(breadcrumbs, /<span aria-current="page">[^<]+<\/span><\/li>$/u);
  }
});

async function setup(t, input = fixture()) {
  const directory = await mkdtemp(path.join(tmpdir(), "pretty-pixel-build-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cacheDirectory = path.join(directory, "cache");
  const outputDirectory = path.join(directory, "docs");
  await mkdir(cacheDirectory);
  async function save(data) {
    await Promise.all(Object.entries({
      "youtube-videos.json": data.videos,
      "youtube-playlists.json": data.playlists,
      "blaetterabend-videos.json": data.magazines,
    }).map(([file, value]) => writeFile(path.join(cacheDirectory, file), JSON.stringify(value))));
  }
  await save(input);
  return {
    cacheDirectory, outputDirectory, save,
    logger: { log() {}, warn() {} },
  };
}

test("erzeugt News mit Sonstiges-Detailseiten ohne Gesamtkatalog", () => {
  const { pages, config, assets } = render();
  assert.equal(pages.size, 58);
  assert.ok(![...pages.keys()].some((file) => file.startsWith("videos/")));
  assert.ok(pages.get("news/index.html").html.includes('href="../sonstiges/b0000000052/#video-b0000000052"'));
  for (const page of pages.values()) {
    assert.ok(!page.html.includes("Alle Videos"));
    assert.ok(!/href="[^"]*videos\//u.test(page.html));
    assert.ok(page.html.includes(`rel="canonical" href="${config.href(page.route, page.route)}"`));
  }
  assert.ok(![...pages.values()].some((page) => /href="[^"]*\/spiele\/|href="[^"]*\/zeitschriften\//u.test(page.html)));
  assert.ok(validateSite(pages, assets, config).maxHtmlGzip < 50 * 1024);
});

test("rendert News-Inhalte vollständig ohne Laufzeit-JavaScript und setzt VideoObject-Metadaten korrekt", () => {
  const { pages } = render();
  const news = pages.get("news/index.html").html;
  assert.equal((news.match(/<li><article>/gu) ?? []).length, 20);
  assert.ok(news.includes("<time datetime="));
  const video = issuePage(render(issueFixture()).pages);
  const graph = JSON.parse(video.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)[1])["@graph"];
  const schema = graph.find((item) => item["@type"] === "VideoObject" && item.sameAs.endsWith("b0000000001"));
  assert.equal(schema.duration, "PT1M1S");
  assert.equal(schema.uploadDate, "2020-01-02T00:00:00.000Z");
  assert.equal(schema.contentUrl, undefined);
  assert.ok(schema.url.endsWith("#video-b0000000001"));
  assert.equal(graph.at(-1)["@type"], "BreadcrumbList");
  assert.equal((video.match(/<script/gu) ?? []).length, 3);
  assert.ok(!video.includes("dateModified"));
});

test("zeigt kompakte Videodaten in Berliner Winter- und Sommerzeit mit unverändertem ISO-Datum", () => {
  const input = issueFixture();
  const cases = [
    ["2016-11-23T17:42:00.000Z", "23.11.2016, 18:42", "23.11.2016"],
    ["2017-07-01T22:30:00.000Z", "02.07.2017, 00:30", "02.07.2017"],
  ];
  input.videos.videos.forEach((video, index) => {
    video.publishedAt = cases[index][0];
    video.durationSeconds = 929;
  });
  const { pages } = render(input);
  const news = pages.get("news/index.html").html;
  const detail = issuePage(pages);
  const menu = detail.match(/<details class="episode-menu"[\s\S]*?<\/details>/u)[0];
  for (const [iso, label, date] of cases) {
    const time = `<time datetime="${iso}">${label}</time>`;
    assert.ok(news.includes(`${time} · 15:29`));
    assert.ok(detail.includes(time));
    assert.ok(menu.includes(`<time datetime="${iso}">${date}</time>`));
    assert.ok(detail.includes(`"uploadDate":"${iso}"`));
  }
  let dates = 0;
  for (const [file, { html }] of pages) {
    for (const [, iso, label] of html.matchAll(/<time datetime="([^"]+)">([^<]+)<\/time>/gu)) {
      dates += 1;
      assert.ok(Number.isFinite(Date.parse(iso)), file);
      assert.ok(!/Europe\/Berlin|\b(?:UTC|MEZ|MESZ|GMT|CET|CEST)\b|[+-]\d{2}:?\d{2}|\dZ\b|Uhr/u.test(label), `${file}: ${label}`);
    }
  }
  assert.ok(dates > 0);
});

test("zeigt auf der Startseite korrekte Statistik statt neuer Videos und zählt Heftausgaben nur einmal", () => {
  const input = issueFixture();
  input.videos.videos[0].durationSeconds = 3600;
  input.videos.videos[1].durationSeconds = 1800;
  const { pages, config, assets } = render(input);
  const home = pages.get("index.html").html;
  for (const [label, value] of [["Videos insgesamt", "2"], ["Zeitschriften", "1"], ["Heftausgaben", "1"], ["Spiele", "0"], ["Playlists", "0"], ["Stunden Video", "1"]]) {
    assert.ok(home.includes(`<dt>${label}</dt><dd>${value}</dd>`), label);
  }
  assert.ok(!home.includes('class="channel-history"'));
  assert.ok(!home.includes("Videogeschichte"));
  assert.ok(home.includes('href="zeitschriften/"'));
  assert.ok(home.includes('href="news/"'));
  assert.ok(!home.includes("Zu den 20 neuesten Videos"));
  assert.ok(home.includes("nicht addierbar"));
  assert.ok(!home.includes('class="video-list"'));
  assert.ok(!home.includes("Neu auf dem Kanal"));
  assert.ok(!home.includes("VideoObject"));
  assert.ok(!home.includes("ItemList"));
  assert.ok(!home.includes("iframe"));
  assert.ok(!/Cache|lokal|bestätigt|fachlich geprüft/u.test(home));
  assert.ok(!home.includes('script type="module"'));
  validateSite(pages, assets, config);
});

test("kennzeichnet unvollständige Laufzeiten und zeigt keine Videogeschichte bei fehlenden Datumswerten", () => {
  const input = fixture(2);
  input.videos.videos[0].durationSeconds = 7200;
  input.videos.videos[1].durationSeconds = null;
  for (const video of input.videos.videos) video.publishedAt = null;
  const home = render(input).pages.get("index.html").html;
  assert.ok(home.includes("<dt>Stunden Video</dt><dd>2</dd>"));
  assert.ok(home.includes("Bekannte Laufzeiten: 1 von 2 Videos"));
  assert.ok(!home.includes("Videogeschichte"));
  assert.ok(!home.includes("datetime="));
  input.videos.videos[0].durationSeconds = null;
  assert.ok(!render(input).pages.get("index.html").html.includes("<dt>Stunden Video</dt>"));
});

test("zählt unterschiedliche Zeitschriften in der Infobox statt Videos oder Mehrfachzuordnungen", () => {
  for (const count of [0, 1, 2]) {
    const input = issueFixture();
    input.magazines.videos = input.magazines.videos.slice(0, count);
    const home = render(input).pages.get("index.html").html;
    if (count === 0) {
      assert.ok(!home.includes('href="zeitschriften/">Zeitschriften</a>'));
    } else {
      const box = home.match(/<article><h3><a href="zeitschriften\/">Zeitschriften<\/a>[\s\S]*?<\/article>/u)[0];
      assert.ok(box.includes('<p class="theme-count">1 Zeitschrift</p>'));
      assert.ok(!box.includes("Video"));
      assert.ok(home.includes(`<dt>Heftausgaben</dt><dd>1</dd>`));
    }
  }
  const input = issueFixture();
  input.magazines.videos[1].magazines.push({
    ...input.magazines.videos[1].magazines[0], name: "Power Play",
  });
  const home = render(input).pages.get("index.html").html;
  assert.ok(home.includes('<a href="zeitschriften/">Zeitschriften</a></h3><p class="theme-count">2 Zeitschriften</p>'));
});

test("berechnet Startseitenzahlen nur aus öffentlichen Videos und aktualisiert Mengen ohne Videoliste", async (t) => {
  const input = fixture(2);
  input.videos.videos.push({ id: "f0000000000", title: "Zukunft", publishedAt: "2099-01-01T00:00:00Z" });
  const options = await setup(t, input);
  await generateSite(options);
  const homeFile = path.join(options.outputDirectory, "index.html");
  assert.ok((await readFile(homeFile, "utf8")).includes("<dt>Videos insgesamt</dt><dd>2</dd>"));
  input.videos.videos.shift();
  await options.save(input);
  await generateSite(options);
  assert.ok((await readFile(homeFile, "utf8")).includes("<dt>Videos insgesamt</dt><dd>1</dd>"));
});

test("erzeugt standortunabhängige Seiten mit relativen Links, Assets, Canonicals und JSON-LD", () => {
  for (const input of [fixture(), issueFixture()]) {
    const { pages, config, assets } = render(input);
    const relocated = render(input, "https://example.org/anderer/tiefer/pfad/");
    assert.deepEqual([...relocated.pages], [...pages]);
    validateSite(pages, assets, relocated.config);
    validateSite(pages, assets, createSiteConfig("http://localhost:8000/"));
    for (const page of pages.values()) {
      assert.ok(!page.html.includes(config.baseUrl));
      assert.ok(!page.html.includes('href="/'));
      assert.ok(!page.html.includes('src="/'));
      assert.ok(page.html.includes(`rel="icon" type="image/jpeg" href="${config.href("favicon.jpg", page.route)}"`));
      assert.ok(page.html.includes(`rel="stylesheet" href="${config.href("assets/site.css", page.route)}"`));
      assert.ok(page.html.includes(`property="og:url" content="${config.href(page.route, page.route)}"`));
      const breadcrumbs = JSON.parse(page.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)[1])["@graph"].at(-1);
      assert.equal(breadcrumbs.itemListElement[0].item, config.href("", page.route));
    }
  }
});

test("lehnt absolute interne Metadaten und Skriptpfade ab", () => {
  const { pages, config, assets } = render(issueFixture());
  const page = pages.get("news/index.html");
  const original = page.html;
  page.html = original.replace('"@id":"./#page"', `"@id":"${config.absolute("news/")}#page"`);
  assert.notEqual(page.html, original);
  assert.throws(() => validateSite(pages, assets, config), /seitenrelativ/u);
  page.html = original.replace('property="og:url" content="./"', `property="og:url" content="${config.absolute("news/")}"`);
  assert.throws(() => validateSite(pages, assets, config), /seitenrelativ/u);
  page.html = original;
  const detail = [...pages.values()].find((page) => page.html.includes('type="module"'));
  detail.html = detail.html.replace(/(<script type="module" src=")[^"]+/u, `$1${config.absolute("assets/video-series.js")}`);
  assert.throws(() => validateSite(pages, assets, config), /seitenrelativ/u);
});

test("bindet den zugänglichen Darstellungs-Schalter und sein lokales Skript vor dem CSS auf jeder Seite ein", () => {
  const { pages, config, assets } = render(issueFixture());
  for (const page of pages.values()) {
    assert.ok(page.html.includes(`src="${config.href("assets/theme.js", page.route)}"`));
    assert.ok(page.html.indexOf('src="' + config.href("assets/theme.js", page.route))
      < page.html.indexOf('rel="stylesheet"'));
    const header = page.html.match(/<header[\s\S]*?<\/header>/u)[0];
    assert.ok(header.includes('type="button" class="theme-toggle" data-theme-toggle hidden'));
    assert.ok(header.includes('aria-label="Darstellungsmodus wechseln"'));
    assert.ok(header.includes('data-theme-status role="status"'));
    assert.match(header, /<li class="navigation-control"><a [^>]+>[^<]+<\/a><button/u);
  }
  validateSite(pages, assets, config);
});

test("escapet Quelltexte und JSON-LD, verlinkt nur HTTP(S) und kennzeichnet externe Ziele", () => {
  const input = issueFixture();
  input.videos.videos[0].title = '<img src=x onerror="alert(1)">';
  input.videos.videos[0].description = '</script><script>alert("x")</script>\n\nhttps://example.com/?x=1&y=2. javascript:alert(1)';
  const { pages, config, assets } = render(input);
  const html = issuePage(pages);
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('href="https://example.com/?x=1&amp;y=2" rel="external"'));
  assert.equal((html.match(/<script/gu) ?? []).length, 3);
  assert.ok(!jsonLd({ text: "</script>\u2028" }).includes("</script>"));
  assert.ok(descriptionHtml("https://example.com/path).").endsWith("</a>).</p>"));
  validateSite(pages, assets, config);
});

test("lädt vor Aktivierung keinen YouTube-Player und dokumentiert den aktuellen Datenschutzstand", () => {
  const { pages } = render(issueFixture());
  const html = issuePage(pages);
  assert.ok(!/<iframe[^>]*\ssrc="/u.test(html));
  assert.ok(html.includes('srcdoc="'));
  assert.ok(html.includes('name="issue-player"'));
  assert.ok(html.includes('name="issue-player"'));
  assert.ok(html.includes('data-player-reset hidden'));
  assert.ok(html.includes('data-video-widget'));
  assert.ok(html.includes('data-player-notice role="status" hidden'));
  assert.ok(html.includes('data-player-url="https://www.youtube-nocookie.com/embed/b0000000000"'));
  assert.ok(html.includes('Vorschaubild von YouTube · Player erst nach Aktivierung.'));
  assert.ok(!html.includes('href="#datenschutzhinweis"'));
  assert.ok(html.match(/<footer[\s\S]*?<\/footer>/u)[0].includes(">YouTube-Einbindung und Datenschutz</a>"));
  assert.equal((html.match(/<iframe /gu) ?? []).length, 1);
  assert.equal((html.match(/data-video-panel /gu) ?? []).length, 2);
  assert.ok(html.includes("keine Beschreibung vorhanden"));
  const privacy = pages.get("datenschutz/index.html").html;
  for (const text of ["nicht kommerziell", "GitHub Pages", "i.ytimg.com", "youtube-nocookie.com", "offizielle YouTube-IFrame-API", "Nächste Folge automatisch", "Local Storage", "YouTube-Aktivierung zurücksetzen", "Session Storage"]) {
    assert.ok(privacy.includes(text), text);
  }
  for (const page of pages.values()) assert.ok(page.html.includes(`href="${createSiteConfig().href("datenschutz/", page.route)}"`));
  assert.ok(pages.get("404.html").html.includes('content="noindex, follow"'));
});

test("stellt Zeitschriften mit Archiv-Match-Typ dar, ohne Cover-Hotlinks oder Phantomseiten", () => {
  const input = fixture(1);
  input.magazines.videos = [{
    id: input.videos.videos[0].id,
    magazines: [{ name: "Computer Gaming World", issue: null,
      reetroz: { match: "magazine", pageUrl: "https://reetroz.com/magazines/cgw", coverUrl: "https://example.com/cover.jpg" },
    }],
  }];
  const { pages, config, assets } = render(input);
  const html = pages.get("zeitschriften/computer-gaming-world/index.html").html;
  assert.ok(html.includes("Computer Gaming World"));
  assert.ok(html.includes("Zeitschriftenübersicht"));
  assert.ok(html.includes('"@type":"Periodical"'));
  assert.ok(!html.includes("cover.jpg"));
  validateSite(pages, assets, config);
});

test("validiert defekte Links, Fragmente und HTML-/CSS-Budgets als Build-Fehler", () => {
  const { pages, config, assets } = render(fixture(1));
  const original = pages.get("index.html").html;
  pages.get("index.html").html += '<a href="fehlt/">Falsch</a>';
  assert.throws(() => validateSite(pages, assets, config), /Nicht erzeugtes Linkziel/u);
  pages.get("index.html").html = `${original}<a href="#nicht-vorhanden">Falsch</a>`;
  assert.throws(() => validateSite(pages, assets, config), /Unbekanntes Fragment/u);
  pages.get("index.html").html = `${original}<a href="/videos/">Falsch</a>`;
  assert.throws(() => validateSite(pages, assets, config), /Projektpfad/u);
  for (const url of ["/prettyOldPixel/news/", `${config.baseUrl}news/`]) {
    pages.get("index.html").html = `${original}<a href="${url}">Falsch</a>`;
    assert.throws(() => validateSite(pages, assets, config), /seitenrelativ/u);
  }
  pages.get("index.html").html = `${original}<a href="https://example.com/">Extern</a>`;
  assert.throws(() => validateSite(pages, assets, config), /ohne Kennzeichnung/u);
  pages.get("index.html").html = `${original}<img src="https://example.com/cover.jpg" width="320" height="180" alt="Cover">`;
  assert.throws(() => validateSite(pages, assets, config), /Unerlaubte externe Ressource/u);
  pages.get("index.html").html = `${original}<picture><source type="image/webp" srcset="https://example.com/logo.webp"></picture>`;
  assert.throws(() => validateSite(pages, assets, config), /Unerlaubte externe Ressource/u);
  pages.get("index.html").html = `${original}<picture><source type="image/webp" srcset="missing-logo.webp"></picture>`;
  assert.throws(() => validateSite(pages, assets, config), /Nicht erzeugtes Linkziel/u);
  pages.get("index.html").html = original;
  const noise = Array.from({ length: 50000 }, (_, i) => `${i}:${Math.imul(i, 2654435761) >>> 0};`).join("");
  assert.ok(gzipSync(noise).length > 50 * 1024);
  assets.set("assets/site.css", noise);
  assert.throws(() => validateSite(pages, assets, config), /CSS überschreitet/u);
  assets.set("assets/site.css", "");
  assets.set("assets/video-series.js", noise);
  assert.throws(() => validateSite(pages, assets, config), /JavaScript überschreitet/u);
  assets.set("assets/video-series.js", "");
  pages.get("index.html").html = original + '<script type="module" src="https://example.com/script.js"></script>';
  assert.throws(() => validateSite(pages, assets, config), /Unerlaubte externe Ressource/u);
  pages.get("index.html").html = original + noise;
  assert.throws(() => validateSite(pages, assets, config), /HTML überschreitet/u);
});

test("baut offline mit Projektpfad, Sitemap und Inhalts-Manifest; übernimmt unveränderte Dateien", async (t) => {
  const options = await setup(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Netzwerk im Build verboten"); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const first = await generateSite(options);
  assert.equal(first.pages, 58);
  assert.equal(first.reused, 0);
  assert.ok(first.cssGzip <= 20 * 1024);
  assert.ok(first.jsGzip <= 5 * 1024);
  assert.deepEqual(
    await readFile(path.join(options.outputDirectory, "favicon.jpg")),
    await readFile(new URL("../src/favicon.jpg", import.meta.url)),
  );
  const newsHtml = await readFile(path.join(options.outputDirectory, "news", "index.html"), "utf8");
  assert.ok(newsHtml.includes('<link rel="icon" type="image/jpeg" href="../favicon.jpg">'));
  const css = (await readdir(path.join(options.outputDirectory, "assets"))).find((file) => file.endsWith(".css"));
  assert.match(css, /^site\.[a-f0-9]{12}\.css$/u);
  const stylesheet = await readFile(path.join(options.outputDirectory, "assets", css), "utf8");
  assert.ok(stylesheet.includes("Pico CSS"));
  assert.ok(!stylesheet.includes("sourceMappingURL"));
  const leadStyles = stylesheet.match(/\.lead\s*\{([^}]*)\}/u)?.[1];
  assert.ok(leadStyles);
  assert.doesNotMatch(leadStyles, /(?:max-)?width\s*:|white-space\s*:|text-wrap\s*:/u);
  assert.match(stylesheet, /\.detail-heading\s*\{[^}]*white-space:\s*nowrap;[^}]*text-overflow:\s*ellipsis/u);
  assert.match(stylesheet, /\.video-player\s*\{[^}]*max-height:\s*min\(60svh,\s*calc\(100svh - 12rem\)\)/u);
  assert.match(stylesheet, /\.detail-page main\.container\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none/u);
  assert.match(stylesheet, /@media \(min-width: 768px\)\s*\{\s*\.detail-page \.video-player\s*\{[^}]*height:\s*auto;[^}]*max-height:\s*none/u);
  const sitemap = await readFile(path.join(options.outputDirectory, "sitemap.xml"), "utf8");
  assert.ok(sitemap.includes("https://mrchristianharms-byte.github.io/prettyOldPixel/news/"));
  assert.ok(!sitemap.includes("404.html"));
  assert.ok(!sitemap.includes("/videos/"));
  assert.equal((sitemap.match(/<lastmod>/gu) ?? []).length, first.pages - 1);
  assert.match(await readFile(path.join(options.outputDirectory, "robots.txt"), "utf8"), /Sitemap: https:.*prettyOldPixel\/sitemap.xml/u);
  const homePath = path.join(options.outputDirectory, "index.html");
  const preservedTime = new Date("2020-01-01T00:00:00Z");
  await utimes(homePath, preservedTime, preservedTime);
  const second = await generateSite(options);
  assert.equal(second.reused, second.files);
  assert.equal((await stat(homePath)).mtime.toISOString(), preservedTime.toISOString());
  const manifest = JSON.parse(await readFile(path.join(options.outputDirectory, "build-manifest.json"), "utf8"));
  assert.equal(manifest.pages["news/index.html"].contentPublishedAt, "2020-02-22T00:00:00.000Z");
});

test("ignoriert Abrufzeiten, aktualisiert nur betroffene Inhalte und entfernt veraltete Seiten", async (t) => {
  const input = fixture();
  const options = await setup(t, input);
  await generateSite(options);
  const newsPath = path.join(options.outputDirectory, "news/index.html");
  const before = await readFile(newsPath, "utf8");
  const otherPath = path.join(options.outputDirectory, "sonstiges/index.html");
  const otherBefore = await readFile(otherPath, "utf8");
  input.videos.fetchedAt = "2099-01-01T00:00:00Z";
  input.playlists.lastModified = "2099-01-01T00:00:00Z";
  input.magazines.generatedAt = "2099-01-01T00:00:00Z";
  await options.save(input);
  const unchanged = await generateSite(options);
  assert.equal(unchanged.reused, unchanged.files);
  input.videos.videos[0].description = "Korrektur an einem alten Video";
  await options.save(input);
  const changed = await generateSite(options);
  assert.ok(changed.reused < changed.files);
  assert.notEqual(await readFile(otherPath, "utf8"), otherBefore);
  assert.equal(await readFile(newsPath, "utf8"), before);
  input.videos.videos.pop();
  for (const route of ["videos", "videos/seite/2", "videos/b0000000052"]) {
    const legacy = path.join(options.outputDirectory, route);
    await mkdir(legacy, { recursive: true });
    await writeFile(path.join(legacy, "index.html"), "Alter Videokatalog");
  }
  await options.save(input);
  await generateSite(options);
  await assert.rejects(stat(path.join(options.outputDirectory, "videos")), { code: "ENOENT" });
  const manifest = JSON.parse(await readFile(path.join(options.outputDirectory, "build-manifest.json"), "utf8"));
  assert.ok(!Object.keys(manifest.pages).some((file) => file.startsWith("videos/")));
  assert.ok(!(await readFile(path.join(options.outputDirectory, "sitemap.xml"), "utf8")).includes("/videos/"));
  assert.notEqual(await readFile(newsPath, "utf8"), before);
});

test("erhält versionierte Assets für gecachtes HTML über lokale und frische CI-Builds", async (t) => {
  const options = await setup(t, fixture(1));
  const first = await generateSite(options);
  const assetsPath = path.join(options.outputDirectory, "assets");
  const previousAssets = new Map([
    ["site", "body{color:rebeccapurple}", "css"],
    ["site", "body{color:navy}", "css"],
    ["video-series", "console.log('previous version');", "js"],
  ].map(([name, content, extension]) => [
    `${name}.${createHash("sha256").update(content).digest("hex").slice(0, 12)}.${extension}`, content,
  ]));
  for (const [file, content] of previousAssets) await writeFile(path.join(assetsPath, file), content);
  await writeFile(path.join(assetsPath, "obsolete.css"), "Not a generated asset");
  for (let build = 0; build < 2; build += 1) {
    const result = await generateSite(options);
    assert.equal(result.files, first.files + previousAssets.size);
    assert.equal(result.cssGzip, first.cssGzip);
    assert.equal(result.jsGzip, first.jsGzip);
    for (const [file, content] of previousAssets) assert.equal(await readFile(path.join(assetsPath, file), "utf8"), content);
    await assert.rejects(stat(path.join(assetsPath, "obsolete.css")), { code: "ENOENT" });
  }
  const restoredOutput = path.join(path.dirname(options.outputDirectory), "ci", "docs");
  await mkdir(path.join(restoredOutput, "assets"), { recursive: true });
  for (const file of await readdir(assetsPath)) {
    await writeFile(path.join(restoredOutput, "assets", file), await readFile(path.join(assetsPath, file)));
  }
  await generateSite({ ...options, outputDirectory: restoredOutput });
  for (const [file, content] of previousAssets) {
    assert.equal(await readFile(path.join(restoredOutput, "assets", file), "utf8"), content);
  }
  const html = await readFile(path.join(restoredOutput, "index.html"), "utf8");
  assert.match(html, /<link rel="stylesheet" href="assets\/site\.[a-f0-9]{12}\.css">/u);
  for (const file of previousAssets.keys()) assert.ok(!html.includes(file));
});

test("verweigert beschädigte oder verlinkte historische Assets und erhält den bisherigen Build", async (t) => {
  const options = await setup(t, fixture(1));
  await generateSite(options);
  const htmlPath = path.join(options.outputDirectory, "index.html");
  const previousHtml = await readFile(htmlPath, "utf8");
  const assetPath = path.join(options.outputDirectory, "assets", "site.000000000000.css");
  await writeFile(assetPath, "Mismatched content");
  await assert.rejects(generateSite(options), /Inhalts-Hash des bisherigen Assets stimmt nicht/u);
  assert.equal(await readFile(htmlPath, "utf8"), previousHtml);
  await rm(assetPath);
  await symlink(htmlPath, assetPath);
  await assert.rejects(generateSite(options), /Versioniertes Asset muss eine echte Datei sein/u);
  await rm(assetPath);
  const assetsPath = path.join(options.outputDirectory, "assets");
  await rm(assetsPath, { recursive: true });
  await symlink(options.cacheDirectory, assetsPath);
  await assert.rejects(generateSite(options), /Asset-Verzeichnis muss ein echtes Verzeichnis sein/u);
  assert.equal(await readFile(htmlPath, "utf8"), previousHtml);
});

test("setzt Sitemap-lastmod nur bei Inhaltsänderungen und erhält Zeitpunkte aus dem CI-Manifest", async (t) => {
  const input = fixture();
  const options = await setup(t, input);
  const firstTime = Date.parse("2021-01-01T12:00:00Z");
  const laterTime = Date.parse("2021-02-01T12:00:00Z");
  const manifestPath = path.join(options.outputDirectory, "build-manifest.json");
  const sitemapPath = path.join(options.outputDirectory, "sitemap.xml");
  const readManifest = async () => JSON.parse(await readFile(manifestPath, "utf8"));
  await generateSite({ ...options, now: firstTime });
  const first = await readManifest();
  const firstSitemap = await readFile(sitemapPath, "utf8");
  assert.equal(first.pages["news/index.html"].lastModified, new Date(firstTime).toISOString());
  assert.equal(first.pages["datenschutz/index.html"].lastModified, new Date(firstTime).toISOString());
  assert.ok(!firstSitemap.includes("404.html"));
  for (const url of firstSitemap.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/url>/gu)) {
    assert.equal(url[2], new Date(firstTime).toISOString());
  }
  input.videos.fetchedAt = "2021-02-01T12:00:00Z";
  await options.save(input);
  const unchanged = await generateSite({ ...options, now: laterTime });
  assert.equal(unchanged.reused, unchanged.files);
  assert.equal(await readFile(sitemapPath, "utf8"), firstSitemap);

  input.videos.videos.at(-1).description = "Korrektur eines aktuellen Videos";
  await options.save(input);
  await generateSite({ ...options, now: laterTime });
  const updated = await readManifest();
  assert.equal(updated.pages["news/index.html"].lastModified, new Date(laterTime).toISOString());
  assert.equal(updated.pages["news/index.html"].contentPublishedAt, first.pages["news/index.html"].contentPublishedAt);
  assert.equal(updated.pages["datenschutz/index.html"].lastModified, first.pages["datenschutz/index.html"].lastModified);
  assert.ok((await readFile(sitemapPath, "utf8")).includes(`<lastmod>${new Date(laterTime).toISOString()}</lastmod>`));

  const restoredOutput = path.join(path.dirname(options.outputDirectory), "ci", "docs");
  await mkdir(restoredOutput, { recursive: true });
  await writeFile(path.join(restoredOutput, "build-manifest.json"), JSON.stringify(updated));
  await generateSite({ ...options, outputDirectory: restoredOutput, now: laterTime + 86400000 });
  assert.equal(await readFile(path.join(restoredOutput, "sitemap.xml"), "utf8"), await readFile(sitemapPath, "utf8"));

  await generateSite({ ...options, now: laterTime + 86400000, baseUrl: "https://example.com/other/" });
  assert.deepEqual((await readManifest()).pages, updated.pages);
  assert.ok((await readFile(sitemapPath, "utf8")).includes("https://example.com/other/news/"));
});

test("migriert alte Manifeste und lehnt beschädigte Änderungsdaten vor dem Schreiben ab", async (t) => {
  const options = await setup(t, fixture(1));
  const manifestPath = path.join(options.outputDirectory, "build-manifest.json");
  const now = Date.parse("2021-01-01T12:00:00Z");
  await generateSite({ ...options, now });
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = 1;
  for (const page of Object.values(manifest.pages)) delete page.lastModified;
  await writeFile(manifestPath, JSON.stringify(manifest));
  await generateSite({ ...options, now: now + 86400000 });
  const migrated = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(migrated.version, 2);
  assert.ok(Object.values(migrated.pages).every((page) => page.lastModified === "2021-01-02T12:00:00.000Z"));
  const previousSitemap = await readFile(path.join(options.outputDirectory, "sitemap.xml"), "utf8");
  migrated.pages["news/index.html"].lastModified = "kein Datum";
  await writeFile(manifestPath, JSON.stringify(migrated));
  await assert.rejects(generateSite({ ...options, now }), /Ungültiger Seiten-Eintrag/u);
  assert.equal(await readFile(path.join(options.outputDirectory, "sitemap.xml"), "utf8"), previousSitemap);
  await assert.rejects(generateSite({ ...options, now: NaN }), /Ungültiger Build-Zeitpunkt/u);
});

test("erhält den letzten erfolgreichen Build bei ungültigen oder fehlenden Quelldaten", async (t) => {
  const input = fixture(1);
  const options = await setup(t, input);
  await generateSite(options);
  const previous = await readFile(path.join(options.outputDirectory, "index.html"), "utf8");
  input.playlists.complete = false;
  await options.save(input);
  await assert.rejects(generateSite(options), /nicht vollständig/u);
  assert.equal(await readFile(path.join(options.outputDirectory, "index.html"), "utf8"), previous);
  await rm(path.join(options.cacheDirectory, "youtube-videos.json"));
  await assert.rejects(generateSite(options), /Quelldatei kann nicht gelesen werden/u);
});

test("erkennt neue Themenlinks als Inhaltsänderung, ohne einen neuen Veröffentlichungszeitpunkt zu erfinden", async (t) => {
  const input = fixture(1);
  const options = await setup(t, input);
  await generateSite(options);
  const manifestFile = path.join(options.outputDirectory, "build-manifest.json");
  const first = JSON.parse(await readFile(manifestFile, "utf8")).pages["news/index.html"];
  input.magazines.videos = [{
    id: input.videos.videos[0].id,
    magazines: [{
      name: "Amiga Joker", issue: null,
      kultmags: { match: "magazine", pageUrl: "https://www.kultmags.com/mags.php?folder=test" },
    }],
  }];
  await options.save(input);
  await generateSite(options);
  const second = JSON.parse(await readFile(manifestFile, "utf8")).pages["news/index.html"];
  assert.notEqual(first.fingerprint, second.fingerprint);
  assert.equal(first.contentPublishedAt, second.contentPublishedAt);
  assert.ok((await readFile(path.join(options.outputDirectory, "news/index.html"), "utf8")).includes("Amiga Joker"));
  assert.ok((await readFile(path.join(options.outputDirectory, "zeitschriften/amiga-joker/index.html"), "utf8")).includes("kultmags.com/mags.php?folder=test"));
});

test("unterstützt lokale Vorschau-Basis und verweigert das Überschreiben von Quellen", async (t) => {
  const options = await setup(t, fixture(1));
  await generateSite({ ...options, baseUrl: "http://localhost:4173/" });
  const html = await readFile(path.join(options.outputDirectory, "index.html"), "utf8");
  assert.ok(html.includes('href="news/"'));
  assert.ok(html.includes('rel="canonical" href="./"'));
  assert.ok(!html.includes("http://localhost:4173/"));
  await assert.rejects(generateSite({ ...options, outputDirectory: options.cacheDirectory }), /Unsicheres Ausgabeverzeichnis/u);
  const legacyOutput = path.join(path.dirname(options.outputDirectory), "public");
  await assert.rejects(generateSite({ ...options, outputDirectory: legacyOutput }), /Ausgabeordner muss docs heißen/u);
  await assert.rejects(stat(legacyOutput), { code: "ENOENT" });
});
