# ADR 0006: Spielemetadaten ausschließlich aus lokalem Games-Dump

- Status: Abgeschlossen.
- Regelstand: Es gelten die [Vorrang- und Abschlussregeln](README.md).
  Der Steam-Nachtrag unten ersetzt die ausschließliche Dump-Regel nur für die
  dort ausdrücklich belegten Firmenangaben von Airships. ADR 0008 vereinheitlicht
  den Titelindex; ADR 0015 erweitert Katalog und Metadatenimport.
- Umfang: Spielmetadaten einschließlich Erscheinungsjahren; keine Änderung an
  Video-, Transkript- oder Zeitschriftenquellen.

## Kontext

Ein geprüfter, auf Katalogkandidaten reduzierter Export eines lokalen
Games-Dumps ist vorhanden. Dieser dient als alleinige Quelle für die
Spielmetadaten.

## Entscheidung

Der zurückbehaltene Dump-Report ist die einzige Faktenquelle. Offline-Prüfung
und Cache-Aufbereitung sind getrennt vom Website-Build. Der fertige Cache
`cache/game-metadata/ready.json` enthält ausschließlich zugeordnete,
plattformgebundene Dump-Angaben sowie explizit gesperrte Spielidentitäten.

Bekannte Katalogplattformen bleiben verbindlich. Bei offener Plattform gilt
DOS, Amiga, C64, NES, SNES, jeweils nur bei eindeutiger Zuordnung. Mehrdeutigkeiten,
abweichende Editionen und nicht belegte Plattformen bleiben unverifiziert;
vorhandene explizite Dump-Prüfentscheidungen bleiben erhalten.

Jahre stammen ebenfalls nur aus dem Dump. Ein pauschales Jahr setzt genau eine
Plattform und vollständig datierte Veröffentlichungen voraus. Sonst bleibt das
Jahr unbekannt; datierte einzelne Veröffentlichungen bleiben als solche sichtbar.

## Folgen

- Reproduzierbarer Offline-Build ohne Spiele-Netzwerkzugriff oder Browserpaket.
- Keine unabhängige Mehrquellenbestätigung; Quellenlabels und Plattformumfang
  bleiben nachvollziehbar.
- Nicht eindeutig zugeordnete Spiele behalten ihre Seiten und Videos, aber
  erhalten keine spekulativen Metadaten.
- Der Originaldump bleibt standardmäßig lokal erhalten und wird nicht
  eingecheckt. Seit dem gemeinsamen Titelindex (ADR 0008) liest nur
  `dev:build:game-title-index` den Dump; der Import nutzt den Index.
  `--delete-input` beim Indexbau erlaubt die Löschung nach geprüftem Export.
  Neue Katalogspiele können einen erneuten lokalen Import erfordern.
  Der Index enthält nur Spiele mit Erstjahr bis 2005 (`--max-year`);
  neuere Katalogspiele erhalten ihre Dump-Daten aus der handgepflegten Datei
  `src/data/data-game-dump-manual.json` (Kandidaten mit `manual: true`), sonst
  blieben sie `blocked`.
- Cache-Reader prüft Schema, Integrität, Katalog und Freigaben; ein neuer Report
  muss ausdrücklich erneut zum fertigen Cache aufbereitet werden.

[Umsetzung, Befehle und Grenzen](../game-metadata-implementation.md)

## Ergänzung vom 2026-11-01: belegte Firmenangaben für Airships

Ausdrücklich freigegeben ist eine Ausnahme für „Airships: Conquer the Skies“:
Die [Steam-Produktseite](https://store.steampowered.com/app/342560/Airships_Conquer_the_Skies/)
nennt David Stark als Entwickler und Publisher. Diese Angaben ergänzen die
fehlenden Dump-Werte in den manuell gepflegten Veröffentlichungen.
Valve Corporation ist hier die Betreiberin von Steam, nicht der Publisher.

`companySource` hält URL, Quellenlabel und Prüfdatum fest. Import, Report-Prüfung
und fertiger Cache übernehmen und validieren diese Quelle; die Datenqualität
wird als `supplemented-source` statt `single-source` gekennzeichnet.
Website, App, Markdown und lokale Prüfübersichten weisen die Quelle für
Entwickler und Publisher separat aus. MobyGames bleibt Quelle für Identität,
Plattform, Genre und Erscheinungsjahr. Es gibt keinen automatischen Steam-Abruf
oder allgemeinen Fallback auf externe Quellen.
