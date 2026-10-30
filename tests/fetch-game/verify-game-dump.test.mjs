import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeJson } from "../../src/shared/archive-cache.mjs";
import { verifyGameDump } from "../../src/fetch-game/verify-game-dump.mjs";

test("prüft nur den Dump und weist falsche Titel, doppelte IDs und ungültige Releases zurück", async (t) => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "pixel-dump-validation-"));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const game = { id: "game", name: "Game II", platforms: ["C64"], aliases: [] };
  const report = { version: 1, provider: "mobygames-local-dump", importedAt: "2026-10-18",
    source: { sha256: "a".repeat(64) }, games: [{ gameId: game.id, title: game.name, platforms: game.platforms,
      candidates: [{ mobyid: 10, title: "Game II", genres: ["Action"], alternativeTitles: [], releases: [{
        mobyid: 10, mobyreleaseid: 100, platform: "Commodore 64", year: 1985,
        developer: null, publisher: "Publisher", countries: null, publabel: null,
      }] }] }] };
  const file = path.join(cacheDir, "local-dump/report.json");
  await writeJson(file, report);
  const options = { cacheDir, games: [game] };
  const result = await verifyGameDump(options);
  assert.deepEqual(result.report, report);
  assert.match(result.reportHash, /^[a-f0-9]{64}$/u);
  const invalid = structuredClone(report);
  invalid.games[0].candidates[0].title = "Game III";
  await writeJson(file, invalid);
  await assert.rejects(verifyGameDump(options), /Titel-\/Aliasbezug/u);
  invalid.games[0].candidates[0].title = "Game II";
  invalid.games[0].candidates.push(invalid.games[0].candidates[0]);
  await writeJson(file, invalid);
  await assert.rejects(verifyGameDump(options), /Ungültiger Kandidat/u);
  invalid.games[0].candidates.pop();
  invalid.games[0].candidates[0].releases[0].year = 9999;
  await writeJson(file, invalid);
  await assert.rejects(verifyGameDump(options), /Releasefelder/u);
  await writeJson(file, { ...report, games: [] });
  await assert.rejects(verifyGameDump(options), /vollständig/u);
});
