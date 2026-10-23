# ADR: YouTube-Kanal-Metadaten ohne offizielle API laden

**Status:** Vorgeschlagen
**Datum:** 2026-10-16 (überarbeitet 2026-10-17)
**Entscheider:** Christian Harms
**Kontext:** Export aller Video-Metadaten eines YouTube-Kanals in ein lokales System, ohne YouTube-Data-API-Key.
**Referenzimplementierung:** [`src/fetch-channel/fetch-youtube-videos.mjs`](../../src/fetch-channel/fetch-youtube-videos.mjs)

## Kontext

Wir benötigen wiederholbar die vollständige Liste der öffentlichen Videos eines YouTube-Kanals. Pro Video sind **zwingend** erforderlich:

- Video-ID
- Titel
- **vollständige** Beschreibung
- Länge
- genaues Veröffentlichungsdatum

Die offizielle YouTube Data API wäre möglich, erfordert aber einen Google-Cloud-API-Key, ein Projekt, Quoten-Management und zusätzliche Zugriffsverwaltung. Für einen lokalen, privaten und automatisierten Export ist das unerwünscht.

Anforderungen:

- Kein YouTube-Data-API-Key.
- Vollständiger Kanal-Export, nicht nur die jüngsten Uploads.
- Paginierung über beliebig große Kanäle.
- Strukturierte Metadaten als JSON.
- Inkrementelle Aktualisierung: Folgeläufe laden nur neue Videos.
- Node.js ohne zusätzliche Abhängigkeiten.
- Keine Abhängigkeit von einem externen SaaS-Scraper.
- Möglichst wenige Aufrufe an YouTube.

## Analyse: Welche Quelle liefert welche Daten?

Geprüft gegen den Kanal `@PrettyOldPixel` (rund 2.160 Uploads):

| Quelle | Videos pro Aufruf | Titel | Länge | Datum | Beschreibung |
|---|---|---|---|---|---|
| Upload-Playlist (`UU…`, Web-Client) | 100 | ✅ | ✅ als Text („34:52“) | nur relativ („vor 4 Std.“) | ❌ |
| Kanal-Reiter „Videos“ (`channel.videos`) | 30 | ✅ | ✅ | nur relativ | ❌ |
| Eingebetteter TV-Client (`TVHTML5_SIMPLY_EMBEDDED_PLAYER`) | 20, ohne Paginierung | ✅ | ✅ | ❌ | gekürzt (~200 Zeichen) |
| RSS-Feed des Kanals | nur die neuesten 15 | ✅ | ❌ | ✅ | ✅ vollständig |
| Einzelabruf pro Video (`player`) | 1 | ✅ | ✅ | ✅ | ✅ vollständig |

Andere Clients (Android, iOS, eingebetteter Web-Player) lehnen die Listenanfrage ab.

**Kernergebnis:** Ohne API-Key gibt es keine Liste, die für alle Videos die vollständige Beschreibung und das genaue Datum liefert. Ein Einzelabruf pro Video ist daher **unvermeidbar**, unabhängig davon, ob eine Bibliothek wie `youtubei.js` oder eine eigene Implementierung verwendet wird.

## Anzahl der Aufrufe

Für einen Kanal mit N Videos, davon k neu seit dem letzten Lauf:

| Variante | Erster Export | Folgelauf | Bei N = 2.160 (erster Export) |
|---|---|---|---|
| **Referenzimplementierung** | 1 + ⌈N/100⌉ + N | 1 + k | ≈ 2.183 |
| `youtubei.js` mit `channel.videos` + `getDetails` (frühere Fassung dieser ADR) | 2 + ⌈N/30⌉ + N bis 2N | 3 + k | ≈ 2.234 bis 4.394 |
| `youtubei.js` mit Upload-Playlist + `getBasicInfo` | 2 + ⌈N/100⌉ + N | 3 + k | ≈ 2.184 |
| RSS + erste Playlist-Seite für Folgeläufe | wie Referenz | 2 (bei k ≤ 15) | wie Referenz |
| YouTube Data API (Vergleich, mit Key) | 1 + 2 · ⌈N/50⌉ | 2 bis 3 | ≈ 89 |

Erläuterung zur Referenzimplementierung:

- **Erster Export:** 1 Kanalseite (Kanal-ID) + 22 Playlist-Seiten + 1 Einzelabruf pro Video.
- **Folgelauf:** Die Kanal-ID wird aus dem Cache gelesen, deshalb nur 1 Playlist-Seite + 1 Einzelabruf pro neuem Video.

## Entscheidung

Wir verwenden die **eigene, abhängigkeitsfreie Implementierung** in `src/fetch-channel/fetch-youtube-videos.mjs`. Sie greift direkt auf die öffentlichen YouTube-Webseiten und die inoffizielle Innertube-Schnittstelle zu (`youtube.com/youtubei/v1/…`).

Ablauf:

1. **Kanal auflösen:** Die öffentliche Kanalseite `https://www.youtube.com/@<handle>` liefert die Kanal-ID `UC…`. Bei Folgeläufen wird sie aus dem Cache genommen.
2. **Upload-Playlist laden:** Die Playlist-ID wird aus der Kanal-ID abgeleitet (`UC…` → `UU…`). Die erste Seite kommt als HTML von `https://www.youtube.com/playlist?list=UU…`, daraus werden `ytInitialData` und die aktuelle Client-Version gelesen.
3. **Paginieren:** Weitere Seiten mit je 100 Videos kommen über `POST /youtubei/v1/browse` mit dem Fortsetzungs-Token der vorherigen Seite.
4. **Details pro Video:** `POST /youtubei/v1/player` liefert Titel, vollständige Beschreibung, Länge in Sekunden und Veröffentlichungsdatum. Fehlen Daten in der Antwort, wird stattdessen die Watch-Seite gelesen.
5. **Filtern:** Nicht gelistete, private und geplante Videos (Premieren, angekündigte Livestreams) werden übersprungen.
6. **Speichern:** Die Daten landen in `cache/youtube-videos.json`, sortiert nach Veröffentlichungsdatum, absteigend.
7. **Inkrementell:** Folgeläufe brechen das Paginieren ab, sobald eine Seite ein bereits bekanntes Video enthält, das nicht neuer als `lastModified` ist.

Cache-Format:

```json
{
  "channel": { "id": "UC…", "handle": "PrettyOldPixel", "title": "Pretty Old Pixel", "url": "https://www.youtube.com/@PrettyOldPixel" },
  "lastModified": "2026-10-16T10:00:21-07:00",
  "fetchedAt": "2026-10-16T21:55:00.000Z",
  "complete": true,
  "videos": [
    {
      "id": "wrVPWvnk2BI",
      "title": "…",
      "description": "…",
      "duration": "PT34M51S",
      "durationSeconds": 2091,
      "publishedAt": "2026-10-16T10:00:21-07:00"
    }
  ]
}
```

## Begründung

- **`youtubei.js` spart keinen Aufruf.** Bei gleicher Quelle (Upload-Playlist + Einzelabruf) ist die Zahl der Aufrufe identisch. Mit `channel.videos` wie in der früheren Fassung wären es sogar mehr. Die Bibliothek nähme nur das Lesen der Antworten ab, bringt dafür aber eine Abhängigkeit, Initialisierungsaufrufe und eigene Versionssprünge mit.
- **Kein API-Key:** Nur öffentlich erreichbare YouTube-Seiten und -Endpunkte werden genutzt.
- **Vollständig:** Die Upload-Playlist enthält alle öffentlichen Uploads, auch Shorts und Livestreams. Sie bietet zudem die größte Seitengröße (100).
- **Abhängigkeitsfrei:** Nur Node.js-Standardbibliothek und das eingebaute `fetch`.
- **Lokal-first:** Keine Datenweitergabe an Dritte.

## Alternativen

| Alternative | Aufrufe (N = 2.160) | Warum nicht gewählt |
|---|---|---|
| YouTube Data API | ≈ 89 | Benötigt API-Key, Google-Cloud-Projekt und Quotenmanagement. Wäre die Vorgabe „kein Key“ verhandelbar, wäre dies die robusteste und sparsamste Lösung. |
| `youtubei.js` | ≈ 2.184 oder mehr | Spart keinen Aufruf gegenüber der Referenz, zusätzliche Abhängigkeit. |
| RSS-Feed für Folgeläufe | spart k Aufrufe pro Folgelauf | Typisch k = 0 bis 2. Dafür ein zweiter Leseweg, Länge nur als Text aus der Playlist, Fallback bei k > 15 nötig. Der Mehraufwand steht in keinem Verhältnis zur Einsparung. |
| `@ytracker/ytinitialdata`, `yt-meta` | ≥ Referenz | Paginierung und Detailabrufe müssten trotzdem selbst gebaut werden. |
| Externe Scraper-APIs, z. B. Apify | – | Externer Dienst, Kosten, Datenschutz- und Betreiberabhängigkeit. |

## Konsequenzen

### Vorteile

- Kein API-Key, kein Google-Cloud-Projekt und keine API-Quoten.
- Vollständiger Export auch großer Kanäle.
- Folgeläufe sind billig: 1 Aufruf plus 1 pro neuem Video, in der Praxis unter einer Sekunde.
- Keine npm-Abhängigkeiten.

### Risiken

- **Hohe Aufrufzahl beim ersten Export:** etwa ein Aufruf pro Video. Bei rund 2.160 Videos dauert der Lauf einige Minuten und erhöht das Risiko von Rate-Limiting oder CAPTCHAs.
- **Inoffizielle Schnittstelle:** YouTube kann HTML-Struktur, `ytInitialData`, Innertube-Endpunkte oder Antwortformate jederzeit ändern. Betroffen ist dann die eigene Implementierung; eine Bibliothek würde nur die Pflege verlagern, nicht das Risiko beseitigen.
- **Nutzungsbedingungen:** Automatisiertes Auslesen kann gegen die YouTube-Nutzungsbedingungen verstoßen. Der Export ist auf öffentliche Daten des eigenen Kanals beschränkt und nicht für Massen-Scraping fremder Kanäle gedacht.
- **Nachträgliche Änderungen** an Titel oder Beschreibung alter Videos werden von Folgeläufen nicht erkannt.
- **Geplante Videos** auf der ersten Playlist-Seite werden bei jedem Lauf erneut abgefragt, bis sie veröffentlicht sind (je 1 Aufruf).

### Umgesetzte Minderungsmaßnahmen

- Cache in `cache/youtube-videos.json`, atomar geschrieben (temporäre Datei + Umbenennen).
- Speichern nach jeder Playlist-Seite; ein abgebrochener erster Export lädt beim nächsten Start nur fehlende Videos (`complete: false`, `lastModified` bleibt bis zum Abschluss unverändert).
- Inkrementelle Folgeläufe über `lastModified`; die Kanal-ID kommt aus dem Cache.
- Wiederholung bei Status 429 und 5xx mit exponentiellem Backoff (1 s, 2 s, 4 s).
- Begrenzte Parallelität: höchstens 4 Detailabrufe gleichzeitig.
- Keine Anmeldung, keine privaten Inhalte. Einziges Cookie ist `SOCS=CAI`, das die EU-Zustimmungsseite überspringt; es enthält keine Nutzer- oder Sitzungsdaten.
- Unit-Tests mit nachgebildeten YouTube-Antworten (`tests/fetch-youtube-videos.test.mjs`).

### Offene Punkte

- **Fehlertoleranz:** Ein einzelner fehlgeschlagener Detailabruf bricht derzeit den Lauf ab. Der Fortschritt bis zur letzten vollständigen Seite bleibt erhalten. Besser wäre, fehlgeschlagene IDs im Cache zu vermerken und beim nächsten Lauf erneut zu versuchen.
- **Integrationstest** gegen den echten Kanal, um Änderungen bei YouTube früh zu erkennen (z. B. `npm run test:integration`, nicht Teil von `npm test`).
- **Gezielter Neuabruf** einzelner oder aller Videos, um geänderte Beschreibungen zu übernehmen.
- **Datumsformat:** `publishedAt` wird mit der Zeitzone von YouTube gespeichert (`-07:00`/`-08:00`). Eine Normalisierung auf UTC würde Sortierung und Vergleiche vereinfachen.

## Folgeentscheidungen

- [ADR 0008: Transkripte und Spieleabschnitte in Blätterabenden](0008-transkripte-und-spieleabschnitte-in-blaetterabenden.md)
  erweitert die Datenerfassung um öffentliche Untertitel und bewertet die
  getrennte Analyse und Veröffentlichung von Spiele-Sprungmarken.
- **Speicherformat:** JSON im Verzeichnis `cache/`. SQLite erst, wenn Abfragen oder Datenmenge es erfordern.
- **Detailtiefe:** Einzelabruf pro Video ist Pflicht, da die Beschreibung zwingend benötigt wird.
- **Betriebsmodus:** CLI-Job (`npm run fetch:videos`) oder geplanter lokaler Task, kein dauerhaft laufender Dienst.
- **Neubewertung:** Wenn der erste Export zu häufig blockiert wird oder sich die Schnittstelle oft ändert, ist die YouTube Data API mit etwa 89 Aufrufen die naheliegende Alternative.
