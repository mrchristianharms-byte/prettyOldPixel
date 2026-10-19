import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCompanyName, normalizeReleaseCompanies } from "../src/game-company-names.mjs";

test("vereinheitlicht ausschließlich die ausdrücklich ausgewählten Firmengruppen", () => {
  const cases = [
    ["Blue Byte Studio GmbH", ["Blue Byte Software GmbH", "Blue Byte Software GmbH & Co. KG"]],
    ["Cinemaware", ["Cinemaware Corporation"]],
    ["Max Design GesMBH", ["Max Design GmbH & Co."]],
    ["Adventuresoft Ltd.", ["Adventure Soft Publishing Ltd."]],
    ["MicroProse", ["MicroProse Ltd.", "MicroProse Software, Inc.", "MPS Labs"]],
    ["Interplay", ["Interplay Productions, Inc.", "Interplay Entertainment Corp."]],
    ["Westwood", ["Westwood Associates", "Westwood Studios, Inc."]],
    ["Gremlin", ["Gremlin Graphics Software Limited", "Gremlin Interactive Limited"]],
    ["Sierra", ["Sierra On-Line, Inc.", "Sierra Entertainment, Inc."]],
    ["Konami", ["Konami Co., Ltd.", "Konami, Inc."]],
    ["Mindscape", ["Mindscape International Ltd.", "Mindscape, Inc."]],
    ["Sun", ["Sun Electronics Corp.", "Sun Corporation of America"]],
    ["Virgin", ["Virgin Games, Ltd.", "Virgin Games, Inc.", "Virgin Interactive Entertainment, Inc.",
      "Virgin Interactive Entertainment (Europe) Ltd.", "Virgin Mastertronic Ltd."]],
  ];
  for (const [canonical, variants] of cases) {
    for (const value of [canonical, ...variants]) {
      assert.equal(normalizeCompanyName(value), canonical, value);
      assert.equal(normalizeCompanyName(normalizeCompanyName(value)), canonical);
    }
  }
  for (const name of ["Lucasfilm Games LLC", "LucasArts Entertainment Company LLC", "Ascon GmbH",
    "Ascon (U.K.) Ltd.", "ASCARON Entertainment GmbH", "Nintendo Co., Ltd.", "Nintendo of America Inc.",
    "Nintendo of Europe GmbH", "Electronic Arts, Inc.", "Unknown MicroProse Studio"]) {
    assert.equal(normalizeCompanyName(name), name);
  }
  assert.equal(normalizeCompanyName(null), null);
  assert.equal(normalizeCompanyName("  "), null);
});

test("erhält Quellen, Veröffentlichungsfelder und Mehrfachfirmen ohne blindes Komma-Splitting", () => {
  const release = { developer: "Magnetic Scrolls, \n          MicroProse Ltd.",
    publisher: "Virgin Games, Inc.", year: 1993, countries: "Germany", publisherLabel: "Budget" };
  const normalized = normalizeReleaseCompanies(release);
  assert.deepEqual(normalized, {
    ...release, developer: "Magnetic Scrolls, MicroProse", publisher: "Virgin",
    sourceDeveloper: release.developer, sourcePublisher: release.publisher,
  });
  assert.equal(release.publisher, "Virgin Games, Inc.");
  assert.deepEqual(normalizeReleaseCompanies(normalized), normalized);
  assert.equal(normalizeCompanyName("Electronic Arts, Inc., \n          Ocean Software Ltd."),
    "Electronic Arts, Inc., Ocean Software Ltd.");
});
