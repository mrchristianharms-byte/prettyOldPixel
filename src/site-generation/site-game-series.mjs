export const gamePhases = [
  { id: "intro", label: "Intro / Unboxing" },
  { id: "gameplay", label: "Spielverlauf" },
  { id: "conclusion", label: "Abschluss / Fazit" },
  { id: "interview", label: "Interview / Gespräch" },
  { id: "reconsider", label: "re.consider – Nachbetrachtung" },
  { id: "reminder", label: "re.minder – Erinnerung" },
  { id: "other", label: "Weitere Beiträge" },
];

const formatPattern = /(?:\[\s*|^\s*)(re\.(?:play|connect|consider|minder|invented)|streamstag|spieleabend)\b(?:\s*[-–]?\s*#\s*\d+(?:[.,]\d+)?)?\s*\]?/iu;
const numberedRunPattern = /\b(Staffel|Durchlauf)\s+([1-9]\d*)\b|\b([1-9]\d*)\.\s*(Durchlauf)\b/iu;

function titleContext(title) {
  const marker = formatPattern.exec(title);
  const format = marker?.[1].toLowerCase()
    ?? (/^\s*(?:Spieleabendaufzeichnung|Aufzeichnung\s*[-–]\s*Spieleabend)\b/iu.test(title) ? "spieleabend" : null);
  return {
    format,
    detail: (marker ? title.slice(marker.index + marker[0].length) : title).replace(/\[[^\]]*\]/gu, " ").trim(),
  };
}

function classifyPhase(video, context, sources) {
  const formatEvidence = context.titleFormat ? video.title : sources.map((source) => source.title).join(" · ");
  if (context.format === "re.minder") return { id: "reminder", evidence: formatEvidence };
  if (context.format === "re.consider") return { id: "reconsider", evidence: formatEvidence };
  const rules = [
    ["conclusion", /\b(?:Abschlussgespräch|Abschlussdiskussion|Fazit|Nachbetrachtung|Resümee)\b/iu],
    ["interview", /\bInterview\b/iu],
    ["intro", /\bUnboxing\b|^(?:(?:Das|Die|Der)\s+)?(?:Intro\b|Box\b|Boxinhalte\b|Vorstellung\s+(?:der\s+)?(?:Box|Verpackung)\b)/iu],
  ];
  for (const [id, pattern] of rules) {
    if (pattern.test(context.detail)) return { id, evidence: video.title };
  }
  if (["re.play", "re.connect", "streamstag", "spieleabend"].includes(context.format)) {
    return { id: "gameplay", evidence: formatEvidence };
  }
  return { id: "other", evidence: null };
}

function runMarker(title) {
  const match = numberedRunPattern.exec(title);
  if (!match) return null;
  const kind = (match[1] ?? match[4]).toLowerCase();
  const number = Number(match[2] ?? match[3]);
  return { id: `${kind}-${number}`, label: `${kind === "staffel" ? "Staffel" : "Durchlauf"} ${number}`, evidence: match[0] };
}

export function structureGameSeries(videos, playlists, gameNames = []) {
  const names = [...gameNames].sort((a, b) => b.length - a.length);
  const entries = videos.map((video) => {
    const sources = playlists.filter((playlist) => video.playlists.some((source) => source.id === playlist.id))
      .sort((a, b) => a.id.localeCompare(b.id, "en"));
    const context = titleContext(video.title);
    context.titleFormat = context.format !== null;
    if (!context.titleFormat) {
      const name = names.find((name) => context.detail.toLowerCase().startsWith(name.toLowerCase())
        && /^(?:$|[\s:–—-])/u.test(context.detail.slice(name.length)));
      if (name) context.detail = context.detail.slice(name.length).replace(/^[\s:–—-]+/u, "");
    }
    if (!context.format) {
      const formats = [...new Set(sources.map((source) => titleContext(source.title).format))];
      if (formats.length === 1) context.format = formats[0];
    }
    const phase = classifyPhase(video, context, sources);
    const sourceKey = sources.map((source) => source.id).sort().join("+") || "zusatz";
    const format = context.format ?? "Weitere Beiträge";
    const sourceLabel = sources.map((source) => source.title).join(" / ");
    const baseRunLabel = sources.length === 1 && titleContext(sources[0].title).format === context.format
      ? sourceLabel : `${format}${sources.length ? ` – ${sourceLabel}` : " – Zusatzbeiträge"}`;
    return {
      videoId: video.id, phase: { ...gamePhases.find((item) => item.id === phase.id), evidence: phase.evidence },
      format: context.format, sourceKey, sources: sources.map((source) => source.id),
      baseRunId: `${sourceKey}:${format}`, baseRunLabel,
      marker: runMarker(video.title), dated: video.publishedAt !== null,
    };
  });
  const activeMarkers = new Map();
  const runs = new Map();
  for (const entry of entries) {
    // Nur explizite Staffel-/Durchlaufmarker tragen sich innerhalb derselben datierten Quellreihe fort.
    if (entry.dated && entry.marker) activeMarkers.set(entry.baseRunId, entry.marker);
    const marker = entry.dated ? activeMarkers.get(entry.baseRunId) : entry.marker;
    const runId = `${entry.baseRunId}${marker ? `:${marker.id}` : ""}`;
    if (!runs.has(runId)) {
      runs.set(runId, {
        id: runId, label: `${entry.baseRunLabel}${marker ? ` – ${marker.label}` : ""}`,
        sources: entry.sources, evidence: marker?.evidence ?? null, videos: [],
      });
    }
    const run = runs.get(runId);
    run.videos.push(entry.videoId);
    entry.runId = runId;
  }
  return {
    entries: entries.map(({ videoId, phase, format, runId }) => ({ videoId, phase, format, runId })),
    phases: gamePhases.flatMap((phase) => {
      const members = entries.filter((entry) => entry.phase.id === phase.id).map((entry) => entry.videoId);
      return members.length ? [{ ...phase, videos: members }] : [];
    }),
    runs: [...runs.values()],
  };
}
