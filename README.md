# Pretty Old Pixel

Statische Website für den YouTube-Kanal
[Pretty Old Pixel](https://www.youtube.com/@PrettyOldPixel):
Retrospiele, alte Computerzeitschriften, Hardware, Retrospektiven und Gespräche.

Die Startseite zeigt Kanalstatistiken und Themenbereiche. Spiel- und
Zeitschriftenausgabeseiten bündeln passende Videos, Beschreibungen, Kapitel
und Archivlinks. Die News zeigen die 20 neuesten Videos; einen Gesamtkatalog
oder separate Videoseiten gibt es nicht.

## Schnellstart

Voraussetzung: **Node.js 22 oder neuer**. Keine zusätzlichen npm-Abhängigkeiten.
Alle Befehle im Projektverzeichnis ausführen.

```sh
npm run generate:site
python3 -m http.server 8000 --bind 127.0.0.1 --directory docs
```

Anschließend http://localhost:8000/ öffnen. Der Generator arbeitet offline
mit den vorhandenen JSON-Caches. Python 3 wird nur für diesen Vorschau-Server
benötigt; alternativ einen anderen lokalen HTTP-Server verwenden.

## Daten aktualisieren

```sh
npm run fetch:all              # Öffentliche YouTube-Videos und Playlists laden
npm run fetch:archives         # Benötigte Zeitschriftenarchive aktualisieren
npm run generate:blaetterabend # Zeitschriften und Ausgaben lokal zuordnen
npm run generate:site          # Website aus den lokalen Daten erzeugen
```

Internetabrufe (`fetch:*`) und lokale Generierung (`generate:*`) sind getrennt.
YouTube-Abrufe benötigen keinen API-Key und verwenden vorhandene Caches.
Zum Bauen der Website sind keine erneuten Internetabrufe nötig.

## Tests

```sh
npm test
```

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
[Architekturentscheidungen](doc/adr/)
