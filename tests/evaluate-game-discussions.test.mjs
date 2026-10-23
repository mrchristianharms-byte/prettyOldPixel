import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  evaluateDiscussions, formatEvaluation, parsePredictions, referenceDirectory, validateReference,
} from "../src/extra-data/evaluate-game-discussions.mjs";

const reference = () => ({
  videoId: "63foHISC8ms", status: "draft",
  discussions: [
    { title: "Falcon", aliases: ["Felken"], startMs: 100_000, endMs: 200_000 },
    { title: "Gunship", startMs: 300_000, endMs: 400_000 },
    { title: "Xenon", startMs: 500_000, endMs: 560_000 },
  ],
  unclear: [{ title: "Black Lamp", startMs: 700_000, endMs: 750_000 }],
  rejected: [{ title: "Wasteland 3", startMs: 900_000 }],
});

test("Bewertung zählt Aliase, Grenzen, Fehlalarme und unklare Bereiche getrennt", () => {
  const result = evaluateDiscussions(reference(), [
    { title: "Felken", startMs: 105_000, endMs: 210_000 },
    { title: "Gunchip", startMs: 300_000, endMs: 400_000 },
    { title: "Black Lamp", startMs: 700_000, endMs: 740_000 },
    { title: "Wasteland 3", startMs: 900_000, endMs: 960_000 },
  ]);

  assert.equal(result.correct, 1);
  assert.equal(result.neutral, 1);
  assert.equal(result.precision, 1 / 3);
  assert.equal(result.recall, 1 / 3);
  assert.equal(result.boundaryAccuracy, 1);
  assert.deepEqual(result.matches.map((match) => [match.expected.title, match.titleCorrect]),
    [["Falcon", true], ["Gunship", false]]);
  assert.deepEqual(result.missed.map((item) => item.title), ["Xenon"]);
  assert.deepEqual(result.falsePositives.map((item) => item.title), ["Wasteland 3"]);
  assert.match(formatEvaluation(result, "probe"), /ENTWURF[\s\S]*≠ 0:05:00 Gunship – erkannt als „Gunchip“/u);
});

test("Bewertung ordnet jede Vorhersage höchstens einem Referenzabschnitt zu", () => {
  const result = evaluateDiscussions(reference(), [
    { title: "Falcon", startMs: 100_000, endMs: 150_000 },
    { title: "Falcon", startMs: 150_000, endMs: 200_000 },
    { title: "Xenon", startMs: 520_000, endMs: null },
  ]);

  assert.equal(result.correct, 2);
  assert.equal(result.falsePositives.length, 1);
  assert.equal(result.matches.find((match) => match.expected.title === "Xenon").endDeltaMs, null);
  assert.equal(result.boundaryAccuracy, 0);
});

test("Vorhersagen werden aus Analyse-JSON und CSV mit beliebiger Titelspalte gelesen", () => {
  assert.deepEqual(parsePredictions(JSON.stringify({ discussions: [{ title: "Xenon", startMs: 1, endMs: null }] })),
    [{ title: "Xenon", startMs: 1, endMs: null }]);
  assert.deepEqual(parsePredictions("startMs,durationMs,gameTitle\n1000,500,\"Ports of Call, Deluxe\"\n2000,,Xenon\n", "a.csv"), [
    { title: "Ports of Call, Deluxe", startMs: 1000, endMs: 1500 },
    { title: "Xenon", startMs: 2000, endMs: null },
  ]);
  assert.throws(() => parsePredictions("start,title\n1,Xenon\n", "a.csv"), /CSV benötigt/u);
});

test("Referenzen benötigen Status und vollständige Zeitangaben", () => {
  assert.throws(() => validateReference({ ...reference(), status: "fertig" }), /draft oder confirmed/u);
  assert.throws(() => validateReference({ ...reference(), discussions: [{ title: "Xenon", startMs: 1, endMs: null }] }),
    /Endzeit/u);
});

test("Gespeicherte Referenzentwürfe sind gültig", async () => {
  const data = JSON.parse(await readFile(`${referenceDirectory}/63foHISC8ms.json`, "utf8"));
  assert.equal(validateReference(data).videoId, "63foHISC8ms");
});
