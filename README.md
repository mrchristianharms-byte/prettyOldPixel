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
MobyGames-Dump; dafür werden weder Browser noch zusätzliche Pakete benötigt.
Externe Programme, Modellserver und deren Modelle werden nicht von npm verwaltet.

| Schritt | Programme / Dienste zusätzlich zu Node.js und npm | Netzwerk und lokale Daten |
|---|---|---|
| `generate:site` | Keine | Offline; benötigt die vorhandenen Video-, Playlist- und Blätterabend-Caches. Vorhandene Archivcaches, Logos und abgeschlossene Transkriptanalysen werden lokal eingelesen. Pico CSS 2.1.1 einschließlich Lizenz liegt bereits unter `src/vendor/`; kein CDN-Abruf beim Build. |
| `dev` | `http-server` über `npx` | Lokale Vorschau der generierten Dateien unter `docs/` auf `127.0.0.1:8000`; beim ersten Aufruf gegebenenfalls Paketabruf aus der npm-Registry. |
| `dev:generate:blaetterabend` | Keine | Offline; liest Video- und vorhandene Archivcaches, ohne fehlende Archive nachzuladen. |
| `fetch:videos`, `fetch:playlists`, `fetch:all` | Keine; insbesondere kein `yt-dlp` oder Browser | HTTPS zu YouTube für öffentliche Video-/Playlistdaten. Kein YouTube-API-Key; vorhandene Caches werden verwendet. `fetch:all` umfasst nur Videos und Playlists, nicht Archive oder Transkripte. |
| `dev:fetch:archives`, `dev:fetch:archives:refresh` | Keine; kein Browser/Scraper-Paket | Video-Cache und HTTPS zu Kultmags, reetroz sowie bei passenden Zeitschriften PC Games Database und AMR; einschließlich lokal gespeicherter Logos. |
| `dev:fetch:gamestar` | Keine | HTTPS zu `www.pcgamesdatabase.de` für GameStar-Ausgaben und Logo. |
| `dev:fetch:amiga-action` | Keine | HTTPS zu `amr.abime.net` für Amiga-Action-Ausgaben und Logo. |
| `dev:review:games` | Keine | Offline-Prüfübersicht aus dem fertigen Dump-Cache: nutzbare/gesperrte Spiele, Plattformumfang und Kandidaten. |
| `dev:import:game-dump -- --input cache/gdb.sql` | Node mit eingebautem `node:sqlite` (ab 22.13 ohne Startflag) | Lokaler MariaDB-Dump wird ohne SQL-Ausführung temporär konvertiert; nur Katalogtreffer als JSON/HTML exportiert. `--delete-input` löscht die Eingabe erst nach geprüften Exporten. Dump und SQLite-Dateien nicht einchecken. |
| `dev:verify:game-dump` | Keine | Validiert offline Katalogabdeckung, Titel/Aliasse, IDs und Veröffentlichungen des lokalen Dump-Reports. Schreibt `local-dump/verification.json`; keine anderen Referenzquellen. |
| `dev:prepare:game-metadata` | Keine | Erzeugt offline `cache/game-metadata/ready.json` (Version 3) aus Dump, Prüfentscheidungen und Plattformregel: bekannte Plattform erhalten, sonst DOS → Amiga → C64; nur eindeutige Kandidaten. 119 Spiele nutzbar, 28 gesperrt. Alle Daten einschließlich Jahresangaben kommen aus dem Dump. |
| `dev:fetch:transcripts` | Aktuelles `yt-dlp` als ausführbares Programm im `PATH` | Lokale Katalogdaten zur Videoauswahl; YouTube-Metadaten über `yt-dlp`, Untertitel anschließend per Node-HTTP-Abruf. Kein Audio-/Videodownload. |
| `dev:generate:games-from-transcript` | Laufender lokaler OpenAI-kompatibler Modellserver, derzeit Ollama mit `qwen3:14b` | Bereits gecachtes Transkript und lokale Modellgewichte; Analyse ausschließlich über einen Loopback-Endpunkt. Internet nur für die vorherige Installation bzw. den Modelldownload nötig. |
| `npm test` | Keine | Actions-taugliche Tests für YouTube-Abrufe, Seitengenerierung, Darstellung und Browser-Skripte; offline mit simulierten HTTP-Antworten. |
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
npm run dev:verify:game-dump
npm run dev:prepare:game-metadata
npm run dev:review:games
npm run generate:site
```

Der Website-Build liest ausschließlich den fertigen Cache. Fehlende oder
mehrdeutige Zuordnungen bleiben unverifiziert, ohne Ersatz aus anderen Quellen.
Ein pauschales Erscheinungsjahr wird nur bei genau einer ausgewählten Plattform
und vollständig datierten Veröffentlichungen angegeben. Der ursprüngliche
SQL-Dump wurde nach dem geprüften Export gelöscht.
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
Sie installiert keine npm-Pakete, Downloader,
Browser oder Modelle und ruft keine Fetch- oder LLM-Schritte auf.
Checkout, Actions-Cache und Pages-Deployment benötigen unabhängig davon
die GitHub-Dienste.

## Projektstruktur

- `src/`: Abrufscripts, Generatoren, Vorlagen und Gestaltung.
- `tests/`: automatisierte Tests.
- `cache/`: lokale JSON-Daten als Grundlage der Generierung.
- `docs/`: generierte Website; Git-ignoriert und bei jedem Build ersetzt.
- `doc/`: Funktionsreferenz und Architekturentscheidungen.

## GitHub Pages

Bei Pushes auf `main` prüft und generiert GitHub Actions die Website und
veröffentlicht `docs/`. Unter **Settings → Pages → Source** muss
**GitHub Actions** ausgewählt sein, nicht „Deploy from a branch“.
Die generierten Dateien müssen nicht committed werden.

Website: https://mrchristianharms-byte.github.io/prettyOldPixel/

## Weiterführende Dokumentation

[Funktionen, Datenformate und weitere Befehle](doc/README.md) ·
[Neue Videos, Titel und fehlende Metadaten](doc/README.md#recherchierte-daten-pflegen) ·
[Architekturentscheidungen](doc/adr/)
