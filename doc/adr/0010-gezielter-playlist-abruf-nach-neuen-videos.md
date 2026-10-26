# ADR 0010: Gezielter Playlist-Abruf nach neuen Videos

- Status: angenommen.
- Datum: 2026-10-26.
- Umfang: `fetch:playlists`, `fetch:all` und der Workflow `Update YouTube caches`;
  Videoabruf siehe [ADR 0001](0001-youtube-metadaten-ohne-offizielle-api.md).
- Umsetzung: [`src/fetch-channel/fetch-youtube-playlists.mjs`](../../src/fetch-channel/fetch-youtube-playlists.mjs),
  [`src/fetch-channel/youtube-data-api.mjs`](../../src/fetch-channel/youtube-data-api.mjs).

## Kontext

Der Kanal hat rund 160 Playlists. Bisher lud jeder Playlist-Lauf nach einem
neuen Video alle Playlists vollständig neu: anonym mindestens ein
Seitenabruf pro Playlist, mit API-Key mindestens ein `playlistItems`-Aufruf
pro Playlist. Ein neues Video steht aber typischerweise in genau einer
Playlist, und zwar in einer kürzlich aktualisierten.

Ziel ist, mit möglichst wenigen Aufrufen alle Playlists zu finden, in denen
die neuen Videos stehen. Maßgeblich sind nur die öffentlichen Videos, die
`fetch:videos` als neu erkannt hat.

Geplante, noch nicht veröffentlichte Playlist-Einträge sind kein Signal:

- Die API zählt sie in `contentDetails.itemCount` mit, liefert sie aber nicht
  aus. Bei solchen Playlists weicht die Videoanzahl der API dauerhaft vom
  Cache ab.
- Für sie gibt es trotzdem ein Fortsetzungstoken. Die API wiederholt es auf
  leeren Seiten; die öffentliche Seite beantwortet es ohne Fortsetzungsdaten.
  Beides wurde zuvor als Fehler gewertet und ließ den Cache unvollständig.

## Entscheidung

1. `fetch:videos` gibt die IDs neuer Videos zurück (`newVideoIds`) und schreibt
   sie in GitHub Actions als Output `new-video-ids`. `fetch:all` übergibt sie
   direkt, der Workflow als `YOUTUBE_NEW_VIDEO_IDS` an `fetch:playlists`.
2. **Gezielter Lauf:** Liegen neue IDs vor und ist der Playlist-Cache
   vollständig, werden die Playlists einzeln und nacheinander geladen,
   zuletzt aktualisierte zuerst. Der Lauf endet, sobald jedes neue Video in
   einer Playlist gefunden wurde: bei einem neuen Video nach dem ersten Fund,
   bei zwei neuen Videos nach dem zweiten.
3. **Reihenfolge anonym:** YouTube-Sortierung „Last video added“
   (`/@<handle>/playlists?view=1&sort=lad`). Weitere Übersichtsseiten werden
   nur geladen, wenn die bisherigen Playlists nicht ausreichen.
4. **Reihenfolge mit API-Key:** Die API kann Playlists nicht sortieren. Erst
   neu gelistete Playlists, dann absteigend nach `lastModified` im Cache.
   `itemCount` wird bewusst nicht verwendet.
5. **Vollständiger Lauf wie bisher:** ohne neue IDs, ohne vollständigen Cache
   oder bei `force_playlists`. Nur er entfernt nicht mehr gelistete
   Playlists; die Sortierung „Last video added“ lässt leere Playlists weg und
   taugt daher nicht für den vollständigen Abgleich.
6. **Geplante Einträge beenden die Mitgliederliste:** Eine leere API-Seite mit
   wiederholtem Token und eine Fortsetzung ohne Daten auf der öffentlichen
   Seite gelten als Ende der Liste. Ein wiederholtes Token auf einer Seite mit
   Einträgen bleibt ein Fehler.

## Anzahl der Aufrufe

Für P Playlists, k neue Videos und j bis zum letzten Fund geprüfte Playlists
(ohne Fortsetzungsseiten langer Playlists):

| Variante | Anonym | Mit API-Key |
|---|---|---|
| Bisher (vollständig) | ⌈P/30⌉ + P | 1 + ⌈P/50⌉ + P |
| Gezielt | 1 + j, weitere Übersichtsseiten nur bei Bedarf | ⌈P/50⌉ + j |

Bei P = 160 und einem neuen Video in der zuletzt aktualisierten Playlist sind
es anonym 2 statt rund 166 Aufrufe, mit API-Key rund 5 statt rund 165.

## Begründung

- Die von `fetch:videos` gefundenen IDs sind das einzige verlässliche
  Änderungssignal; eine zusätzliche Abfrage zur Erkennung entfällt.
- „Last video added“ ist genau die gesuchte Reihenfolge und kostet keinen
  zusätzlichen Aufruf gegenüber der normalen Übersicht.
- Das Änderungsdatum im Cache ist mit API-Key die beste verfügbare Näherung,
  weil Reihen meist über mehrere Wochen fortgesetzt werden.
- Ein früher Abbruch hält nicht geprüfte Playlists auf ihrem letzten
  vollständigen Stand; sie ändern sich ohne neues öffentliches Video nicht.

## Folgen

- Typische tägliche Läufe brauchen nur wenige Aufrufe; Rate-Limits und das
  API-Kontingent werden geschont.
- Umsortierungen, Titeländerungen oder entfernte Playlists ohne neues Video
  werden erst mit einem vollständigen Lauf (`force_playlists`,
  `npm run fetch:playlists` ohne `YOUTUBE_NEW_VIDEO_IDS`) übernommen.
- Steht ein neues Video in keiner Playlist, prüft der gezielte Lauf alle
  Playlists und meldet die IDs ohne Playlist; er ist dann nicht teurer als ein
  vollständiger Lauf.
- Mit API-Key kann eine lange nicht geänderte Playlist, die ein neues Video
  erhält, spät in der Reihenfolge stehen; der Lauf bleibt korrekt, kostet dann
  aber mehr Aufrufe.
- Geplante Einträge erscheinen erst nach ihrer Veröffentlichung im Cache,
  ausgelöst durch den Videoabruf.
