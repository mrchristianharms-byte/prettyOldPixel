import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { loadEnvFile } from "node:process";
import test from "node:test";
import {
  analyzeWindow, generateGamesFromTranscript, llmConfiguration, mergeDiscussions, readModelResponse,
  prepareSegments, transcriptWindows, validateDiscussions,
} from "../src/extra-data/generate-games-from-transcript.mjs";

const config = llmConfiguration({
  OPENAI_BASE_URL: "http://127.0.0.1:11434/v1", OPENAI_MODEL: "qwen3:14b",
  MODEL_REASONING_EFFORT: "none", MODEL_MAX_OUTPUT_TOKENS: "4096",
});
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

test("ignoriert .env-Kommentarzeilen mit #", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pretty-old-pixel-env-"));
  const variable = `PRETTY_OLD_PIXEL_ENV_COMMENT_TEST_${process.pid}`;
  const previous = process.env[variable];
  try {
    await writeFile(path.join(directory, ".env"), `# comment\n${variable}=loaded\n# ${variable}=ignored\n`);
    delete process.env[variable];
    loadEnvFile(path.join(directory, ".env"));
    assert.equal(process.env[variable], "loaded");
  } finally {
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
    await rm(directory, { recursive: true, force: true });
  }
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

test("konfiguriert OpenRouter Auto nur mit API-Key und überträgt keine Ollama-Parameter", async () => {
  const openRouter = llmConfiguration({
    OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
    OPENAI_MODEL: "openrouter/auto",
    OPENAI_API_KEY: "test-key",
    MODEL_REASONING_EFFORT: "low",
    MODEL_MAX_OUTPUT_TOKENS: "16384",
  });
  assert.equal(openRouter.endpoint, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(openRouter.model, "openrouter/auto");
  assert.equal(openRouter.reasoningEffort, "low");
  assert.equal(openRouter.maxOutputTokens, 16384);
  assert.throws(() => llmConfiguration({
    OPENAI_BASE_URL: "https://openrouter.ai/api/v1", OPENAI_MODEL: "openrouter/auto",
  }), /OPENAI_API_KEY/u);
  assert.throws(() => llmConfiguration({
    OPENAI_BASE_URL: "https://openrouter.ai/api/v1", OPENAI_MODEL: "openrouter/auto",
    OPENAI_API_KEY: "test-key", MODEL_CONTEXT_TOKENS: "32768",
  }), /MODEL_CONTEXT_TOKENS/u);
  for (const endpoint of ["http://openrouter.ai/api/v1", "https://openrouter.ai.example/api/v1",
    "https://openrouter.ai:8443/api/v1", "https://openrouter.ai/other",
    "https://openrouter.ai/api/v1?redirect=elsewhere"]) {
    assert.throws(() => llmConfiguration({
      OPENAI_BASE_URL: endpoint, OPENAI_MODEL: "openrouter/auto", OPENAI_API_KEY: "test-key",
    }));
  }

  const logs = [];
  const result = await analyzeWindow(transcriptWindows(segments)[0], openRouter, {
    sleep: async () => {}, log: (message) => logs.push(message),
    fetchImpl: async (url, request) => {
      assert.equal(url, openRouter.endpoint);
      assert.equal(request.headers.authorization, "Bearer test-key");
      const body = JSON.parse(request.body);
      assert.equal(body.model, "openrouter/auto");
      assert.equal(body.stream, true);
      assert.equal(body.max_tokens, 16384);
      assert.deepEqual(body.reasoning, { effort: "low" });
      assert.equal(body.response_format.type, "json_object");
      assert.ok(!("reasoning_effort" in body));
      return Response.json({
        model: "z-ai/glm-5.3-flash",
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ discussions: [] }) } }],
      });
    },
  });
  assert.deepEqual(result, []);
  assert.ok(logs.some((message) => message.includes('OpenRouter-Modell "z-ai/glm-5.3-flash"')));
});

test("gibt Fortsetzungsstatus an Erkennung und Kontextprüfung weiter", async () => {
  const window = transcriptWindows(segments)[0];
  const incomingContinuations = [{
    title: "Doom", firstSegmentId: 0, lastSegmentId: 1, confidence: "high",
    evidenceSegmentId: 0, lastSegmentText: "Wir sprechen weiter über Doom.",
  }];
  let calls = 0;
  const result = await analyzeWindow(window, config, {
    incomingContinuations,
    fetchImpl: async (_url, request) => {
      const body = JSON.parse(request.body);
      const context = JSON.parse(body.messages[1].content.split("\n")[0]);
      assert.deepEqual(context.incomingContinuations, incomingContinuations);
      calls += 1;
      if (calls === 1) return answer({ discussions: [candidate({
        firstSegmentId: 2, lastSegmentId: 5, evidenceSegmentId: 3, continuesBefore: true,
      })] });
      return answer({ decisions: [{
        candidateIndex: 0, kind: "review", evidenceSegmentId: 3,
        discussions: [candidate({
          firstSegmentId: 2, lastSegmentId: 5, evidenceSegmentId: 3, continuesBefore: true,
        })],
      }], continuityDecisions: [{
        continuationIndex: 0, status: "continues", evidenceSegmentId: 3, lastSegmentId: 5,
      }] });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result[0].continuesBefore, true);
});

test("prüft übernommenen Fortsetzungsstatus auch wenn keine Vorschläge vorliegen", async () => {
  const window = transcriptWindows(segments)[0];
  const incomingContinuations = [{
    title: "Doom", firstSegmentId: 0, lastSegmentId: 1, confidence: "high",
    evidenceSegmentId: 0, lastSegmentText: "Wir sprechen weiter über Doom.",
  }];
  let calls = 0;
  const result = await analyzeWindow(window, config, {
    candidates: [], incomingContinuations, sleep: async () => {}, log() {},
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? answer({ discussions: [] }) : answer({
        decisions: [],
        continuityDecisions: [{
          continuationIndex: 0, status: "new-topic", evidenceSegmentId: 4, lastSegmentId: 3,
        }],
      });
    },
  });
  assert.deepEqual(result, []);
  assert.equal(calls, 2);
});

test("erhöht OpenRouter-Ausgabelimit bei Abschneiden mit begrenztem Reasoning", async () => {
  const openRouter = llmConfiguration({
    OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
    OPENAI_MODEL: "openrouter/auto",
    OPENAI_API_KEY: "test-key",
    MODEL_REASONING_EFFORT: "low",
    MODEL_MAX_OUTPUT_TOKENS: "16384",
  });
  const limits = [];
  const reasons = [];
  await assert.rejects(analyzeWindow(transcriptWindows(segments)[0], openRouter, {
    candidates: [candidate()], sleep: async () => {}, log() {},
    fetchImpl: async (_url, request) => {
      const body = JSON.parse(request.body);
      limits.push(body.max_tokens);
      reasons.push(body.reasoning);
      return answer({}, "length");
    },
  }), /Nach 3 Versuchen/u);
  assert.deepEqual(limits, [16384, 32768, 65536]);
  assert.deepEqual(reasons, Array(3).fill({ effort: "low" }));
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

test("konfiguriert Ollamas echtes Kontextfenster und modellunabhängige Parameter", () => {
  const env = { OPENAI_BASE_URL: "http://localhost:11434/v1", OPENAI_MODEL: "qwen3:14b" };
  const configured = llmConfiguration({
    ...env, MODEL_CONTEXT_TOKENS: "32768", MODEL_REASONING_EFFORT: "none",
    MODEL_MAX_OUTPUT_TOKENS: "4096",
  });
  assert.equal(configured.contextTokens, 32768);
  assert.equal(configured.ollamaEndpoint, "http://localhost:11434/api/chat");
  assert.equal(configured.reasoningEffort, "none");
  assert.equal(configured.maxOutputTokens, 4096);
  for (const value of ["", "0", "4095", "131073", "1.5", "abc"]) {
    assert.throws(() => llmConfiguration({ ...env, MODEL_CONTEXT_TOKENS: value }), /MODEL_CONTEXT_TOKENS/u);
  }
  assert.throws(() => llmConfiguration({
    ...env, OPENAI_BASE_URL: "http://localhost:11434/other", MODEL_CONTEXT_TOKENS: "32768",
  }), /Basisadresse/u);
  assert.throws(() => llmConfiguration({
    ...env, MODEL_CONTEXT_TOKENS: "32768", OLLAMA_NUM_CTX: "32768",
  }), /dürfen nicht gleichzeitig/u);
  assert.throws(() => llmConfiguration({ ...env, MODEL_REASONING_EFFORT: "impossible" }), /MODEL_REASONING_EFFORT/u);
  assert.throws(() => llmConfiguration({ ...env, MODEL_MAX_OUTPUT_TOKENS: "999999" }), /MODEL_MAX_OUTPUT_TOKENS/u);
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
  assert.ok(requests.every((body) => body.reasoning_effort === "none"));
  assert.ok(requests.every((body) => JSON.stringify(body.messages) === JSON.stringify(requests[0].messages)));
  assert.ok(logs.some((message) => message.includes("8192 Tokens")));
  assert.ok(logs.some((message) => message.includes("16384 Tokens")));
});

test("erweitert bei Ollama-Abschneiden Kontext und Ausgabe für Erkennung und Kontextprüfung", async () => {
  const configured = llmConfiguration({
    OPENAI_BASE_URL: "http://localhost:11434/v1", OPENAI_MODEL: "qwen3:14b",
    MODEL_CONTEXT_TOKENS: "32768", MODEL_REASONING_EFFORT: "none", MODEL_MAX_OUTPUT_TOKENS: "4096",
  });
  const requests = [];
  const result = await analyzeWindow(transcriptWindows(segments)[0], configured, {
    sleep: async () => {}, log() {},
    fetchImpl: async (url, request) => {
      assert.equal(url, "http://localhost:11434/api/chat");
      const body = JSON.parse(request.body);
      requests.push(body);
      assert.equal(body.format, "json");
      assert.equal(body.think, false);
      const verification = body.messages[0].content.includes("Du prüfst");
      const truncated = requests.length === 1 || requests.length === 3;
      return Response.json({
        done: true, done_reason: truncated ? "length" : "stop",
        message: { content: JSON.stringify(truncated ? {} : verification
          ? { decisions: [{ candidateIndex: 0, kind: "review", evidenceSegmentId: 3, discussions: [candidate()] }] }
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
    OPENAI_BASE_URL: "http://localhost:11434/v1", OPENAI_MODEL: "qwen3:14b",
    MODEL_CONTEXT_TOKENS: "65536", MODEL_REASONING_EFFORT: "none", MODEL_MAX_OUTPUT_TOKENS: "4096",
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
      assert.ok(body.messages[0].content.includes("Teile einen vermischten Vorschlag"));
      assert.ok(body.messages[0].content.includes("coreFirstId/coreLastId"));
      assert.ok(body.messages[0].content.includes("Namensbeleg"));
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        decisions: [{ candidateIndex: 0, kind: "review", evidenceSegmentId: 3, discussions: [candidate()] }],
      }) } }] });
    }
    assert.ok(body.messages[0].content.includes("Quizantworten"));
    assert.ok(body.messages[0].content.includes("mindestens 30 Sekunden"));
    assert.ok(body.messages[0].content.includes("Zuschauerabstimmungen"));
    assert.ok(body.messages[0].content.includes("Wing Commander II"));
    assert.ok(body.messages[0].content.includes("Tiny Little Slug"));
    assert.ok(body.messages[0].content.includes("Trespasser"));
    assert.equal(JSON.parse(body.messages[1].content.split("\n")[0]).segments[0].durationMs, 12_000);
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

test("erklärt beiden Modellphasen den Unterschied zwischen Spieltiteln, Sprechern und Portierungen", async () => {
  for (const { title, text, kind } of [
    { title: "Selma", kind: "personal-update", text: [
      "Heute habe ich eine Folge Wintergames veröffentlicht",
      "und zwar eine Konsolenversion.",
      "Wir sprechen über die NES Version und Selma",
      "keine Titelmusik.",
      "Es ist die schlechteste Version, die ich bisher hatte.",
    ] },
    { title: "Schneider CPC Version", kind: "comparison", text: [
      "lassen wir die Zuschauer abstimmen,",
      "welche Portierungsfolge ich als nächstes mache.",
      "Die Schneider CPC Version ist, glaube ich, bestimmt ganz gut.",
      "Die sieht sogar sehr gut aus.",
      "Schneider CPC habt ihr euch entschieden. Mache ich total gerne.",
    ] },
  ]) {
    const source = prepareSegments({ status: "available", segments: text.map((text, index) => ({
      text, startMs: index * 10_000, durationMs: 10_000,
    })) });
    const window = { index: 0, coreFirstId: 0, coreLastId: 4, segments: source };
    let calls = 0;
    const result = await analyzeWindow(window, config, {
      fetchImpl: async (_url, request) => {
        const prompt = JSON.parse(request.body).messages[0].content;
        assert.ok(prompt.includes("niemals ein Sprechername"));
        assert.ok(prompt.includes('"Schneider CPC Version"'));
        assert.ok(prompt.includes("Selma ist hier eine angesprochene Person"));
        assert.ok(prompt.includes("im Textfenster nicht belegbar"));
        return ++calls === 1
          ? answer({ discussions: [candidate({ title, firstSegmentId: 0, lastSegmentId: 4, evidenceSegmentId: 2 })] })
          : answer({ decisions: [{ candidateIndex: 0, kind, evidenceSegmentId: 0 }] });
      },
    });
    assert.equal(calls, 2);
    assert.deepEqual(result, []);
  }
});

test("übernimmt geprüfte Titel und erweitert den Beginn in den überlappenden Kontext", async () => {
  const source = prepareSegments({ status: "available", segments: [
    "Ah, Jurassic World Evolution. Danke. Und",
    "Dresspther,",
    "damit bin ich langsam warm geworden.",
    "günstig war und es war halt super.",
    "Es war super schwer. Es hat geruckelt.",
    "habe ich es dann noch mal gespielt",
    "und es hatte irgendwie wirklich so ein Jurassic Park Feeling.",
  ].map((text, index) => ({ startMs: index * 10_000, durationMs: 10_000, text })) });
  const window = { index: 1, coreFirstId: 3, coreLastId: 6, segments: source };
  const original = candidate({
    title: "Jurassic World Evolution", firstSegmentId: 3, lastSegmentId: 6, evidenceSegmentId: 3,
  });
  const corrected = candidate({
    title: "Trespasser", firstSegmentId: 1, lastSegmentId: 6, evidenceSegmentId: 1,
  });
  const result = await analyzeWindow(window, config, {
    candidates: [original],
    fetchImpl: async (_url, request) => {
      const context = JSON.parse(JSON.parse(request.body).messages[1].content.split("\n")[0]);
      assert.equal(context.segments[1].text, "Dresspther,");
      assert.equal(context.coreFirstId, 3);
      return answer({ decisions: [{
        candidateIndex: 0, kind: "review", evidenceSegmentId: 1, discussions: [corrected],
      }] });
    },
  });
  assert.deepEqual(result, [{ ...corrected, windowIndex: 1 }]);
  assert.equal(mergeDiscussions(result, source, [])[0].startMs, 10_000);
});

test("teilt geprüfte Themenwechsel auf, statt Syndicate unter Tiny Little Slug weiterzuführen", async () => {
  const source = prepareSegments({ status: "available", segments: [
    "Ein quasi Remake von Globule ist Tiny Little Slug.",
    "Ist das jetzt ein neues Spiel?",
    "Tiny Little Slack ist classic Amiga Game",
    "müsste das doch bei Hall of Light sein",
    "das sieht richtig gut aus.",
    "Sindigkeit hat schöne Cyberpunk Stimmung",
    "und die fängt mit dem unglaublich tollen Intro schon an",
    "diesen Überzeugungsstrahler",
    "die haben auch Waffen aufgehoben",
    "und wenn du geschossen hast, haben die auch geschossen.",
  ].map((text, index) => ({ startMs: index * 10_000, durationMs: 10_000, text })) });
  const window = { index: 1, coreFirstId: 2, coreLastId: 8, segments: source };
  const corrected = [
    candidate({ title: "Tiny Little Slug", firstSegmentId: 0, lastSegmentId: 4,
      evidenceSegmentId: 0, endReason: "next-game" }),
    candidate({ title: "Syndicate", firstSegmentId: 5, lastSegmentId: 9, evidenceSegmentId: 5 }),
  ];
  const result = await analyzeWindow(window, config, {
    candidates: [candidate({ title: "Tiny Little Slug", firstSegmentId: 2, lastSegmentId: 8,
      evidenceSegmentId: 2, continuesAfter: true, endReason: "window-end" })],
    fetchImpl: async () => answer({ decisions: [{
      candidateIndex: 0, kind: "review", evidenceSegmentId: 5, discussions: corrected,
    }] }),
  });
  const merged = mergeDiscussions(result, source, []);
  assert.deepEqual(merged.map(({ title, startMs, endMs }) => ({ title, startMs, endMs })), [
    { title: "Tiny Little Slug", startMs: 0, endMs: 50_000 },
    { title: "Syndicate", startMs: 50_000, endMs: 100_000 },
  ]);
  assert.ok(merged.every((item) => item.issues.length === 0));
});

test("validiert korrigierte Abschnitte und verhindert ungeprüfte oder fremde Ersatztreffer", async () => {
  const window = transcriptWindows(segments)[0];
  for (const discussions of [
    undefined, [], [candidate({ evidenceSegmentId: 99 })],
    [candidate({ firstSegmentId: 8, lastSegmentId: 12, evidenceSegmentId: 8 })],
    [candidate({ firstSegmentId: 18, lastSegmentId: 19, evidenceSegmentId: 18 })],
    [candidate(), candidate()],
  ]) {
    await assert.rejects(analyzeWindow(window, config, {
      candidates: [candidate()], sleep: async () => {}, log() {},
      fetchImpl: async () => answer({ decisions: [{
        candidateIndex: 0, kind: "review", evidenceSegmentId: 3, discussions,
      }] }),
    }), /Nach 3 Versuchen abgebrochen/u);
  }
  await assert.rejects(analyzeWindow(window, config, {
    candidates: [candidate()], sleep: async () => {}, log() {},
    fetchImpl: async () => answer({ decisions: [{
      candidateIndex: 0, kind: "comparison", evidenceSegmentId: 3, discussions: [candidate()],
    }] }),
  }), /Nur review darf/u);
  await assert.rejects(analyzeWindow(window, config, {
    candidates: [candidate(), candidate({ firstSegmentId: 8, lastSegmentId: 12, evidenceSegmentId: 8 })],
    sleep: async () => {}, log() {},
    fetchImpl: async () => answer({ decisions: [
      { candidateIndex: 0, kind: "review", evidenceSegmentId: 3,
        discussions: [candidate({ lastSegmentId: 10 })] },
      { candidateIndex: 1, kind: "review", evidenceSegmentId: 9,
        discussions: [candidate({ firstSegmentId: 9, lastSegmentId: 15, evidenceSegmentId: 9 })] },
    ] }),
  }), /überlappende Segmentverweise/u);
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
      return answer({ decisions: [{ candidateIndex: 0, kind: "review", evidenceSegmentId: 3, discussions: [candidate()] }] });
    },
  });
  assert.equal(requests.length, 3);
  assert.equal(result[0].title, "Doom");
  assert.deepEqual(delays, [5000]);
  assert.ok(logs.some((message) => message.includes("Neuer Versuch 2/3")));
});

test("prüft persönliche Outer-Worlds-Berichte und behebt wechselnde Schemafehler mit vollständigem Feedback", async () => {
  const source = prepareSegments({ status: "available", segments: [
    { startMs: 1243980, durationMs: 1760, text: "Ja, bitte. Und zwar spiele ich ja Outer" },
    { startMs: 1245740, durationMs: 2820, text: "Worlds und ich bin eigentlich" },
    { startMs: 1248560, durationMs: 2200, text: "kurz vor Abschluss der Hauptmission" },
    { startMs: 1302000, durationMs: 2700, text: "habe und dann weitergehe. Das Gute ist" },
    { startMs: 1304700, durationMs: 1300, text: "aber, dass ich mich nicht mehr um Loot" },
    { startMs: 1306000, durationMs: 2500, text: "oder so kümmern muss" },
  ] });
  const window = { index: 8, coreFirstId: 0, coreLastId: 3, segments: source };
  const proposal = candidate({ title: "Outer Worlds", firstSegmentId: 0, lastSegmentId: 3,
    evidenceSegmentId: 0, endReason: "window-end", continuesAfter: true });
  const requests = [];
  const logs = [];
  const result = await analyzeWindow(window, config, {
    candidates: [proposal], log: (message) => logs.push(message), sleep: async () => {},
    fetchImpl: async (_url, request) => {
      const body = JSON.parse(request.body);
      requests.push(body);
      assert.ok(body.messages[0].content.includes("endReason window-end erfordert continuesAfter true"));
      assert.ok(body.messages[0].content.includes("Ich spiele Outer Worlds"));
      assert.ok(body.messages[0].content.includes("kopiere keine Abschnitte"));
      if (requests.length === 1) return answer({ decisions: [{
        candidateIndex: 0, kind: "personal-update", evidenceSegmentId: 0, discussions: [proposal],
      }] });
      if (requests.length === 2) return answer({ decisions: [{
        candidateIndex: 0, kind: "review", evidenceSegmentId: 0,
        discussions: [{ ...proposal, continuesAfter: false }],
      }] });
      const feedback = body.messages.at(-1).content;
      assert.ok(feedback.includes("Nur review darf"));
      assert.ok(feedback.includes("window-end erfordert continuesAfter true"));
      return answer({ decisions: [{ candidateIndex: 0, kind: "personal-update", evidenceSegmentId: 0 }] });
    },
  });
  assert.deepEqual(result, []);
  assert.equal(requests.length, 3);
  assert.equal(logs.filter((message) => message.includes("Verworfene Modellantwort")).length, 2);
});

test("protokolliert verworfene Antworten samt Tokenstatistik und Endgrund auch beim letzten Versuch begrenzt", async () => {
  for (const native of [false, true]) {
    const logs = [];
    const configured = native ? llmConfiguration({
      OPENAI_BASE_URL: "http://localhost:11434/v1", OPENAI_MODEL: "qwen3:14b",
      MODEL_CONTEXT_TOKENS: "32768", MODEL_REASONING_EFFORT: "none",
      MODEL_MAX_OUTPUT_TOKENS: "4096", OPENAI_API_KEY: "secret-test-key",
    }) : { ...config, apiKey: "secret-test-key" };
    const content = `${"x".repeat(7000)}\ninvalid-json`;
    await assert.rejects(analyzeWindow(transcriptWindows(segments)[0], configured, {
      log: (message) => logs.push(message), sleep: async () => {},
      fetchImpl: async () => Response.json(native ? {
        done: true, done_reason: "stop", prompt_eval_count: 2500, eval_count: 900,
        message: { content },
      } : {
        choices: [{ finish_reason: "stop", message: { content } }],
        usage: { prompt_tokens: 2500, completion_tokens: 900 },
      }),
    }), /Nach 3 Versuchen/u);
    const diagnostics = logs.filter((message) => message.includes("Fehlerdiagnose"))
      .map((message) => JSON.parse(message.split("Fehlerdiagnose ")[1]));
    assert.deepEqual(diagnostics.map((item) => item.attempt), [1, 2, 3]);
    assert.ok(diagnostics.every((item) => item.finishReason === "stop" && item.promptTokens === 2500
      && item.completionTokens === 900 && item.responseCharacters === content.length
      && item.inputCharacters > 0 && item.maxTokens === 4096));
    if (native) assert.ok(diagnostics.every((item) => item.contextTokens === 32768));
    const responses = logs.filter((message) => message.includes("Verworfene Modellantwort"));
    assert.equal(responses.length, 3);
    assert.ok(responses.every((message) => message.includes("nach 6000 Zeichen gekürzt") && message.length < 6200));
    assert.ok(logs.every((message) => !message.includes("secret-test-key")));
  }
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

test("protokolliert verbrauchten Denktext und verborgene Netzwerkursache", async () => {
  const logs = [];
  let calls = 0;
  await assert.rejects(analyzeWindow(transcriptWindows(segments)[0], config, {
    log: (message) => logs.push(message), sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return Response.json({
          choices: [{ finish_reason: "length", message: { content: "", reasoning: "x".repeat(900) } }],
          usage: { prompt_tokens: 5205, completion_tokens: 4096 },
        });
      }
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("Headers Timeout Error"), { code: "UND_ERR_HEADERS_TIMEOUT" }) });
    },
  }), /Nach 3 Versuchen abgebrochen/u);
  const diagnostics = logs.filter((message) => message.includes("Fehlerdiagnose"))
    .map((message) => JSON.parse(message.split("Fehlerdiagnose ")[1]));
  assert.equal(diagnostics[0].reasoningCharacters, 900);
  assert.equal(diagnostics[0].cause, undefined);
  assert.deepEqual(diagnostics.slice(1).map((item) => item.cause), ["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT"]);
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
      assert.equal(await readFile(completedFile, "utf8"), before);
      const messages = JSON.parse(request.body).messages;
      requests.push(messages);
      return messages[0].content.includes("Du prüfst")
        ? answer({ decisions: [{ candidateIndex: 0, kind: "review", evidenceSegmentId: 21,
          discussions: [candidate({ firstSegmentId: 20, lastSegmentId: 23, evidenceSegmentId: 21 })] }] })
        : answer({ discussions: [] });
    },
  });
  assert.equal(requests.length, 2);
  assert.ok(requests[0][0].content.includes("Du prüfst"));
  assert.equal(result.discussions.length, 1);
  await assert.rejects(readFile(completedFile), { code: "ENOENT" });
});

test("setzt trotz geändertem Spielekatalog fort und erhält Fenster bis zum erfolgreichen Abschluss bytegenau", async (t) => {
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
    analyzeWindowImpl: async (window) => {
      for (let index = 0; index < files.length; index += 1) {
        assert.equal(await readFile(files[index], "utf8"), contents[index]);
      }
      calls.push(window.index);
      return [];
    },
  });
  assert.deepEqual(calls, [2]);
  assert.equal(result.status, "needs-review");
  assert.ok(logs.some((message) => message.includes("2/3 fertige Fenster")));
  assert.ok(logs.some((message) => message.includes("Spielekatalog geändert")));
  for (let index = 0; index < files.length; index += 1) {
    await assert.rejects(readFile(files[index]), { code: "ENOENT" });
  }
});

test("prüft alle vorhandenen Fenster vor Modellaufrufen und überspringt auch spätere fertige Fenster", async (t) => {
  const { directory, videoId } = await setup(t);
  const options = { cacheDirectory: directory, config, log() {} };
  await assert.rejects(generateGamesFromTranscript(videoId, {
    ...options, analyzeWindowImpl: async (window) => {
      if (window.index === 2) throw new Error("Unterbrechung");
      return [];
    },
  }), /Unterbrechung/u);
  const target = path.join(directory, "game-discussions");
  await rm(path.join(target, `${videoId}.window-0.json`));
  const file = path.join(target, `${videoId}.window-2.json`);
  const content = await readFile(path.join(target, `${videoId}.window-1.json`), "utf8");
  await writeFile(file, JSON.stringify({ ...JSON.parse(content), model: "anderes-modell" }));
  await assert.rejects(generateGamesFromTranscript(videoId, {
    ...options, analyzeWindowImpl: () => assert.fail("Keine Modellaufrufe vor vollständiger Prüfung"),
  }), /model geändert/u);
  await writeFile(file, content);
  const calls = [];
  await generateGamesFromTranscript(videoId, {
    ...options, analyzeWindowImpl: async (window) => {
      assert.equal(await readFile(file, "utf8"), content);
      calls.push(window.index);
      return [];
    },
  });
  assert.deepEqual(calls, [0]);
  await assert.rejects(readFile(file), { code: "ENOENT" });
});

test("löscht nach atomarem Abschluss nur eigene Fenster und behält Transkript sowie Gesamtanalyse", async (t) => {
  const { directory, videoId, source } = await setup(t);
  const transcriptBefore = await readFile(source, "utf8");
  const target = path.join(directory, "game-discussions");
  await mkdir(target);
  const preserved = ["b0000000000.window-0.json", `${videoId}.notes.json`, `${videoId}.window-x.json`];
  for (const name of preserved) await writeFile(path.join(target, name), "unverändert");
  await writeFile(path.join(target, `${videoId}.window-99.json.tmp`), "alter Schreibzwischenstand");
  const result = await generateGamesFromTranscript(videoId, {
    cacheDirectory: directory, config, log() {},
    fetchImpl: async () => answer({ discussions: [] }),
  });
  assert.deepEqual((await readdir(target)).sort(), [...preserved, `${videoId}.json`].sort());
  assert.deepEqual(JSON.parse(await readFile(path.join(target, `${videoId}.json`), "utf8")), result);
  assert.equal(await readFile(source, "utf8"), transcriptBefore);
  for (const name of preserved) assert.equal(await readFile(path.join(target, name), "utf8"), "unverändert");

  const finalSource = await readFile(path.join(target, `${videoId}.json`), "utf8");
  await writeFile(path.join(target, `${videoId}.candidates-window-0.json`), "veralteter Zwischenstand");
  await generateGamesFromTranscript(videoId, {
    cacheDirectory: directory, config, log() {},
    fetchImpl: () => assert.fail("Vorhandene Gesamtanalyse wird nicht erneut analysiert"),
  });
  assert.equal(await readFile(path.join(target, `${videoId}.json`), "utf8"), finalSource);
  await assert.rejects(readFile(path.join(target, `${videoId}.candidates-window-0.json`)), { code: "ENOENT" });
});

test("behält alle Fenster, wenn das atomare Schreiben der Gesamtanalyse fehlschlägt", async (t) => {
  const { directory, videoId } = await setup(t);
  const target = path.join(directory, "game-discussions");
  await mkdir(path.join(target, `${videoId}.json.tmp`), { recursive: true });
  await assert.rejects(generateGamesFromTranscript(videoId, {
    cacheDirectory: directory, config, log() {},
    fetchImpl: async () => answer({ discussions: [] }),
  }), { code: "EISDIR" });
  for (const index of [0, 1, 2]) {
    for (const suffix of ["window", "candidates-window"]) {
      assert.ok(JSON.parse(await readFile(path.join(target, `${videoId}.${suffix}-${index}.json`), "utf8")));
    }
  }
  await assert.rejects(readFile(path.join(target, `${videoId}.json`)), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(target, `${videoId}.json.lock`)), { code: "ENOENT" });
});

test("meldet Aufräumfehler ohne die fertige Analyse zu verändern und erlaubt einen erneuten Aufruf", async (t) => {
  const { directory, videoId } = await setup(t);
  const options = {
    cacheDirectory: directory, config, log() {}, analyzeWindowImpl: async () => [],
  };
  await generateGamesFromTranscript(videoId, options);
  const target = path.join(directory, "game-discussions");
  const file = path.join(target, `${videoId}.json`);
  const before = await readFile(file, "utf8");
  const blocked = path.join(target, `${videoId}.window-0.json`);
  await mkdir(blocked);
  const retry = {
    ...options, analyzeWindowImpl: () => assert.fail("Kein Modellaufruf beim Aufräumen"),
  };
  await assert.rejects(generateGamesFromTranscript(videoId, retry), (error) => error.path === blocked);
  assert.equal(await readFile(file, "utf8"), before);
  await assert.rejects(readFile(`${file}.lock`), { code: "ENOENT" });
  await rm(blocked, { recursive: true });
  await generateGamesFromTranscript(videoId, retry);
  assert.equal(await readFile(file, "utf8"), before);
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
  assert.equal("reviewed" in merged[0], false, "Freigabe gilt für die ganze Analyse, nicht je Abschnitt");
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

test("übernimmt ein im Nachbarfenster belegtes Ende auch bei identischem letztem Segment", () => {
  const result = mergeDiscussions([
    candidate({ firstSegmentId: 2, lastSegmentId: 18, windowIndex: 0,
      continuesAfter: true, endReason: "window-end" }),
    candidate({ firstSegmentId: 16, lastSegmentId: 18, evidenceSegmentId: 16, windowIndex: 1,
      continuesBefore: true, continuesAfter: false, endReason: "topic-change" }),
  ], segments);
  assert.equal(result.length, 1);
  assert.equal(result[0].endMs, 192_000);
  assert.equal(result[0].endReason, "topic-change");
  assert.deepEqual(result[0].issues, []);
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

test("führt bestätigte Besprechungen über viele Fenster fort und erhält den Status beim Resume", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "pixel-long-discussion-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, "youtube-transcripts"));
  const videoId = "b0000000000";
  await writeFile(path.join(directory, "youtube-transcripts", `${videoId}.json`), JSON.stringify({
    videoId, status: "available",
    segments: Array.from({ length: 100 }, (_, index) => ({
      startMs: index * 10_000, durationMs: 10_000, text: `Gesprächssegment ${index}`,
    })),
  }));
  const windows = transcriptWindows(prepareSegments({
    status: "available", segments: Array.from({ length: 100 }, (_, index) => ({
      startMs: index * 10_000, durationMs: 10_000, text: `Gesprächssegment ${index}`,
    })),
  }));
  assert.ok(windows.length >= 5);
  const options = { cacheDirectory: directory, config, log() {} };
  const calls = [];
  let interruptedAtThree = false;
  let interruptedAtFive = false;
  const analyzeWindowImpl = async (window, _config, { incomingContinuations, onContinuityDecision }) => {
    calls.push({ index: window.index, incomingContinuations });
    if (window.index === 3 && !interruptedAtThree) {
      interruptedAtThree = true;
      throw new Error("Unterbrechung Fenster 3");
    }
    if (window.index === 5 && !interruptedAtFive) {
      interruptedAtFive = true;
      throw new Error("Unterbrechung");
    }
    const title = window.index < 4 ? "Jurassic Park" : "Doom";
    const previousTitle = window.index - 1 < 4 ? "Jurassic Park" : "Doom";
    const nextTitle = window.index + 1 < 4 ? "Jurassic Park" : "Doom";
    const continuesBefore = window.index > 0 && title === previousTitle;
    const continuesAfter = window.index < windows.length - 1
      && (window.index < 4 || title === nextTitle);
    if (incomingContinuations.length) {
      const incoming = incomingContinuations[0];
      const status = title === incoming.title ? "continues" : "new-topic";
      onContinuityDecision({
        continuationIndex: 0, incoming, status, evidenceSegmentId: window.coreFirstId,
        lastSegmentId: status === "new-topic" ? window.coreFirstId - 1 : window.coreLastId,
      });
    }
    return [{
      title, firstSegmentId: window.coreFirstId, lastSegmentId: window.coreLastId,
      evidenceSegmentId: window.coreFirstId, confidence: "high",
      endReason: continuesAfter ? "window-end" : "topic-change",
      continuesBefore, continuesAfter,
    }];
  };
  await assert.rejects(generateGamesFromTranscript(videoId, {
    ...options, analyzeWindowImpl,
  }), /Unterbrechung Fenster 3/u);
  const interruptedWindow = calls.find((call) => call.index === 3);
  assert.deepEqual(interruptedWindow.incomingContinuations.map((item) => item.title), ["Jurassic Park"]);

  const resumedCalls = [];
  await assert.rejects(generateGamesFromTranscript(videoId, {
    ...options,
    analyzeWindowImpl: async (window, currentConfig, context) => {
      resumedCalls.push({ index: window.index, incomingContinuations: context.incomingContinuations });
      return analyzeWindowImpl(window, currentConfig, context);
    },
  }), /Unterbrechung/u);
  assert.deepEqual(resumedCalls.map((call) => call.index), [3, 4, 5]);
  assert.deepEqual(resumedCalls.map((call) => call.incomingContinuations.map((item) => item.title)), [
    ["Jurassic Park"], ["Jurassic Park"], ["Doom"],
  ]);

  const finalCalls = [];
  const result = await generateGamesFromTranscript(videoId, {
    ...options,
    analyzeWindowImpl: async (window, currentConfig, context) => {
      finalCalls.push({ index: window.index, incomingContinuations: context.incomingContinuations });
      return analyzeWindowImpl(window, currentConfig, context);
    },
  });
  assert.deepEqual(finalCalls.map((call) => call.index), [5]);
  assert.deepEqual(finalCalls[0].incomingContinuations.map((item) => item.title), ["Doom"]);
  assert.deepEqual(result.discussions.map((item) => item.title), ["Jurassic Park", "Doom"]);
  assert.ok(result.discussions[0].endMs > 8 * 60 * 1000);
});

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
  const reviewed = { ...result, status: "reviewed", discussions: [{ title: "Manuelle Korrektur" }] };
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
    candidate({ firstSegmentId: 0, lastSegmentId: 3, evidenceSegmentId: 0, windowIndex: 0 }),
    candidate({ title: "Anderes Spiel", firstSegmentId: 4, lastSegmentId: 7, evidenceSegmentId: 4, windowIndex: 0 }),
  ], segments);
  assert.equal(result[0].endMs, segments[4].startMs);
  const missing = segments.map((segment) => ({ ...segment, durationMs: null }));
  const unknown = mergeDiscussions([candidate({ windowIndex: 0 })], missing);
  assert.equal(unknown[0].endMs, null);
  assert.ok(unknown[0].issues.includes("missing-end-duration"));
});

test("verwirft Besprechungen unter 30 Sekunden, behält exakt 30 Sekunden und erfindet fehlende Dauer nicht", () => {
  for (const [durationMs, expected] of [[9999, 0], [10000, 1], [10001, 1], [null, 0]]) {
    const source = segments.map((segment) => segment.id === 2 ? { ...segment, durationMs } : segment);
    const result = mergeDiscussions([
      candidate({ firstSegmentId: 0, lastSegmentId: 2, evidenceSegmentId: 1, windowIndex: 0 }),
    ], source);
    assert.equal(result.length, expected, String(durationMs));
  }
  const open = mergeDiscussions([
    candidate({ firstSegmentId: 0, lastSegmentId: 1, evidenceSegmentId: 0, windowIndex: 0, continuesAfter: true }),
  ], segments);
  assert.equal(open.length, 0);
});

test("prüft Mindestdauer erst nach dem Zusammenführen zusammenhängender Fensterstücke", () => {
  const result = mergeDiscussions([
    candidate({ firstSegmentId: 0, lastSegmentId: 1, evidenceSegmentId: 0, windowIndex: 0,
      continuesAfter: true, endReason: "window-end" }),
    candidate({ firstSegmentId: 2, lastSegmentId: 3, evidenceSegmentId: 2, windowIndex: 1,
      continuesBefore: true }),
  ], segments);
  assert.equal(result.length, 1);
  assert.equal(result[0].startMs, 0);
  assert.equal(result[0].endMs, 42_000);
  const adjacent = mergeDiscussions([
    candidate({ firstSegmentId: 0, lastSegmentId: 1, evidenceSegmentId: 0, windowIndex: 0 }),
    candidate({ firstSegmentId: 2, lastSegmentId: 3, evidenceSegmentId: 2, windowIndex: 1 }),
  ], segments);
  assert.equal(adjacent.length, 1);
  assert.equal(adjacent[0].endMs, 42_000);
  const separate = mergeDiscussions([
    candidate({ firstSegmentId: 0, lastSegmentId: 1, evidenceSegmentId: 0, windowIndex: 0 }),
    candidate({ firstSegmentId: 3, lastSegmentId: 4, evidenceSegmentId: 3, windowIndex: 1 }),
  ], segments);
  assert.deepEqual(separate, []);
});

test("führt direkt angrenzende Abschnitte desselben Katalogspiels trotz Schreibvariante zusammen", () => {
  const games = [{ id: "falcon", name: "Falcon", aliases: ["Falcon AT"] }];
  const result = mergeDiscussions([
    candidate({ title: "Falcon", firstSegmentId: 0, lastSegmentId: 4, evidenceSegmentId: 0, windowIndex: 0 }),
    candidate({ title: "Falcon AT", firstSegmentId: 5, lastSegmentId: 9, evidenceSegmentId: 5, windowIndex: 1 }),
    candidate({ title: "Xenon", firstSegmentId: 10, lastSegmentId: 14, evidenceSegmentId: 10, windowIndex: 1 }),
    candidate({ title: "Falcon", firstSegmentId: 15, lastSegmentId: 19, evidenceSegmentId: 15, windowIndex: 2 }),
  ], segments, games);
  assert.deepEqual(result.map((item) => [item.title, item.gameId, item.firstSegmentId, item.lastSegmentId]), [
    ["Falcon", "falcon", 0, 9], ["Xenon", null, 10, 14], ["Falcon", "falcon", 15, 19],
  ]);
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

function streamResponse(type, lines) {
  const encoder = new TextEncoder();
  const text = lines.join("\n");
  // Split inside a multi-byte character and inside lines to exercise buffering.
  const cut = Math.floor(text.length / 2);
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text).slice(0, encoder.encode(text.slice(0, cut)).length + 1));
      controller.enqueue(encoder.encode(text).slice(encoder.encode(text.slice(0, cut)).length + 1));
      controller.close();
    },
  }), { headers: { "content-type": type } });
}

test("liest gestreamte OpenAI- und Ollama-Antworten vollständig samt Endgrund und Tokenzahlen", async () => {
  const body = JSON.stringify({ discussions: [candidate({ title: "Pac-Män" })] });
  const sse = [...body.match(/.{1,7}/gsu)].map((content) =>
    `data: ${JSON.stringify({ model: "openai/gpt-4.1", choices: [{ delta: { content }, finish_reason: null }] })}\n`);
  const openai = await readModelResponse(streamResponse("text/event-stream", [
    ...sse, `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n`,
    `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n`, "data: [DONE]", "",
  ]), false);
  assert.equal(openai.choices[0].message.content, body);
  assert.equal(openai.choices[0].finish_reason, "stop");
  assert.equal(openai.model, "openai/gpt-4.1");
  assert.deepEqual(openai.usage, { prompt_tokens: 10, completion_tokens: 5 });

  const ndjson = [...body.match(/.{1,5}/gsu)].map((content) => JSON.stringify({ message: { content }, done: false }));
  const native = await readModelResponse(streamResponse("application/x-ndjson", [
    ...ndjson, JSON.stringify({ message: { content: "" }, done: true, done_reason: "length", eval_count: 7 }),
  ]), true);
  assert.equal(native.message.content, body);
  assert.equal(native.done_reason, "length");
  assert.equal(native.eval_count, 7);
});

test("wiederholt abgebrochene Streams und Streamfehler, bevor der Lauf endet", async () => {
  for (const lines of [
    [JSON.stringify({ choices: [{ delta: { content: "{\"discussions\":" }, finish_reason: null }] })].map((line) => `data: ${line}`),
    [`data: ${JSON.stringify({ error: { message: "model runner crashed" } })}`],
  ]) {
    let calls = 0;
    const requests = [];
    await assert.rejects(analyzeWindow(transcriptWindows(segments)[0], config, {
      log() {}, sleep: async () => {},
      fetchImpl: async (_url, request) => {
        calls += 1;
        requests.push(JSON.parse(request.body));
        return streamResponse("text/event-stream", lines);
      },
    }), /Nach 3 Versuchen abgebrochen/u);
    assert.equal(calls, 3);
    assert.ok(requests.every((body) => body.stream === true && body.stream_options.include_usage === true));
  }
});
