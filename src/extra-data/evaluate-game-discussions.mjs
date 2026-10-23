import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
export const referenceDirectory = path.join(projectRoot, "src/data/game-discussion-references");
export const BOUNDARY_TOLERANCE_MS = 15_000;
// Predictions without a known end are compared over this minimal span only; their end never counts as correct.
const OPEN_END_SPAN_MS = 30_000;

function requireValue(condition, message) {
  if (!condition) throw new Error(`Bewertung: ${message}`);
}

const titleKey = (title) => title.normalize("NFKC").toLocaleLowerCase("de-DE").replace(/[^\p{L}\p{N}]/gu, "");

function validTime(item, label) {
  requireValue(Number.isSafeInteger(item.startMs) && item.startMs >= 0
    && (item.endMs === null || (Number.isSafeInteger(item.endMs) && item.endMs > item.startMs)),
  `${label}: ungültige Zeitangaben.`);
}

export function validateReference(reference) {
  requireValue(reference && /^[A-Za-z0-9_-]{11}$/u.test(reference.videoId), "Referenz ohne gültige Video-ID.");
  requireValue(["draft", "confirmed"].includes(reference.status), "Referenzstatus muss draft oder confirmed sein.");
  for (const list of ["discussions", "unclear", "rejected"]) {
    requireValue(Array.isArray(reference[list] ?? []), `${list} muss eine Liste sein.`);
  }
  for (const item of reference.discussions) {
    requireValue(typeof item.title === "string" && item.title.trim()
      && (item.aliases ?? []).every((alias) => typeof alias === "string" && alias.trim()),
    "Referenzabschnitt ohne Titel oder mit ungültigem Alias.");
    validTime(item, item.title);
    requireValue(item.endMs !== null, `${item.title}: Referenzabschnitte benötigen eine Endzeit.`);
  }
  for (const item of reference.unclear ?? []) validTime(item, item.title ?? "Unklarer Abschnitt");
  return reference;
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === "\"" && line[index + 1] === "\"") {
      value += "\"";
      index += 1;
    } else if (character === "\"") {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

// Accepts the analysis cache format or CSV exports with startMs,durationMs and a title column.
export function parsePredictions(source, fileName = "") {
  if (fileName.endsWith(".json") || source.trimStart().startsWith("{")) {
    const data = JSON.parse(source);
    requireValue(Array.isArray(data.discussions), "Analysedatei ohne discussions.");
    return data.discussions.map((item) => {
      validTime(item, item.title);
      return { title: item.title, startMs: item.startMs, endMs: item.endMs };
    });
  }
  const [header, ...rows] = source.split(/\r?\n/u).filter((line) => line.trim());
  const columns = parseCsvLine(header).map((column) => column.trim());
  const titleColumn = ["gameTitle", "spieletitel", "title"].find((name) => columns.includes(name));
  requireValue(columns.includes("startMs") && columns.includes("durationMs") && titleColumn,
    "CSV benötigt startMs, durationMs und gameTitle/spieletitel/title.");
  return rows.map((row) => {
    const values = parseCsvLine(row);
    const value = (name) => values[columns.indexOf(name)]?.trim() ?? "";
    const startMs = Number(value("startMs"));
    const duration = value("durationMs");
    const item = { title: value(titleColumn), startMs, endMs: duration === "" ? null : startMs + Number(duration) };
    requireValue(item.title, "CSV-Zeile ohne Titel.");
    validTime(item, item.title);
    return item;
  });
}

const span = (item) => [item.startMs, item.endMs ?? item.startMs + OPEN_END_SPAN_MS];

function overlapMs(a, b) {
  const [aStart, aEnd] = span(a);
  const [bStart, bEnd] = span(b);
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

// A time match needs at least half of the shorter section to overlap.
function timeMatch(a, b) {
  const shorter = Math.min(span(a)[1] - span(a)[0], span(b)[1] - span(b)[0]);
  return overlapMs(a, b) >= shorter / 2;
}

export function evaluateDiscussions(reference, predictions) {
  validateReference(reference);
  const pairs = [];
  reference.discussions.forEach((expected, referenceIndex) => predictions.forEach((predicted, predictionIndex) => {
    if (timeMatch(expected, predicted)) pairs.push({ referenceIndex, predictionIndex, overlap: overlapMs(expected, predicted) });
  }));
  pairs.sort((a, b) => b.overlap - a.overlap);
  const byReference = new Map();
  const byPrediction = new Map();
  for (const pair of pairs) {
    if (byReference.has(pair.referenceIndex) || byPrediction.has(pair.predictionIndex)) continue;
    byReference.set(pair.referenceIndex, pair.predictionIndex);
    byPrediction.set(pair.predictionIndex, pair.referenceIndex);
  }
  const matches = [...byReference].map(([referenceIndex, predictionIndex]) => {
    const expected = reference.discussions[referenceIndex];
    const predicted = predictions[predictionIndex];
    // Catalogue titles carry subtitles ("Police Quest: In Pursuit of the Death Angel"); the main title is enough.
    const predictedKeys = new Set([predicted.title, predicted.title.split(":")[0]].map(titleKey));
    const titleCorrect = [expected.title, ...(expected.aliases ?? [])].some((title) => predictedKeys.has(titleKey(title)));
    const startDeltaMs = predicted.startMs - expected.startMs;
    const endDeltaMs = predicted.endMs === null ? null : predicted.endMs - expected.endMs;
    return {
      expected, predicted, titleCorrect, startDeltaMs, endDeltaMs,
      boundariesWithinTolerance: Math.abs(startDeltaMs) <= BOUNDARY_TOLERANCE_MS
        && endDeltaMs !== null && Math.abs(endDeltaMs) <= BOUNDARY_TOLERANCE_MS,
    };
  }).sort((a, b) => a.expected.startMs - b.expected.startMs);
  const unmatched = predictions.filter((_, index) => !byPrediction.has(index));
  const neutral = unmatched.filter((predicted) => (reference.unclear ?? []).some((item) => timeMatch(item, predicted)));
  const falsePositives = unmatched.filter((predicted) => !neutral.includes(predicted));
  const correct = matches.filter((match) => match.titleCorrect);
  const counted = predictions.length - neutral.length;
  const ratio = (value, total) => (total ? value / total : null);
  return {
    videoId: reference.videoId, referenceStatus: reference.status,
    references: reference.discussions.length, predictions: predictions.length, neutral: neutral.length,
    correct: correct.length,
    precision: ratio(correct.length, counted),
    recall: ratio(correct.length, reference.discussions.length),
    boundaryAccuracy: ratio(correct.filter((match) => match.boundariesWithinTolerance).length, correct.length),
    matches,
    missed: reference.discussions.filter((_, index) => !byReference.has(index)),
    falsePositives, neutralPredictions: neutral,
  };
}

function clock(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

const percent = (value) => (value === null ? "–" : `${(value * 100).toFixed(0)} %`);
const delta = (value) => (value === null ? "offen" : `${value >= 0 ? "+" : ""}${Math.round(value / 1000)} s`);

export function formatEvaluation(result, label) {
  const lines = [
    `${label}: ${result.videoId} (Referenz ${result.referenceStatus === "draft" ? "ENTWURF, ungeprüft" : "bestätigt"})`,
    `  Präzision ${percent(result.precision)} · Abdeckung ${percent(result.recall)} · Grenzen ±${BOUNDARY_TOLERANCE_MS / 1000} s ${percent(result.boundaryAccuracy)}`,
    `  ${result.correct}/${result.references} Referenzabschnitte korrekt erkannt; ${result.predictions} Vorschläge, davon ${result.neutral} in unklaren Bereichen nicht gewertet.`,
  ];
  for (const match of result.matches) {
    lines.push(`  ${match.titleCorrect ? "✓" : "≠"} ${clock(match.expected.startMs)} ${match.expected.title}`
      + `${match.titleCorrect ? "" : ` – erkannt als „${match.predicted.title}“`}`
      + ` (Start ${delta(match.startDeltaMs)}, Ende ${delta(match.endDeltaMs)})`);
  }
  for (const item of result.missed) lines.push(`  – ${clock(item.startMs)} ${item.title}: nicht erkannt`);
  for (const item of result.falsePositives) lines.push(`  + ${clock(item.startMs)} ${item.title}: kein Referenzabschnitt`);
  return lines.join("\n");
}

export async function runCli(argv = process.argv.slice(2)) {
  requireValue(argv.length >= 2 && argv.every((value) => !value.startsWith("--")),
    "Aufruf: node src/extra-data/evaluate-game-discussions.mjs <video-id|referenz.json> <ergebnis.json|ergebnis.csv> [...]");
  const referenceFile = /^[A-Za-z0-9_-]{11}$/u.test(argv[0]) ? path.join(referenceDirectory, `${argv[0]}.json`) : argv[0];
  const reference = validateReference(JSON.parse(await readFile(referenceFile, "utf8")));
  for (const file of argv.slice(1)) {
    const predictions = parsePredictions(await readFile(file, "utf8"), file);
    console.log(formatEvaluation(evaluateDiscussions(reference, predictions), path.basename(file)));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
