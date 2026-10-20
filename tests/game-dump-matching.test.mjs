import test from "node:test";
import assert from "node:assert/strict";
import { platformMatches, selectDumpCandidate } from "../src/game-dump-matching.mjs";
import policy from "../src/data-game-dump-policy.json" with { type: "json" };

const game = (platforms = []) => ({ name: "Game II", aliases: [], platforms });
const candidate = (mobyid, platforms, title = "Game II") => ({
  mobyid, title, releases: platforms.map((platform, i) => ({ platform, mobyreleaseid: mobyid * 100 + i })),
});
function select(g, candidates) {
  return selectDumpCandidate(g, candidates, policy);
}

test("offene Plattform wählt DOS vor Amiga vor C64 vor NES vor SNES unabhängig von Kandidatenreihenfolge", () => {
  const candidates = [candidate(1, ["Commodore 64"]), candidate(2, ["Amiga"]), candidate(3, ["DOS"])];
  assert.equal(select(game(), candidates).mobyid, 3);
  assert.equal(select(game(), [...candidates].reverse()).mobyid, 3);
  assert.equal(select(game(), candidates.slice(0, 2)).mobyid, 2);
  assert.equal(select(game(), candidates.slice(0, 1)).mobyid, 1);
  assert.deepEqual(select(game(), candidates).platforms, ["MS-DOS"]);
  assert.equal(select(game(), [...candidates, candidate(4, ["NES"]), candidate(5, ["SNES"])]).mobyid, 3);
  assert.equal(select(game(), [candidate(4, ["NES"]), candidate(5, ["SNES"])]).mobyid, 4);
  assert.equal(select(game(), [candidate(5, ["SNES"]), candidate(4, ["NES"])]).mobyid, 4);
  assert.equal(select(game(), [candidate(4, ["NES"]), candidate(1, ["C64"])]).mobyid, 1);
  assert.equal(select(game(), [candidate(5, ["SNES"])]).mobyid, 5);
});

test("festgelegte Plattform bleibt erhalten einschließlich NES und aller Mehrfachplattformen", () => {
  const candidates = [candidate(1, ["DOS"]), candidate(2, ["Amiga"]), candidate(3, ["NES"])];
  assert.equal(select(game(["Amiga"]), candidates).mobyid, 2);
  assert.equal(select(game(["NES"]), candidates).mobyid, 3);
  assert.equal(select(game(["C64"]), candidates).reason, "no-matching-platform");
  assert.equal(select(game(["Amiga", "MS-DOS"]), candidates).reason, "no-matching-platform");
});

test("Mehrdeutigkeit bei DOS weicht nicht auf eindeutiges Amiga aus", () => {
  const result = select(game(), [candidate(1, ["DOS"]), candidate(2, ["DOS"]), candidate(3, ["Amiga"])]);
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "ambiguous-on-selected-platform");
  assert.deepEqual(result.consideredIds, [1, 2]);
  assert.deepEqual(result.platforms, ["MS-DOS"]);
});

test("leere Treffer und nicht priorisierte Plattformen bleiben bei offener Plattform unverifiziert", () => {
  assert.equal(select(game(), []).reason, "no-exact-title-match");
  assert.equal(select(game(), [candidate(1, ["Windows"])]).reason, "no-matching-platform");
});

test("ordnet NES und SNES einschließlich Langformen nur der richtigen Plattform zu", () => {
  for (const platform of ["SNES", "Super Nintendo", "Super Nintendo Entertainment System", "SNES (Super Nintendo Entertainment System)", "Super Famicom"]) {
    assert.ok(platformMatches(["SNES"], platform));
    assert.ok(!platformMatches(["NES"], platform));
    assert.equal(select(game(["SNES"]), [candidate(1, ["NES"]), candidate(2, [platform])]).mobyid, 2);
  }
  for (const platform of ["NES", "Nintendo Entertainment System", "NES (Nintendo Entertainment System)", "Famicom"]) {
    assert.ok(platformMatches(["NES"], platform));
    assert.ok(!platformMatches(["SNES"], platform));
  }
  const ambiguous = select(game(), [candidate(1, ["NES"]), candidate(2, ["NES"]), candidate(3, ["SNES"])]);
  assert.equal(ambiguous.reason, "ambiguous-on-selected-platform");
  assert.deepEqual(ambiguous.platforms, ["NES"]);
});

test("fehlender Titelbeleg und Editionsabweichung bleiben unverifiziert", () => {
  assert.equal(select(game(), [candidate(1, ["DOS"], "Game III")]).reason, "title-unverified");
  assert.equal(select(game(), [candidate(1, ["DOS"], "Game II Gold")]).reason, "edition-unverified");
  assert.equal(select({ ...game(), name: "Game II Gold" }, [candidate(1, ["DOS"], "Game II Gold")]).status, "selected");
  assert.equal(select({ ...game(["Amiga"]), name: "Oil Imperium" },
    [{ ...candidate(1, ["Amiga"], "Black Gold"), alternativeTitles: [{ title: "Oil Imperium" }] }]).status, "selected");
});

test("Releaseumfang enthält nur ausgewählte Plattform ohne andere Quellen", () => {
  const candidates = [candidate(1, ["DOS", "Amiga", "Windows"])];
  const result = select(game(), candidates);
  assert.deepEqual(result.matchingReleaseIds, [100]);
  assert.equal(result.identityBasis, "dump-title-and-platform");
  assert.throws(() => selectDumpCandidate(game(), candidates, { ...policy, requireUniqueCandidate: false }), /Auswahlregel/u);
});
