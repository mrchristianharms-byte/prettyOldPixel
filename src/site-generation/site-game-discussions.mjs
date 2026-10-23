import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function optionalFile(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export const unreviewedPreviewVariable = "SHOW_UNREVIEWED_GAME_DISCUSSIONS";

export async function loadGameDiscussions(model, cacheDirectory, {
  includeUnreviewed = process.env[unreviewedPreviewVariable] === "1",
} = {}) {
  for (const video of model.videos) {
    if (!video.blaetterabend && !video.magazines.length) continue;
    const file = path.join(cacheDirectory, "game-discussions", `${video.id}.json`);
    const source = await optionalFile(file);
    if (source === undefined) continue;
    try {
      const data = JSON.parse(source);
      const transcriptSource = await optionalFile(path.join(cacheDirectory, "youtube-transcripts", `${video.id}.json`));
      requireValue(transcriptSource !== undefined, "Zugehöriges Transkript fehlt.");
      const transcript = JSON.parse(transcriptSource);
      requireValue(data.version === 1 && data.videoId === video.id
        && ["needs-review", "reviewed"].includes(data.status) && Array.isArray(data.discussions),
      "Ungültige Gesamtanalyse.");
      requireValue(transcript.status === "available" && transcript.videoId === video.id
        && Array.isArray(transcript.segments) && transcript.segments.length > 0,
      "Kein verfügbares Transkript.");
      requireValue(data.transcriptHash === createHash("sha256").update(transcriptSource).digest("hex"),
        "Analyse gehört nicht zum aktuellen Transkript.");
      // Review is one decision for the whole list; a legacy per-entry "reviewed" field is ignored.
      const reviewed = data.status === "reviewed";
      let previousStart = -1;
      const discussions = data.discussions.map((discussion) => {
        requireValue(discussion && typeof discussion.title === "string" && discussion.title.trim().length > 0
          && Number.isSafeInteger(discussion.startMs) && discussion.startMs >= previousStart
          && discussion.startMs >= 0
          && (discussion.endMs === null || (Number.isSafeInteger(discussion.endMs) && discussion.endMs > discussion.startMs))
          && ["high", "medium", "low"].includes(discussion.confidence),
        "Ungültiger Besprechungsabschnitt.");
        const first = transcript.segments[discussion.firstSegmentId];
        const last = transcript.segments[discussion.lastSegmentId];
        requireValue(Number.isInteger(discussion.firstSegmentId) && Number.isInteger(discussion.lastSegmentId)
          && discussion.firstSegmentId >= 0 && discussion.lastSegmentId >= discussion.firstSegmentId
          && first?.startMs === discussion.startMs && Number.isSafeInteger(last?.startMs)
          && (discussion.endMs === null || (Number.isSafeInteger(last.durationMs)
            && discussion.endMs <= last.startMs + last.durationMs))
          && (video.durationSeconds === null || (discussion.startMs < video.durationSeconds * 1000
            && (discussion.endMs === null || discussion.endMs <= video.durationSeconds * 1000))),
        "Besprechungszeit liegt außerhalb der Transkriptsegmente oder Videolaufzeit.");
        const names = (key) => {
          const value = discussion[key] ?? [];
          requireValue(Array.isArray(value) && value.every((name) => typeof name === "string" && name.trim()), `Ungültige Angabe ${key}.`);
          return value.map((name) => name.trim());
        };
        requireValue(discussion.firstYear === undefined || Number.isInteger(discussion.firstYear), "Ungültiges Erscheinungsjahr.");
        previousStart = discussion.startMs;
        return {
          title: discussion.title.trim(), startMs: discussion.startMs, endMs: discussion.endMs,
          reviewed, confidence: discussion.confidence,
          firstYear: discussion.firstYear ?? null, developers: names("developers"), publishers: names("publishers"),
        };
      });
      // Unreviewed model proposals are validated, but only published in an explicit local preview.
      if (discussions.length && (reviewed || includeUnreviewed)) video.gameDiscussions = discussions;
    } catch (error) {
      throw new Error(`${file}: ${error.message}`, { cause: error });
    }
  }
  return model;
}
