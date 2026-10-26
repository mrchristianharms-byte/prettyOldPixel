# Quellstruktur: Umbau in Fachverzeichnisse

Stand: 23.10.2026.

Zurück zum [Projekteinstieg](../README.md) oder zur
[Funktionsreferenz](README.md).

## Ziel und Umfang

Die zuvor überwiegend flach unter `src/` abgelegten Dateien sind nach
Aufgaben gruppiert. Abruf von Kanaldaten, Zeitschriftenarchive,
Spielemetadaten, Zusatzdaten und Websitegenerierung haben eigene
Fachverzeichnisse. Gepflegte Quelldaten und gemeinsame Cachehilfen sind
von ausführender Logik getrennt.

Direkt unter `src/` bleiben ausschließlich zwei dünne Hauptstarter:

- [`fetch-youtube.mjs`](../src/fetch-youtube.mjs) für `npm run fetch:all`.
- [`generate-site.mjs`](../src/generate-site.mjs) für `npm run generate:site`.

Sie rufen `runCli()` aus der jeweiligen Implementierung auf. Alle anderen
ausführbaren Fachmodule werden ohne zusätzlichen Starter direkt über ihre
npm-Targets aufgerufen. Beim Import eines solchen Moduls wird dessen
CLI-Teil nicht ausgeführt.

## Verzeichnisübersicht

```text
src/
├── fetch-youtube.mjs
├── generate-site.mjs
├── content-data/       # einziger Loader fuer Website und Offline-App
├── app-generation/    # JSON-Export, Browser-Ansichten und Service Worker
├── site-generation/
│   ├── generate-site.mjs
│   ├── site-*.mjs
│   ├── widget/
│   ├── vendor/
│   ├── site.css
│   ├── theme.js
│   ├── video-series.js
│   └── assets/          # Favicon, Apple-Touch-Icon, Logovorlage
├── fetch-channel/
├── fetch-magazine/
├── fetch-game/
├── extra-data/
├── data/
└── shared/
```

| Verzeichnis | Zuständigkeit und wichtige Dateien |
|---|---|
| [`content-data/`](../src/content-data/) | Gemeinsamer Einstieg `loadContentData` liest Caches und Bestandsdaten, validiert und normalisiert sie einschließlich Spielemetadaten, Abschnitten, Gästen und Logos. Keine Abhängigkeit von einem der beiden Renderer. |
| [`app-generation/`](../src/app-generation/) | Kompakter JSON-Export, App-Hülle und browserfähige Ansichten, Hash-Routing, Offline-Speicherung und Updates. Liest keine Inhalts-Caches selbst. |
| [`site-generation/`](../src/site-generation/) | Gemeinsamer Build-Aufruf, Website-Konfiguration, HTML-Rendering und Formatierung. `widget/` enthält die gemeinsamen HTML-Komponenten; Styles, Browser-Skripte und vendiertes Pico CSS einschließlich Lizenz liegen beim Generator, Bilder in `assets/`. |
| [`fetch-channel/`](../src/fetch-channel/) | YouTube-Videos und Playlists sowie deren gemeinsamer Abruf. Die Implementierungen heißen weiterhin `fetch-youtube-videos.mjs`, `fetch-youtube-playlists.mjs` und `fetch-youtube.mjs`; `youtube-data-api.mjs` kapselt die YouTube Data API v3, die bei gesetztem `GOOGLE_YT_DATA_API_KEY` statt des anonymen Abrufs verwendet wird. |
| [`fetch-magazine/`](../src/fetch-magazine/) | Zeitschriftenarchive von Kultmags, Reetroz, PC Games Database und AMR, gemeinsamer Archivabruf und Logoverarbeitung. PC Games Database gehört hierher, weil das Modul den GameStar-Heftkatalog verarbeitet. |
| [`fetch-game/`](../src/fetch-game/) | Lokale Spielemetadaten-Pipeline: SQL-Dump einmal in den Titelindex lesen, Katalog daraus importieren, Titel und Plattformen abgleichen, Firmennamen vereinheitlichen, Ergebnisse verifizieren, nutzbare Metadaten und Prüfberichte erzeugen. Der Ordnername bedeutet keinen automatischen Internetabruf. |
| [`extra-data/`](../src/extra-data/) | Transkripte abrufen, Spielebesprechungen daraus analysieren und Blätterabend-Zuordnungen aus lokalen Caches erzeugen. |
| [`data/`](../src/data/) | Dauerhaft gepflegte Spiel- und Themenkataloge, Gastkanäle sowie JSON-Entscheidungen und Auswahlregeln für den Spiele-Dump. Keine generierten Caches. |
| [`shared/`](../src/shared/) | `archive-cache.mjs` mit gemeinsam genutzten Cache-, JSON-, HTTP- und Wiederholungshilfen. |

### Zentrale YouTube-Steuerung

[`fetch-channel/fetch-youtube.mjs`](../src/fetch-channel/fetch-youtube.mjs)
liest den API-Key (Umgebung vor `.env`), protokolliert ausschließlich dessen
Herkunft und wählt für Videos und Playlists den gemeinsamen Abrufweg:
YouTube Data API v3 mit Key, sonst die anonymen Fetch-Implementierungen.
Diese Auswahl gilt für `fetch:all`, `fetch:videos` und `fetch:playlists`;
API-Fehler führen nicht zu einem stillen Wechsel zum anonymen Abruf.

Die Synchronisationsfunktionen in `fetch-youtube-videos.mjs` und
`fetch-youtube-playlists.mjs` erhalten bereits konfigurierte Quellen und
kümmern sich um Fortschritt, Cache und Abbruchbedingungen. Die Fachmodule
behalten ihre anonymen Abrufimplementierungen und direkt ausführbaren
CLI-Einstiege; diese delegieren erst bei Ausführung an die zentrale Steuerung.
`youtube-data-api.mjs` enthält nur den API-Client und seine Datenkonvertierung,
keine `.env`- oder CLI-Logik.

Ein gemeinsamer Ordner `fetch-meta/` wurde bewusst nicht beibehalten:
Zeitschriften- und Spielemetadaten sind getrennte Verantwortungsbereiche.

## Zuordnung der npm-Targets

Die Namen und Optionen der npm-Targets bleiben erhalten. Nur die internen
Scriptpfade haben sich geändert.

| npm-Target | Einstieg relativ zum Projektverzeichnis |
|---|---|
| `fetch:all` | `src/fetch-youtube.mjs` → `src/fetch-channel/fetch-youtube.mjs` |
| `fetch:videos` | `src/fetch-channel/fetch-youtube-videos.mjs` |
| `fetch:playlists` | `src/fetch-channel/fetch-youtube-playlists.mjs` |
| `generate:site` | `src/generate-site.mjs` → `src/site-generation/generate-site.mjs` |
| `dev:generate:css` | `src/site-generation/generate-css.mjs`; reduziert das vendierte Pico CSS für die aktuellen Templates. |
| `dev:fetch:archives`, `dev:fetch:archives:refresh` | `src/fetch-magazine/fetch-archives.mjs`; das zweite Target setzt `--refresh`. |
| `dev:fetch:gamestar` | `src/fetch-magazine/fetch-pcgamesdatabase.mjs` |
| `dev:fetch:amiga-action` | `src/fetch-magazine/fetch-amr.mjs` |
| `dev:fetch:transcripts` | `src/extra-data/fetch-youtube-transcripts.mjs` |
| `dev:generate:blaetterabend` | `src/extra-data/generate-blaetterabend.mjs` |
| `dev:generate:games-from-transcript` | `src/extra-data/generate-games-from-transcript.mjs` |
| `dev:build:game-title-index` | `src/fetch-game/build-game-title-index.mjs` |
| `dev:import:game-dump` | `src/fetch-game/import-game-dump.mjs` |
| `dev:verify:game-dump` | `src/fetch-game/verify-game-dump.mjs` |
| `dev:prepare:game-metadata` | `src/fetch-game/game-metadata-ready.mjs` |
| `dev:review:games` | `src/fetch-game/generate-game-metadata-review.mjs` |

Maßgeblich ist die aktuelle [package.json](../package.json).
`test`, `dev:test` und `dev` bleiben Test- beziehungsweise Vorschauaufgaben
ohne zusätzlichen Starter unter `src/`.

## Datenfluss und unverändertes Verhalten

1. `fetch-channel/` schreibt die Video- und Playlist-Caches unter `cache/`.
2. `fetch-magazine/` aktualisiert Archiv- und Logo-Caches.
3. `fetch-game/` bereitet den lokalen Spiele-Dump auf.
   [Details zur Spielemetadaten-Pipeline](game-metadata-implementation.md).
4. `extra-data/` erzeugt ergänzende Zuordnungen und Analysen.
   Transkripte benötigen einen eigenen Abruf; ihre Analyse ist ein separater
   Schritt und kein Bestandteil des Websitebuilds.
5. [`loadContentData`](../src/content-data/content-data.mjs) liest die vorhandenen
   Caches und Bestandsdaten genau einmal ein und erstellt das gemeinsame
   Inhaltsmodell.
6. Dasselbe Modell geht an den HTML-Renderer und an
   [`generateApp`](../src/app-generation/generate-app.mjs). Der App-Generator
   exportiert JSON und erzeugt seine Browser-Dateien ohne eigene Inhaltsabrufe.
7. Der gemeinsame Build schreibt Website und App in dasselbe Staging-Verzeichnis
   und ersetzt `docs/` erst nach erfolgreicher Generierung. Die Website liegt
   unter den bisherigen Routen, die App unter `docs/app/`.

Die Nummerierung beschreibt die Zuständigkeiten, keine Pflicht zur
erneuten Ausführung aller Schritte vor jedem Build. Der Websitebuild bleibt
offline und startet weder Scraper noch Transkript- oder LLM-Aufgaben.

Unverändert bleiben Cacheorte und Datenformate, die Ausgabe unter `docs/`,
öffentliche Seitenrouten, Assetnamen im Build sowie die npm-Befehle der
GitHub-Workflows. Nicht erhalten bleiben die alten direkten Script- und
Importpfade der verschobenen Fachmodule: Eigene Aufrufer müssen auf die
neuen Pfade umgestellt werden.

## Ausführung: lokal und GitHub Actions

Die Pfade der Skripte ergeben sich aus den Fachgruppen und der
[Targettabelle](#zuordnung-der-npm-targets).

### Datenaufbereitung und Websitebuild

**Die Reihenfolge ist: YouTube-Videos und Playlists abrufen, Caches
speichern, anschließend die Website aus diesen Caches generieren.**
Der Offline-Build ersetzt den vorangehenden Abruf nicht, sondern verwendet
dessen Ergebnisse. Vorhandene Caches können für mehrere Builds wiederverwendet
werden.

Lokal erledigt `npm run fetch:all` die beiden Abrufe nacheinander und lässt
die Playlists ohne neue Videos aus; danach kann
`npm run generate:site` folgen. In GitHub Actions laufen sie im
YouTube-Workflow nacheinander **vor** einem späteren Pages-Build.
Die Workflows sind weiterhin getrennt: Der YouTube-Workflow speichert die
Ergebnisse im Repository, der Pages-Workflow liest sie beim Checkout.
Nach erfolgreichem Abschluss des YouTube-Workflows auf `main` startet der
Pages-Workflow automatisch über `workflow_run`, auch ohne Cacheänderungen.

`fetch-kultmags.mjs` und `fetch-reetroz.mjs` sind Bibliotheksmodule ohne
eigenes npm-Target. `fetch-pcgamesdatabase.mjs` und `fetch-amr.mjs` können
zusätzlich einzeln über `dev:fetch:gamestar` beziehungsweise
`dev:fetch:amiga-action` gestartet werden. Der Archivabruf verwendet die
Blätterabend-Erkennung aus `generate-blaetterabend.mjs`, erzeugt aber nicht
selbst die Blätterabend-Datei.

Die Archivmodule und `kultmags-logos.mjs` werden beim Datenladen auch als
lokale Leser wiederverwendet: Der Websitebuild liest vorhandene Kataloge
und fertige Logos, startet aber keine Abrufe oder Bildkonvertierung.
`shared/archive-cache.mjs` liefert gemeinsame JSON-, Cache- und HTTP-Hilfen
für die Fachmodule und hat keinen eigenen CLI-Einstieg.

Die Transkriptauswahl verwendet das Website-Datenmodell und benötigt deshalb
die vorhandenen Basis-Caches. Das ist keine Aufforderung, die gesamte
Aufbereitung erneut auszuführen. Nur fertige Gesamtanalysen gehen in die
Website ein; temporäre Analysefenster nicht.

### Tatsächliche GitHub-Actions-Abläufe

Für die Veröffentlichung aktualisierter YouTube-Daten gilt:
**YouTube-Workflow erfolgreich abschließen → aktualisierte Caches im Repository →
Pages-Workflow automatisch starten → Website generieren und veröffentlichen.**
Ein Pages-Build ohne vorherigen neuen Abruf verwendet den zuletzt
versionierten Cachestand.

Der `GITHUB_TOKEN`-Push des Cache-Commits startet keinen Push-Workflow;
das `workflow_run`-Ereignis stellt die Verbindung her. Der nachgelagerte
Build checkt ausdrücklich den aktuellen Stand von `main` aus, damit der
während des Abrufs erstellte Cache-Commit enthalten ist. Ein erfolgreicher
Abruf ohne Änderungen startet ebenfalls einen Build. Bei fehlgeschlagenen
oder abgebrochenen Abrufen werden Build und Deployment übersprungen.
Reguläre Pushes und manuelle Pages-Starts bleiben möglich.
Die Verknüpfung ist aktiv, sobald die Workflowänderung auf `main` liegt.

Es werden keine lokalen Aufbereitungs- oder Optimierungsaufgaben gestartet.
Vorhandene manuelle Zuordnungen, fertige Metadaten, Archiv-/Logo-Caches und
abgeschlossene Transkriptanalysen werden weiterhin eingelesen und nicht
durch den YouTube-Job ersetzt.

Auch die CSS-Optimierung ist ein lokaler Vorbereitungsschritt:
`dev:generate:css` schreibt die reduzierte Pico-Fassung in das
Quellverzeichnis `site-generation/vendor/`. Diese Datei wird versioniert;
der Offline-Build und GitHub Actions lesen sie ohne PurgeCSS-Installation.

Quellen: [YouTube-Workflow](../.github/workflows/fetch-youtube.yml) und
[Pages-Workflow](../.github/workflows/pages.yml).
Beide Workflows verzichten auf npm-Installation, `yt-dlp`, Modellserver und
die lokale `sharp`-Konvertierung. Checkout, Actions-Caches, Push,
Artefaktübertragung und Deployment benötigen GitHub-Netzwerkzugriff.
„Offline“ bezeichnet hier die Tests und die eigentliche Seitengenerierung,
nicht den gesamten Actions-Job.

### Ausführungsorte im Überblick

| Targets | Lokal | GitHub Actions | Netzwerk während der Aufgabe |
|---|---|---|---|
| `fetch:all` | Ja | Nein | YouTube; lädt Videos und danach nur bei neuen Videos die Playlists. |
| `fetch:videos`, `fetch:playlists` | Ja | YouTube-Workflow, nacheinander; Playlists nur bei neuen Videos | YouTube |
| `dev:fetch:archives`, `dev:fetch:archives:refresh`, `dev:fetch:gamestar`, `dev:fetch:amiga-action` | Ja | Nein | Archivseiten und Logos; Caches werden berücksichtigt. |
| `dev:fetch:transcripts` | Ja | Nein | YouTube über `yt-dlp` und HTTP |
| `dev:generate:blaetterabend` | Ja | Nein | Keines; lokale Caches |
| `dev:generate:css` | Ja | Nein | Keines; lokale Templates und vendiertes CSS, installierte Entwicklungsabhängigkeiten erforderlich. |
| `dev:import:game-dump`, `dev:verify:game-dump`, `dev:prepare:game-metadata`, `dev:review:games` | Ja | Nein | Keines; lokaler Dump und Metadaten |
| `dev:generate:games-from-transcript` | Ja | Nein | Lokale Modell-API; kein externer LLM-Endpunkt. Modell muss vorher vorhanden sein. |
| `generate:site` | Ja | Pages-Workflow | Keines; lokale Caches und Assets |
| `test` | Ja | Pages-Workflow | Keines; HTTP in Tests simuliert |
| `dev:test` | Ja | Nein | Keines für die Tests; installierte Entwicklungsabhängigkeiten erforderlich. |
| `dev` | Ja | Nein | Lokaler HTTP-Server; `npx` kann das Vorschaupaket bei Bedarf aus der npm-Registry laden. |

## Regeln für weitere Änderungen

- Implementierungen und Tests importieren Fachmodule, nicht die beiden
  Hauptstarter. Zusätzliche Entwicklungsaufgaben erhalten keinen Wrapper
  direkt unter `src/`.
- Dateibezogene Pfade berücksichtigen den neuen Standort: Module eine
  Ebene unter `src/` erreichen die Projektwurzel über `../../`.
  Websiteassets werden relativ zum Generatormodul geladen.
- Gemeinsame Widgets bleiben unter `site-generation/widget/` und verwenden
  die vorhandenen HTML-, Link- und Formatierungshelfer.
- Gepflegte Zuordnungen gehören nach `data/`, abgerufene und abgeleitete
  Ergebnisse weiterhin nach `cache/`.
- Bei weiteren Verschiebungen auch npm-Pfade, Tests, Dokumentationslinks
  und die [UI-Instruktionsmuster](../.github/instructions/ui-components.instructions.md)
  aktualisieren.

## Prüfung des Umbaus

Die [Quellstrukturtests](../tests/source-layout.test.mjs) prüfen die
Fachverzeichnisse, die zwei Hauptstarter, die Zuordnung der npm-Targets,
nebenwirkungsfreie CLI-Imports und Fehlermeldungen bei ungültigen Argumenten.

Beim Umbau und der anschließenden Funktionsprüfung wurden zusätzlich geprüft:

- Vorher-/Nachher-Vergleich: alle 728 erzeugten Dateien bytegleich.
- Echter `npm run fetch:all`: 2.161 Videos und 158 Playlists;
  keine neuen oder geänderten Inhalte, nur aktualisierte Abruf-/Prüfzeitstempel.
- Datenloader: 147 Spiele mit Metadaten, 30 Zeitschriften und 53 Logoassets.
- `npm run generate:site`: 665 HTML-Seiten; 728 von 728 Dateien unverändert übernommen.
- `npm test`: 239 Tests bestanden.
- `npm run dev:test`: 390 Tests bestanden.
- Alle 15 ausführbaren npm-Targetpfade vorhanden und syntaktisch gültig.

Diese Zahlen sind eine Momentaufnahme vom 20.10.2026, keine festen
Sollwerte für künftige Inhalte. Die bestehenden Datenhinweise zu unklaren
Ausgaben und fehlenden Erscheinungsjahren sind keine Import- oder Pfadfehler.
Weitere Archiv-/Transkriptabrufe, ein vollständiger SQL-Import und eine
LLM-Analyse wurden bei dieser Live-Prüfung nicht gestartet; dafür wurden
die automatisierten Funktions- und CLI-Tests ausgeführt.
