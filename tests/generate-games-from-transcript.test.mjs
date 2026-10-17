import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  analyzeWindow, generateGamesFromTranscript, llmConfiguration, mergeDiscussions,
  prepareSegments, transcriptWindows, validateDiscussions,
} from "../src/generate-games-from-transcript.mjs";

const config = llmConfiguration({ OPENAI_BASE_URL: "http://127.0.0.1:11434/v1", OPENAI_MODEL: "qwen3:14b" });
const segments = prepareSegments({
  status: "available", segments: Array.from({ length: 50 }, (_, index) => ({
    startMs: index * 10_000, durationMs: 12_000, text: `Text ${index}`,
  })),
});
const candidate = (overrides = {}) => ({
  title: "Doom", firstSegmentId: 2, lastSegmentId: 5, evidenceSegmentId: 3,
  confidence: "high", endReason: "topic-change", continuesBefore: false, continuesAfter: false,
  ...overrides,
});

test("liest Modellkonfiguration und verhindert Übertragung an externe Endpunkte", () => {
  assert.equal(config.model, "qwen3:14b");
  assert.equal(config.endpoint, "http://127.0.0.1:11434/v1/chat/completions");
  for (const url of ["https://example.org/v1", "http://127.0.0.1.evil.org/v1",
    "file:///tmp/test", "http://user:pass@localhost/v1", "http://localhost/v1?redirect=external"]) {
    assert.throws(() => llmConfiguration({ OPENAI_BASE_URL: url, OPENAI_MODEL: "test" }));
  }
  assert.throws(() => llmConfiguration({}), /OPENAI_BASE_URL/u);
  assert.throws(() => llmConfiguration({ OPENAI_BASE_URL: "http://localhost/v1" }), /OPENAI_MODEL/u);
});

test("behält Quellenzeiten und vergibt eigene stabile Segment-IDs ohne Text zu erfinden", () => {
  const data = prepareSegments({ status: "available", segments: [
    { id: 99, startMs: 0, durationMs: null, text: " Hallo \n Welt " },
    { startMs: 10, durationMs: 20, text: "Hallo Welt" },
  ] });
  assert.deepEqual(data.map((segment) => segment.id), [0, 1]);
  assert.equal(data[0].text, "Hallo Welt");
  assert.equal(data[0].durationMs, null);
  assert.equal(data.length, 2);
  assert.throws(() => prepareSegments({ status: "unavailable" }));
  assert.throws(() => prepareSegments({ status: "available", segments: [
    { startMs: 20, durationMs: 1, text: "A" }, { startMs: 10, durationMs: 1, text: "B" },
  ] }));
});

test("konfiguriert Ollamas echtes Kontextfenster explizit und validiert Parameter", () => {
  const env = { OPENAI_BASE_URL: "http://localhost:11434/v1", OPENAI_MODEL: "qwen3:14b" };
  const configured = llmConfiguration({ ...env, OLLAMA_NUM_CTX: "32768" });
  assert.equal(configured.contextTokens, 32768);
  assert.equal(configured.ollamaEndpoint, "http://localhost:11434/api/chat");
  for (const value of ["", "0", "4095", "131073", "1.5", "abc"]) {
    assert.throws(() => llmConfiguration({ ...env, OLLAMA_NUM_CTX: value }), /OLLAMA_NUM_CTX/u);
  }
  assert.throws(() => llmConfiguration({
    ...env, OPENAI_BASE_URL: "http://localhost:11434/other", OLLAMA_NUM_CTX: "32768",
  }), /Basisadresse/u);
});

test("erhöht bei abgeschnittener OpenAI-Antwort das Ausgabelimit ohne Originalsegmente zu verlieren", async () => {
  const requests = [];
  const logs = [];
  const result = await analyzeWindow(transcriptWindows(segments)[0], config, {
    sleep: async () => {}, log: (message) => logs.push(message),
    fetchImpl: async (_url, request) => {
      requests.push(JSON.parse(request.body));
      return requests.length < 3 ? answer({}, "length") : answer({ discussions: [] });
    },
  });
  assert.deepEqual(result, []);
  assert.deepEqual(requests.map((body) => body.max_tokens), [4096, 8192, 16384]);
  assert.ok(requests.every((body) => JSON.stringify(body.messages) === JSON.stringify(requests[0].messages)));
  assert.ok(logs[0].includes("8192 Tokens"));
  assert.ok(logs[1].includes("16384 Tokens"));
});

test("erweitert bei Ollama-Abschneiden Kontext und Ausgabe für Erkennung und Kontextprüfung", async () => {
  const configured = llmConfiguration({
    OPENAI_BASE_URL: "http://localhost:11434/v1", OPENAI_MODEL: "qwen3:14b", OLLAMA_NUM_CTX: "32768",
  });
  const requests = [];
  const result = await analyzeWindow(transcriptWindows(segments)[0], configured, {
    sleep: async () => {}, log() {},
    fetchImpl: async (url, request) => {
      assert.equal(url, "http://localhost:11434/api/chat");
      const body = JSON.parse(request.body);
      requests.push(body);
      assert.equal(body.format, "json");
      const verification = body.messages[0].content.includes("Du prüfst");
      const truncated = requests.length === 1 || requests.length === 3;
      return Response.json({
        done: true, done_reason: truncated ? "length" : "stop",
        message: { content: JSON.stringify(truncated ? {} : verification
          ? { decisions: [{ candidateIndex: 0, kind: "review", evidenceSegmentId: 3 }] }
          : { discussions: [candidate()] }) },
      });
    },
  });
  assert.equal(result[0].title, "Doom");
  assert.deepEqual(requests.map((body) => [body.options.num_ctx, body.options.num_predict]),
    [[32768, 4096], [65536, 8192], [32768, 4096], [65536, 8192]]);
});

test("teilt alle Segmente in eindeutige Kernbereiche mit überlappendem Kontext und Textbudget", () => {
  const windows = transcriptWindows(segments);
  assert.equal(windows.length, 3);
  assert.ok(windows[0].segments.at(-1).id >= windows[1].coreFirstId);
  assert.ok(windows[1].segments[0].id < windows[1].coreFirstId);
  assert.deepEqual(windows.flatMap((window) => window.segments
    .filter((segment) => segment.id >= window.coreFirstId && segment.id <= window.coreLastId).map((segment) => segment.id)),
  segments.map((segment) => segment.id));
  const longSegments = segments.map((segment) => ({ ...segment, text: "x".repeat(1000) }));
  for (const window of transcriptWindows(longSegments)) {
    assert.ok(window.segments.reduce((sum, segment) => sum + segment.text.length + 80, 0) <= 14_000);
  }
  assert.throws(() => transcriptWindows([{ id: 0, startMs: 0, text: "x".repeat(14_000) }]), /zu lang/u);
});

test("begrenzt Ollama-Kontextwachstum und bricht dauerhaft abgeschnittene Antworten nach drei Versuchen ab", async () => {
  const configured = llmConfiguration({
    OPENAI_BASE_URL: "http://localhost:11434/v1", OPENAI_MODEL: "qwen3:14b", OLLAMA_NUM_CTX: "65536",
  });
  const limits = [];
  await assert.rejects(analyzeWindow(transcriptWindows(segments)[0], configured, {
    sleep: async () => {}, log() {},
    saveCandidates: () => assert.fail("Keine abgeschnittenen Ergebnisse speichern"),
    fetchImpl: async (_url, request) => {
      limits.push(JSON.parse(request.body).options);
      return Response.json({ done: true, done_reason: "length", message: { content: "{}" } });
    },
  }), /Nach 3 Versuchen abgebrochen/u);
  assert.deepEqual(limits.map((options) => options.num_ctx), [65536, 131072, 131072]);
  assert.deepEqual(limits.map((options) => options.num_predict), [4096, 8192, 16384]);
});

test("validiert Modellantworten strikt und entfernt reine Kontexttreffer", () => {
  const window = transcriptWindows(segments)[0];
  assert.equal(validateDiscussions({ discussions: [candidate()] }, window).length, 1);
  for (const data of [{}, { discussions: [candidate({ firstSegmentId: -1 })] },
    { discussions: [candidate({ evidenceSegmentId: 6 })] },
    { discussions: [candidate({ confidence: "certain" })] },
    { discussions: [candidate({ endReason: "window-end" })] },
    { discussions: [candidate(), candidate()] }, { discussions: [candidate({ title: "" })] }]) {
    assert.throws(() => validateDiscussions(data, window));
  }
  const contextOnly = candidate({ firstSegmentId: 18, lastSegmentId: 19, evidenceSegmentId: 18 });
  assert.equal(validateDiscussions({ discussions: [contextOnly] }, window).length, 0);
});

test("nutzt OpenAI-kompatible JSON-Antworten mit Modell aus Konfiguration und lehnt Teilantworten ab", async () => {
  const window = transcriptWindows(segments)[0];
  const result = await analyzeWindow(window, config, { fetchImpl: async (url, options) => {
    assert.equal(url, config.endpoint);
    assert.equal(options.redirect, "error");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "qwen3:14b");
    assert.equal(body.response_format.type, "json_object");
    assert.equal(body.temperature, 0);
    assert.ok(!options.headers.authorization);
    if (body.messages[0].content.includes("Du prüfst")) {
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        decisions: [{ candidateIndex: 0, kind: "review", evidenceSegmentId: 3 }],
      }) } }] });
    }
    assert.ok(body.messages[0].content.includes("Quizantworten"));
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ discussions: [candidate()] }) } }] });
  } });
  assert.equal(result[0].title, "Doom");
  for (const response of [
    new Response("Error", { status: 500 }),
    Response.json({ choices: [{ finish_reason: "length", message: { content: "{}" } }] }),
    Response.json({ choices: [{ finish_reason: "stop", message: { content: "not json" } }] }),
  ]) await assert.rejects(analyzeWindow(window, config, { fetchImpl: async () => response, sleep: async () => {}, log() {} }));
});

test("verwirft Quiz- und Nebentreffer durch eine separate Kontextprüfung und validiert deren Antwort", async () => {
  const window = transcriptWindows(segments)[0];
  for (const kind of ["quiz", "personal-update", "comparison", "uncertain"]) {
    let calls = 0;
    const result = await analyzeWindow(window, config, { fetchImpl: async () => Response.json({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(++calls === 1
        ? { discussions: [candidate()] }
        : { decisions: [{ candidateIndex: 0, kind, evidenceSegmentId: 3 }] }) } }],
    }) });
    assert.deepEqual(result, []);
    assert.equal(calls, 2);
  }
  let calls = 0;
  await assert.rejects(analyzeWindow(window, config, { sleep: async () => {}, log() {}, fetchImpl: async () => Response.json({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(++calls === 1
      ? { discussions: [candidate()] } : { decisions: [] }) } }],
  }) }), /Entscheidungen fehlen/u);
});

const answer = (value, finish_reason = "stop") => Response.json({
  choices: [{ finish_reason, message: { content: typeof value === "string" ? value : JSON.stringify(value) } }],
});

test("wiederholt ungültige Abschnittskennzeichnungen mit konkretem Fehlerhinweis ohne Validierung aufzuweichen", async () => {
  const delays = [];
  const logs = [];
  const requests = [];
  const result = await analyzeWindow(transcriptWindows(segments)[0], config, {
    log: (message) => logs.push(message), sleep: async (ms) => delays.push(ms),
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      if (requests.length === 1) return answer({ discussions: [candidate({ endReason: "window-end" })] });
      if (requests.length === 2) {
        assert.ok(body.messages.at(-1).content.includes("window-end erfordert continuesAfter true"));
        return answer({ discussions: [candidate()] });
      }
      return answer({ decisions: [{ candidateIndex: 0, kind: "review", evidenceSegmentId: 3 }] });
    },
  });
  assert.equal(requests.length, 3);
  assert.equal(result[0].title, "Doom");
  assert.deepEqual(delays, [5000]);
  assert.ok(logs[0].includes("Neuer Versuch 2/3"));
});

test("wiederholt JSON-, Teilantwort- und vorübergehende Verbindungsfehler begrenzt; HTTP 400 nicht", async () => {
  for (const failure of [
    () => answer("not json"),
    () => answer({}, "length"),
    () => new Response("Error", { status: 503 }),
    () => { throw new TypeError("fetch failed"); },
    () => { throw new DOMException("Zeitlimit", "TimeoutError"); },
  ]) {
    let calls = 0;
    const delays = [];
    await assert.rejects(analyzeWindow(transcriptWindows(segments)[0], config, {
      log() {}, sleep: async (ms) => delays.push(ms),
      fetchImpl: async () => { calls += 1; return failure(); },
    }), /Nach 3 Versuchen abgebrochen/u);
    assert.equal(calls, 3);
    assert.deepEqual(delays, [5000, 10_000]);
  }
  let calls = 0;
  await assert.rejects(analyzeWindow(transcriptWindows(segments)[0], config, {
    sleep: () => assert.fail("Kein Retry bei Konfigurationsfehler"), log() {},
    fetchImpl: async () => { calls += 1; return new Response("Error", { status: 400 }); },
  }), /HTTP 400/u);
  assert.equal(calls, 1);
});

test("setzt nach fehlerhafter Kontextprüfung beim Prüfaufruf fort und erhält bereits fertige Fenster", async (t) => {
  const { directory, videoId } = await setup(t);
  const options = { cacheDirectory: directory, config, sleep: async () => {}, log() {} };
  let calls = 0;
  await assert.rejects(generateGamesFromTranscript(videoId, {
    ...options, fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return answer({ discussions: [] });
      if (calls === 2) return answer({ discussions: [candidate({
        firstSegmentId: 20, lastSegmentId: 23, evidenceSegmentId: 21,
      })] });
      return answer({ decisions: [] });
    },
  }), /Kontextprüfung.*Entscheidungen fehlen.*erneuter Aufruf/iu);
  assert.equal(calls, 5);
  const completedFile = path.join(directory, "game-discussions", `${videoId}.window-0.json`);
  const before = await readFile(completedFile, "utf8");
  const requests = [];
  const result = await generateGamesFromTranscript(videoId, {
    ...options, fetchImpl: async (_url, request) => {
      const messages = JSON.parse(request.body).messages;
      requests.push(messages);
      return messages[0].content.includes("Du prüfst")
        ? answer({ decisions: [{ candidateIndex: 0, kind: "review", evidenceSegmentId: 21 }] })
        : answer({ discussions: [] });
    },
  });
  assert.equal(requests.length, 2);
  assert.ok(requests[0][0].content.includes("Du prüfst"));
  assert.equal(result.discussions.length, 1);
  assert.equal(await readFile(completedFile, "utf8"), before);
});

test("setzt trotz geändertem Spielekatalog bei fehlenden Fenstern fort und erhält bestehende Dateien bytegenau", async (t) => {
  const { directory, videoId } = await setup(t);
  const options = { cacheDirectory: directory, config, log() {} };
  await assert.rejects(generateGamesFromTranscript(videoId, {
    ...options, analyzeWindowImpl: async (window) => {
      if (window.index === 2) throw new Error("Unterbrechung");
      return [];
    },
  }), /Unterbrechung/u);
  const files = [0, 1].map((index) => path.join(directory, "game-discussions", `${videoId}.window-${index}.json`));
  const contents = [];
  for (const file of files) {
    const checkpoint = JSON.parse(await readFile(file, "utf8"));
    const content = JSON.stringify({ ...checkpoint, catalogHash: "alter-katalog" });
    await writeFile(file, content);
    contents.push(content);
  }
  const calls = [];
  const logs = [];
  const result = await generateGamesFromTranscript(videoId, {
    ...options, log: (message) => logs.push(message),
    analyzeWindowImpl: async (window) => { calls.push(window.index); return []; },
  });
  assert.deepEqual(calls, [2]);
  assert.equal(result.status, "needs-review");
  assert.ok(logs.some((message) => message.includes("2/3 fertige Fenster")));
  assert.ok(logs.some((message) => message.includes("Spielekatalog geändert")));
  for (let index = 0; index < files.length; index += 1) {
    assert.equal(await readFile(files[index], "utf8"), contents[index]);
  }
});

test("prüft alle vorhandenen Fenster vor Modellaufrufen und überspringt auch spätere fertige Fenster", async (t) => {
  const { directory, videoId } = await setup(t);
  const options = { cacheDirectory: directory, config, log() {} };
  await generateGamesFromTranscript(videoId, { ...options, analyzeWindowImpl: async () => [] });
  const target = path.join(directory, "game-discussions");
  await rm(path.join(target, `${videoId}.json`));
  await rm(path.join(target, `${videoId}.window-0.json`));
  const file = path.join(target, `${videoId}.window-2.json`);
  const content = await readFile(file, "utf8");
  await writeFile(file, JSON.stringify({ ...JSON.parse(content), model: "anderes-modell" }));
  await assert.rejects(generateGamesFromTranscript(videoId, {
    ...options, analyzeWindowImpl: () => assert.fail("Keine Modellaufrufe vor vollständiger Prüfung"),
  }), /model geändert/u);
  await writeFile(file, content);
  const calls = [];
  await generateGamesFromTranscript(videoId, {
    ...options, analyzeWindowImpl: async (window) => { calls.push(window.index); return []; },
  });
  assert.deepEqual(calls, [0]);
  assert.equal(await readFile(file, "utf8"), content);
});

test("Abbruch beendet Modellaufrufe ohne Retry und räumt die Analysesperre auf", async (t) => {
  const { directory, videoId } = await setup(t);
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(generateGamesFromTranscript(videoId, {
    cacheDirectory: directory, config, log() {}, signal: controller.signal,
    sleep: () => assert.fail("Kein Retry nach Abbruch"),
    fetchImpl: async (_url, request) => {
      calls += 1;
      controller.abort(new Error("Benutzerabbruch"));
      request.signal.throwIfAborted();
    },
  }), /Benutzerabbruch/u);
  assert.equal(calls, 1);
  await assert.rejects(readFile(path.join(directory, "game-discussions", `${videoId}.json.lock`)), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(directory, "game-discussions", `${videoId}.json`)), { code: "ENOENT" });
});

test("beschädigte Vorschlagszwischenstände werden nicht durch neue Modellaufrufe ersetzt", async (t) => {
  const { directory, videoId } = await setup(t);
  const options = { cacheDirectory: directory, config, log() {}, sleep: async () => {} };
  await assert.rejects(generateGamesFromTranscript(videoId, {
    ...options, fetchImpl: async (_url, request) => JSON.parse(request.body).messages[0].content.includes("Du prüfst")
      ? answer({ decisions: [] }) : answer({ discussions: [candidate()] }),
  }), /Entscheidungen fehlen/u);
  const file = path.join(directory, "game-discussions", `${videoId}.candidates-window-0.json`);
  const record = JSON.parse(await readFile(file, "utf8"));
  for (const invalid of [
    { ...record, model: "anderes-modell" },
    { ...record, discussions: [candidate({ confidence: "certain" })] },
  ]) {
    const source = JSON.stringify(invalid);
    await writeFile(file, source);
    await assert.rejects(generateGamesFromTranscript(videoId, {
      ...options, fetchImpl: () => assert.fail("Kein Abruf bei beschädigtem Zwischenstand"),
    }));
    assert.equal(await readFile(file, "utf8"), source);
  }
});

test("gleichzeitige Analyse meldet den Sperrpfad ohne fremde Sperren zu entfernen", async (t) => {
  const { directory, videoId } = await setup(t);
  const target = path.join(directory, "game-discussions");
  await mkdir(target);
  const file = path.join(target, `${videoId}.json.lock`);
  await writeFile(file, "laufender-prozess");
  await assert.rejects(generateGamesFromTranscript(videoId, {
    cacheDirectory: directory, config, log() {}, fetchImpl: () => assert.fail("Gesperrter Abruf"),
  }), (error) => error.message.includes(file) && error.message.includes("EEXIST"));
  assert.equal(await readFile(file, "utf8"), "laufender-prozess");
});

test("führt überlappende Besprechungen zusammen, erhält spätere Wiederaufnahmen und kennzeichnet Konflikte", () => {
  const merged = mergeDiscussions([
    candidate({ firstSegmentId: 2, lastSegmentId: 18, windowIndex: 0, continuesAfter: true, endReason: "window-end" }),
    candidate({ firstSegmentId: 16, lastSegmentId: 25, evidenceSegmentId: 16, windowIndex: 1, continuesBefore: true }),
    candidate({ firstSegmentId: 30, lastSegmentId: 35, evidenceSegmentId: 30, windowIndex: 1 }),
  ], segments, [{ id: "doom", name: "Doom", aliases: [] }]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].startMs, 20_000);
  assert.equal(merged[0].endMs, 262_000);
  assert.equal(merged[0].gameId, "doom");
  assert.equal(merged[0].reviewed, false);
  assert.equal(merged[0].evidence[0].text, "Text 3");
  const conflict = mergeDiscussions([
    candidate({ lastSegmentId: 10, windowIndex: 0 }),
    candidate({ title: "Unbekannt", firstSegmentId: 8, lastSegmentId: 12, evidenceSegmentId: 9, windowIndex: 1 }),
  ], segments, []);
  assert.ok(conflict.every((item) => item.endMs === null && item.issues.includes("conflicting-window-boundaries")));
  assert.equal(conflict[1].gameId, null);
  const ambiguous = mergeDiscussions([candidate({ windowIndex: 0 })], segments, [
    { id: "one", name: "Doom", aliases: [] }, { id: "two", name: "Doom", aliases: [] },
  ]);
  assert.equal(ambiguous[0].gameId, null);
  const unfinished = mergeDiscussions([candidate({ windowIndex: 0, continuesAfter: true, endReason: "window-end" })], segments);
  assert.equal(unfinished[0].endMs, null);
});

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "pixel-discussions-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, "youtube-transcripts"));
  const videoId = "a0000000000";
  const source = path.join(directory, "youtube-transcripts", `${videoId}.json`);
  await writeFile(source, JSON.stringify({ videoId, status: "available", segments }));
  return { directory, videoId, source };
}

test("speichert separate Vorschläge, nutzt Zwischenstände und überschreibt weder manuelle Prüfung noch geänderte Quellen", async (t) => {
  const { directory, videoId, source } = await setup(t);
  const options = { cacheDirectory: directory, config, log() {} };
  let calls = 0;
  await assert.rejects(generateGamesFromTranscript(videoId, { ...options, analyzeWindowImpl: async () => {
    if (++calls === 2) throw new Error("Modell unterbrochen");
    return [];
  } }), /Modell unterbrochen/u);
  calls = 0;
  const result = await generateGamesFromTranscript(videoId, { ...options, analyzeWindowImpl: async () => { calls += 1; return []; } });
  assert.equal(calls, 2);
  assert.equal(result.status, "needs-review");
  const file = path.join(directory, "game-discussions", `${videoId}.json`);
  const reviewed = { ...result, status: "reviewed", discussions: [{ title: "Manuelle Korrektur", reviewed: true }] };
  await writeFile(file, JSON.stringify(reviewed));
  const existing = await generateGamesFromTranscript(videoId, {
    ...options, analyzeWindowImpl: () => { throw new Error("Kein erneuter Modellaufruf"); },
  });
  assert.equal(existing.status, "reviewed");
  assert.equal(existing.discussions[0].title, "Manuelle Korrektur");
  await writeFile(source, (await readFile(source, "utf8")) + "\n");
  await assert.rejects(generateGamesFromTranscript(videoId, options), /nicht überschrieben/u);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), reviewed);
});

test("leitet Abschnittsenden aus Quellenzeiten ab und erfindet bei fehlender Dauer kein Ende", () => {
  const result = mergeDiscussions([
    candidate({ firstSegmentId: 0, lastSegmentId: 1, evidenceSegmentId: 0, windowIndex: 0 }),
    candidate({ title: "Anderes Spiel", firstSegmentId: 2, lastSegmentId: 3, evidenceSegmentId: 2, windowIndex: 0 }),
  ], segments);
  assert.equal(result[0].endMs, segments[2].startMs);
  const missing = segments.map((segment) => ({ ...segment, durationMs: null }));
  const unknown = mergeDiscussions([candidate({ windowIndex: 0 })], missing);
  assert.equal(unknown[0].endMs, null);
  assert.ok(unknown[0].issues.includes("missing-end-duration"));
});

test("speichert nach einem Modellausfall keine scheinbar erfolgreiche leere Gesamtanalyse", async (t) => {
  const { directory, videoId } = await setup(t);
  await assert.rejects(generateGamesFromTranscript(videoId, {
    cacheDirectory: directory, config, log() {},
    analyzeWindowImpl: async () => { throw new Error("HTTP 500"); },
  }), /HTTP 500/u);
  await assert.rejects(readFile(path.join(directory, "game-discussions", `${videoId}.json`)), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(directory, "game-discussions", `${videoId}.json.lock`)), { code: "ENOENT" });
});
