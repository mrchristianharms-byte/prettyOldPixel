# ADR 0006: Spielemetadaten ausschließlich aus lokalem MobyGames-Dump

- Status: angenommen; ersetzt die frühere Mehrquellenentscheidung dieser ADR.
- Umfang: Spielmetadaten einschließlich Erscheinungsjahren; keine Änderung an
  Video-, Transkript- oder Zeitschriftenquellen.

## Kontext

Die zunächst erprobten Wikimedia-, C64-Wiki-, HOL- und GOG-Adapter benötigen
unterschiedliche Identitätsprüfungen und zusätzliche Caches. Inzwischen ist ein
geprüfter, auf Katalogkandidaten reduzierter Export eines lokalen MobyGames-Dumps
vorhanden. Der Nutzer möchte ausschließlich diese Quelle verwenden und die
anderen Spielequellen einschließlich ihrer Skripte und Caches entfernen.

## Entscheidung

Der zurückbehaltene Dump-Report ist die einzige Faktenquelle. Offline-Prüfung
und Cache-Aufbereitung sind getrennt vom Website-Build. Der fertige Cache
`cache/game-metadata/ready.json` enthält ausschließlich zugeordnete,
plattformgebundene Dump-Angaben sowie explizit gesperrte Spielidentitäten.

Bekannte Katalogplattformen bleiben verbindlich. Bei offener Plattform gilt
DOS, Amiga, C64, jeweils nur bei eindeutiger Zuordnung. Mehrdeutigkeiten,
abweichende Editionen und nicht belegte Plattformen bleiben unverifiziert;
vorhandene explizite Dump-Prüfentscheidungen bleiben erhalten.

Jahre stammen ebenfalls nur aus dem Dump. Ein pauschales Jahr setzt genau eine
Plattform und vollständig datierte Veröffentlichungen voraus. Sonst bleibt das
Jahr unbekannt; datierte einzelne Veröffentlichungen bleiben als solche sichtbar.
Keine Rückfälle auf manuelle Jahreslisten oder ehemalige externe Quellen.

## Folgen

- Reproduzierbarer Offline-Build ohne Spiele-Netzwerkzugriff oder Browserpaket.
- Keine unabhängige Mehrquellenbestätigung; Quellenlabels und Plattformumfang
  bleiben nachvollziehbar.
- Nicht eindeutig zugeordnete Spiele behalten ihre Seiten und Videos, aber
  erhalten keine spekulativen Metadaten.
- Der Originaldump wurde nach geprüftem Export gelöscht und wird nicht
  eingecheckt. Neue Katalogspiele können einen erneuten lokalen Import erfordern.
- Cache-Reader prüft Schema, Integrität, Katalog und Freigaben; ein neuer Report
  muss ausdrücklich erneut zum fertigen Cache aufbereitet werden.

[Umsetzung, Befehle und Grenzen](../game-metadata-implementation.md)

Der Dateiname bleibt für bestehende Verweise erhalten; der frühere
Mehrquellenansatz ist nicht mehr aktiv.
