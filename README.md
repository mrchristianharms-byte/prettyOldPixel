# Pretty Old Pixel

Statische Website für den YouTube-Kanal
[Pretty Old Pixel](https://www.youtube.com/@PrettyOldPixel):
Retrospiele, alte Computerzeitschriften, Hardware, Retrospektiven und Gespräche.

Die Startseite zeigt Kanalstatistiken und Themenbereiche. Spiel- und
Zeitschriftenausgabeseiten bündeln passende Videos, Beschreibungen, Kapitel
und Archivlinks. Die News zeigen die 20 neuesten Videos. Blätterabende ohne
eindeutig bekannte Ausgabe sowie Themenvideos ohne Spiel-/Ausgabeseite
erhalten eine eigene Videodetailseite. Alle Listen verwenden dasselbe
Video-Widget mit internen Detailverweisen; einen
Gesamtkatalog aller Videos gibt es nicht.
Zeitschriftenlisten verzichten auf wiederholte Links zu Übersicht, Magazin,
Jahrgang und Ausgabe pro Video; Breadcrumbs und Ausgabenlinks bleiben erhalten.

Unter `spiele/uebersicht/` gibt es zusätzlich eine aus der Spieleübersicht
verlinkte Tabelle mit allen Spielen: erstes Videojahr, Titel, Erscheinungsjahr,
Plattform und Genre (jeweils ein Wert pro Zeile), YouTube-Vorschaubild und
Spielzeit. Die gemeinsame Spalte
„Weiteres“ enthält Playlists, belegte MobyGames-Links („Moby“) und, sofern
vorhanden, einen Link zur Spieleseite mit dem ersten zugeordneten Abschluss /
Fazit als ausgewähltem Video („Abschlußgespräch“). Die Links bleiben jeweils
ohne Textumbruch in einer Zeile. „Gespielt“ zeigt das erste Videojahr; „Spielzeit“ zeigt
die summierte Videolaufzeit kompakt als Stunden und Minuten (z. B. `22:20h`).
Standardmäßig wird nach der frühesten bekannten
Videoveröffentlichung sortiert (neueste zuerst). Pfeilschaltflächen in den
Tabellenköpfen für Gespielt, Titel, Jahr und Spielzeit wechseln die Sortierung
zwischen auf- und absteigend. Nur die aktive Spalte ist hervorgehoben.
Der dynamische Übersichtstext steht links, die kombinierbaren System- und
Genre-Filter rechts auf gleicher Höhe; auf schmalen Bildschirmen untereinander.
Fehlende Sortierwerte und
unvollständige Spielzeiten stehen in beiden Richtungen zuletzt. Ohne JavaScript
bleibt die vollständige Tabelle mit allen Links zugänglich. Das Videojahr ist
das Veröffentlichungsjahr in Berliner Zeit, kein Aufnahmedatum. Laufzeiten
umfassen alle zugeordneten Videos; fehlende Werte und bekannte Teilsummen werden
gekennzeichnet. Die Tabelle ist auf schmalen Bildschirmen seitlich scrollbar.
Das zusätzliche Tabellenskript wird nur auf dieser Seite geladen; das
JavaScript-Budget von 5 KiB gzip wird pro Seite einschließlich Theme-Skript geprüft.
Als Ausnahme zu den statisch generierten Listen erfolgen Sortierung und Filterung
dieser Tabelle ausschließlich per JavaScript auf derselben Seite, ohne
Variantenseiten. Der kurze Übersichtstext zeigt dynamisch drei Zeilen:
Trefferzahl, System-/Genre-Filter und Sortierreihenfolge; zusätzliche
Erklärungstexte entfallen.

## Schnellstart

Voraussetzung: **Node.js 22 oder neuer mit npm**. Projektabhängigkeiten zuerst
mit `npm ci` installieren; optionale Abruf- und Analyseschritte
benötigen die unten aufgeführten externen Werkzeuge.
Alle Befehle im Projektverzeichnis ausführen.

```sh
npm ci
npm run generate:site
npm run dev
```

Anschließend http://localhost:8000/ öffnen. Der Generator arbeitet offline
mit den vorhandenen JSON-Caches. `npm run dev` startet den Webserver für `docs/`
auf `127.0.0.1:8000`, ohne die Website erneut zu generieren. Der Befehl verwendet
`npx http-server` und lädt bei Bedarf das externe
npm-Paket `http-server` aus der npm-Registry; es ist nur ein Vorschauwerkzeug
und keine Projektabhängigkeit. Alternativ mit vorhandenem Python 3:
`python3 -m http.server 8000 --bind 127.0.0.1 --directory docs`.
Python wird für die Node.js-Skripte nicht benötigt.
Ist Port 8000 belegt, kann beispielsweise `npm run dev -- -p 8001` einen
anderen Port verwenden.

## Externe Abhängigkeiten nach Arbeitsschritt

Die lokalen Entwicklungsabhängigkeiten einschließlich `sharp` für die
Logo-Konvertierung werden mit `npm ci` anhand der Lockdatei installiert.
Dabei werden auch die zur Plattform passenden nativen Bildbibliotheken geladen.
Actions benötigen keine npm-Installation: YouTube-Abrufe, Seitenbuild und
Produktionstests haben keine externen npm-Abhängigkeiten. Die Bildkonvertierung lädt `sharp` erst
beim lokalen Konvertieren, nicht beim Einlesen fertiger Logo-Caches.
HTTP-Abrufe verwenden Nodes eingebautes `fetch`;
Tests verwenden `node:test` und `node:assert`.
Spielemetadaten stammen ausschließlich aus dem bereits lokal exportierten
Games-Dump; dafür werden weder Browser noch zusätzliche Pakete benötigt.
Externe Programme, Modellserver und deren Modelle werden nicht von npm verwaltet.

### GitHub Actions: Seiten veröffentlichen

| npm-Target | Programme / Dienste zusätzlich zu Node.js und npm | Netzwerk und lokale Daten |
|---|---|---|
| `test` | Keine | Actions-taugliche Tests für YouTube-Abrufe, Seitengenerierung, Darstellung und Browser-Skripte; offline mit simulierten HTTP-Antworten. |
| `generate:site` | Keine | Offline; benötigt die vorhandenen Video-, Playlist- und Blätterabend-Caches. Vorhandene Archivcaches, Logos und abgeschlossene Transkriptanalysen werden lokal eingelesen. Pico CSS 2.1.1 einschließlich Lizenz liegt bereits unter `src/site-generation/vendor/`; kein CDN-Abruf beim Build. |

### GitHub Actions: YouTube-Daten aktualisieren

| npm-Target | Programme / Dienste zusätzlich zu Node.js und npm | Netzwerk und lokale Daten |
|---|---|---|
| `fetch:videos`, `fetch:playlists`, `fetch:all` | Keine; insbesondere kein `yt-dlp` oder Browser | HTTPS zu YouTube für öffentliche Video-/Playlistdaten. Kein YouTube-API-Key; vorhandene Caches werden verwendet. `fetch:all` umfasst nur Videos und Playlists, nicht Archive oder Transkripte. |

### Lokal: Zeitschriften und Archive pflegen

| npm-Target | Programme / Dienste zusätzlich zu Node.js und npm | Netzwerk und lokale Daten |
|---|---|---|
| `dev:fetch:archives`, `dev:fetch:archives:refresh` | Keine; kein Browser/Scraper-Paket | Video-Cache und HTTPS zu Kultmags, reetroz sowie bei passenden Zeitschriften PC Games Database und AMR; einschließlich lokal gespeicherter Logos. |
| `dev:fetch:gamestar` | Keine | HTTPS zu `www.pcgamesdatabase.de` für GameStar-Ausgaben und Logo. |
| `dev:fetch:amiga-action` | Keine | HTTPS zu `amr.abime.net` für Amiga-Action-Ausgaben und Logo. |
| `dev:generate:blaetterabend` | Keine | Offline; liest Video- und vorhandene Archivcaches, ohne fehlende Archive nachzuladen. |

### Lokal: Spielemetadaten aufbereiten

| npm-Target | Programme / Dienste zusätzlich zu Node.js und npm | Netzwerk und lokale Daten |
|---|---|---|
| `dev:review:games` | Keine | Offline-Prüfübersicht aus dem fertigen Dump-Cache: nutzbare/gesperrte Spiele, Plattformumfang und Kandidaten. |
| `dev:import:game-dump -- --input gdb.sql` | Node mit eingebautem `node:sqlite` (ab 22.13 ohne Startflag) | Exportiert Katalogkandidaten aus dem lokalen SQL-Dump; keine SQL-Ausführung. |
| `dev:verify:game-dump` | Keine | Validiert offline Katalogabdeckung, Titel/Aliasse, IDs und Veröffentlichungen des lokalen Dump-Reports. Schreibt `local-dump/verification.json`; keine anderen Referenzquellen. |
| `dev:prepare:game-metadata` | Keine | Erzeugt `cache/game-metadata/ready.json` aus Report, Katalog und gespeicherten Freigaben. Alle 147 Spiele zugeordnet. |

### Lokal: Transkripte und Spielebesprechungen verarbeiten

| npm-Target | Programme / Dienste zusätzlich zu Node.js und npm | Netzwerk und lokale Daten |
|---|---|---|
| `dev:fetch:transcripts` | Aktuelles `yt-dlp` als ausführbares Programm im `PATH` | Lokale Katalogdaten zur Videoauswahl; YouTube-Metadaten über `yt-dlp`, Untertitel anschließend per Node-HTTP-Abruf. Kein Audio-/Videodownload. |
| `dev:generate:games-from-transcript` | Laufender lokaler OpenAI-kompatibler Modellserver, derzeit Ollama mit `qwen3:14b` | Bereits gecachtes Transkript und lokale Modellgewichte; Analyse ausschließlich über einen Loopback-Endpunkt. Internet nur für die vorherige Installation bzw. den Modelldownload nötig. |

### Lokal: Vorschau und vollständige Tests

| npm-Target | Programme / Dienste zusätzlich zu Node.js und npm | Netzwerk und lokale Daten |
|---|---|---|
| `dev` | `http-server` über `npx` | Lokale Vorschau der generierten Dateien unter `docs/` auf `127.0.0.1:8000`; beim ersten Aufruf gegebenenfalls Paketabruf aus der npm-Registry. |
| `dev:test` | `sharp` aus den Entwicklungsabhängigkeiten | Vollständige lokale Testsuite einschließlich Archivabrufen, Logo-Konvertierung, Spielzuordnung, Dump-Verarbeitung und Transkripten. Kein Browser, `yt-dlp` oder Modellserver nötig. |

### Actions-Tasks und lokale Entwicklung

Ohne Präfix `dev:` bleiben `fetch:videos`, `fetch:playlists`,
`fetch:all`, `generate:site` und `test` für Actions verfügbar.
Alle Archiv-, Spielemetadaten-, Zuordnungs- und Transkriptaufgaben sind mit
`dev:` gekennzeichnet und werden ausschließlich lokal ausgeführt, ebenso
deren Tests innerhalb von `dev:test`. Auch die Blätterabend-Aufbereitung
ist ein lokaler Datenpflegeschritt; der Seitenbuild verwendet ihren fertigen Cache.
`dev` startet weiterhin die lokale Vorschau.

### Spielemetadaten aus dem lokalen Dump

```sh
npm run dev:import:game-dump -- --input gdb.sql
npm run dev:verify:game-dump
npm run dev:prepare:game-metadata
npm run dev:review:games
npm run generate:site
```

Titelaliase und Plattformen stehen in `src/data/data-games.mjs`, manuelle Freigaben
in `src/data/data-game-dump-decisions.json`. Beide werden bei jedem Lauf beachtet,
nicht überschrieben. Ohne feste Plattform gilt DOS → Amiga → C64 → NES → SNES;
unaufgelöste Mehrdeutigkeiten bleiben gesperrt. Nicht mehr belegte Freigaben
brechen die Aufbereitung ab.

Der Build liest nur `cache/game-metadata/ready.json`: plattformbezogene Genres,
Firmen und Jahre aus dem Dump, keine Designer-Credits. Die erzeugten Caches
werden neu geschrieben und versioniert. Der ignorierte SQL-Dump bleibt lokal;
nur `--delete-input` löscht ihn nach geprüftem Export.
[Umsetzungsstand und Grenzen](doc/game-metadata-implementation.md).

### Transkript-Downloader installieren

`yt-dlp` ist eine **System-/CLI-Abhängigkeit**, kein npm-Paket. Zum Beispiel
unter macOS mit bereits installiertem Homebrew:

```sh
brew install yt-dlp
yt-dlp --version
npm run dev:fetch:transcripts
```

Andere Plattformen und die je nach Installationsart benötigte Laufzeit
beschreibt die [yt-dlp-Installationsanleitung](https://github.com/yt-dlp/yt-dlp#installation).
Auch zusätzliche YouTube-Anforderungen, etwa an eine unterstützte
JavaScript-Laufzeit, richten sich nach der verwendeten yt-dlp-Version;
das Projekt installiert oder konfiguriert diese nicht selbst.

### Ollama und Modell vorbereiten

[Ollama](https://ollama.com/) separat installieren, starten und das konfigurierte
Modell einmalig herunterladen. Beispiel für die bisher verwendete Konfiguration:

```sh
ollama serve
# In einem zweiten Terminal:
ollama pull qwen3:14b
```

```dotenv
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
OPENAI_MODEL=qwen3:14b
```

Optional vergrößert `OLLAMA_NUM_CTX=32768` das Ollama-Kontextfenster über
die native lokale API; bei abgeschnittenen Antworten erhöht das Skript
für den nächsten Versuch Kontext- und Ausgabelimit.
[Konfiguration und Grenzen](doc/README.md#optional-größeres-ollama-kontextfenster).

## Daten aktualisieren

```sh
npm run fetch:all              # Öffentliche YouTube-Videos und Playlists laden
npm run dev:fetch:archives         # Benötigte Zeitschriftenarchive aktualisieren
npm run dev:fetch:gamestar         # Optional nur GameStar bei PC Games Database aktualisieren
npm run dev:fetch:amiga-action     # Optional nur Amiga Action und Logo bei AMR aktualisieren
npm run dev:generate:blaetterabend # Zeitschriften und Ausgaben lokal zuordnen
npm run generate:site          # Website aus den lokalen Daten erzeugen
```

Internetabrufe (`fetch:*`) und lokale Generierung (`generate:*`) sind getrennt.
YouTube-Abrufe benötigen keinen API-Key und verwenden vorhandene Caches.
Zum Bauen der Website sind keine erneuten Internetabrufe nötig.

Optional: `npm run dev:fetch:transcripts` speichert öffentliche Untertitel mit
Zeitmarken ausschließlich für Blätterabend-/Zeitschriftenvideos dauerhaft
lokal. Dafür muss `yt-dlp` installiert sein. Erfolgreich geprüfte Videos
werden nie automatisch erneut angefragt, auch wenn keine Untertitel
verfügbar sind. [Details und Cacheformat](doc/README.md#youtube-transkripte-einmalig-cachen).

`npm run dev:generate:games-from-transcript -- <video-id>` erstellt daraus lokal
Vorschläge für Spielebesprechungen mit Zeitbereichen. Es verwendet das in
`.env` konfigurierte Ollama-Modell; Ergebnisse müssen geprüft werden.
Nach erfolgreichem Speichern der Gesamtanalyse werden ihre temporären
Fensterdateien gelöscht; bei einem Abbruch bleiben sie zur Wiederaufnahme
erhalten. Fertige Transkripte und Gesamtanalysen werden in Git versioniert,
Fensterzwischenstände, Sperren und temporäre Schreibdateien nicht.
[Analyse und Grenzen](doc/README.md#spielebesprechungen-aus-transkripten).

## Tests

```sh
# Actions-taugliche Tests, ohne Entwicklungsabhängigkeiten:
npm test

# Vollständige lokale Suite inklusive Datenpflege und Konvertierung:
npm run dev:test
```

Die GitHub-Pages-Pipeline verwendet Node.js 22 und führt `npm test`
und `npm run generate:site` ohne npm-Installation aus.
Sie hat drei aufeinanderfolgende Jobs: `test` → `build` → `deploy`.
Nur erfolgreiche Tests geben den Build frei; gebaut wird genau der getestete Commit.
Sie installiert keine npm-Pakete, Downloader,
Browser oder Modelle und ruft keine Fetch- oder LLM-Schritte auf.
Checkout, Actions-Cache und Pages-Deployment benötigen unabhängig davon
die GitHub-Dienste.

Der zweite Workflow `Update YouTube caches` startet täglich um 06:00 Uhr
in `Europe/Berlin` (einschließlich Sommer-/Winterzeit), zusätzlich manuell
über `workflow_dispatch`. Er führt ausschließlich `fetch:videos` und
`fetch:playlists` aus und committet Änderungen an `cache/youtube-videos.json`
und `cache/youtube-playlists.json` nach `main`. Ohne Änderungen entsteht
kein Commit; bei einem fehlgeschlagenen Abruf werden keine Teilstände eingecheckt.
Er benötigt keine npm-Installation und führt keine lokalen `dev:`-Aufgaben aus.
Bei HTTP 429 (YouTube-Rate-Limit) warten beide Fetcher vor maximal drei
Wiederholungen mindestens 30, 60 und 120 Sekunden; ein längeres `Retry-After`
(Sekunden oder HTTP-Datum) wird berücksichtigt. Die Wartezeiten stehen im
Job-Log. Bleibt die Sperre bestehen, schlägt der Lauf ausdrücklich fehl;
dann vor einem manuellen Neustart ausreichend warten. Eine längerfristige
Sperre der GitHub-Runner-IP lässt sich durch Wiederholungen nicht beheben.
GitHub kann geplante Starts verzögern. Der Workflow benötigt Schreibrechte auf
`main`; Branch-Regeln müssen den Bot-Push erlauben.
Ein Push mit `GITHUB_TOKEN` startet den Pages-Push-Workflow nicht erneut.
Stattdessen startet der erfolgreiche Abschluss des YouTube-Workflows über
`workflow_run` automatisch `Deploy to GitHub Pages`, auch ohne Cacheänderungen.

## CSS schlank halten

Der Seitenbuild verwendet eine eingecheckte, auf die Website reduzierte
Pico-CSS-Fassung statt aller Framework-Komponenten. Nach Änderungen an
Templates, Widgets oder dynamischen Browserzuständen die Fassung lokal
aktualisieren und prüfen:

```sh
npm run dev:generate:css
npm run dev:test
npm run generate:site
```

Das Target benötigt die mit `npm ci` installierte Entwicklungsabhängigkeit
PurgeCSS. Die erzeugte Datei unter `src/site-generation/vendor/` wird
mit versioniert. Der normale Seitenbuild und GitHub Actions brauchen
PurgeCSS nicht und bleiben ohne npm-Installation ausführbar.
Das kleine Stylesheet wird weiterhin regulär geladen: kein Aufblitzen
ungestylter Inhalte und keine JavaScript-Abhängigkeit beim Laden der Styles.

## Projektstruktur

[Umbau, Zuständigkeiten, npm-Einstiege und geprüfte Kompatibilität](doc/source-structure.md) ·
[Ausführung: lokal und GitHub Actions](doc/source-structure.md#ausführung-lokal-und-github-actions).

- `src/`: nur die dünnen Hauptstarter `fetch-youtube.mjs` (`fetch:all`) und
  `generate-site.mjs` (`generate:site`); alle weiteren npm-Aufgaben starten
  ihre Implementierung direkt aus dem passenden Fachordner.
  - `site-generation/`: Websitegenerator, Renderer, Widgets, Browser-Skripte, Styles, Bilder und vendiertes CSS.
  - `fetch-channel/`: Abruf von YouTube-Kanalvideos und Playlists.
  - `fetch-magazine/`: Zeitschriftenarchive, Archivabrufe und lokale Zeitschriftenlogos.
  - `fetch-game/`: lokale Spielemetadaten-Pipeline einschließlich Import, Abgleich, Prüfung und Prüfbericht.
  - `extra-data/`: Transkript-Abruf und -Analyse sowie lokale Blätterabend-Aufbereitung.
  - `data/`: gepflegte Kataloge, Zuordnungen und JSON-Freigaberegeln.
  - `shared/`: gemeinsam genutzte Cache- und Abrufhilfen.
- `tests/`: automatisierte Tests.
- `cache/`: lokale JSON-Daten als Grundlage der Generierung.
- `docs/`: generierte Website; Git-ignoriert und bei jedem Build ersetzt.
- `doc/`: Funktionsreferenz und Architekturentscheidungen.

Andere Module und Tests importieren die Implementierungen aus den Fachordnern,
nicht die CLI-Starter. Zusätzliche Abrufe und Entwicklungsaufgaben benötigen
keinen eigenen Starter in `src/`; ihre npm-Befehle verweisen direkt auf den
Fachordner. Die Namen und Optionen der npm-Befehle bleiben unverändert.

## GitHub Pages

Unter **Settings → Pages → Source** muss **GitHub Actions** ausgewählt sein,
nicht „Deploy from a branch“.

Die beiden Workflows haben getrennte Aufgaben:

- **Deploy to GitHub Pages** startet bei regulären Pushes auf `main`,
  nach erfolgreichem Abschluss von **Update YouTube caches** auf `main` oder
  manuell unter **Actions → Deploy to GitHub Pages → Run workflow**.
  Er führt die Produktionstests aus, generiert die Website aus den vorhandenen
  Caches und veröffentlicht `docs/` als Pages-Artefakt. Es werden weder Daten
  abgerufen noch Entwicklungsabhängigkeiten wie `sharp` installiert.
- **Update YouTube caches** startet täglich um **06:00 Uhr deutscher Zeit**
  (`Europe/Berlin`, einschließlich Sommer-/Winterzeit) oder manuell.
  Er ruft `fetch:videos` und `fetch:playlists` auf und committet ausschließlich
  die beiden aktualisierten Cache-Dateien nach `main`. Der Workflow
  veröffentlicht selbst keine Website; sein erfolgreicher Abschluss startet
  den Pages-Workflow automatisch.

**Wichtig:** Der Cache-Push mit `GITHUB_TOKEN` löst keinen weiteren
Push-Workflow aus. Die Verkettung erfolgt stattdessen über `workflow_run`.
Der nachgelagerte Pages-Build checkt den aktuellen Stand von `main` aus,
einschließlich des zuvor gespeicherten Cache-Commits. Auch ohne Cacheänderungen
wird nach einem erfolgreichen Abruf gebaut; nach fehlgeschlagenen oder
abgebrochenen Abrufen werden Build und Deployment übersprungen.
Die Verknüpfung wird aktiv, sobald die Workflowänderung auf `main` liegt.

Lokale Optimierungs- und Aufbereitungsschritte (`dev:*`) werden dabei nicht
ausgeführt: keine Archivabrufe, Transkriptanalysen oder Spiele-Dump-Aufbereitung.
Vorhandene gepflegte Zuordnungen, Metadaten und fertige Analyse-Caches bleiben
unverändert und werden beim Websitebuild weiterhin verwendet.

Die generierten Dateien unter `docs/` müssen nicht committed werden.
Die lokal gepflegten Daten- und Logo-Caches hingegen gehören ins Repository,
damit der Build ohne lokale `dev:`-Aufgaben auskommt.

Website: https://mrchristianharms-byte.github.io/prettyOldPixel/

## Weiterführende Dokumentation

[Funktionen, Datenformate und weitere Befehle](doc/README.md) ·
[Quellstruktur und Verzeichnisumbau](doc/source-structure.md) ·
[Neue Videos, Titel und fehlende Metadaten](doc/README.md#recherchierte-daten-pflegen) ·
[Architekturentscheidungen](doc/adr/)
