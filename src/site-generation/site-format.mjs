export function dateLabel(iso, withTime = true) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(iso));
}

export function durationLabel(seconds) {
  if (seconds === null) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours ? `${hours}:` : ""}${hours ? String(minutes).padStart(2, "0") : minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function videoDate(video) {
  return video.publishedAt
    ? `<time datetime="${video.publishedAt}">${dateLabel(video.publishedAt)}</time>`
    : "Veröffentlichungsdatum unbekannt";
}
