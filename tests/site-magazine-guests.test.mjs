import assert from "node:assert/strict";
import test from "node:test";
import { extractMagazineGuests, magazineGuests } from "../src/content-data/site-magazine-guests.mjs";

test("liest Gäste aus Namens-, Handle- und kombinierten Titelvarianten ohne Heft- oder Streamzusätze", () => {
  const cases = [
    ["Blätterabend mit @retrokompott - PC Games 7/93", "@retrokompott", "@retrokompott"],
    ["Blätterabendaufzeichnung mit Christian @StayForeverDE - GameStar 12/99 - Teil 2", "@stayforeverde", "Christian @StayForeverDE"],
    ["Blätterabend mit Robin - @retrokompott | Computer Games Strategy Plus 4/93", "@retrokompott", "Robin @retrokompott"],
    ["Blätterabend - ASM 04/92 - Mit Robin @retrokompott", "@retrokompott", "Robin @retrokompott"],
    ["Blätterabend mit @avavii  PC Player 04/96 -", "@avavii", "@avavii"],
    ["Blätterabend mit @cirdan7746 PC Joker 01/93 | Spiele", "@cirdan7746", "@cirdan7746"],
    ["Blätterabend mit Falko Löffler und dem PC Games Sonderheft Adventure", "falko löffler", "Falko Löffler"],
    ["Blätterabend mit Falko Löffler und der Power Play Ausgabe 2 - 1988", "falko löffler", "Falko Löffler"],
    ["Blätterabend mit Jörg Langer in der retro GAMER 3/2024 / Game Star 1/2000", "jörg langer", "Jörg Langer"],
    ["Blätterabend mit @v3to_c64pixels in der Power Play 04/91", "@v3to_c64pixels", "@v3to_c64pixels"],
    ["Blätterabend mit Hardy vom Nerdwelten Podcast - Ab ~ 20:30 PC Player 9/97 -", "hardy vom nerdwelten podcast", "Hardy vom Nerdwelten Podcast"],
    ["Blätterabend mit Andreas - Ab ~ 20:30 Power Play 1/1988", "andreas", "Andreas"],
    ["Blätterabend mit Massimo | GameStar #1 10/97", "massimo", "Massimo"],
  ];
  for (const [title, key, name] of cases) assert.deepEqual(extractMagazineGuests(title), [{ key, name }], title);
});

test("ergänzt bekannte Gäste im zweiten Durchlauf nur anhand vollständiger Namen und Handles", () => {
  const titles = [
    "Power Play - Strategie für Geniesser - Steinwallen [re.read]",
    "Blätterabend mit @Steinwallen - ASM",
    "Blätterabend mit Christian @StayForeverDE - PC Games",
    "GameStar - stayforeverde",
    "PC Games - Christian",
    "PC Games - @SteinwallenExtra",
    "PC Games - NichtSteinwallen",
    "PC Games - @Unbekannt",
    "Blätterabend mit Jörg Langer - Power Play",
    "Power Play - JÖRG LANGER",
    "Power Play - Langer",
    "Blätterabend mit @v3to_c64pixels",
    "Power Play - @vetodrom",
    "Interview mit @Steinwallen",
    "Blätterabend mit Christian - PC Games",
  ];
  const videos = titles.map((title, index) => ({
    id: String(index), title, blaetterabend: index !== 13, magazines: [],
  }));
  const guests = magazineGuests(videos, []);
  assert.deepEqual(guests.find((guest) => guest.key === "@steinwallen").videoIds, ["0", "1"]);
  assert.deepEqual(guests.find((guest) => guest.key === "@stayforeverde").videoIds, ["2", "3"]);
  assert.deepEqual(guests.find((guest) => guest.key === "jörg langer").videoIds, ["8", "9"]);
  assert.deepEqual(guests.find((guest) => guest.key === "@v3to_c64pixels").videoIds, ["11", "12"]);
  assert.deepEqual(guests.find((guest) => guest.key === "christian").videoIds, ["14", "4"]);
  assert.equal(guests.length, 5);
  assert.deepEqual(magazineGuests([...videos].reverse(), []), guests);
});

test("erkennt mehrere ausdrückliche Gäste, ignoriert Chat-Vote und erfindet keine fehlenden Namen", () => {
  assert.deepEqual(extractMagazineGuests("Blätterabend mit Anna und Ben - PC Games"), [
    { key: "anna", name: "Anna" }, { key: "ben", name: "Ben" },
  ]);
  assert.deepEqual(extractMagazineGuests("Blätterabend mit @Anna & @Ben - PC Games"), [
    { key: "@anna", name: "@Anna" }, { key: "@ben", name: "@Ben" },
  ]);
  for (const title of [
    "Blätterabend mit Chat-Vote - PC Power / PC Player / ASM",
    "Blätterabend ohne Gast", "Blätterabend mit ", "Blätterabend mit <script>Gast</script>",
    "Blätterabend mit vielen Spielen", "Blätterabend mit Ab ~ 20:30",
  ]) assert.deepEqual(extractMagazineGuests(title), [], title);
});
