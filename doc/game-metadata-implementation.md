# Spielemetadaten: lokaler MobyGames-Dump

## Entscheidung und Datenfluss

Spielemetadaten einschließlich Erscheinungsjahren stammen ausschließlich aus dem
lokal exportierten MobyGames-Dump. Die früheren Wikimedia-, C64-Wiki-, HOL- und
GOG-Abrufe, manuelle Jahresliste und deren Caches sind entfernt. Zeitschriften-
und Videoquellen bleiben unverändert.

1. [`import-game-dump.mjs`](../src/import-game-dump.mjs) liest einen lokalen
   MariaDB-Dump als Daten, führt dessen SQL nicht aus und verwendet eine temporäre
   SQLite-Datenbank. Nur Kandidaten für Katalogspiele werden exportiert.
2. [`local-dump/report.json`](../cache/game-metadata/local-dump/report.json)
   enthält die zurückbehaltenen Titel, Aliasse, Genres und Veröffentlichungen.
   Der ursprüngliche SQL-Dump und die temporäre Datenbank sind gelöscht.
3. `npm run verify:game-dump` prüft Katalogabdeckung, Titel/Aliasse, eindeutige
   IDs und Veröffentlichungsfelder ausschließlich innerhalb dieses Reports.
   Das ist eine Konsistenzprüfung, keine unabhängige Bestätigung durch Dritte.
4. `npm run prepare:game-metadata` erzeugt
   [`ready.json`](../cache/game-metadata/ready.json), Schema 3. Eingaben sind
   ausschließlich Report, Katalog,
   [explizite Prüfentscheidungen](../src/data-game-dump-decisions.json) und
   [Plattformregel](../src/data-game-dump-policy.json).
5. `npm run review:games` erzeugt eine lokale durchsuchbare HTML-Prüfübersicht.
6. `npm run generate:site` liest nur den fertigen Cache über
   [`game-metadata-ready.mjs`](../src/game-metadata-ready.mjs). Der Katalog bleibt
   maßgeblich für Spielnamen, Routen und Videozuordnungen.

Der Build benötigt keine externen Spielequellen und nicht den Eingabereport.
Hashes prüfen Integrität und den aktuellen Katalog/Entscheidungsstand.
Nach einer neuen Report-Ausgabe muss `prepare:game-metadata` erneut laufen;
der Offline-Reader vergleicht bewusst nicht mit einem eventuell vorhandenen Report.
Bei fehlendem fertigen Cache meldet der Build eine Warnung und zeigt unbekannte
Daten. Beschädigte oder veraltete fertige Caches brechen den Build ab.

## Zuordnung und Grenzen

- Bereits bekannte Katalogplattformen bleiben erhalten; bei mehreren müssen
  alle durch denselben Kandidaten gedeckt sein.
- Nur bei offener Plattform gilt DOS, dann Amiga, dann C64.
- Mehrere Kandidaten auf der gewählten Plattform bleiben gesperrt; es gibt
  keinen Ausweichversuch auf die nächste Plattform.
- Titel/Aliasse und Edition müssen passen. Keine erratenen Fortsetzungen oder
  weggefallenen Untertitel. Neun zuvor ausdrücklich geprüfte Dump-Entscheidungen
  lösen bekannte Mehrdeutigkeiten auf.
- Derzeit sind 119 von 147 Spielen nutzbar; 28 bleiben unverifiziert.
- Alle Firmenbezeichnungen sind Quellenlabels, keine normalisierten
  Firmenidentitäten. Personen-Credits sind nicht vorhanden.
- Ein pauschales Erscheinungsjahr ist nur für genau eine ausgewählte Plattform
  und ausschließlich datierte Veröffentlichungen verfügbar; dann das früheste
  Jahr. Bei mehreren Plattformen oder unvollständiger Datierung bleibt es
  unbekannt. Einzelne Veröffentlichungsjahre bleiben plattformgebunden sichtbar.
- Andere oder manuell recherchierte Jahresangaben sind kein Fallback.

## Anzeige und Pflege

Spieleseiten zeigen ein kompaktes Profil mit Genre, Entwickler, Publisher und
Veröffentlichung sowie weiteren Veröffentlichungen in einem geschlossenen
Detailbereich. Quellenlinks sind Link-Icons. Länderunterschiede werden nur für
die Anzeige zusammengefasst; vollständig von reicheren Datensätzen abgedeckte
Leerangaben entfallen. Abweichende Jahre oder Firmen bleiben erhalten.

Neue Spielidentitäten werden im [Katalog](../src/data-games.mjs) gepflegt. Fehlen
sie im zurückbehaltenen Dump-Report, bleiben sie unverifiziert, bis ein neuer
lokaler Import passende Titel exportiert. Den fehlenden Originaldump nicht
aus den reduzierten Exporten rekonstruieren. Neue SQL-Dumps und temporäre
SQLite-Dateien nicht einchecken; `--delete-input` löscht die Eingabe erst nach
geprüftem JSON-/HTML-Export.
