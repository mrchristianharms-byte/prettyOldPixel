import test from "node:test";
import assert from "node:assert/strict";
import { parseReviewArguments, renderGameMetadataReview } from "../src/generate-game-metadata-review.mjs";

test("Dump-Prüfübersicht zeigt Nutzbarkeit und escaped Titel ohne andere Anbieter", () => {
  const games = [{ id: "game", name: "<Game>", platforms: ["C64"] }];
  const reader = { summary: { games: 1, ready: 0, blocked: 1 }, get: () => ({
    status: "blocked", reason: "ambiguous-on-selected-platform", data: null,
    selection: { platforms: ["C64"], consideredIds: [1, 2] },
  }) };
  const html = renderGameMetadataReview(reader, games);
  assert.match(html, /&lt;Game&gt;/u);
  assert.match(html, /1 unverifiziert/u);
  assert.match(html, /Kandidaten: 1, 2/u);
  assert.ok(!html.includes("Wikidata"));
  assert.throws(() => parseReviewArguments(["--web-cache-dir", "pilot"]), /Aufruf/u);
  assert.throws(() => parseReviewArguments(["--output"]), /Aufruf/u);
});
