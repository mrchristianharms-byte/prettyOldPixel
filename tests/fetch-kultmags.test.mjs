import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseBlaetterabendTitle } from "../src/generate-blaetterabend.mjs";
import {
  findKultmagsIssue,
  folderUrl,
  loadKultmagsCatalog,
  parseFolderPage,
  parseIssueTitle,
} from "../src/fetch-kultmags.mjs";

const folderLink = (folder) => `<div class="folder-name"><a href="mags.php?folder=${encodeURIComponent(Buffer.from(folder).toString("base64"))}"><strong>${folder.split("/").pop()}</strong></a></div>`;
const card = (title, file, reader = true) => `<article class="magazine-card"><div class="item-title"><strong><u>${title}</u></strong></div>`
  + `<img class="mag-cover" src="${file}.jpg"><a href="${file}"><img src="img/pdf.png"></a>`
  + (reader ? `<a href="https://reader.kultmags.com/${encodeURIComponent(title)}"><img src="img/or.png"></a>` : "")
  + "</article>";

const pages = new Map([
  ["mags.php", folderLink("Power Play") + folderLink("PC-Games") + folderLink("Smash") + folderLink("Happy Computer")],
  ["Power Play", folderLink("Power Play/1988") + folderLink("Power Play/Special")],
  ["Power Play/1988", card("Power Play 1988-06..07", "Power%20Play/1988/Power%20Play%201988-06..07.rar")
    + card("Power Play 1988-08..09", "Power%20Play/1988/Power%20Play%201988-08..09.rar")],
  ["Power Play/Special", card("Power Play 1990-02", "Power%20Play/Special/Power%20Play%201990-02.rar")],
  ["PC-Games", folderLink("PC-Games/1993") + folderLink("PC-Games/Sonderhefte")],
  ["PC-Games/1993", card("PC Games 1993-09", "PC-Games/1993/PC%20Games%201993-09.rar")
    + card("PC-Games 1993-09 - Beilage", "PC-Games/1993/PC-Games%201993-09%20-%20Beilage.rar")],
  ["PC-Games/Sonderhefte", card("PC-Games - Sonderheft 1992-01 - Rollenspiele", "PC-Games/Sonderhefte/r.rar")
    + card("PC-Games - Sonderheft 1994-01 - Adventures", "PC-Games/Sonderhefte/a.rar")],
  ["Smash", card("Smash 1989-02", "Smash/Smash%201989-02.rar", false) + card("Smash 1989-03", "Smash/Smash%201989-03.rar", false)],
  ["Happy Computer", folderLink("Happy Computer/Sonderhefte")],
  ["Happy Computer/Sonderhefte", card("Happy Computer - Sonderheft 03 - Spiele 1", "HC/s03.rar")
    + card("Happy Computer - Sonderheft 11 - Spiele 2", "HC/s11.rar")],
]);

function createFetch() {
  const requests = [];
  const fetchImpl = async (url) => {
    const folder = new URL(url).searchParams.get("folder");
    const key = folder ? Buffer.from(folder, "base64").toString("utf8") : "mags.php";
    requests.push(key);
    const body = pages.get(key);
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body };
  };
  return { fetchImpl, requests };
}

async function withCatalog(callback) {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "kultmags-"));
  try {
    const { fetchImpl, requests } = createFetch();
    const options = { cacheDir, fetchImpl, sleep: async () => {}, log: () => {} };
    const catalog = await loadKultmagsCatalog({ ...options, magazineNames: ["Power Play", "PC Games", "Smash", "Happy Computer", "GameStar"] });
    await callback({ catalog, cacheDir, requests, options });
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
}

const link = (catalog, name, title) => {
  const magazine = parseBlaetterabendTitle(`Blätterabend - ${title}`).magazines.find((candidate) => candidate.name === name);
  return findKultmagsIssue(catalog, name, magazine.issue, title);
};

test("parseFolderPage liest Unterordner und Ausgabenkarten", () => {
  const page = parseFolderPage(pages.get("mags.php") + pages.get("Power Play/1988"));
  assert.deepEqual(page.folders, ["Power Play", "PC-Games", "Smash", "Happy Computer"]);
  assert.equal(page.cards[0].title, "Power Play 1988-06..07");
  assert.equal(page.cards[0].downloadUrl, "https://www.kultmags.com/Power%20Play/1988/Power%20Play%201988-06..07.rar");
  assert.match(page.cards[0].readerUrl, /^https:\/\/reader\.kultmags\.com\//);
  assert.equal(folderUrl("Power Play"), "https://www.kultmags.com/mags.php?folder=UG93ZXIgUGxheQ%3D%3D");
});

test("extrahiert nur das Titelbild aus archive-title-image und löst relative URLs auf", () => {
  const page = parseFolderPage(`<img src="img/banner.png"><div class='extra archive-title-image'>
<img alt="" src='Amiga%20Joker/1990/title.png'></div>`);
  assert.equal(page.logoUrl, "https://www.kultmags.com/Amiga%20Joker/1990/title.png");
  assert.equal(parseFolderPage('<img src="img/banner.png">').logoUrl, null);
  for (const src of ["https://example.org/logo.png", "javascript:alert(1)", "logo.svg"]) {
    assert.throws(() => parseFolderPage(`<div class="archive-title-image"><img src="${src}"></div>`), /Logoadresse/u);
  }
});

test("ergänzt alte frische Caches nur über die Titelseite und speichert das Logo lokal", async () => {
  await withCatalog(async ({ options, cacheDir }) => {
    const file = path.join(cacheDir, "magazines", "smash.json");
    const original = JSON.parse(await readFile(file, "utf8"));
    delete original.logo;
    await writeFile(file, JSON.stringify(original));
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=", "base64");
    const requests = [];
    const catalog = await loadKultmagsCatalog({
      ...options, magazineNames: ["Smash"],
      fetchImpl: async (url) => {
        requests.push(url);
        return url.endsWith("/title.png") ? new Response(bytes)
          : new Response('<div class="archive-title-image"><img src="Smash/title.png"></div>');
      },
    });
    assert.deepEqual(requests, [folderUrl("Smash"), "https://www.kultmags.com/Smash/title.png"]);
    const updated = catalog.magazines.get("Smash");
    assert.deepEqual(updated.issues, original.issues);
    assert.equal(updated.fetchedAt, original.fetchedAt);
    assert.equal(updated.logo.url, "https://www.kultmags.com/Smash/title.png");
    assert.deepEqual(await readFile(path.join(cacheDir, "logos", updated.logo.file)), bytes);
    await loadKultmagsCatalog({
      ...options, magazineNames: ["Smash"], fetchImpl: () => assert.fail("Erneuter Abruf"),
    });
  });
});
test("parseIssueTitle erkennt Doppelausgaben, Beilagen und Sonderheftnummern", () => {
  assert.deepEqual(parseIssueTitle("Power Play 1988-06..07", "1988").numbers, [6, 7]);
  assert.equal(parseIssueTitle("PC-Games 1993-09 - Beilage", "1993").supplement, true);
  const special = parseIssueTitle("Happy Computer - Sonderheft 11 - Spiele 2", "Sonderhefte");
  assert.equal(special.special, true);
  assert.deepEqual(special.numbers, [11]);
});

test("verlinkt reguläre Ausgaben, Doppelhefte und Hefte nach Nummer", async () => {
  await withCatalog(({ catalog }) => {
    assert.equal(link(catalog, "Power Play", "Power Play 8/9 88").title, "Power Play 1988-08..09");
    assert.equal(link(catalog, "Power Play", "Power Play 7/88").title, "Power Play 1988-06..07");
    const pcGames = link(catalog, "PC Games", "PC Games 9/93");
    assert.equal(pcGames.title, "PC Games 1993-09");
    assert.match(pcGames.readerUrl, /reader\.kultmags\.com/);
    const smash = link(catalog, "Smash", "SMASH 3 Mai/Juni 1989");
    assert.equal(smash.title, "Smash 1989-03");
    assert.equal(smash.matchedBy, "number");
  });
});

test("verlinkt Sonderhefte über Stichwort oder Nummer und fällt sonst auf den Ordner zurück", async () => {
  await withCatalog(({ catalog }) => {
    assert.equal(link(catalog, "PC Games", "PC Games Sonderheft Adventure").title, "PC-Games - Sonderheft 1994-01 - Adventures");
    assert.equal(link(catalog, "PC Games", "PC Games - Sonderheft Rollenspiele - 1992").matchedBy, "keyword");
    assert.equal(link(catalog, "Happy Computer", "Happy Computer Sonderheft 3").title, "Happy Computer - Sonderheft 03 - Spiele 1");

    const unknownSpecial = link(catalog, "Happy Computer", "Happy Computer Sonderausgabe 4");
    assert.equal(unknownSpecial.match, "folder");
    assert.equal(unknownSpecial.pageUrl, folderUrl("Happy Computer/Sonderhefte"));
    // A single special issue in the same year is not enough evidence for a match.
    assert.equal(link(catalog, "Power Play", "Power Play Die besten Spiele '90").match, "folder");

    const missingIssue = link(catalog, "Power Play", "Power Play 12/89");
    assert.deepEqual([missingIssue.match, missingIssue.pageUrl], ["folder", folderUrl("Power Play")]);
    assert.equal(link(catalog, "GameStar", "GameStar 5/98"), null);
  });
});

test("nutzt den Cache und lädt nur mit refresh neu", async () => {
  await withCatalog(async ({ cacheDir, requests, options }) => {
    assert.equal(requests.length, 10);
    const cached = JSON.parse(await readFile(path.join(cacheDir, "magazines", "pc-games.json"), "utf8"));
    assert.equal(cached.name, "PC-Games");
    assert.equal(cached.issues.length, 4);

    const second = createFetch();
    await loadKultmagsCatalog({ ...options, fetchImpl: second.fetchImpl, magazineNames: ["Power Play", "Smash"] });
    assert.deepEqual(second.requests, []);

    await loadKultmagsCatalog({ ...options, fetchImpl: second.fetchImpl, magazineNames: ["Smash"], refresh: true });
    assert.deepEqual(second.requests, ["mags.php", "Smash"]);
  });

});

test("liest im Offline-Modus auch veraltete Caches und meldet fehlende Dateien ohne Abruf", async () => {
  await withCatalog(async ({ cacheDir, options }) => {
    const offline = {
      ...options, cachedOnly: true, refresh: true, now: Date.parse("2099-01-01"),
      fetchImpl: () => { throw new Error("Unerlaubter Netzwerkzugriff"); },
      magazineNames: ["Power Play"],
    };
    const file = path.join(cacheDir, "magazines", "power-play.json");
    const before = await readFile(file, "utf8");
    const catalog = await loadKultmagsCatalog(offline);
    assert.ok(catalog.magazines.has("Power Play"));
    assert.equal(await readFile(file, "utf8"), before);
    await rm(file);
    await assert.rejects(loadKultmagsCatalog(offline), /kultmags-Cache fehlt:.*fetch:archives/u);
    await rm(path.join(cacheDir, "index.json"));
    await assert.rejects(loadKultmagsCatalog(offline), /kultmags-Cache fehlt:.*index.json/u);
  });

});

test("behält Ausgabendetails 365 Tage und aktualisiert den Index weiterhin nach 30 Tagen", async () => {
  await withCatalog(async ({ cacheDir, options }) => {
    const file = path.join(cacheDir, "magazines", "power-play.json");
    const before = await readFile(file, "utf8");
    const start = Date.parse(JSON.parse(before).fetchedAt);
    const mock = createFetch();
    const load = (days) => loadKultmagsCatalog({
      ...options, fetchImpl: mock.fetchImpl, magazineNames: ["Power Play"], now: start + days * 86400000,
    });
    await load(29);
    assert.deepEqual(mock.requests, []);
    await load(30);
    assert.deepEqual(mock.requests, ["mags.php"]);
    mock.requests.length = 0;
    await load(364);
    assert.deepEqual(mock.requests, ["mags.php"]);
    assert.equal(await readFile(file, "utf8"), before);
    mock.requests.length = 0;
    await load(365);
    assert.deepEqual(mock.requests, ["Power Play", "Power Play/1988", "Power Play/Special"]);
    assert.equal(JSON.parse(await readFile(file, "utf8")).fetchedAt, new Date(start + 365 * 86400000).toISOString());
  });
});
