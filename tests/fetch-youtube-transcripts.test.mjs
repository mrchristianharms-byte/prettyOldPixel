import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fetchTranscript, fetchYoutubeTranscripts, parseTranscript, selectCaptionTrack, YoutubeRateLimitError } from "../src/fetch-youtube-transcripts.mjs";

const id = "t0000000000";
const url = "https://www.youtube.com/api/timedtext?v=t0000000000&fmt=json3";
const track = [{ ext: "json3", url }];
const captions = { events: [
  { tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: "Hallo " }, { utf8: "Welt" }] },
  { tStartMs: 1500, segs: [{ utf8: "\n" }] },
  { tStartMs: 1600, segs: [{ utf8: "Weiter" }] },
] };

test("liest JSON3-Zeitmarken und Textsegmente ohne erfundene Dauer oder doppelte Zeilenumbrüche", () => {
  assert.deepEqual(parseTranscript(captions), [
    { startMs: 0, durationMs: 1500, text: "Hallo Welt" },
    { startMs: 1600, durationMs: null, text: "Weiter" },
  ]);
  for (const data of [{}, { events: [] }, { events: [{ tStartMs: -1, segs: [{ utf8: "Text" }] }] },
    { events: [{ tStartMs: 1, dDurationMs: -1, segs: [{ utf8: "Text" }] }] },
    { events: [{ tStartMs: 1, segs: [{}] }] }]) {
    assert.throws(() => parseTranscript(data));
  }
});

test("bevorzugt deutsche manuelle Untertitel, dann automatische deutsche, englische und andere Sprachen", () => {
  assert.deepEqual(selectCaptionTrack({ subtitles: { en: track, de: track }, automatic_captions: { de: track } }),
    { language: "de", automatic: false, url });
  assert.equal(selectCaptionTrack({ subtitles: { en: track }, automatic_captions: { de: track } }).language, "de");
  assert.equal(selectCaptionTrack({ subtitles: { fr: track }, automatic_captions: { en: track } }).language, "en");
  assert.equal(selectCaptionTrack({ subtitles: { fr: track }, automatic_captions: {} }).language, "fr");
  assert.equal(selectCaptionTrack({ subtitles: { live_chat: [] }, automatic_captions: {} }), null);
  assert.throws(() => selectCaptionTrack({}), /fehlende subtitles/u);
  assert.throws(() => selectCaptionTrack({ subtitles: { de: [{ ext: "vtt", url }] }, automatic_captions: {} }), /JSON3/u);
});

test("fragt ausschließlich YouTube mit yt-dlp ohne Shell, Konfiguration, Login oder Mediendownload ab", async () => {
  const result = await fetchTranscript(id, {
    sleep: async (ms) => assert.equal(ms, 3000),
    execFileImpl: async (command, args, options) => {
      assert.equal(command, "yt-dlp");
      for (const flag of ["--ignore-config", "--no-cache-dir", "--no-playlist", "--skip-download", "--dump-single-json"]) {
        assert.ok(args.includes(flag));
      }
      assert.ok(!args.some((argument) => /cookies|password|username|proxy/u.test(argument)));
      assert.equal(args.at(-1), `https://www.youtube.com/watch?v=${id}`);
      assert.equal(options.timeout, 120_000);
      assert.ok(!options.shell);
      return { stdout: JSON.stringify({ id, subtitles: { de: track }, automatic_captions: {} }), stderr: "" };
    },
    fetchImpl: async (target, options) => {
      assert.equal(target, url);
      assert.equal(options.redirect, "error");
      return new Response(JSON.stringify(captions));
    },
  });
  assert.equal(result.status, "available");
  assert.equal(result.language, "de");
  assert.equal(result.automatic, false);
  assert.equal(result.segments[0].startMs, 0);
});

test("fehlende Untertitel sind ein eigener Zustand; technische Fehler sind kein Erfolg", async () => {
  const metadata = (data) => async () => ({ stdout: JSON.stringify(data), stderr: "" });
  assert.deepEqual(await fetchTranscript(id, {
    execFileImpl: metadata({ id, subtitles: {}, automatic_captions: {} }),
    fetchImpl: () => { throw new Error("Keine Untertitelanfrage erwartet"); },
  }), { status: "unavailable", reason: "no-public-captions" });
  await assert.rejects(fetchTranscript("../bad"), /Video-ID/u);
  await assert.rejects(fetchTranscript(id, { execFileImpl: metadata({ id: "wrong" }) }), /Video-ID/u);
  await assert.rejects(fetchTranscript(id, { execFileImpl: async () => { throw new Error("ENOENT"); } }), /ENOENT/u);
  const execFileImpl = metadata({ id, subtitles: { de: track }, automatic_captions: {} });
  await assert.rejects(fetchTranscript(id, {
    execFileImpl, sleep: async () => {}, fetchImpl: async () => new Response("Rate limit", { status: 429 }),
  }), /HTTP 429/u);
  await assert.rejects(fetchTranscript(id, {
    execFileImpl, sleep: async () => {}, fetchImpl: async () => new Response(""),
  }), /JSON/u);
  await assert.rejects(fetchTranscript(id, {
    execFileImpl, sleep: async () => {}, fetchImpl: async () => new Response(new Uint8Array(16 * 1024 * 1024 + 1)),
  }), /überschreitet/u);
  for (const address of ["https://example.org/api/timedtext", "http://www.youtube.com/api/timedtext",
    "https://www.youtube.com/redirect", "https://user:secret@www.youtube.com/api/timedtext"]) {
    await assert.rejects(fetchTranscript(id, {
      sleep: async () => {},
      execFileImpl: metadata({ id, subtitles: { de: [{ ext: "json3", url: address }] }, automatic_captions: {} }),
      fetchImpl: () => { throw new Error("Nicht aufrufen"); },
    }), /Unerwartete/u);
  }
});

test("429 wird ohne Retry erkannt, einschließlich Retry-After und yt-dlp-Fehlern oder Warnungen", async () => {
  let requests = 0;
  const metadata = { stdout: JSON.stringify({ id, subtitles: { de: track }, automatic_captions: {} }), stderr: "" };
  await assert.rejects(fetchTranscript(id, {
    execFileImpl: async () => metadata,
    sleep: async () => {},
    fetchImpl: async () => {
      requests += 1;
      return new Response("Rate limit", { status: 429, headers: { "Retry-After": "3600" } });
    },
  }), (error) => error instanceof YoutubeRateLimitError && /Retry-After: 3600/u.test(error.message));
  assert.equal(requests, 1);
  for (const execFileImpl of [
    async () => { throw Object.assign(new Error("yt-dlp fehlgeschlagen"), { stderr: "ERROR: HTTP Error 429: Too Many Requests" }); },
    async () => ({ ...metadata, stderr: "WARNING: HTTP Error 429: Too Many Requests" }),
  ]) {
    await assert.rejects(fetchTranscript(id, {
      execFileImpl, log() {},
      fetchImpl: () => assert.fail("Nach yt-dlp-429 darf kein Untertitelabruf folgen"),
      sleep: () => assert.fail("Nach 429 darf keine Pause mit Wiederholung folgen"),
    }), YoutubeRateLimitError);
  }
});

test("wiederholt nur vorübergehende Serverfehler begrenzt mit steigender Pause", async () => {
  const execFileImpl = async () => ({
    stdout: JSON.stringify({ id, subtitles: { de: track }, automatic_captions: {} }), stderr: "",
  });
  for (const status of [500, 502, 503, 504]) {
    const delays = [];
    const logs = [];
    let calls = 0;
    const result = await fetchTranscript(id, {
      execFileImpl, log: (message) => logs.push(message), sleep: async (ms) => delays.push(ms),
      fetchImpl: async () => {
        calls += 1;
        return calls < 3 ? new Response("Server error", { status }) : new Response(JSON.stringify(captions));
      },
    });
    assert.equal(result.status, "available");
    assert.equal(calls, 3);
    assert.deepEqual(delays, [3000, 5000, 10_000]);
    assert.equal(logs.length, 2);
  }
  for (const status of [403, 503]) {
    let calls = 0;
    await assert.rejects(fetchTranscript(id, {
      execFileImpl, sleep: async () => {}, log() {},
      fetchImpl: async () => { calls += 1; return new Response("Error", { status }); },
    }), new RegExp(`HTTP ${status}`, "u"));
    assert.equal(calls, status === 403 ? 1 : 3);
  }
  let calls = 0;
  const delays = [];
  await assert.rejects(fetchTranscript(id, {
    execFileImpl, sleep: async (ms) => delays.push(ms), log() {},
    fetchImpl: async () => {
      calls += 1;
      return new Response("Error", { status: calls === 1 ? 503 : 429 });
    },
  }), YoutubeRateLimitError);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [3000, 5000]);
});

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "pixel-transcripts-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const channel = { id: "UC-transcripts", title: "Pretty Old Pixel" };
  const videos = [
    { id, title: "Blätterabend - Ausgabe unbekannt" },
    { id: "t0000000001", title: "Heftbesprechung" },
    { id: "t0000000002", title: "Anderes Video" },
    { id: "t0000000003", title: "Zukunft", publishedAt: "2199-01-01T00:00:00Z" },
  ];
  for (const [name, data] of [
    ["youtube-videos", { channel, complete: true, videos }],
    ["youtube-playlists", { channel, complete: true, playlists: [] }],
    ["blaetterabend-videos", { channel, videos: [
      { id, magazines: [] },
      { id: "t0000000001", magazines: [{ name: "PC Games", issue: null }] },
      { id: "t0000000003", magazines: [] },
    ] }],
  ]) {
    await writeFile(path.join(directory, `${name}.json`), JSON.stringify(data));
  }
  return { cacheDirectory: directory, targetDirectory: path.join(directory, "youtube-transcripts"), log() {}, sleep: async () => {} };
}

const available = { status: "available", language: "de", automatic: true, segments: parseTranscript(captions) };

test("holt nur zugeordnete öffentliche Videos und fragt gespeicherte Transkripte oder Fehlanzeigen nie erneut an", async (t) => {
  const options = await setup(t);
  const calls = [];
  const logs = [];
  const delays = [];
  const fetchTranscriptImpl = async (videoId) => {
    calls.push(videoId);
    return videoId === id ? available : { status: "unavailable", reason: "no-public-captions" };
  };
  const first = await fetchYoutubeTranscripts({
    ...options, fetchTranscriptImpl, log: (message) => logs.push(message), sleep: async (ms) => delays.push(ms),
  });
  assert.deepEqual(delays, [15_000]);
  assert.deepEqual(first, { selected: 2, fetched: 1, unavailable: 1, skipped: 0, failed: 0 });
  assert.deepEqual([...calls].sort(), [id, "t0000000001"]);
  assert.ok(logs.some((message) => message.includes("2 Blätterabend-/Zeitschriftenvideos ausgewählt")));
  assert.ok(logs.some((message) => message.includes(`[1/2 · 50 %] ${id} – Blätterabend`)));
  assert.ok(logs.some((message) => message.includes("[2/2 · 100 %]")));
  assert.ok(logs.some((message) => message.includes(`Video: https://www.youtube.com/watch?v=${id}`)));
  assert.ok(logs.some((message) => message.includes("de, automatische Untertitel, 2 Segmente")));
  assert.ok(logs.some((message) => message.includes("1 neu gespeichert, 1 ohne Untertitel, 0 aus Cache übersprungen, 0 fehlgeschlagen")));
  const record = JSON.parse(await readFile(path.join(options.targetDirectory, `${id}.json`), "utf8"));
  assert.equal(record.videoId, id);
  assert.equal(record.segments[0].durationMs, 1500);
  assert.ok(!JSON.stringify(record).includes("timedtext"));
  const cachedLogs = [];
  const second = await fetchYoutubeTranscripts({
    ...options, log: (message) => cachedLogs.push(message), fetchTranscriptImpl: () => { throw new Error("Erneuter Abruf verboten"); },
    sleep: () => assert.fail("Cachetreffer benötigen keine Pause"),
  });
  assert.ok(!cachedLogs.some((message) => message.includes(id) || message.includes("t0000000001")));
  assert.ok(cachedLogs.some((message) => message.includes("Abgeschlossen: 2/2 Videos geprüft")));
  assert.ok(cachedLogs.some((message) => message.includes("2 aus Cache übersprungen")));
  assert.deepEqual(second, { selected: 2, fetched: 0, unavailable: 0, skipped: 2, failed: 0 });
  assert.deepEqual((await readdir(options.targetDirectory)).sort(), [`${id}.json`, "t0000000001.json"]);
});

test("bricht beim ersten 429 sofort ab, räumt Sperren auf und setzt später nur fehlende Videos fort", async (t) => {
  const options = await setup(t);
  await writeFile(path.join(options.cacheDirectory, "blaetterabend-videos.json"), JSON.stringify({
    channel: { id: "UC-transcripts", title: "Pretty Old Pixel" },
    videos: [{ id, magazines: [] }, { id: "t0000000001", magazines: [] }, { id: "t0000000002", magazines: [] }],
  }));
  const calls = [];
  const logs = [];
  await assert.rejects(fetchYoutubeTranscripts({
    ...options, log: (message) => logs.push(message),
    fetchTranscriptImpl: async (videoId) => {
      calls.push(videoId);
      if (calls.length === 2) throw new YoutubeRateLimitError("3600");
      return available;
    },
  }), /HTTP 429.*abgebrochen/u);
  assert.equal(calls.length, 2);
  assert.deepEqual(await readdir(options.targetDirectory), [`${calls[0]}.json`]);
  assert.ok(logs.some((message) => message.includes("Abgebrochen: 2/3")));
  assert.ok(!logs.some((message) => message.includes("Abgeschlossen:")));
  assert.ok(logs.some((message) => message.includes("Retry-After: 3600")));
  const resumed = [];
  const result = await fetchYoutubeTranscripts({
    ...options, fetchTranscriptImpl: async (videoId) => { resumed.push(videoId); return available; },
  });
  assert.equal(result.skipped, 1);
  assert.equal(result.fetched, 2);
  assert.ok(!resumed.includes(calls[0]));
  assert.ok(resumed.includes(calls[1]));
});

test("stoppt auch bei strukturiertem oder als HTTP-Fehler gemeldetem 429 beim allerersten Video", async (t) => {
  const options = await setup(t);
  for (const error of [
    Object.assign(new Error("HTTP-Fehler"), { status: 429 }),
    new Error("YouTube-Untertitel: HTTP 429."),
  ]) {
    let calls = 0;
    await assert.rejects(fetchYoutubeTranscripts({
      ...options, fetchTranscriptImpl: async () => { calls += 1; throw error; },
    }), /HTTP 429/u);
    assert.equal(calls, 1);
    assert.deepEqual(await readdir(options.targetDirectory), []);
  }
});

test("meldet eine leere Auswahl ohne Abrufe oder ungültige Prozentanzeige", async (t) => {
  const options = await setup(t);
  const source = path.join(options.cacheDirectory, "blaetterabend-videos.json");
  const data = JSON.parse(await readFile(source, "utf8"));
  data.videos = [];
  await writeFile(source, JSON.stringify(data));
  const logs = [];
  const result = await fetchYoutubeTranscripts({
    ...options, log: (message) => logs.push(message),
    fetchTranscriptImpl: () => { throw new Error("Nicht aufrufen"); },
  });
  assert.equal(result.selected, 0);
  assert.ok(logs.includes("Abgeschlossen: 0/0 Videos geprüft."));
  assert.ok(!logs.some((message) => /NaN|Infinity/u.test(message)));
});

test("speichert technische Fehler nicht als fehlende Untertitel und versucht nur diese später erneut", async (t) => {
  const options = await setup(t);
  const logs = [];
  await assert.rejects(fetchYoutubeTranscripts({
    ...options, log: (message) => logs.push(message),
    fetchTranscriptImpl: async (videoId) => {
      if (videoId === id) throw new Error("HTTP 403");
      return available;
    },
  }), /1 Transkriptabrufe fehlgeschlagen/u);
  assert.ok(logs.some((message) => message.includes(`FEHLER ${id}: HTTP 403`)));
  assert.deepEqual(await readdir(options.targetDirectory), ["t0000000001.json"]);
  const calls = [];
  const result = await fetchYoutubeTranscripts({
    ...options, fetchTranscriptImpl: async (videoId) => { calls.push(videoId); return available; },
  });
  assert.deepEqual(calls, [id]);
  assert.equal(result.skipped, 1);
});

test("lehnt beschädigten Cache ab, ohne ihn erneut abzufragen oder zu überschreiben", async (t) => {
  const options = await setup(t);
  await fetchYoutubeTranscripts({ ...options, fetchTranscriptImpl: async () => available });
  const file = path.join(options.targetDirectory, `${id}.json`);
  await writeFile(file, "null");
  await assert.rejects(fetchYoutubeTranscripts({
    ...options, fetchTranscriptImpl: () => { throw new Error("Nicht aufrufen"); },
  }), /Ungültiger Transkript-Cache/u);
  assert.equal(await readFile(file, "utf8"), "null");
});

test("verhindert gleichzeitigen Abruf derselben Video-ID", async (t) => {
  const options = await setup(t);
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  const first = fetchYoutubeTranscripts({
    ...options, fetchTranscriptImpl: async () => { entered(); await blocked; return available; },
  });
  await started;
  try {
    await assert.rejects(fetchYoutubeTranscripts({
      ...options, fetchTranscriptImpl: () => { throw new Error("Nicht aufrufen"); },
    }), /Transkript gesperrt/u);
  } finally {
    release();
    await first;
  }
});
