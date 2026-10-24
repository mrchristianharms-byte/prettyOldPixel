import { externalLink } from "../site-html.mjs";

export function archiveLinks(archives, inline = false, { visibleLabel = false } = {}) {
  if (!archives.length) return "<p>Kein passender Archivlink vorhanden.</p>";
  const icon = (path) => `<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const folder = icon('<path d="M3 7V4h6l2 3h10v13H3Z"/>');
  const reader = icon('<path d="M12 5v15M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z"/>');
  const download = icon('<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>');
  const links = archives.flatMap((archive) => {
    const provider = archive.provider === "pcgamesdatabase" ? "PC Games Database"
      : archive.provider === "amr" ? "AMR"
        : archive.provider === "retromags" ? "RetroMags" : archive.provider;
    const suffix = archive.match === "issue"
      ? archive.provider === "retromags" && archive.title ? `Ausgabe: ${archive.title}` : "Ausgabe"
      : "Zeitschriftenübersicht";
    return [
      archive.pageUrl ? externalLink(archive.pageUrl, `${provider}: ${archive.match === "issue" && archive.provider === "kultmags" ? "Archivordner zur Ausgabe" : suffix}`, "", folder, { visibleLabel }) : "",
      archive.match === "issue" && archive.readerUrl ? externalLink(archive.readerUrl, `${provider}: Heft lesen`, "", reader, { visibleLabel }) : "",
      archive.match === "issue" && archive.downloadUrl ? externalLink(archive.downloadUrl, `${provider}: Heft herunterladen`, "", download, { visibleLabel }) : "",
    ];
  }).filter(Boolean);
  return inline
    ? `<span class="archive-links" aria-label="Archivlinks">(${links.join(" ")})</span>`
    : `<ul class="archive-links" aria-label="Archivlinks">${links.map((link) => `<li>${link}</li>`).join("")}</ul>`;
}
