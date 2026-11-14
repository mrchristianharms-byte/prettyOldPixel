import { escapeHtml, externalLink } from "../site-html.mjs";

export function playerPoster(video) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouTube-Player aktivieren</title>
<style>body{margin:0;background:#171a22;color:#fff;font:1rem system-ui;text-align:center}a{display:grid;place-items:center;position:absolute;inset:0;color:#fff}img{position:absolute;width:100%;height:100%;object-fit:contain;opacity:.5}span{position:relative;padding:1rem;background:#171a22}</style></head>
<body><a href="${video.embedUrl}" rel="external"><img src="${video.thumbnailUrl}" width="320" height="180" alt="${escapeHtml(`Videovorschau: ${video.title}`)}"><span>YouTube-Player aktivieren ↗<br>Erst danach wird der externe Player geladen.</span></a></body></html>`;
}

const icons = {
  enable: '<path d="M12 3v9m-5-7a9 9 0 1 0 10 0"/>',
  next: '<path d="m4 5 9 7-9 7V5Zm10 0 8 7-8 7V5Z"/>',
  start: '<path d="m7 4 14 8-14 8V4Z"/>',
  youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3V9Z"/>',
};

function icon(name) {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

function playerSwitch(id, attribute, name, explanation, symbol) {
  return `<label class="player-setting" title="${explanation}">${icon(symbol)}<input id="${id}" type="checkbox" role="switch" aria-label="${name}" aria-description="${explanation}" ${attribute} disabled></label>`;
}

export function videoWidget(video, videoCount = 1) {
  return `<div class="detail-player" data-video-widget><section aria-label="Videoplayer">
<iframe class="video-player" name="issue-player" title="${escapeHtml(`YouTube-Video: ${video.title}`)}" srcdoc="${escapeHtml(playerPoster(video))}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>
</section><div class="player-toolbar"><p class="player-title" data-player-title>${escapeHtml(video.title)}</p><div class="player-controls meta" data-player-controls>
${playerSwitch("player-enable", "data-player-enable", "YouTube-Aktivierung", "YouTube-Aktivierung: Externen Player laden; die Freigabe wird in diesem Browser gemerkt. Ausschalten widerruft die Freigabe.", "enable")}
${videoCount > 1 ? playerSwitch("player-auto-next", "data-auto-next", "Nächste Folge automatisch", "Nächste Folge automatisch: Nach Videoende innerhalb dieser Reihe fortsetzen. Die Auswahl wird in diesem Browser gemerkt.", "next") : ""}
${playerSwitch("player-auto-start", "data-auto-start", "Automatisch starten", "Automatisch starten: Videos nach dem Laden abspielen. Nur mit YouTube-Aktivierung; standardmäßig aus. Die Auswahl wird in diesem Browser gemerkt.", "start")}
<span data-player-external>${externalLink(video.url, "Auf YouTube ansehen und liken", "", icon("youtube")).replace('<a href=', '<a id="player-youtube-link" href=')}</span>
<button id="player-manual-play" type="button" data-player-play hidden>Video manuell starten</button>
</div></div><p class="meta" data-player-preview-note>Vorschaubild von YouTube · Player erst nach Aktivierung.<span data-player-preference-note hidden> Die Aktivierung wird in diesem Browser gemerkt.</span></p>
<p class="meta" data-player-notice role="status" hidden></p></div>`;
}
