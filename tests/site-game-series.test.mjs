import assert from "node:assert/strict";
import test from "node:test";
import { structureGameSeries } from "../src/site-generation/site-game-series.mjs";

const playlist = { id: "PL-first", title: "re.play - Beispiel" };
const video = (id, title, overrides = {}) => ({
  id, title, publishedAt: "2020-01-01T00:00:00Z", playlists: [{ id: playlist.id }], ...overrides,
});
const classify = (title, playlists = [playlist]) => structureGameSeries([video("a", title)], playlists).entries[0].phase;

test("erkennt Phasen aus eindeutigen Titelmerkmalen und speichert den Beleg", () => {
  const cases = [
    ["Beispiel [re.play - #0] Intro / Unboxing [German/Deutsch]", "intro"],
    ["Beispiel [re.play - #1] Die Box [German]", "intro"],
    ["Beispiel [re.play - #1] Das Intro und Boxinhalte", "intro"],
    ["Beispiel [re.play - #2] Vorstellung der Verpackung", "intro"],
    ["Beispiel [re.play - #11 Das Abschlussgespräch [German/Deutsch]", "conclusion"],
    ["Beispiel [re.play - #15] Fazit mit Gästen", "conclusion"],
    ["Beispiel [re.play - #9] Interview mit dem Grafiker", "interview"],
    ["Beispiel [re.consider] Intro und Fazit", "reconsider"],
    ["re.minder / Streamaufzeichnung - Beispiel", "reminder"],
    ["Beispiel [re.minder] [German/Deutsch]", "reminder"],
  ];
  for (const [title, phase] of cases) {
    const actual = classify(title);
    assert.equal(actual.id, phase, title);
    assert.equal(actual.evidence, title);
  }
});

test("rät weder aus Folgenummern noch aus Level-Abschlüssen eine Phasenfolge", () => {
  for (const title of [
    "Beispiel [re.play - #0] Die ersten Schritte",
    "Beispiel [re.play - #1] Gameplay",
    "Beispiel [re.play - #99] Nur noch ein Level",
    "Beispiel [re.play - #4] Der Kampf – Abschluss Level 1",
    "Beispiel [re.play - #8] Ein krönender Abschluss von Level 1?",
    "Beispiel [re.play - #8] Die Anleitung sagt etwas anderes",
    "Unboxing Simulator [re.play - #1] Neuer Level",
    "The Final Interview [re.play - #4] Die Flucht",
  ]) assert.equal(classify(title).id, "gameplay", title);
});

test("nutzt bestätigten Playlist-Kontext, lässt widersprüchliche oder fremde Formate ungeklärt", () => {
  assert.equal(classify("Beispiel – Spielrunde").id, "gameplay");
  assert.equal(classify("Beispiel – Spielrunde").evidence, playlist.title);
  const reconsiderPlaylist = { ...playlist, title: "re.consider - Beispiel" };
  assert.deepEqual(classify("Beispiel – Rückblick", [reconsiderPlaylist]),
    { id: "reconsider", label: "re.consider – Nachbetrachtung", evidence: reconsiderPlaylist.title });
  assert.equal(classify("Beispiel – Spielrunde", []).id, "other");
  assert.equal(classify("Beispiel [re.invented] Vorstellung").id, "other");
  const conflicting = [playlist, { id: "PL-other", title: "re.consider" }];
  const input = video("a", "Beispiel – Beitrag", { playlists: conflicting });
  const entry = structureGameSeries([input], conflicting).entries[0];
  assert.equal(entry.phase.id, "other");
  assert.equal(entry.phase.evidence, null);
  assert.equal(classify("Spieleabendaufzeichnung - Beispiel - Stream 4").id, "gameplay");
  conflicting[1].title = "Beiträge ohne Formatangabe";
  assert.equal(structureGameSeries([input], conflicting).entries[0].phase.id, "other");
  assert.deepEqual(structureGameSeries([input], conflicting), structureGameSeries([input], [...conflicting].reverse()));
});

test("verwechselt bestätigte Spielnamen und Aliase auch ohne Formatmarker nicht mit Phasen", () => {
  const videos = [
    video("a", "The Interview – Die Flucht"),
    video("b", "Unboxing Simulator: Level 1"),
    video("c", "Intro [German/Deutsch]"),
    video("d", "The Interview – Abschlussgespräch"),
  ];
  const series = structureGameSeries(videos, [playlist], ["The Interview", "Unboxing Simulator", "Intro"]);
  assert.deepEqual(series.entries.map((entry) => entry.phase.id), ["gameplay", "gameplay", "gameplay", "conclusion"]);
});

test("behält Reihenfolge und Originalnummern bei, auch nach Fazit und bei späteren Streams", () => {
  const videos = [
    video("a", "Beispiel [re.play - #1] Intro"),
    video("b", "Beispiel [re.play - #2] Abschlussgespräch"),
    video("c", "Beispiel [re.play - #21,5] Weiter geht es"),
    video("d", "Beispiel [streamstag] Stream 1"),
    video("e", "Beispiel [re.minder]", { playlists: [] }),
  ];
  const before = structuredClone(videos);
  const structure = structureGameSeries(videos, [playlist]);
  assert.deepEqual(structure.entries.map((entry) => entry.videoId), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(structure.runs.map((run) => run.videos), [["a", "b", "c"], ["d"], ["e"]]);
  assert.deepEqual(structure.phases.map((phase) => [phase.id, phase.videos]),
    [["intro", ["a"]], ["gameplay", ["c", "d"]], ["conclusion", ["b"]], ["reminder", ["e"]]]);
  assert.deepEqual(videos, before);
});

test("trennt bestätigte Quellplaylists und explizit benannte Staffeln ohne Folge-Reset-Heuristik", () => {
  const second = { id: "PL-second", title: "re.play - Beispiel, späterer Durchlauf" };
  const videos = [
    video("a", "Beispiel Staffel 1 [re.play - #0] Intro"),
    video("b", "Beispiel [re.play - #1] Los geht es"),
    video("c", "Beispiel Staffel 2 [re.play - #0] Intro"),
    video("d", "Beispiel [re.play - #1] Neustart nach Fehler"),
    video("e", "Beispiel [re.play - #0] Noch ein Intro", { playlists: [{ id: second.id }] }),
  ];
  const structure = structureGameSeries(videos, [playlist, second]);
  assert.equal(structure.runs.length, 3);
  assert.match(structure.runs[0].label, /Staffel 1/u);
  assert.match(structure.runs[1].label, /Staffel 2/u);
  assert.deepEqual(structure.runs.map((run) => run.videos), [["a", "b"], ["c", "d"], ["e"]]);
  assert.equal(structure.runs[1].evidence, "Staffel 2");
});

test("überträgt Durchlaufmarker nicht auf andere Formate oder undatierte Videos", () => {
  const videos = [
    video("a", "Beispiel [re.play - #1] 2. Durchlauf"),
    video("b", "Beispiel [re.play - #2] Weiter"),
    video("c", "Beispiel [streamstag] Weiter"),
    video("d", "Beispiel [re.play - #3] Ohne Datum", { publishedAt: null }),
    video("e", "Beispiel [re.play - #0] Durchlauf 3", { publishedAt: null }),
    video("f", "Beispiel [re.play - #4] Ebenfalls ohne Datum", { publishedAt: null }),
  ];
  const structure = structureGameSeries(videos, [playlist]);
  assert.deepEqual(structure.runs.map((run) => run.videos), [["a", "b"], ["c"], ["d", "f"], ["e"]]);
  assert.match(structure.runs[0].label, /Durchlauf 2/u);
  assert.match(structure.runs[3].label, /Durchlauf 3/u);
});
