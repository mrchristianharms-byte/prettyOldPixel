# Spielemetadaten: lokaler Games-Dump

## Entscheidung und Datenfluss

Spielemetadaten einschließlich Erscheinungsjahren stammen ausschließlich aus dem
lokal exportierten Games-Dump.

1. [`import-game-dump.mjs`](../src/import-game-dump.mjs) liest einen lokalen
   MariaDB-Dump als Daten, führt dessen SQL nicht aus und verwendet eine temporäre
   SQLite-Datenbank. Nur Kandidaten für Katalogspiele werden exportiert.
2. [`local-dump/report.json`](../cache/game-metadata/local-dump/report.json)
   enthält die zurückbehaltenen Titel, Aliasse, Genres und Veröffentlichungen.
   Der SQL-Dump bleibt standardmäßig lokal erhalten; die temporäre Datenbank
   wird nach dem Import entfernt.
3. `npm run dev:verify:game-dump` prüft Katalogabdeckung, Titel/Aliasse, eindeutige
   IDs und Veröffentlichungsfelder ausschließlich innerhalb dieses Reports.
   Das ist eine Konsistenzprüfung, keine unabhängige Bestätigung durch Dritte.
4. `npm run dev:prepare:game-metadata` erzeugt
   [`ready.json`](../cache/game-metadata/ready.json), Schema 3. Eingaben sind
   ausschließlich Report, Katalog,
   [explizite Prüfentscheidungen](../src/data-game-dump-decisions.json) und
   [Plattformregel](../src/data-game-dump-policy.json).
5. `npm run dev:review:games` erzeugt eine lokale durchsuchbare HTML-Prüfübersicht.
6. `npm run generate:site` liest nur den fertigen Cache über
   [`game-metadata-ready.mjs`](../src/game-metadata-ready.mjs). Der Katalog bleibt
   maßgeblich für Spielnamen, Routen und Videozuordnungen.

Der Build benötigt keine externen Spielequellen und nicht den Eingabereport.
Hashes prüfen Integrität und den aktuellen Katalog/Entscheidungsstand.
Nach einer neuen Report-Ausgabe muss `dev:prepare:game-metadata` erneut laufen;
der Offline-Reader vergleicht bewusst nicht mit einem eventuell vorhandenen Report.
Bei fehlendem fertigen Cache meldet der Build eine Warnung und zeigt unbekannte
Daten. Beschädigte oder veraltete fertige Caches brechen den Build ab.

## Zuordnung und Grenzen

- Bereits bekannte Katalogplattformen bleiben erhalten; bei mehreren müssen
  alle durch denselben Kandidaten gedeckt sein.
- Nur bei offener Plattform gilt DOS → Amiga → C64 → NES → SNES.
  NES und SNES werden auch über ihre ausgeschriebenen Plattformnamen erkannt
  und nicht miteinander verwechselt.
- Mehrere Kandidaten auf der gewählten Plattform bleiben gesperrt; es gibt
  keinen Ausweichversuch auf die nächste Plattform.
- Titel/Aliasse und Edition müssen passen. Keine erratenen Fortsetzungen oder
  weggefallenen Untertitel. 18 ausdrücklich geprüfte Dump-Entscheidungen
  lösen bekannte Mehrdeutigkeiten auf.
- Derzeit sind alle 147 Spiele zugeordnet; keines bleibt unverifiziert.
  Darunter ist nun auch `Kabuki: Quantum Fighter` für NES.
- `David Crane's A Boy and His Blob: Trouble on Blobolonia` ist dem NES-Original
  statt dem späteren gleichnamigen Spiel zugeordnet. Die NES-Veröffentlichungen
  im Dump sind mit 1990 datiert; die Nutzerangabe 1989 überschreibt diese
  Quelljahre nicht. Airships: Conquer the Skies (2018) und Hyperspace Delivery
  Service (2019) sind ausdrücklich Windows zugeordnet.
- Erneut geprüfte Videobeschreibungen belegen Labyrinth für C64,
  Tom Clancy's EndWar für PSP und Akalabeth für Apple II.
  Explizite Plattformkorrekturen erhalten bestehende Katalog-IDs und Routen.
- Vollständige Dump-Titel sind als explizite Katalogaliase hinterlegt, etwa
  `Wing Commander II: Vengeance of the Kilrathi`,
  `X-COM: Terror from the Deep` und `They $tole a Million`.
  B.S.S. Jane Seymour verwendet den Umfang MS-DOS und Amiga.
  Need for Speed III: Hot Pursuit ist ausdrücklich Windows zugeordnet:
  Der Dump enthält dafür keine MS-DOS-Veröffentlichung.
- Entwicklerfirmen und Publisher werden aus den Veröffentlichungen der
  ausgewählten Plattform übernommen. 134 Spiele enthalten Entwicklerangaben.
  Bei Airships fehlen Entwickler und Publisher im Dump; diese bleiben unbekannt.
  Der aktuelle Dump enthält keine strukturierten Designer- oder
  Personen-Credits; diese werden nicht aus Beschreibungen abgeleitet.
- Firmenbezeichnungen werden beim SQL-Import und bei `dev:prepare:game-metadata`
  über eine explizite [Aliasliste](../src/game-company-names.mjs) vereinheitlicht.
  Die kürzesten vorhandenen Bezeichnungen sind `Blue Byte Studio GmbH`,
  `Cinemaware`, `Max Design GesMBH` und `Adventuresoft Ltd.`.
  Zusätzlich werden MicroProse (einschließlich MPS Labs), Interplay, Westwood,
  Gremlin, Sierra, Konami, Mindscape, Sun und Virgin als gemeinsame Anzeigenamen
  verwendet. Das ist eine redaktionelle Gruppierung, keine Gleichsetzung
  juristischer Firmenidentitäten. Andere Firmen bleiben unverändert.
  Abweichende Quellwerte bleiben in `sourceDeveloper` bzw. `sourcePublisher`
  erhalten; vorhandene Rohreports werden nicht überschrieben. Mehrfachnamen
  bleiben Mehrfachnamen, ihre enthaltenen bekannten Aliasse werden normalisiert.
  Die Aliasliste ist im fertigen Cache per Hash abgesichert; Änderungen erfordern
  ein erneutes `dev:prepare:game-metadata`. Personen-Credits sind nicht vorhanden.
- Ein pauschales Erscheinungsjahr ist nur für genau eine ausgewählte Plattform
  und ausschließlich datierte Veröffentlichungen verfügbar; dann das früheste
  Jahr. Bei mehreren Plattformen oder unvollständiger Datierung bleibt es
  unbekannt. Einzelne Veröffentlichungsjahre bleiben plattformgebunden sichtbar.
- Andere oder manuell recherchierte Jahresangaben sind kein Fallback.
- Explizite `additionalReleases` im Katalog ergänzen separat belegte Sammlungen,
  ohne diese zu Titelaliasen oder Hauptspiel-Kandidaten zu machen.
  Akalabeth bleibt Apple II (Dump-Jahr 1980); die Ultima Collection wird mit ihren
  DOS-Releases ab 1998 unter „Weitere Veröffentlichungen“ samt eigener Quelle gezeigt.
  Import, Report-Prüfung und fertiger Cache prüfen ID, Titel und Plattformbezug;
  der Cache-Hash sichert auch diese Katalogfreigaben. Sammlungen ändern weder
  das Hauptjahr noch die Plattformzählung der Startseite.

## Anzeige und Pflege

Spieleseiten zeigen ein kompaktes Profil mit Genre, Entwickler, Publisher und
Veröffentlichung sowie weiteren Veröffentlichungen in einem geschlossenen
Detailbereich. Quellenlinks sind Link-Icons. Länderunterschiede werden nur für
die Anzeige zusammengefasst; vollständig von reicheren Datensätzen abgedeckte
Leerangaben entfallen. Abweichende Jahre oder Firmen bleiben erhalten.
In Veröffentlichungstabellen steht jedes Land auf einer eigenen, ungetrennten
Zeile. Spaltenüberschriften und Jahreszahlen werden nicht mitten im Wort
umgebrochen; auf schmalen Bildschirmen ist die Tabelle horizontal scrollbar.

Neue Spielidentitäten werden im [Katalog](../src/data-games.mjs) gepflegt. Fehlen
sie im zurückbehaltenen Dump-Report, bleiben sie unverifiziert, bis ein neuer
lokaler Import passende Titel exportiert. Fehlende Originaldumps nicht
aus den reduzierten Exporten rekonstruieren. SQL-Dumps und temporäre
SQLite-Dateien nicht einchecken; `--delete-input` löscht die Eingabe erst nach
geprüftem JSON-/HTML-Export.
