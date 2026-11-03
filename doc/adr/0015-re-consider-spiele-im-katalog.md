# ADR 0015: re.consider-Spiele in Spieleliste und Statistiken

- Status: angenommen und umgesetzt; Katalogdefinitionen, Metadatenimport
  (Stand 2026-11-03) und erhaltene re.consider-Detailseiten sind geprüft.
- Datum: 2026-11-03.
- Ergänzt [ADR 0006](0006-spielemetadaten-aus-lokalem-games-dump.md),
  [ADR 0007](0007-kataloguebersichten-und-erweiterte-navigation.md) und
  [ADR 0014](0014-spielestatistiken-fuer-re-play.md).
- Umfang: Zuordnung der re.consider-Videos zu Spielen und deren Folgen für
  Spieleliste, Spielstatistiken, Filterseiten und App; Verlinkung von Jahr,
  Entwickler, Publisher und Genre auf den re.consider-Detailseiten; Weg des
  Metadatenimports. Keine Änderung an Video-, Transkript- oder
  Zeitschriftenquellen und am Blätterabend-Modell.

## Kontext

re.consider ist ein eigenes Serienformat mit einem Video je Spiel. Die Playlist
`PLZW5k3rtbudq-K-nqrsVARYVJ9HaSgyiK` „re.consider" enthält derzeit acht Videos.
Aus dem Titelmarker `\bre.consider\b` entsteht automatisch der Bereich
„re.consider" mit Kachelliste und Detailvideoseiten unter `reconsider/<titel>/`;
diese Detailseiten existieren bereits und bleiben vom Katalog unabhängig.

Die Videos sind keinem Spiel zugeordnet:

- `normalizeGames` nimmt eine Spielzuordnung nur mit bestätigter Quellplaylist
  oder bestätigter Videoliste an und überspringt Reihen mit weniger als zwei
  Beiträgen. Ausnahme ist allein die aktuelle Ein-Video-Reihe aus einer
  bestätigten Playlist innerhalb von zwei Kalendermonaten; alle acht
  re.consider-Videos sind älter und stammen aus einer Serien- statt
  Spiel-Playlist. Neu ergänzt ist die Ausnahme für bestätigte
  Ein-Video-Reihen über `confirmedSingle`.
- Ohne Zuordnung bleiben die Videos außen vor bei: Spieleliste (`spiele/`),
  Gesamtübersicht (`spiele/uebersicht/`), Filterseiten (Jahr, Genre,
  Entwickler, Publisher, Plattform), Spielestatistiken
  (`spiele/statistik/` samt Jahresdiagramm und Startseiten-Kacheln) sowie der
  Offline-App.
- Die Detailvideoseiten zeigen keine Spielmetadaten und verlinken deshalb
  weder Erscheinungsjahr noch Entwickler, Publisher oder Genre.
- Die Spielemetadaten-Pipeline liest den fertigen Cache pro `game.id`
  (`metadata.get(game.id)`); ohne Katalogspiel gibt es keinen Schlüssel.

## Spielliste der re.consider-Videos

Stand 2026-11-03, Reihenfolge nach Veröffentlichung. Die Plattformen sind als
Entscheidung ergänzt und im Katalog verbindlich; Erscheinungsjahr, Genre,
Entwickler und Publisher stammen erst nach dem Import aus dem Games-Dump.

| Video-ID | Titel | Veröffentlicht | Plattform (Entscheidung) |
| --- | --- | --- | --- |
| `eF4Mlroykxo` | Knight Rider | 2025-06-20 | C64 |
| `27dsXHjbZeo` | Lotus Esprit Turbo Challenge | 2025-08-05 | Amiga |
| `NKweesBHbY0` | Dragon's Lair | 2025-09-11 | MS-DOS |
| `uLDJHRwoyDg` | Highlander | 2025-10-10 | C64 |
| `SUEoiSRnxD0` | H.E.R.O. | 2025-11-17 | C64 |
| `d4vgnGsOdu0` | Space Taxi | 2026-01-06 | C64 |
| `BIuC4Qcbgsg` | Bubble Bobble | 2026-03-10 | C64 |
| `GhpsW9qIOzw` | Miami Vice | 2026-06-09 | C64 |

Keiner der Titel kollidiert mit einem bestehenden Katalogspiel. „Dragon's Lair",
„Knight Rider" und „Highlander" sind mehrdeutige Titel; Erscheinungsjahr,
Genre, Entwickler und Publisher bleiben bis zur eindeutigen Dump-Zuordnung
unbekannt ([ADR 0006](0006-spielemetadaten-aus-lokalem-games-dump.md) verbietet
ersetzte Angaben).

## Prüfung: Wege in Spieleliste und Statistiken

**Option A – Einzelspiel-Definitionen mit Bestätigungsflag (Empfehlung).**
Die acht Spiele werden wie die vorhandenen videoId-basierten Definitionen
(Der Patrizier, Airships: Conquer the Skies, Hyperspace Delivery Service) in
[`data-games.mjs`](../../src/data/data-games.mjs) gepflegt, aber mit einem
expliziten Merkmal für bestätigte Ein-Video-Reihen, damit der Zwei-Beiträge-
Schwellenwert sie nicht verwirft. Alternativ zum Merkmal könnte
`normalizeGames` den belegten Formatmarker (re.consider) im Titel wie
re.minder als Bestätigung erkennen; das Merkmal ist schlichter, prüft sichtbar
in der Zuordnungsliste und lässt Künftiges offen.

Folgen:

- Acht neue Spielseiten unter `spiele/<id>/`. `structureGameSeries` kennt die
  Phase „re.consider – Nachbetrachtung" bereits; Reihenstruktur und Episoden-
  navigation funktionieren ohne neue Widgets.
- Spieleliste, Gesamtübersicht, Filterseiten, Statistiken, Jahresdiagramm,
  Startseiten-Kacheln und Offline-App übernehmen die Spiele automatisch;
  `gameStatistics` und die Filter brauchen keine Anpassung.
- Bereich und Detailvideoseiten unter `reconsider/<titel>/` bleiben bestehen
  (Entscheidung vom 2026-11-03): `videoHref` verlinkt Listeneinträge weiterhin
  auf die Detailseite, solange sie existiert; die Spielezeile der Einträge
  verweist zusätzlich auf die Spielseite. Die Wiedergabe ist damit an zwei
  Adressen erreichbar und wird bewusst akzeptiert.
- Der Bereich re.consider bleibt als Formatüberblick erhalten; er zählt
  weiterhin alle Titelmarker-Videos.
- Der Themenbaustein „Spiele" zählt künftig auch die acht Videos
  (`videoCount` der zugeordneten Videos), die Spielzahl steigt entsprechend.

**Option B – bisheriger Zustand plus Metadatenlinks auf den Detailseiten.**
Der Katalog bliebe unangetastet; die Verlinkung von Jahr, Entwickler,
Publisher und Genre würde ein videengebundenes Metadatum erfordern, weil
kein `game.id` existiert. Das widerspricht ADR 0006 (Metadaten gelten pro
Spielidentität) und erfüllt das Ziel (Spieleliste und Statistiken) nicht.
Entfällt.

**Option C – Spielzuordnung und zusätzliche Detailseite parallel.**
Zuordnung in den Katalog bei Beibehaltung der eigenständigen
`reconsider/<titel>/`-Seiten bietet dieselbe Wiedergabe an zwei Adressen an
(doppelter Player, doppelte Folgenavigation, doppelte Sitemap-Einträge).
Genau dieser Erhalt ist zusammen mit Option A entschieden worden; die
Widgetregeln für Spielseiten bleiben unberührt.

## Verlinkung von Jahr, Entwickler, Publisher und Genre

Mit Option A entstehen die Links über die vorhandene Spielmechanik
(`renderGameMetadata`): Erscheinungsjahr verlinkt auf
`spiele/jahr/<jahr>/`, Genre auf `spiele/genre/<slug>/`, Entwickler und
Publisher auf ihre Filterseiten; `config.href` ist routenbewusst, sodass
keine Pfadanpassung nötig ist. Fehlende Werte bleiben als „unbekannt"
gekennzeichnet und unverlinkt. Vorschauseiten und Offlineliste greifen die
Verweise über die bestehenden Widgets auf. Die erhaltenen
re.consider-Detailseiten verweisen über die Spielezeile auf die Spielseite und
zeigen unter dem Videobild dieselben Spielinformationen mit den Filterlinks
für Jahr, Genre, Entwickler und Publisher.

## Metadatenimport für die acht Spiele

Der Katalogeintrag geht dem Import voraus, denn der Import gleicht den
Katalog mit dem Titelindex ab ([Prozess](../game-metadata-implementation.md)).
Definitionen und Import gehören dabei zusammen: der fertige Cache prüft
Katalog-Hash und Spielanzahl; neue Definitionen ohne erneute Aufbereitung
brechen Build und Tests ab. Der Import wurde am 2026-11-03 mit dem lokalen
Dump durchgeführt:

1. Acht Definitionen in `data-games.mjs` pflegen (IDs nach dem üblichen
   Muster `slugify(Name + Plattform)`, jeweils mit `confirmedSingle: true`
   und den laut Spielliste verbindlichen Plattformen).
2. Titelindex aus dem lokalen Dump (Juni 2025) neu bauen
   (`node src/fetch-game/build-game-title-index.mjs --input gdb.sql`):
   61213 Spiele im Index, Plattformindex mit 329 Plattformen.
3. `npm run dev:import:game-dump`: der Report wurde für 156 Katalogspiele neu
   erzeugt – 156/156 Spiele mit Treffern, 39 titelmehrdeutig, 0 ohne Treffer.
   Einträge in `data-game-dump-manual.json` sind nicht zu erwarten.
4. `npm run dev:verify:game-dump`, `npm run dev:review:games`,
   `npm run dev:prepare:game-metadata`: Prüfentscheidungen für mehrdeutige
   Titel landen in [`data-game-dump-decisions.json`](../../src/data/data-game-dump-decisions.json).
5. `npm run generate:site` liest den fertigen Cache; fehlende Metadaten
   erscheinen als unbekannt, bis der Import fertig ist.

Plattformregeln: Alle acht Plattformen sind im Katalog verbindlich hinterlegt
(sechs C64-Titel, Amiga für Lotus Esprit Turbo Challenge, MS-DOS für
Dragon's Lair). Bleiben mehrere Kandidaten auf der gewählten Plattform,
bleibt das Spiel gesperrt, bis eine Prüfentscheidung vorliegt.

## Umsetzungsstand vom 2026-11-03

- Acht Definitionen mit `confirmedSingle: true` und verbindlichen Plattformen
  gepflegt; IDs nach `slugify(Name + Plattform)`.
- Report neu erzeugt und geprüft (`dev:verify:game-dump`: 156 Katalogeinträge).
- Sieben Spiele wurden durch die Plattformregel eindeutig selektiert; für
  Dragon's Lair liegt die Prüfentscheidung auf die DOS-Ausgabe von 1993
  (MobyGames 1503, ReadySoft Incorporated) in
  [`data-game-dump-decisions.json`](../../src/data/data-game-dump-decisions.json);
  die DOS-Ausgabe von 1989 (Sullivan Bluth) bleibt ausgeschlossen.
- `dev:prepare:game-metadata`: 156 Spiele, alle bereit, keine Sperren.
- Website regeneriert: acht Spielseiten mit verlinktem Jahr, Genre,
  Entwickler und Publisher; Spieleliste, Gesamtübersicht, Filterseiten,
  Statistiken und Startkacheln tragen die neuen Spiele; der Bereich
  re.consider samt aller acht Detailvideoseiten bleibt erhalten und zeigt
  unter dem Videobild die Spielinformationen des zugeordneten Spiels.
