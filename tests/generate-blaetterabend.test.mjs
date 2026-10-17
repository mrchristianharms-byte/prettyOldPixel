import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  generateBlaetterabendList,
  extractBlaetterabendVideos,
  parseBlaetterabendTitle,
} from "../src/generate-blaetterabend.mjs";

const summarize = (title) => {
  const { magazines, part } = parseBlaetterabendTitle(title);
  return { magazines: magazines.map(({ name, issue }) => `${name}${issue ? ` ${issue.label}` : ""}`), part };
};

const cases = [
  ["Blätterabendaufzeichnung - PowerPlay 11/88 -", ["Power Play 11/1988"], null],
  ["Blätterabendaufzeichnung mit @MrVenom1974  - PowerPlay - 12 / 1988 - Teil 2", ["Power Play 12/1988"], 2],
  ["Blätterabendaufzeichnung - SMASH 3 Mai/Juni 1989 - Teil 2", ["Smash #3 5+6/1989"], 2],
  ["Blätterabendaufzeichnung - SMASH - 3 - Mai/Juni 1989 - Teil 1", ["Smash #3 5+6/1989"], 1],
  ["Blätterabendaufzeichnung - Amiga Games Sonderheft 1/94 - Die Hits - Die Macher -", ["Amiga Games Sonderheft 1/1994"], null],
  ["Blätterabendaufzeichnung - Computer Gaming World - #60 - 6/89", ["Computer Gaming World #60 6/1989"], null],
  ["Blätterabend - Computer Gaming World 1989 Nr. 56", ["Computer Gaming World #56 1989"], null],
  ["Blätterabend - Computer Gaming World - 15th Anniversary - [re.read] 04.05.2021 [German/Deutsch]", ["Computer Gaming World #148 11/1996"], null],
  ["Blätterabend - Computer Gaming World - 15th Anniversary - [re.read] 20.04.2021 [German/Deutsch]", ["Computer Gaming World #148 11/1996"], null],
  ["Blätterabend - Computer Gaming World - 15th Anniversary - [re.read] 13.04.2021 [German/Deutsch]", ["Computer Gaming World #148 11/1996"], null],
  ["Aufzeichnung - Blätterabend - Computer Gaming World [re.read] 17.07.2022 [German/Deutsch]", ["Computer Gaming World"], null],
  ["Blätterabend - PC Gamer US - 15th Anniversary", ["PC Gamer US"], null],
  ["Blätterabend @VirtualDimension  - Amiga Fever Nr. 2 - 2/99", ["Amiga Fever #2 2/1999"], null],
  ["Blätterabendaufzeichnung - GameStar 6/99 & Amiga Action #025 October 1991 - Teil 3", ["GameStar 6/1999", "Amiga Action #25 10/1991"], 3],
  ["Aufzeichnung - Blätterabend mit Jörg Langer in der retro GAMER 3/2024 / Game Star 1/2000", ["Retro Gamer 3/2024", "GameStar 1/2000"], null],
  ["Blätterabend  |  Amiga Joker 8/9 92", ["Amiga Joker 8+9/1992"], null],
  ["Aufzeichnung - Blätterabend - Power Play 6/7 1988 -", ["Power Play 6+7/1988"], null],
  ["Aufzeichnung - Blätterabend - Play Time 8+9/95 [German/Deutsch]", ["Play Time 8+9/1995"], null],
  ["Aufzeichnung - Blätterabend - Die 100 Besten Spiele 1994 - Power Play Sonderheft - Teil 2", ["Power Play Sonderheft 1994"], 2],
  ["Blätterabend - Power Play \"Die BESTEN Spiele '89\" [re.read] 02.11.2021 [German/Deutsch]", ["Power Play Sonderheft 1989"], null],
  ["Blätterabend - PC Gamer 5/94 - Top 50 Games Of All Time - Stream II", ["PC Gamer 5/1994"], 2],
  ["Blätterabend - C64'er Top 111 Spiele - Stream #2", ["64'er Sonderheft"], 2],
  ["Blätterabend-Aufzeichnung - Happy Computer '88 -", ["Happy Computer 1988"], null],
  ["Blätterabend mit Falko Löffler und der Power Play Ausgabe 2 - 1988", ["Power Play #2 1988"], null],
  ["Blätterabend - PC Jocker 8/93 [re.read] 28.10.2021 [German/Deutsch]", ["PC Joker 8/1993"], null],
  ["Blätterabend | Ab ~ 20:30 PC Extreme 11/96", ["PC Xtreme 11/1996"], null],
  ["Blätterabend mit @virtual_dimension - Amiga 8/91 - Steam Teil 2", ["Amiga 8/1991"], 2],
  ["Aufzeichnung Blätterabend -  Amiga Play 1/91 - Die 111 besten Amiga Spiele", ["Amiga Play 1/1991"], null],
  ["Blätterabend - GameStar 11/97 - NHL 98 / Dark Reign / Diablo 2 / Lands of Lore 2", ["GameStar 11/1997"], null],
  ["Blätterabend - Aufzeichnung - PC Games 10/97 - 5 Jahre PC Games - Teil 2", ["PC Games 10/1997"], 2],
  ["Streamaufzeichnung vom 04.08.2023 Blätterabend - PC Games 6/94", ["PC Games 6/1994"], null],
  ["Total! 06/93 - Blätterabend [streamstag] 19.05.2020 [German/Deutsch]", ["Total! 6/1993"], null],
  ["Aufzeichnung - Blätterabend mit Chat-Vote - PC Power / PC Player / ASM", ["PC Power", "PC Player", "ASM"], null],
  ["Blätterabend - Nach Zuschauerabstimmung", [], null],
];

for (const [title, magazines, part] of cases) {
  test(`erkennt Zeitschrift und Ausgabe: ${title}`, () => {
    assert.deepEqual(summarize(title), { magazines, part });
  });
}

test("liefert die Ausgabe strukturiert", () => {
  assert.deepEqual(parseBlaetterabendTitle("Blätterabendaufzeichnung - SMASH 3 Mai/Juni 1989 - Teil 2"), {
    magazines: [{
      name: "Smash",
      issue: { label: "#3 5+6/1989", number: 3, months: [5, 6], year: 1989, special: false },
    }],
    part: 2,
  });
});

test("filtert nur Videos mit Blätterabend im Titel", () => {
  const videos = extractBlaetterabendVideos([
    { id: "a", title: "Blätterabend - ASM 9/93", publishedAt: "2021-01-26T00:00:00Z", durationSeconds: 60 },
    { id: "b", title: "Cadaver [re.play - #16]", publishedAt: "2026-10-16T00:00:00Z", durationSeconds: 60 },
  ]);
  assert.deepEqual(videos.map(({ id }) => id), ["a"]);
  assert.equal(videos[0].url, "https://www.youtube.com/watch?v=a");
});

test("schreibt die Ergebnisliste als JSON-Datei", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blaetterabend-"));
  const sourceFile = path.join(directory, "youtube-videos.json");
  const targetFile = path.join(directory, "blaetterabend-videos.json");
  try {
    await writeFile(sourceFile, JSON.stringify({
      channel: { handle: "PrettyOldPixel" },
      videos: [{ id: "a", title: "Blätterabend - ASM 9/93", publishedAt: "2021-01-26T00:00:00Z", durationSeconds: 60 }],
    }));
    await generateBlaetterabendList({ sourceFile, targetFile, log: () => {}, kultmags: false });

    const result = JSON.parse(await readFile(targetFile, "utf8"));
    assert.equal(result.count, 1);
    assert.equal(result.videos[0].magazines[0].issue.label, "9/1993");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
