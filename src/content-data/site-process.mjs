export const siteProcess = {
  route: "so-entsteht-die-seite/",
  title: "So entsteht diese Website",
  description: "Von lokalen Zuordnungen und YouTube-Cachedateien über GitHub Actions zu Website, Offline-App und Agentendaten auf GitHub Pages hinter Cloudflare.",
  date: "30.10.2026",
  introduction: "Diese Website besteht aus statischen Seiten, die bei Änderungen automatisch neu generiert werden. Aus Quellcode, lokalen Zuordnungen und YouTube-Daten entstehen HTML-Seiten, eine Offline-App und maschinenlesbare Inhalte. GitHub Actions übernehmen die Generierung und Veröffentlichung, aber Besucher erhalten die fertigen Dateien über Cloudflare und GitHub Pages.",
  legend: [
    "Besucher: Alle 3 Sekunden wird ein Seitenaufruf simuliert. Jeder zweite führt zum Ursprungsserver (Origin) bei GitHub Pages.",
    "Entwicklung: Nach 5 Sekunden wird einmalig ein git push simuliert.",
    "YouTube: Alle 20 Sekunden zeigt ein Beispiel die Aktualisierung – Fetch-Action aktivieren → YouTube abrufen → Cachedateien schreiben.",
    "Darstellung: Boxen werden kurz hervorgehoben, neue Daten erscheinen vorübergehend grün.",
    "Dabei werden keine echten Anfragen gesendet oder Deployments gestartet. Der tatsächliche automatische YouTube-Abruf erfolgt täglich.",
  ],
  flows: [
    { title: "F1 · Entwicklung und lokale Daten", items: [
      "Manuelle Magazin-Fetches zur Referenzierung von Blätterabend-Videos laufen über dev:fetch:archives, bei Bedarf auch über dev:fetch:gamestar und dev:fetch:amiga-action. Danach werden die Zuordnungen geprüft.",
      "Die lokale Zuordnungsdatenbank besteht aus Dateien. Sie verknüpfen Magazine mit Heften und Spiele mit Playlists. Dafür läuft kein Datenbankserver. Spielezuordnungen werden manuell bestätigt; vorbereitete Spielemetadaten ergänzen den Bestand.",
      "Quellcode und geprüfte Daten gelangen per Commit und git push in den Branch main des Repositorys. Dieser git push startet die Site-Action.",
    ] },
    { title: "F2 · YouTube und Cache-Aktualisierung", items: [
      "Die im Diagramm als fetch:videos bezeichnete GitHub Action gehört zum Workflow „Update YouTube caches“. Er läuft täglich, nicht über einen YouTube-Webhook. Aktualisierungen in Echtzeit sind nicht garantiert.",
      "fetch:videos erkennt neue öffentliche Video-IDs. fetch:playlists läuft bei neuen Videos, fehlenden Ausgabedateien oder aktivierter Option force_playlists. Der Abruf erfolgt wahlweise über die offizielle API oder anonym ohne API-Schlüssel.",
      "Die Daten werden in cache/youtube-videos.json und cache/youtube-playlists.json gespeichert. Der Bot erstellt nur für geänderte Dateien einen Commit und überträgt ihn per git push. Neue Spiele werden dabei nicht automatisch redaktionell zugeordnet.",
      "Nach erfolgreichem Abschluss startet site:generation über workflow_run, auch wenn sich keine Daten geändert haben.",
    ] },
    { title: "F3 · Generierung und Veröffentlichung", items: [
      "Die im Diagramm als site:generation bezeichnete GitHub Action gehört zum Workflow „Deploy to GitHub Pages“. Die Generierung läuft mit npm run generate:site. Weitere Auslöser sind ein git push auf main oder ein manueller Workflow-Start.",
      "Der Ablauf ist test → build → deploy. Der Build verwendet denselben Commit, der zuvor getestet wurde. Nach einem Fetch-Lauf wird der aktuelle main-Stand getestet. Fehler verhindern eine neue Veröffentlichung.",
      "Node.js erzeugt drei gleichrangige Ausgaben: site/ (HTML und Assets), app/ (Offline-App) und ai-bot/ (Markdown, llms.txt, API und Katalog). Das Diagramm zeigt logische Zweige, keine drei parallel gestarteten Workflows.",
      "Alle Ausgaben werden in einem docs/-Artefakt gebündelt und auf GitHub Pages veröffentlicht. Sie werden nicht als generierter Git-Commit gespeichert. Die öffentliche Domain ist prettyoldpixel.com.",
      "Der Build liest vorbereitete lokale Daten, ohne YouTube oder Magazinarchive abzurufen. site/ und ai-bot/ sind Diagrammbezeichnungen, keine zusätzlichen öffentlichen Verzeichnisse.",
      "Gerundete Größenordnung des aktuellen Builds: rund 610 HTML-Seiten beziehungsweise 680 Website-Dateien mit Assets, 90 App-Dateien und 620 Agentendateien. Die Mengen ändern sich mit dem Katalog.",
    ] },
    { title: "F4 · Besucher und Auslieferung", items: [
      "Seitenaufrufe laufen über HTTPS an prettyoldpixel.com, dann über Cloudflare und bei Bedarf weiter zu GitHub Pages. Antworten nehmen den umgekehrten Weg. Cloudflare dient als vorgeschalteter Proxy und als Content Delivery Network (CDN).",
      "Die Animation zeigt abwechselnd eine Antwort aus dem Cloudflare-Cache und einen Abruf beim Ursprungsserver (Origin) von GitHub Pages. Jeder zweite simulierte Aufruf erreicht den Origin. Dieses Verhältnis ist ein Beispiel und keine gemessene Cache-Trefferquote.",
      "Videos bleiben auf YouTube. Erst nach Player-Aktivierung verbindet sich der Browser direkt mit YouTube, nicht über einen Video-Proxy bei GitHub Pages.",
      "Die animierten Pfeile und die grüne „neu“-Markierung veranschaulichen den Ablauf. Sie zeigen keinen Live-Status. Du kannst die Animation pausieren oder reduzierte Bewegung im Betriebssystem aktivieren.",
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
  ["archive", 130, 165, 330, 60, "archive", "file", "Magazinarchive → Fetch", "manuelle dev:fetch:*-Skripte"],
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
