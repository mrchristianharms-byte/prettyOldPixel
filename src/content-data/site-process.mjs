export const siteProcess = {
  route: "so-entsteht-die-seite/",
  title: "So entsteht diese Website",
  description: "Von lokalen Zuordnungen und YouTube-Cachedateien über GitHub Actions zu Website, Offline-App und Agentendaten auf GitHub Pages hinter Cloudflare.",
  date: "30.10.2026",
  introduction: "Diese Website besteht aus statischen Seiten, die bei Änderungen automatisch neu generiert werden. Aus Quellcode, lokalen Zuordnungen und YouTube-Daten entstehen HTML-Seiten, eine Offline-App und maschinenlesbare Inhalte. GitHub Actions übernimmt die Generierung und Veröffentlichung; Besucher erhalten fertige Dateien über Cloudflare und GitHub Pages.",
  legend: [
    "Besucher: alle 3 Sekunden ein Beispielaufruf; jeder zweite führt zum GitHub-Pages-Origin.",
    "Entwicklung: einmaliger Push nach 5 Sekunden.",
    "YouTube: alle 20 Sekunden ein Änderungsbeispiel – Fetch-Action aktivieren → YouTube abrufen → Cachedateien schreiben.",
    "Darstellung: Boxen werden kurz hervorgehoben, neue Daten erscheinen vorübergehend grün.",
    "Keine echten Anfragen oder Deployments. Der tatsächliche automatische YouTube-Abruf erfolgt täglich.",
  ],
  flows: [
    { title: "F1 · Entwicklung und lokale Daten", items: [
      "Manuelle Magazin-Fetches zur Referenzierung von Blätterabend-Videos: dev:fetch:archives, bei Bedarf dev:fetch:gamestar und dev:fetch:amiga-action; danach Zuordnungen prüfen.",
      "Lokale DB bedeutet dateibasierte Magazin-/Heft- und Spiele-/Playlistzuordnungen, keinen laufenden Datenbankserver. Spiele werden manuell bestätigt; vorbereitete Spielemetadaten ergänzen den Bestand.",
      "Quellcode und geprüfte Daten gelangen per Commit und git push main ins Repository. Der Entwicklungs-Push startet die Site-Action.",
    ] },
    { title: "F2 · YouTube und Cache-Aktualisierung", items: [
      "GitHub Action fetch:videos = Workflow „Update YouTube caches“: täglich. Kein YouTube-Webhook und keine Echtzeitgarantie.",
      "fetch:videos erkennt neue öffentliche Video-IDs; fetch:playlists läuft bei neuen Videos, fehlendem Output oder force_playlists. Abruf über optionale offizielle API oder anonym.",
      "Explizite Cachedateien: cache/youtube-videos.json und cache/youtube-playlists.json. Nur geänderte Dateien werden vom Bot committed und gepusht; keine automatische redaktionelle Zuordnung neuer Spiele.",
      "Erfolgreicher Abschluss startet site:generation über workflow_run, auch ohne Datenänderung.",
    ] },
    { title: "F3 · Generierung und Veröffentlichung", items: [
      "GitHub Action site:generation = Workflow „Deploy to GitHub Pages“; tatsächlicher npm-Aufruf: npm run generate:site. Alternative Trigger: push main oder manueller Workflow-Start.",
      "test → build → deploy: Der Build verwendet denselben getesteten Commit; nach einem Fetch-Lauf wird der aktuelle main-Stand getestet. Fehler verhindern eine neue Veröffentlichung.",
      "Node.js erzeugt drei gleichrangige Datenzweige: site/ (HTML und Assets), app/ (Offline-App) und ai-bot/ (Markdown, llms.txt, API und Katalog). Logische Zweige, keine drei parallel gestarteten Workflows.",
      "Alle Ausgaben laufen in einem docs/-Artefakt zusammen und werden auf GitHub Pages veröffentlicht, nicht als generierter Git-Commit. Öffentliche Domain: prettyoldpixel.com.",
      "Der Build liest vorbereitete lokale Daten, ohne YouTube oder Magazinarchive abzurufen. site/ und ai-bot/ sind Diagrammbezeichnungen, keine zusätzlichen öffentlichen Verzeichnisse.",
      "Gerundete Größenordnung des aktuellen Builds: rund 610 HTML-Seiten beziehungsweise 680 Website-Dateien mit Assets, 90 App-Dateien und 620 Agentendateien. Die Mengen ändern sich mit dem Katalog.",
    ] },
    { title: "F4 · Besucher und Auslieferung", items: [
      "Besucher → HTTPS prettyoldpixel.com → Cloudflare → bei Bedarf GitHub Pages; Antworten laufen zurück. Cloudflare ist Proxy/CDN.",
      "Die Animation zeigt abwechselnd eine Antwort aus Cloudflare und einen Abruf am GitHub-Pages-Origin. Jeder zweite simulierte Aufruf läuft zum Origin; dies ist keine gemessene Cache-Hit-Rate.",
      "Videos bleiben auf YouTube. Erst nach Player-Aktivierung verbindet sich der Browser direkt mit YouTube, nicht über einen Video-Proxy bei GitHub Pages.",
      "Pfeilanimation und grüne „neu“-Markierung sind illustrative Beispiele, keine Live-Statusanzeige. Animation pausieren oder reduzierte Bewegung im Betriebssystem verwenden.",
    ] },
  ],
};

export const processColors = { dev: "#1D4ED8", archive: "#7E22CE", yt: "#A16207", build: "#475569", web: "#047857" };

export const processConnections = {
  "archive-db": ["archive", "db"],
  "dev-push": ["dev", "push"],
  "db-push": ["db", "push"],
  "push-repo": ["push", "repo"],
  "fetch-channel": ["fetch", "youtube"],
  "fetch-cache": ["fetch", "cache"],
  "cache-repo": ["cache", "repo"],
  "repo-site": ["repo", "site"],
  "build-out": ["site", null],
  "build-html": [null, "html"],
  "build-app": [null, "app"],
  "build-ai": [null, "ai"],
  "html-artifact": ["html", "artifact"],
  "app-artifact": ["app", "artifact"],
  "ai-artifact": ["ai", "artifact"],
  deploy: ["artifact", "pages"],
  "origin-get": ["cloudflare", "pages"],
  "origin-response": ["pages", "cloudflare"],
  "visitor-get": ["visitor", "cloudflare"],
  "visitor-response": ["cloudflare", "visitor"],
};

export const processNodes = [
  ["dev", 130, 55, 330, 60, "dev", "code", "Entwicklung", "Code · manuelle Pflege"],
  ["archive", 130, 165, 330, 60, "archive", "file", "Magazinarchive → Fetch", "manuelle dev:fetch:*-Scripte"],
  ["db", 130, 275, 330, 80, "dev", "db", "Lokale Zuordnungs-DB", "Magazine / Hefte · Spiele / Playlists", "dateibasiert · geprüft"],
  ["push", 130, 405, 330, 60, "dev", "github", "Commit + git push main", "einmaliges Beispiel nach 5 s"],
  ["youtube", 710, 125, 330, 60, "yt", "youtube", "YouTube-Kanal", "öffentliche Videos / Playlists"],
  ["fetch", 710, 235, 330, 100, "yt", "workflow", "GitHub Action · fetch:videos", "Update YouTube caches", "Videos → ggf. Playlists", "täglich automatisch · 20:17"],
  ["cache", 710, 385, 330, 80, "yt", "cache", "YouTube-Cachedateien", "youtube-videos.json", "youtube-playlists.json"],
  ["repo", 405, 515, 330, 60, "build", "github", "Repository · main", "Code + lokale Daten + Caches"],
  ["site", 405, 625, 330, 80, "build", "workflow", "GitHub Action · site:generation", "Deploy to GitHub Pages", "test → Node.js build · generate:site"],
  ["html", 287.5, 755, 165, 60, "build", "file", "site/ · HTML", "Assets · Sitemap"],
  ["app", 487.5, 755, 165, 60, "build", "file", "app/ · Offline", "Daten · SW"],
  ["ai", 687.5, 755, 165, 60, "build", "file", "ai-bot/", "Markdown · API"],
  ["artifact", 405, 865, 330, 60, "build", "cache", "Gemeinsames docs/-Artefakt", "upload → deploy"],
  ["pages", 405, 975, 330, 60, "web", "github", "github.io Pages", "Origin"],
  ["cloudflare", 870, 975, 330, 60, "web", "cloudflare", "Cloudflare · Proxy / CDN", "prettyoldpixel.com"],
  ["visitor", 870, 1085, 330, 60, "web", "visitor", "Besucher", "Browser · HTTPS"],
];

export const processEdges = [
  { id: "archive-db", d: "M325 225V275", color: "archive", label: "Archivdaten", x: 395, y: 255 },
  { id: "dev-push", d: "M130 85H112V435H130", color: "dev", label: "", x: 0, y: 0 },
  { id: "db-push", d: "M325 355V405", color: "dev", label: "geprüfte Daten", x: 400, y: 385 },
  { id: "push-repo", d: "M325 465V490H510V515", color: "dev", label: "git push", x: 390, y: 485, push: 5 },
  { id: "fetch-channel", d: "M945 235V185", color: "yt", label: "Abruf · täglich automatisch", x: 915, y: 215, yt: 21 },
  { id: "fetch-cache", d: "M905 335V385", color: "yt", label: "1 neues Video + 1 neue Playlist in JSON", x: 875, y: 365, yt: 22 },
  { id: "cache-repo", d: "M905 465V490H675V515", color: "yt", label: "git push", x: 800, y: 485, yt: 23 },
  { id: "repo-site", d: "M570 575V625", color: "dev", label: "Checkout · push / manuell / workflow_run", x: 570, y: 605, trigger: true, push: 6, yt: 24 },
  { id: "build-out", d: "M570 705V730", color: "build", label: "", x: 0, y: 0, push: 7, yt: 25 },
  ...[["html", 370, "HTML Generierung starten"], ["app", 570, "App Daten starten"], ["ai", 770, "Markdown Daten starten"]].map(([id, x, label]) => ({
    id: `build-${id}`, d: `M570 730H${x}V755`, color: "build", label, x, y: 745, push: 7.6, yt: 25.6,
  })),
  ...[["html", 370, 455, 680], ["app", 570, 570, 90], ["ai", 770, 685, 620]].map(([id, x, target, count]) => ({
    id: `${id}-artifact`, d: `M${x} 815V840H${target}V865`, color: "build", label: `Dateien speichern · ca. ${count}`, x, y: 835, push: 8.6, yt: 26.6,
  })),
  { id: "deploy", d: "M570 925V975", color: "build", label: "deploy · alle Ausgaben", x: 675, y: 955, push: 10.2, yt: 28.2 },
  { id: "origin-get", d: "M870 1020H735", color: "web", label: "GET bei Bedarf", x: 802, y: 1055, origin: 3.8 },
  { id: "origin-response", d: "M735 990H870", color: "web", label: "", x: 802, y: 965, origin: 4.8 },
  { id: "visitor-get", d: "M950 1085V1035", color: "web", label: "GET", x: 920, y: 1065, visitor: 0 },
  { id: "visitor-response", d: "M1100 1035V1085", color: "web", label: "", x: 1140, y: 1065, cacheResponse: 1, origin: 5.8 },
];
