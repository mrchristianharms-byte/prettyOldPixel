# ADR 0006: Spielemetadaten ausschließlich aus lokalem Games-Dump

- Status: angenommen.
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
  eingecheckt; `--delete-input` erlaubt die Löschung nach geprüftem Export.
  Neue Katalogspiele können einen erneuten lokalen Import erfordern.
- Cache-Reader prüft Schema, Integrität, Katalog und Freigaben; ein neuer Report
  muss ausdrücklich erneut zum fertigen Cache aufbereitet werden.

[Umsetzung, Befehle und Grenzen](../game-metadata-implementation.md)
