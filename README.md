# Pretty Old Pixel

Statische Website für GitHub Pages. Die Quelldateien und das Build-Script liegen
in `src/`; `npm run build` erzeugt die veröffentlichbaren Dateien in `public/`.

## Lokal bauen

Voraussetzung: Node.js 22 oder neuer.

```sh
npm run build
```

Anschließend `public/index.html` im Browser öffnen oder einen beliebigen lokalen
statischen HTTP-Server auf das Verzeichnis `public/` zeigen lassen.

## Tests

Alle Testdateien liegen in `tests/` (`*.test.mjs`) und werden ausgeführt mit:

```sh
npm test
```

## YouTube-Videos cachen

Das Script liest alle öffentlichen Videos eines YouTube-Kanals ohne API-Key über
die öffentlichen YouTube-Webseiten aus und speichert Video-ID, Titel,
Beschreibung, Länge und Veröffentlichungsdatum in `cache/youtube-videos.json`.

Für den Kanal https://www.youtube.com/@PrettyOldPixel:

```sh
npm run fetch:videos
```

Für einen beliebigen Kanal:

```sh
npm run fetch:youtube -- https://www.youtube.com/@PrettyOldPixel
# oder
npm run fetch:youtube -- PrettyOldPixel
```

Beim ersten Lauf werden alle Seiten der Upload-Playlist geladen und die Details
jedes Videos abgerufen. Der Fortschritt wird nach jeder Seite gespeichert; ein
abgebrochener Lauf lädt beim nächsten Start nur noch fehlende Videos. Nach einem
vollständigen Lauf nutzt das Script `lastModified` aus der Cache-Datei und lädt
nur später veröffentlichte Videos. Geplante Livestreams und Premieren werden
erst übernommen, wenn sie veröffentlicht sind.

## YouTube-Playlists cachen

```sh
# Videos und Playlists gleichzeitig aktualisieren:
npm run fetch:all

# Nur Playlists aktualisieren:
npm run fetch:playlists

# Optional einen anderen Kanal angeben (gilt für beide neuen Tasks):
npm run fetch:playlists -- https://www.youtube.com/@PrettyOldPixel
```

`src/fetch-youtube-playlists.mjs` liest ohne API-Key die öffentlichen Playlists
des Kanals und alle Seiten ihrer Mitgliederlisten. Bis zu drei Playlists werden
parallel geladen; innerhalb einer Playlist werden Fortsetzungen nacheinander
abgefragt. Der gemeinsame Task wartet auf beide Scripts und endet bei einem
Fehler mit einem Fehlerstatus. Die Scripts schreiben getrennte Cache-Dateien.

Das Ergebnis liegt in `cache/youtube-playlists.json`:

```json
{
  "channel": { "id": "UC…", "handle": "PrettyOldPixel", "title": "Pretty Old Pixel", "url": "https://www.youtube.com/@PrettyOldPixel" },
  "fetchedAt": "2026-10-17T11:00:00.000Z",
  "lastModified": "2026-10-17T10:00:00.000Z",
  "complete": true,
  "playlists": [
    {
      "id": "PL…",
      "title": "re.play - Cadaver",
      "description": "",
      "url": "https://www.youtube.com/playlist?list=PL…",
      "videoCount": 1,
      "videos": [
        { "position": 1, "videoId": "glGHg5Mj2xs", "title": "Cadaver …", "availability": "listed" }
      ],
      "lastModified": "2026-10-17T10:00:00.000Z",
      "checkedAt": "2026-10-17T11:00:00.000Z"
    }
  ]
}
```

Bei jedem Folgelauf werden Übersicht und Mitgliedschaften erneut geprüft:
YouTube bietet öffentlich keinen verlässlichen Änderungszeitpunkt, und auch
ältere Videos können neu einsortiert, entfernt oder verschoben werden.
`checkedAt` bezeichnet die letzte erfolgreiche Prüfung, `lastModified` die
lokale Erkennung einer Änderung, nicht einen von YouTube gelieferten Zeitpunkt.
Unveränderte Playlists behalten `lastModified`; neue und geänderte Playlists
werden ergänzt bzw. ersetzt. Nicht mehr im Kanal gelistete Playlists werden
erst nach einem vollständig erfolgreichen Lauf entfernt.

Reihenfolge und doppelte Video-Einträge bleiben erhalten; `position` beginnt
bei 1. `videoCount` zählt gelieferte Einträge, nicht eindeutige Videos.
`availability: "listed"` bedeutet nur, dass YouTube den Eintrag liefert, nicht
dass seine öffentliche Abspielbarkeit separat geprüft wurde. Explizit nicht
abspielbare klassische Einträge erhalten `"unavailable"`. YouTube kann verborgene
Einträge ganz auslassen.

Die Daten verweisen über `videoId` auf `cache/youtube-videos.json`. Beschreibungen,
Dauer und Veröffentlichungsdatum einzelner Videos werden nicht erneut geladen.
Playlist-Einträge ohne Gegenstück im Video-Cache bleiben als Verweise erhalten,
etwa wenn sie fremde Videos betreffen. Keine Bilder oder Videos werden kopiert.

Nach jeder vollständig gelesenen Playlist wird atomar gespeichert. Bei Fehlern
bleiben erfolgreiche Aktualisierungen und der vorherige Stand fehlgeschlagener
Playlists erhalten; `complete` bleibt `false`, und der nächste Lauf prüft erneut.
Seitennavigation, Playlist-Titel und vollständige Mitgliedschaften werden nicht
anhand bloßer Playlist-Verweise in Videobeschreibungen geschätzt.
Zeitgleiche Aufrufe desselben Scripts auf dieselbe Cache-Datei sind zu vermeiden.

## Blätterabend-Videos auswerten

Aus der Video-Liste in `cache/youtube-videos.json` werden alle Videos mit
„Blätterabend“ im Titel gefiltert. Für jedes Video werden Zeitschrift, Ausgabe
(Nummer, Monat(e), Jahr, Sonderheft) und ggf. der Teil (`Teil 2`, `Stream II`)
aus dem Titel erkannt und in `cache/blaetterabend-videos.json` gespeichert.

```sh
npm run extract:blaetterabend
```

Titel ohne erkannte Zeitschrift oder Ausgabe werden beim Lauf aufgelistet. Neue
Zeitschriften oder Schreibweisen werden in der Liste `MAGAZINES` in
`src/extract-blaetterabend.mjs` ergänzt.
Die bestätigte Titelbezeichnung „Computer Gaming World – 15th Anniversary“
wird als Ausgabe #148 (11/1996) erkannt; auf dem
[Cover](https://assets.reetroz.com/covers/cgw-148.jpg) sind beide Angaben zu sehen.
Fehlt eine eindeutige Ausgabenangabe, bleibt die Ausgabe unbekannt. Die
Logmeldung weist dann gegebenenfalls auf die verlinkte Archiv-Übersichtsseite hin.

### Links auf kultmags.com

Jede erkannte Zeitschrift bekommt ein Feld `kultmags` mit einem Link in das
Archiv von [kultmags.com](https://www.kultmags.com/mags.php)
(`src/kultmags.mjs`):

- `match: "issue"`: Die passende Ausgabe wurde gefunden, mit `title`, `pageUrl`,
  `readerUrl` (Online-Reader, falls vorhanden), `downloadUrl` und `coverUrl`.
  `matchedBy` nennt den Weg dorthin: `month` (Monat/Doppelheft), `number`
  (Heft- oder Sonderheftnummer) oder `keyword` (Thema des Sonderhefts).
- `match: "folder"`: Die Zeitschrift ist im Archiv, die Ausgabe aber nicht
  eindeutig zuzuordnen. Dann zeigt der Link auf den Jahrgangs- bzw.
  Sonderheft-Ordner.
- `null`: Die Zeitschrift gibt es auf kultmags.com nicht.

Die Zeitschriftenliste und die Ausgabenlisten der benötigten Zeitschriften
werden in `cache/kultmags/` gespeichert und 30 Tage wiederverwendet. Mit
`npm run extract:blaetterabend:refresh` werden sie neu geladen (zusammen mit
dem reetroz-Cache). Ein vollständiger Abruf braucht etwa 140 Seitenaufrufe, mit
200 ms Pause zwischen den Aufrufen.

### Links auf reetroz.com (internationale Zeitschriften)

kultmags.com enthält nur deutsche Zeitschriften. Für Zeitschriften, die dort
fehlen (`kultmags: null`), wird im Archiv von
[reetroz.com](https://reetroz.com/catalog) gesucht (`src/reetroz.mjs`), z. B.
Computer Gaming World, PC Gamer (US) und Computer Games Strategy Plus. Das
Ergebnis steht im Feld `reetroz` im selben Format wie `kultmags`:

- `match: "issue"` über `matchedBy: "number"` (Heftnummer, z. B. `#148`) oder
  `"month"` (Monat und Jahr, z. B. `1/90`). `pageUrl` und `readerUrl` zeigen auf
  die Ausgabenseite mit Online-Reader. Downloads bietet reetroz nicht an,
  `downloadUrl` ist deshalb `null`.
- `match: "folder"` verlinkt die Übersichtsseite der Zeitschrift.
- `null`: Die Zeitschrift gibt es auch auf reetroz.com nicht.

Der Katalog (`cache/reetroz/index.json`) und je eine Ausgabenliste pro
benötigter Zeitschrift (`cache/reetroz/magazines/<slug>.json`) werden ebenfalls
30 Tage gecacht. Ein vollständiger Abruf braucht nur 1 Seitenaufruf plus 1 pro
Zeitschrift, weil eine Zeitschriftenseite alle Ausgaben enthält.

## Architekturentscheidungen

Architecture Decision Records liegen in `doc/adr/`:

- [ADR 0001: YouTube-Kanal-Metadaten ohne offizielle API laden](doc/adr/0001-youtube-metadaten-ohne-offizielle-api.md)
- [ADR 0002: Statische Seiten mit minimalem JavaScript, SEO und kurzen Ladezeiten](doc/adr/0002-statische-seiten-seo-und-performance.md)
- [ADR 0003: Seitenstruktur und Zuordnung von Videos zu Inhaltsbereichen](doc/adr/0003-seitenstruktur-und-inhaltszuordnung.md)
- [ADR 0004: Detailseiten, Videonavigation und fortlaufende Wiedergabe](doc/adr/0004-detailseiten-und-videonavigation.md)

## GitHub Pages veröffentlichen

Der Workflow in `.github/workflows/pages.yml` baut die Website bei Pushes auf
den Branch `main` und veröffentlicht `public/` über GitHub Pages. Aktiviere im
Repository unter **Settings → Pages** die Bereitstellung über **GitHub Actions**.
