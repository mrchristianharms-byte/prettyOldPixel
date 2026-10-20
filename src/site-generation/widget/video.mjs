import { escapeHtml, externalLink } from "../site-html.mjs";

export function playerPoster(video) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouTube-Player aktivieren</title>
<style>body{margin:0;background:#171a22;color:#fff;font:1rem system-ui;text-align:center}a{display:grid;place-items:center;position:absolute;inset:0;color:#fff}img{position:absolute;width:100%;height:100%;object-fit:contain;opacity:.5}span{position:relative;padding:1rem;background:#171a22}</style></head>
<body><a href="${video.embedUrl}" rel="external"><img src="${video.thumbnailUrl}" width="320" height="180" alt="${escapeHtml(`Videovorschau: ${video.title}`)}"><span>YouTube-Player aktivieren ↗<br>Erst danach wird der externe Player geladen.</span></a></body></html>`;
}

export function videoWidget(video, videoCount = 1) {
  return `<div class="detail-player" data-video-widget><section aria-label="Videoplayer">
<iframe class="video-player" name="issue-player" title="${escapeHtml(`YouTube-Video: ${video.title}`)}" srcdoc="${escapeHtml(playerPoster(video))}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>
<p class="meta" data-player-preview-note>Vorschaubild von YouTube · Player erst nach Aktivierung.<span data-player-preference-note hidden> Die Aktivierung wird in diesem Browser gemerkt.</span></p>
<p class="meta" data-player-notice role="status" hidden></p>
</section><div class="player-controls meta" data-player-controls>
<button type="button" class="player-reset" data-player-reset hidden>YouTube-Aktivierung zurücksetzen</button>
${videoCount > 1 ? '<label><input type="checkbox" data-auto-next disabled> Nächste Folge automatisch</label>' : ""}
<span data-player-external>${externalLink(video.url, "Video auf YouTube ansehen")}</span>
<button type="button" data-player-play hidden>Video manuell starten</button>
</div></div>`;
}
