# ADR 0013: Statische Prozessseite zur Entstehung der Website

- Status: angenommen; Prozessseite, SVG und Animationen lokal implementiert
  und geprüft; Veröffentlichung ausstehend.
- Datum: 2026-10-30.
- Ergänzt [ADR 0002](0002-statische-seiten-seo-und-performance.md),
  [ADR 0010](0010-gezielter-playlist-abruf-nach-neuen-videos.md),
  [ADR 0011](0011-agentenlesbare-inhalte-und-maschinenlesbare-zugaenge.md)
  und [ADR 0012](0012-eigene-domain-mit-cloudflare-und-github-pages.md).
- Ziel: eine öffentliche, statische Erklärseite mit SVG-Prozessdiagramm,
  nicht die Einführung neuer Abrufe oder Workflows.

## Kontext

Die Website entsteht aus gepflegtem Quellcode, manuellen Zuordnungen,
lokal vorbereiteten Archiv-/Spielemetadaten und automatisch aktualisierten
YouTube-Caches. GitHub Actions prüft und baut daraus die statische Ausgabe.
GitHub Pages hostet diese; Besucher greifen über Cloudflare darauf zu.

Diese Zusammenhänge sollen auf einer eigenen Seite nachvollziehbar sein:
Welche Ereignisse starten einen Prozess, welche Daten werden übernommen,
was läuft nur manuell und warum erscheint ein neues Video nicht in Echtzeit?
Das Diagramm muss den tatsächlichen Betrieb erklären, nicht eine technisch
attraktive, aber nicht vorhandene Webhook- oder Live-API-Architektur.

## Entscheidung

### 1. Statische Seite und Zuständigkeit

Implementiert ist die Route `so-entsteht-die-seite/` mit dem Titel
„So entsteht diese Website“. Die Projektseite `ueber/` verlinkt sie;
ein zusätzlicher Eintrag in der Hauptnavigation ist nicht erforderlich.
Auf „Über das Projekt“ erhält sie einen gut sichtbaren Textlink
„So entsteht diese Website“. Zusätzlich verweisen die erläuternden
Dienste-Erwähnungen zu GitHub Pages/GitHub Actions, Cloudflare und YouTube
in den Projekt- und Datenschutzhinweisen auf die Prozessseite,
mit dem Linktext „Zusammenspiel der Dienste“.
Bestehende externe Anbieter-, Quellen- und Datenschutzlinks bleiben
unverändert erhalten; der interne Erklärlink ergänzt sie und ersetzt sie
nicht. Keine zusätzlichen Links an jedem Videotitel oder in jeder
Videobeschreibung. Website und Offline-App verwenden ihre jeweiligen
internen Routen; die Markdown-Ausgabe übernimmt die entsprechenden Links.
Die Seite erhält Canonical, Breadcrumbs, Beschreibung und Sitemap-Eintrag
wie die anderen öffentlichen Inhaltsseiten.

Oberhalb des SVG erklärt eine kurze Einleitung die automatisch erzeugte,
statisch ausgelieferte Website. Unter dem SVG stehen eine gegliederte
Simulationslegende und kurze Stichpunkte zu F1 bis F4: Quellenpflege,
Aktualisierung, Prüfung/Generierung und Auslieferung.
Das SVG ist die visuelle Übersicht; die Stichpunkte sind die vollständige
textuelle Alternative, keine zusätzlichen Fließtextabschnitte.
Keine Live-Statusanzeige, Laufzeitabfrage, Drittanbieter-Einbettung,
Diagrammbibliothek oder zusätzliche Paketabhängigkeit. Ein kleines lokales
Browser-Skript steuert ausschließlich die manuellen Play-Buttons.
Der dargestellte Architekturstand wird als Datum angegeben und nicht
als Zeitpunkt des letzten erfolgreichen Deployments ausgegeben.
Die ergänzend gewünschten Animationen simulieren Verkehr rein visuell;
sie ändern weder den statischen Charakter noch die tatsächlichen Zeitpläne.

### 2. Anordnung im SVG

Die gewünschte räumliche Ordnung ist verbindlich:

| Bereich | Knoten und Aufgabe |
|---|---|
| Links oben: Entwicklung und manuelle Quellenpflege | Entwickler, manuelle Magazin-Fetch-Scripte, lokale DB für Magazin-/Spielezuordnungen, lokale Aufbereitung/Prüfung, Git-Commit und Push auf `main` |
| Rechts oben: YouTube-Kanal | Neue öffentliche Videos und Änderungen an Playlists als externe Quellenereignisse |
| Rechts unter dem Kanal: automatische Aktualisierung | GitHub-Actions-Block `fetch:videos`: Zeitplan oder manueller Start, Videoabruf, bedingter Playlist-Abruf, explizite Cachedateien und Cache-Commit |
| Mitte: Zusammenführung | Repository `main` mit Quellcode, Zuordnungen und vorbereiteten Caches; mehrere Trigger führen in denselben Pages-Workflow |
| Mitte unten: Veröffentlichung | GitHub-Actions-Block `site:generation`: `test` → `build` → `deploy`, mit drei gleichrangigen Datenzweigen `site/`, `app/`, `ai-bot/`, die vor dem gemeinsamen Pages-Deployment zusammenlaufen |
| Unten rechts: Zugriff | GitHub Pages als Origin, davor Cloudflare und ganz unten rechts der Besucher |

Der Entwicklungs-Push steht im oberen linken Bereich. Die dynamischen,
YouTube-bezogenen Actions-Ereignisse stehen im unteren Teil des rechten
Quellenbereichs, oberhalb der Auslieferung. So bleibt der Besucher der
rechte unterste Knoten. Die räumliche Anordnung ist keine globale Zeitachse;
Pfeilrichtung und nummerierte Flows definieren die Reihenfolge.

Vereinfachte Skizze der implementierten Anordnung, kein Ersatz für das SVG:

```text
LINKS: ENTWICKLUNG / MANUELL                    RECHTS: YOUTUBE
Entwickler + Magazinarchive                    YouTube: Video / Playlist
        |                                              ^
manuelle Fetch-Scripte                     [GitHub Action: fetch:videos]
        |                                              |
lokale DB: Magazin-/Spielezuordnung             Videos -> ggf. Playlists
        |                                              |
Aufbereitung -> Commit + git push main         Cachedateien -> git push
        |                                              |
        +----------> Repository main <-----------------+
                           | Checkout / Trigger
               [GitHub Action: site:generation]
                       test -> build (Node.js)
                              |
                 site/ | app/ | ai-bot/
                              |
                  gemeinsames Artefakt -> deploy
                              |
                 GitHub Pages (github.io) <---- Cloudflare
                                               ^  |
                                               |  v
                                              Besucher
```

In der endgültigen Zeichnung zeigt `deploy` ausdrücklich auf GitHub Pages.
Der Build-Ausgang „Dateien“ wird vor `deploy` eingeordnet; er wird nicht
als separater Hosting-Dienst dargestellt.

Die drei Zweige sind logisch parallele Ausgaben desselben Builds,
keine drei getrennten Workflows oder zugesicherte gleichzeitige Ausführung.
`site/`, `app/` und `ai-bot/` sind Diagrammbezeichnungen, keine neuen
öffentlichen Verzeichnisse: Website-Dateien liegen an der Ausgabewurzel,
die App unter `app/`, Agenten-/API-Dateien unter anderem als `index.md`,
`llms.txt`, `.well-known/api-catalog` und `api/v1/`.
Alle werden gemeinsam im Artefakt `docs/` an GitHub Pages veröffentlicht,
nicht per Git-Push generierter Dateien. Der Origin-Knoten trägt
„github.io Pages“ mit Untertitel „Origin“; der öffentliche Zugriff
bleibt `https://prettyoldpixel.com/` über Cloudflare.

#### Icons und erkennbare Datenspeicher

- GitHub-Icon für Repository, Commit/Push und GitHub Pages.
- Ablaufdiagramm-Icon mit kleinem GitHub-Logo für beide Actions-Blöcke.
- Cloudflare-Icon am vorgeschalteten Proxy/CDN.
- YouTube-Icon am Kanal; direkter Player-Zugriff wird nur textuell erklärt.
- Node.js-Icon an Entwicklung, Magazin-Fetch und Generator; links in den
  beiden manuellen Boxen zusätzlich rahmenlose Play-Dreiecke.
  Next.js wird nicht verwendet; auf Rückfrage
  wurde ausdrücklich Node.js statt eines irreführenden Next.js-Icons gewählt.
- Datenbank-Zylinder für „Lokale DB: Magazin- und Spielezuordnungen“.
  Gemeint ist ein dateibasierter, gepflegter Datenbestand, kein SQLite-,
  SQL- oder laufender Datenbankdienst. Magazin-/Ausgabenzuordnung und
  bestätigte Spiel-/Playlistzuordnung werden in derselben Box benannt.
- Dateistapel-/Cache-Icon für die beiden YouTube-JSON-Caches; diese sind
  ausdrücklich keine manuelle Zuordnungsdatenbank und kein CDN-Cache.
- Dokument-/Paket-Icons für die drei generierten Datenzweige und das
  gemeinsame Deployment-Artefakt; Besucher als Personen-/Browser-Symbol.

Icons werden lokal als SVG eingebunden, nicht von einem externen Icon-CDN
geladen. Bei Umsetzung nur nutzbare, lizenzgeprüfte Markenassets verwenden
und notwendige Quellen-/Lizenzhinweise erhalten. Markensymbole ersetzen keine
Textbeschriftung und suggerieren keine Partnerschaft. Die Quellenfarben
gelten für Knotenrahmen und Pfeile; erforderliche Markenfarben der Icons
ändern nicht die Farblegende.

### 3. Quellenfarben und Pfeilsemantik

Jede Quellengruppe erhält eine feste Farbe für Rahmen, Kennzeichnung und
die zugehörigen Pfeile. Helle Knotenflächen erhalten dunkle Beschriftungen;
die Farbwahl allein darf keine Bedeutung tragen.

| Herkunft / Gruppe | Farbe | Kennzeichnung |
|---|---|---|
| Entwicklung, Code und manuelle Zuordnungen | Blau `#1D4ED8` | `DEV` |
| Manuelle Magazin-/Archivquellen | Violett `#7E22CE` | `ARCHIV` |
| YouTube-Videos und Playlists | Dunkelgelb `#A16207` | `YT` |
| Gemeinsame GitHub-Actions-Verarbeitung und Build-Artefakte | Dunkelgrau `#475569` | `BUILD` |
| Besucheranfragen und Antworten über Cloudflare | Dunkelgrün `#047857` | `WEB` |

Farben markieren logische Quellengruppen, nicht Anbieterlogos. Einzelne
Archivdienste werden im ARCHIV-Knoten als manuelle Fetch-Scripte zusammengefasst,
nicht mit jeweils neuen Farben versehen.

Bis zur Zusammenführung bleibt ein Pfeil in der Farbe seiner Quelle:
Archivdaten violett, Quellcode/Entwicklungs-Push blau, YouTube-Cache dunkelgelb.
Nach dem gemeinsamen Build sind die Artefakte nicht mehr einer einzigen
Quelle zuzuordnen; deshalb sind diese Kanten dunkelgrau.
Besucherpfade bleiben grün, auch beim Origin-Abruf durch Cloudflare.

- Durchgezogene Pfeile: Daten-/Artefaktübertragung oder HTTP-Anfrage/Antwort.
- Auch Steuerereignisse, Zeitplan, Bedingungen und Workflow-Starts verwenden
  durchgezogene Pfeile; die Beschriftungen unterscheiden ihre Bedeutung.
- Relevante Übergänge tragen kurze Beschriftungen; beide Eingänge zum
  Repository heißen „git push“. Antwortpfeile bleiben unbeschriftet.
  Nach `site:generation`: „HTML Generierung starten“, „App Daten starten“,
  „Markdown Daten starten“. Vor dem Artefakt jeweils
  „Dateien speichern · ca. …“ mit gerundeter Menge.
  Gemeinsame Verzweigungsabschnitte benötigen keine eigene Beschriftung.
- Eigene Pfeilspitzen pro Farbe; keine Pfeile ohne erkennbare Richtung.
- Unterschiedliche Kanten für Trigger und Datenfluss vermeiden die
  falsche Aussage, dass ein Ereignis selbst die Quelldaten transportiert.

#### Animierte Pfeile

- Manueller Entwicklungs-Push: einmalig **5 Sekunden nach Start der
  Diagrammanimation** ein blauer Impuls von `Commit + git push main`
  zum Repository und anschließend über die Push-Triggerkante zu
  `site:generation`. Keine automatische Wiederholung dieses Pushs.
- Nach diesem Push läuft eine zusammenhängende illustrative Sequenz:
  `site:generation: test → build` → die drei Datenzweige
  `site/`, `app/`, `ai-bot/` → gemeinsames Artefakt → `deploy` →
  GitHub Pages. Kurze, aufeinander abgestimmte Impulse verdeutlichen
  Verarbeitung und Veröffentlichung; keine echten Build-Laufzeiten suggerieren.
- Besucher: alle **3 Sekunden** ein grüner Impuls entlang
  `Besucher → Cloudflare`, anschließend Antwortimpuls zurück.
  Jeder zweite simulierte Aufruf läuft weiter zu GitHub Pages:
  Besucher ab 3 s, Origin-Anfrage ab 3,8 s, Origin-Antwort ab 4,8 s,
  Besucherantwort ab 5,8 s; dieser Ablauf wiederholt sich alle 6 s.
  Dazwischen antwortet Cloudflare direkt (ab 1 s, ebenfalls alle 6 s).
  Die animierte Verteilung ist ein Beispiel, keine gemessene Cache-Hit-Rate.
- YouTube: alle **20 Sekunden** zuerst die Fetch-Action dunkelgelb aktivieren
  (ab 20 s), dann den Abrufpfeil `fetch:videos → YouTube-Kanal`
  animieren (ab 21 s), anschließend `fetch:videos → YouTube-Cachedateien`
  (ab 22 s). Kein direkter Kanal-zu-Cache-Pfeil und keine
  Kanal-Push-Benachrichtigung. Der echte Abruf läuft täglich automatisch.
- Im YouTube-Zyklus werden beispielhaft ein neues öffentliches Video und
  eine neue Playlist („1 neues Video + 1 neue Playlist in JSON“)
  dargestellt: Abruf → Cachedateien → Cache-Commit ins Repository →
  erfolgreicher Fetch-Workflow → `workflow_run` → dieselbe
  `site:generation`-Sequenz bis zum Pages-Deployment. Die Triggeranimation
  folgt der gemeinsamen Repository-/Checkout-Kante mit `workflow_run`-Beschriftung, nicht einer erfundenen Bot-Push-Verkettung
  oder direkten Kanal-zu-Build-Verbindung. Nicht jeder reale Abruf findet
  neue Daten; die Legende nennt dies ausdrücklich ein Änderungsbeispiel.
- Neu geschriebene Daten werden beim Eintreffen kurz **grün `#047857`**
  hervorgehoben: zunächst betroffene YouTube-Cachedateien, dann bei
  Generierung die drei Ausgabezweige und schließlich der neue Pages-Stand.
  Nach jeweils **2 Sekunden** verblasst die Hervorhebung weich zur
  normalen Quellen-/Buildfarbe. Dauerhafte Quellfarben und Pfeilfarben
  bleiben erhalten; ein grüner Datenakzent mit „neu“ unterscheidet den
  temporären Zustand von der ebenfalls grünen Besucherstrecke.
- Beide Auslöser benutzen dieselbe visuelle Build-Sequenz. Alle Phasen
  werden auf einer gemeinsamen deklarativen Zeitleiste abgestimmt:
  einmaliger Push ab Sekunde 5, YouTube-Beispiele im 20-Sekunden-Zyklus.
  Die erste Push-Sequenz endet vor dem ersten YouTube-Beispiel;
  dessen Sequenz endet vor dem nächsten Zyklus. Besucherimpulse laufen
  unabhängig weiter, ohne Build- oder Datenzustände neu zu starten.
- Sichtbare Legende unter „Simulation im Diagramm“ als getrennte
  Stichpunkte für Besucher, Entwicklung, YouTube, Hervorhebungen und die
  Abgrenzung zum echten Betrieb. Sie nennt den tatsächlichen Abruf nur
  als „täglich“, ohne Uhrzeit, Zeitzone oder manuellen Workflow-Start.
- Kleine bewegte Punkte auf unverändert sichtbaren Pfeilen und ein kurz
  dunkelgelb hervorgehobener Fetch-Knoten; nur Illustration, keine Live-Zustandsanzeige.
- Jede animierte Verbindung hebt ihre Startbox beim Loslaufen und die
  Zielbox beim Eintreffen kurz in deren Quellfarbe hervor. Dies gilt für
  automatische und manuelle Abläufe, Besucher und Origin-Antworten.
  Gemeinsame Start-/Zielzuordnungen halten beide Darstellungen konsistent;
  Pause und reduzierte Bewegung schließen alle Box-Highlights ein.
- Pfeilbewegungen dauern 0,6 s; vor der Weitergabe aus einer erreichten
  Box folgt eine kurze Verarbeitungspause von mindestens 0,4 s.
  Die drei Ausgabezweige teilen sich einen einzigen animierten Ausgang
  aus `site:generation`. Die drei Pfeile aus den Ausgabezweigen münden
  direkt von oben an drei getrennten Stellen ins gemeinsame docs/-Artefakt.
  Nach dem Zusammenführen startet nur ein Deployment-Impuls, nicht einer
  pro Eingangsereignis. Verzweigungspunkte sind keine zusätzlichen Boxen.
  Während einer manuellen Sequenz sind die einmaligen automatischen
  Pushimpulse ausgeblendet. Der gesamte YouTube-Zyklus inklusive
  Aktivierung, Box-Highlights und Datenakzenten pausiert synchron und
  setzt danach an derselben Stelle fort, statt unsichtbar weiterzulaufen
  und Zwischenschritte zu verlieren. Besucherzugriffe laufen unabhängig weiter.
- Automatische Abläufe deklarativ mit CSS-Bewegung auf SVG-Pfeilpfaden.
  Kleine native Play-Buttons links in Entwicklung und Magazin-Fetch
  starten per lokalem Interaktionsskript die jeweilige manuelle Sequenz
  bis zum Deployment. Wiederholtes Starten ersetzt nur diese Sequenz;
  Pause und reduzierte Bewegung gelten auch dafür. Keine Timer,
  Fetch-Aufrufe, Live-Metriken oder zusätzliche Paketabhängigkeit.
- Bei `prefers-reduced-motion: reduce` bleiben alle Impulse abgeschaltet;
  Pfeile, Beschriftungen und Informationen bleiben vollständig sichtbar.
  Ein Wechsel während einer manuellen Sequenz verwirft deren temporäre
  Elemente und löst die YouTube-Sperre. Wird Bewegung später wieder
  erlaubt, bleibt der automatische Zyklus nicht durch einen ausgefallenen
  `animationend`-Callback blockiert.
- Da die Animation dauerhaft wiederholt wird, gibt es zusätzlich einen
  tastaturbedienbaren Schalter „Animation pausieren“
  (natives Checkbox-Control mit CSS). Pause stoppt sämtliche Impulse,
  Verzögerungen, Build-Phasen und Farbübergänge auf derselben Zeitleiste;
  Wiederaufnahme setzt sie fort, ohne den einmaligen Push neu zu starten.
  Keine Netzwerkanfrage und keine Speicherung nötig.

### 4. Tatsächliche Prozesse und Flows

#### F1: Manuelle Magazinpflege und Entwicklung

1. Entwickler ändern Code, gepflegte Zuordnungen oder Inhaltsdaten.
2. Magazin-Fetch läuft bewusst lokal: `dev:fetch:archives`, bei Bedarf
   `dev:fetch:gamestar` oder `dev:fetch:amiga-action`.
   Externe Archivquellen liefern Metadaten, keine Live-Seiten beim Build.
3. Benötigte Blätterabend-Zuordnungen werden mit
   `dev:generate:blaetterabend` beziehungsweise der im Archiv-Abruf
   integrierten Aufbereitung aktualisiert und geprüft.
4. Nur die geprüften Quellen-/Cacheänderungen werden committed und nach
   `main` gepusht. Dieser Push startet den Pages-Workflow.

Der lokale DB-Knoten wird vor Commit/Push verortet und anschließend
als versionierter Repository-Datenbestand weitergereicht:
Magazin-/Heftzuordnungen fließen unter anderem in
`cache/blaetterabend-videos.json`, bestätigte Spiele-/Playlistzuordnungen
stehen in `src/data/data-games.mjs`. Fertige Spielemetadaten sind ein
weiterer lokaler Datenbestand. Die Darstellung trennt redaktionelle
Zuordnung von automatisch abgerufenen Rohmetadaten.

Spielemetadaten aus dem lokalen Dump und manuelle Spielbestätigungen
werden als zusätzlicher lokaler Eingang desselben Entwicklungszweigs
genannt. Sie sind kein automatischer Magazin- oder YouTube-Netzabruf.
Transkriptabrufe sind optionale manuelle Zusatzaufgaben, kein Pflichtpfad.
Keine Secrets, lokale Zugangsdaten oder privaten Entwicklungspfade zeigen.

#### F2: YouTube-Kanal und automatische GitHub Actions

Der Diagrammblock heißt **GitHub Action · `fetch:videos`**,
mit Untertitel **Workflow: `Update YouTube caches`**.
`fetch:videos` ist der npm-Schritt im bestehenden Fetch-Job, nicht der
tatsächliche Workflowname. Playlist-Abruf und Cache-Push liegen innerhalb
desselben Workflow-Rahmens.

1. Ein neues öffentliches Video oder eine Playlist-Änderung entsteht
   rechts im YouTube-Kanal.
2. Es gibt keinen direkten YouTube-Webhook ins Repository. Der Workflow
   `Update YouTube caches` startet zeitgesteuert täglich um 20:17 Uhr
   in `Europe/Berlin` oder manuell über `workflow_dispatch`.
   GitHub kann geplante Läufe verzögern; keine Echtzeitgarantie.
3. `fetch:videos` lädt öffentliche Metadaten und meldet neue Video-IDs.
   Der Zugriff erfolgt mit optionalem API-Key über die offizielle API,
   sonst über die vorhandenen anonymen Abrufpfade.
4. `fetch:playlists` läuft bei neuen Videos, fehlendem Output oder
   `force_playlists`. Neue IDs ermöglichen die gezielte Suche gemäß
   ADR 0010; erzwungene Läufe prüfen vollständig.
   Änderungen ohne neues Video werden nicht sofort automatisch erkannt.
5. Geänderte Video-/Playlist-Caches werden vom Actions-Bot committed
   und gepusht. Ohne Änderungen entsteht kein Cache-Commit.
   Die Dateiknoten heißen ausdrücklich `cache/youtube-videos.json`
   und `cache/youtube-playlists.json` und tragen das Cache-Icon.
6. Der erfolgreiche Workflow-Abschluss startet über `workflow_run`
   den Pages-Workflow, auch ohne Cacheänderung. Bei Fehler oder Abbruch
   wird der nachfolgende Pages-Testjob übersprungen.

Wichtig im Diagramm: Der Bot-Push mit `GITHUB_TOKEN` ist **nicht** der
Auslöser einer weiteren Push-Workflow-Kette. Auf Wunsch entfällt die direkte
Kante zwischen den Actions; die Stichpunkte erklären `workflow_run`.
Die gemeinsame Repository-/Checkout-Kante trägt die Triggerbeschriftung
und den anschließenden YouTube-Buildimpuls. Der nachgelagerte Workflow liest den aktuellen
Stand von `main` und fixiert den getesteten Commit für den Build.

#### F3: Gemeinsamer Build und Veröffentlichung

Der zweite Rahmen heißt **GitHub Action · `site:generation`**,
mit Untertitel **Workflow: `Deploy to GitHub Pages`**.
`site:generation` ist nur die gewünschte Diagrammkennzeichnung;
der tatsächliche npm-Aufruf bleibt `npm run generate:site`.
Weder Workflows noch npm-Scripte werden für die Zeichnung umbenannt.

Der sichtbare Datenweg lautet Fetch-Action → Cachedateien → Repository →
Checkout der Site-Action. Die tatsächliche Steuerung durch
`workflow_run: completed + success` steht in den Stichpunkten, ohne direkte
Verbindung der beiden Action-Knoten. Entwicklung führt direkt zu
Commit/Push, nicht zur lokalen Zuordnungs-DB. Deren eigener geprüfter
Datenpfad führt ebenfalls zu Commit/Push.

1. Trigger: Entwicklungs-Push auf `main`, manueller Pages-Start oder
   erfolgreicher Fetch-Workflow. Diese sind alternative Einstiege,
   keine drei nacheinander erforderlichen Schritte.
2. `test`: Abhängigkeiten installieren, `npm test`, getesteten Commit merken.
3. `build`: denselben Commit auschecken, Abhängigkeiten installieren,
   Änderungsverlauf und versionierte Assets wiederherstellen.
4. `npm run generate:site` lädt die vorbereiteten Inhalte lokal und erzeugt:
   - öffentliche HTML-Seiten, Assets, Sitemap und Robots-Datei;
   - Offline-App mit Daten und Service Worker;
   - über `ai-bot-generation` Markdown, `llms.txt`, Inhalts-API,
     OpenAPI und API-Katalog gemäß dem lokalen ADR-0011-Stand.
5. Validierte Ausgabe wird als Pages-Artefakt hochgeladen;
   `deploy` veröffentlicht sie auf GitHub Pages.
   Die Pfeile aller drei Datenzweige münden in dasselbe Artefakt und
   denselben GitHub-Pages-Origin (`github.io`), niemals nur in Cloudflare.

Kein YouTube-/Archiv-Fetch während der Seitengenerierung. Generierte
Dateien unter `docs/` werden nicht als neue Quellcode-Commits eingezeichnet.
Fehlgeschlagene Tests oder Builds veröffentlichen keinen neuen Stand;
der bisherige veröffentlichte Stand bleibt erreichbar.
Noch nicht live aktivierte Edge-Discovery-Regeln aus ADR 0011 als
„vorbereitet, manuell zu aktivieren“ kennzeichnen, nicht als laufenden
Standardpfad darstellen.

#### F4: Besucher und Cloudflare

Der Besucher ganz unten rechts sendet einen HTTPS-GET an
`prettyoldpixel.com`. Der Pfeil führt zuerst zu Cloudflare, nicht direkt
zu einem Actions-Job. Cloudflare liefert einen passenden Cacheeintrag
oder fragt GitHub Pages als Origin an; die Antwort läuft zurück.
Cloudflare ist kein zusätzlicher Build- oder Deployment-Host.

Nicht behaupten, dass alle HTML-Seiten im Edge-Cache liegen:
Beim letzten dokumentierten Test war HTML `DYNAMIC`, während statische
Assets Cache-Hits hatten. Detail-TTLs bleiben in ADR 0012 dokumentiert.
YouTube-Player werden erst nach Aktivierung direkt vom Browser geladen;
dies bleibt ausschließlich eine textuelle Erklärung. Der Besucher-zu-
YouTube-Pfeil entfällt zur Vereinfachung des Diagramms.

### 5. SVG, Barrierefreiheit und maschinenlesbarer Text

- Statisches Inline-SVG mit `viewBox`, `role="group"`, eindeutigem `<title>`
  und `<desc>`. Die Gruppenrolle erhält die Bedienbarkeit der nativen
  HTML-Buttons in `foreignObject`; keine Scripts innerhalb des SVG,
  externen Fonts oder Netzabrufe.
- Nummerierte Gruppen F1 bis F4, sichtbare Legende, lesbare Schrift und
  ausreichende Kontraste auch bei Hell-/Dunkeldarstellung.
- Auf kleinen Displays keine verkleinerte unlesbare Gesamtgrafik:
  Diagramm in einem beschrifteten, bei Bedarf horizontal scrollbar und
  per Tastatur erreichbaren Bereich; sonstiger Seiteninhalt bricht normal um.
- Direkt unter dem SVG stehen ausschließlich Stichpunktlisten zu F1 bis F4.
  Sie sind die vollständige zugängliche Alternative und erklären dieselben
  Beziehungen, Bedingungen, Cachedateien und Speicher. Keine ausführlichen
  Fließtextabsätze unter dem Diagramm; Detailkommandos bleiben verlinkbar.
- Die Stichpunkte nennen zusätzlich die simulierten Intervalle und den
  tatsächlichen täglichen Abruf sowie die Bedeutung beider Action-Labels.
- Die Markdown-Fassung übernimmt diese Texte, nicht SVG-Pfaddaten.
  Der Markdown-Exporter entfernt SVG, Styles und Pausen-Control explizit;
  Regressionstests prüfen die erhaltenen Texte und Links.
- Die Offline-App erhält dieselbe Erklärung ohne Online-Statusabfragen.
  Ihr Renderer muss die neue öffentliche Route unterstützen.

### 6. Umgesetzte Integration

1. Prozessdaten und Erklärungstexte liegen gemeinsam unter `src/content-data/`,
   statt HTML und App separat redaktionell zu pflegen.
2. Das SVG-Widget unter `src/site-generation/widget/` enthält lokale Icons,
   Pfeilanimationen, Pausensteuerung und Reduced-Motion-Unterstützung.
   [`process-diagram.js`](../../src/site-generation/process-diagram.js)
   steuert manuelle Sequenzen und die Freigabe des YouTube-Zyklus.
3. Website-Route, Projektseitenlink, Dienste-Querverweise, Sitemap und
   App-Ansicht sind unter Beibehaltung der Seitenkonventionen verdrahtet.
4. Der Agentenexport erhält Einleitung, Stichpunkte und Links;
   SVG und Bedienelemente werden entfernt.
5. Tests und lokale Browserprüfung sichern Verhalten und Darstellung ab;
   die öffentliche Abnahme bleibt bis zum Deployment offen.

Die Umsetzung ändert keine Fetch-Zeitpläne, Workflow-Trigger, Cache-Regeln,
DNS-Einstellungen oder öffentlichen Datenverträge.

### 7. Lokaler Umsetzungsstand am 30.10.2026

- Gemeinsame Prozessdaten und Stichpunkte in
  [`site-process.mjs`](../../src/content-data/site-process.mjs);
  Diagramm und lokale Icon-Pfade in
  [`process-diagram.mjs`](../../src/site-generation/widget/process-diagram.mjs).
- Route `so-entsteht-die-seite/` in Website und Offline-App integriert,
  inklusive Links auf Projekt-/Kontakt- und Datenschutzseiten.
  Sitemap und generierte Markdown-Fassung enthalten die Prozessseite.
- Pausierbare CSS-Pfeilanimation: Besucher alle 3 s, einmaliger Push ab
  5 s, YouTube-Beispiel ab 20 s und dann alle 20 s; beide führen
  über die passenden Trigger bis zum Deployment.
  Neue Daten blenden über 2 s von Grün zur normalen Darstellung zurück.
  Reduced Motion schaltet Impulse und Farbakzente vollständig ab.
- Diagrammstyles werden ausschließlich zusammen mit dem Widget als
  Inline-Styles ausgegeben. Dies ist eine bewusste Abweichung vom globalen
  Website-Stylesheet, damit andere Seiten keine Diagrammstyles übertragen
  und das bestehende globale CSS-Budget unverändert bleibt.
  Nur die Prozessseite lädt das kleine manuelle Interaktionsskript;
  die Offline-App importiert dasselbe Skript. Widget und Erklärungstexte
  bleiben gemeinsam.
- Kompakte Boxen mit 60–100 SVG-Einheiten Höhe, engeren Zeilenabständen
  und 330 SVG-Einheiten Breite; die drei Datenboxen sind mit 165 Einheiten
  halb so breit und symmetrisch um die gemeinsame Mittelachse gruppiert.
  Ihre Kurzbeschriftungen werden in den Stichpunkten vollständig erklärt.
  Die Play-Buttons zeigen ein explizites SVG-Dreieck ohne Rahmen oder Kreis
  statt eines Schriftzeichens. Das Diagramm ist 1190 Einheiten hoch.
  Die Origin-Box zeigt
  nur „github.io Pages“ und „Origin“, nicht den vollständigen Hostnamen.
  YouTube-Boxen sind dunkelgelb hinterlegt; Pfeile und Aktivierung verwenden
  dieselbe Quellfarbe, im Dunkelmodus kontrastreich aufgehellt.
- Beide Eingabestränge stehen näher nebeneinander; das Repository liegt
  unterhalb von Commit/Push und YouTube-Cachedateien. Beide Datenpfeile
  münden von oben in das gemeinsame Repository.
  Vertikal aufeinanderfolgende Boxen haben durchgehend 50 SVG-Einheiten
  freien Abstand; der kürzere YouTube-Strang beginnt entsprechend tiefer,
  sodass beide Eingänge auf gleicher Höhe ins Repository münden.
- github.io Pages ist als Auslieferung grün hinterlegt. Die Ausgabewege
  benennen HTML-Erzeugung, App-Paketierung und Markdown/API-Erzeugung;
  vor dem Artefakt steht jeweils „Dateien speichern“ mit gerundeter Menge.
  Build-Stichprobe: 614 HTML-Seiten, rund 680 Website-Dateien inklusive
  Assets, 88 App-Dateien und rund 620 Agentendateien. Beschriftungen sind
  illustrative Größenordnungen dieses Stands, keine Live-Zähler.
- Entwicklung, Magazin-Fetch, lokale DB und Commit/Push sind hellblau
  hinterlegt. Repository, Site-Action, Offline-App, Artefakt und Pages sind
  auf der Mittelachse x=570 ausgerichtet. Die äußeren Datenboxen liegen
  symmetrisch bei x=370 und x=770; ihre Artefakt-Eingänge bei x=455 und
  x=685, jeweils 115 Einheiten neben der Mitte. Der Deployment-Pfeil
  läuft mittig. Zwischen Pages und Cloudflare zeigt der untere Pfeil nach
  links (GET), der obere nach rechts; beide Antwortbeschriftungen entfallen.
- Öffentliche Stichpunkte sind gegenüber der technischen ADR gekürzt:
  keine Token-/Fehlerdetails zur Workflow-Verkettung, kein vollständiger
  github.io-Hostname und kein Zusatz „kein Build-Host“.
  Die technische Beschreibung unter F2 bleibt bewusst vollständig.
  Der Fetch-Knoten selbst zeigt weiterhin die tatsächliche Uhrzeit 20:17;
  Legende und F2-Stichpunkt nennen nur „täglich“.
- Markenpfade von Simple Icons lokal übernommen (CC0-1.0; Quelle und
  Markenhinweis bei der Grafik). Quellenfarben erhalten im Dunkelmodus
  kontrastreichere Varianten bei unveränderter Gruppenzuordnung.
- Markdown entfernt SVG, Styles und Pausen-Control ausdrücklich;
  Stichpunkte, Legende und Links bleiben vollständig lesbar.
- Browserprüfung: Desktop und schmaler Viewport, Hell-/Dunkeldarstellung,
  keine überstehenden Knotenbeschriftungen; auf Mobilgeräten scrollt nur
  die Grafik horizontal. Pause friert auch laufende Verzögerungen ein,
  Wiederaufnahme setzt ohne Neustart fort. Bewegungsreduktion entfernt alle
  Animationen. Es entstehen keine externen Requests durch das Diagramm.
- Vollständiger Build mit 614 HTML-Seiten erfolgreich; bestehende globale
  Budgets eingehalten (CSS 10.010 nach erneuter CSS-Generierung,
  Website-JavaScript 4.269
  Bytes gzip). Bei der erneuten Prüfung bestehen alle 332 Tests der
  produktiven Testsuite (`npm test`), einschließlich des neuen Regressionstests
  zum Wechsel der Bewegungsreduktion während eines manuellen Ablaufs.
  Vor dem Commit besteht zusätzlich die vollständige Entwicklungssuite
  mit 518 Tests; das generierte Pico-Stylesheet wurde dafür aktualisiert.
  Automatisierte Prozess-/Website-/App- und Strukturtests
  sichern Datenflüsse, Intervalle, Route, Links und Textparität.
  Die öffentliche Auslieferung wird erst nach Deployment abgenommen.

#### Erneute Implementierungsprüfung

- Diagrammdaten, SVG-Renderer, manuelles Interaktionsskript,
  Website-/App-Integration, Markdown-Export und beide Workflows abgeglichen.
- Veraltete ADR-Aussagen zu zusätzlichem JavaScript, SVG-Rolle, Icons,
  Origin-Beschriftung, Pfeilarten und Legendentext korrigiert.
- Gefundenen Randfall behoben: Bewegungsreduktion während eines manuellen
  Ablaufs darf den YouTube-Zyklus nicht dauerhaft sperren. Automatisierter
  Regressionstest und Browserwechsel bestätigen die Freigabe.
- Layout, Symmetrie, 50-Einheiten-Abstände, beschriftete Datenzweige und
  deduplizierte Highlights sind durch Prozess- und Integrationstests abgedeckt.
- Unverändert offen: öffentliche Auslieferung und Prüfung nach Deployment;
  die lokalen Tests belegen keine bereits erfolgte Veröffentlichung.

## Abnahme

- Diagramm enthält Entwicklung links, YouTube rechts, manuelle
  Magazin-Fetches/Entwicklungs-Push oben, automatische YouTube-Actions
  darunter und den Besucher ganz unten rechts.
- Alle Knoten, Quellfarben, Pfeilfarben, Richtungen und Bedingungen
  stimmen mit F1 bis F4 und den aktuellen Workflows überein.
- Kein direkter YouTube-Webhook und kein Bot-Push als falscher Build-Trigger.
- Build trennt HTML, Offline-App und Agentenausgaben; Pages und Cloudflare
  sind als Hosting beziehungsweise Auslieferung unterscheidbar.
- Die Action-Rahmen `fetch:videos` und `site:generation` tragen die echten
  Workflow-/npm-Namen als Untertitel; `workflow_run` und Repository-Checkout
  sind korrekt verbunden. Keine Umbenennung bestehender Automatisierung.
- Lokale Zuordnungs-DB, YouTube-Cachedateien und die drei logischen
  Ausgabezweige haben unterscheidbare Icons und Beschriftungen.
  Alle Ausgaben erreichen dasselbe Pages-Deployment.
- GitHub-, Cloudflare-, YouTube- und Node.js-Icons sind lokal, lesbar und
  mit geprüften Nutzungsbedingungen eingebunden; kein Next.js suggeriert.
- Animationszyklen betragen 3 s beziehungsweise 20 s; Tests prüfen die
  CSS-Dauern, Pfeilzuordnung, Pause und `prefers-reduced-motion`.
  Der manuelle Push beginnt einmalig nach 5 s. Beide Änderungsbeispiele
  durchlaufen die korrekten Trigger bis `site:generation` und Deployment;
  neue Daten werden grün und kehren nach 2 s zur normalen Farbe zurück.
  Pause/Wiederaufnahme startet die einmalige Sequenz nicht erneut;
  Reduced Motion unterbindet auch Zustands-/Farbanimationen.
  Ein Browser-Netzwerktest bestätigt keine durch Impulse ausgelösten Requests.
- Direkt unter dem Diagramm stehen nur erklärende Stichpunkte; sie bleiben
  auch ohne Icons, Animation oder SVG vollständig verständlich.
- Neue Route liefert statisches HTML mit genau einer H1 und vollständiger
  Erklärung ohne SVG/visuelle Wahrnehmung. Nur manuelle Startbuttons
  benötigen das lokale Interaktionsskript; automatische Animationen und
  Pausenschalter sind CSS-basiert.
- „Über das Projekt“ und die Dienste-Erklärungen in Projekt-/Datenschutzhinweisen
  verlinken die Prozessseite in Website, Offline-App und Markdown;
  vorhandene externe Anbieter- und Datenschutzlinks bleiben erhalten.
- SVG-Titel/-Beschreibung, eindeutige IDs und farbrichtige Marker werden
  getestet; Text-, Link- und Route-Parität in Markdown und App ebenfalls.
- Generator-/Website-/App-Tests und vollständiger Build bestehen;
  vorhandene Performancebudgets bleiben eingehalten.
- Visuelle Prüfung mit schmalem und breitem Viewport, Tastatur sowie
  Hell-/Dunkeldarstellung; keine abgeschnittenen Beschriftungen oder
  nicht erklärbaren Pfeilkreuzungen.

## Folgen

Die Architektur wird für Besucher verständlich, ohne einen dynamischen
Dienst einzuführen. Das Diagramm ist eine gepflegte Dokumentation:
Bei Änderungen an Triggern, Fetch-Aufgaben, Generatoren oder Hosting muss
die Prozessseite zusammen mit den betroffenen Tests aktualisiert werden.
Ein SVG allein ist kein ausreichender Ersatz für die textuelle Erklärung.

## Geprüfte Grundlagen

- [YouTube-Workflow](../../.github/workflows/fetch-youtube.yml)
- [Pages-Workflow](../../.github/workflows/pages.yml)
- [npm-Aufgaben](../../package.json)
- [Archivabruf](../../src/fetch-magazine/fetch-archives.mjs)
- [Gemeinsamer Build](../../src/site-generation/generate-site.mjs)
- [Agentengenerierung](../../src/ai-bot-generation/generate-ai-bot.mjs)
