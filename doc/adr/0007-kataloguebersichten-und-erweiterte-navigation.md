# ADR 0007: Katalogübersichten und erweiterte Navigation

**Status:** Angenommen; nachträgliche Dokumentation der bestehenden Umsetzung
**Datum:** 2026-10-22
**Entscheider:** Christian Harms
**Kontext:** Bessere Orientierung in den Zeitschriften- und Spielekatalogen.
**Grundlagen:** [ADR 0003: Seitenstruktur und Inhaltszuordnung](0003-seitenstruktur-und-inhaltszuordnung.md),
[ADR 0002: Statische Seiten, SEO und Performance](0002-statische-seiten-seo-und-performance.md),
[ADR 0005: Wiederverwendbare Widgets und Komponenten](0005-wiederverwendbare-widgets-und-komponenten.md)

## Kontext

Die in ADR 0003 festgelegte Zuordnung von Videos zu Zeitschriften, Ausgaben
und Spielen bleibt die Grundlage der Website. Eine reine Liste von Videos
oder Textlinks reicht jedoch für die Navigation durch größere Bestände nicht
aus: Besucher suchen wahlweise nach einer Zeitschrift, einem Gast, einer
konkreten Heftausgabe oder einem Spiel mit bestimmten Eigenschaften.

Die Übersichtsseiten erhalten deshalb eine eigene, auf die jeweilige
Suchaufgabe abgestimmte Struktur. Sie sind keine weiteren Videodetailseiten:
Katalogeinträge mit Statistikwerten erschließen die Inhalte; Kalender und
Spielestatistik ergänzen diese Einstiege um direkte Auswahlmöglichkeiten.

Diese ADR hält die bereits umgesetzte Erweiterung nachträglich fest. Sie
ergänzt ADR 0003, ohne deren Inhaltszuordnung oder bestehende Detailpfade
zu ersetzen.

## Entscheidung

### 1. Zeitschriftenindex: Katalog und alternativer Einstieg nach Gast

`/zeitschriften/` besteht aus zwei aufeinanderfolgenden Bereichen:

1. **Zeitschriftenkatalog:** Pro Zeitschrift erscheint eine alphabetisch
   einsortierte Kachel mit Link zur Zeitschriftenübersicht. Die Statistikwerte
   nennen bekannte Jahrgänge, Videoanzahl und gesamte Videolaufzeit.
   Fehlende Laufzeiten werden als unvollständige Summe kenntlich gemacht.
2. **„Blätterabend mit Gast“:** Darunter folgt eine alphabetische Kachelliste
   der Gäste. Jede Kachel nennt Videoanzahl und Anzahl bekannter Ausgaben
   beziehungsweise eine ungeklärte Ausgabe. Sie führt zu
   `/zeitschriften/gaeste/<gast>/`, wo die Zeitschriftenvideos dieses Gasts
   nach Jahrgang und Ausgabe zusammengefasst sind.

Der Gästebereich ist damit eine alternative Erschließung derselben Videos,
kein zweiter unabhängiger Videobestand. Gäste werden aus den vorhandenen
Videotiteln ermittelt und normalisiert; bestätigte Kanalverweise ergänzen
die Anzeige. Die Gruppierung ersetzt keine bestätigte Heftzuordnung.

Die Bereiche werden in dieser Reihenfolge gemeinsam paginiert, sobald mehr
als 60 Katalogeinträge vorhanden sind. Der Gästebereich kann dann auf einer
Folgeseite beginnen. Auch Gästeseiten verwenden die bestehende Paginierung.
In der Seitenüberschrift „Blätterabend – Zeitschriften und Gäste“ ist
„Gäste“ als Sprunglink eingebaut, sofern der Bereich vorhanden ist.
Der Link führt zum Beginn des Gästebereichs, auch wenn dieser auf einer
anderen Katalogseite liegt. „Zeitschriften“ bleibt unverlinkter Text.

### 2. Zeitschriftenübersicht: Kalender bei mehr als 30 Videos

Auf `/zeitschriften/<zeitschrift>/` bleibt die nach Jahrgang, Ausgabe und
Videoteil gegliederte Liste erhalten. Für Zeitschriften mit **mehr als 30
unterschiedlichen Videos** ersetzt ein kompakter Kalender die einfache
Navigation „Jahr + Videoanzahl“.

Entscheidend ist die Videoanzahl, nicht die Zahl unterschiedlicher Hefte.
Mehrere Videoteile eines Hefts zählen jeweils als Video; dieselbe Video-ID
wird für die Schwelle nur einmal gezählt. Bei genau 30 Videos bleibt die
bisherige Jahrgangsnavigation bestehen.

Der Kalender hat folgende Struktur:

- Eine Spalte pro bekanntem Heftjahr; die Jahreszahl ist eine Sprungmarke
  `#jahr-<jahr>` zum Jahrgangsabschnitt auf derselben Zeitschriftenseite,
  nicht auf ein externes Archiv.
- Zwölf Zeilen für die Ausgaben 1 bis 12.
- In belegten Zellen steht die Ausgabennummer als Link auf die Ausgabenseite
  mit dem Fragment des ersten zugehörigen Videos.
- Doppelausgaben stehen in der Zeile ihres ersten Monats, etwa `4+5` in
  Zeile 4. Fehlt ein Monat, kann eine bekannte Heftnummer von 1 bis 12
  die Zeilenposition bestimmen.
- Leere Zellen kennzeichnen fehlende zugeordnete Ausgaben. Sonderhefte und
  nicht in das Raster einzuordnende Ausgaben bleiben in den nachfolgenden
  Listen sichtbar; der Kalender erfindet keine Zuordnung.

Die Darstellung ist bewusst klein: inhaltsabhängige Breite, geringe
Zellabstände und ein umlaufender Rahmen. Links haben mindestens 24 Pixel
große Klickflächen. Unter 768 Pixel Bildschirmbreite ersetzt eine Liste
der Jahrgangslinks die Tabelle; ihre Links sind mindestens 44 Pixel hoch.
Beide Darstellungen funktionieren ohne JavaScript.

### 3. Spieleindex: paginierter Katalog mit Statistikwerten

`/spiele/` bleibt der primäre Einstieg in den Spielebestand. Alle bestätigten
Spiele erscheinen alphabetisch als Kacheln, verteilt auf echte HTML-Seiten
mit jeweils höchstens 60 Einträgen. Folgeseiten liegen unter
`/spiele/seite/<nummer>/`.

Eine Kachel verlinkt auf die Spieleseite und zeigt:

- Plattformen,
- Erscheinungsjahr beziehungsweise „unbekannt“,
- Videoanzahl,
- gesamte Videolaufzeit beziehungsweise eine gekennzeichnete Teilsumme.

Zeitschriften- und Spielekatalog verwenden dasselbe Kachel-Widget, aber
bereichsspezifische Statistikwerte. Die Kachelansicht dient dem Stöbern und
bleibt vollständig ohne JavaScript navigierbar.

### 4. Zusätzliche Spieleübersicht: vollständige, interaktive Tabelle

Der Spieleindex verlinkt zusätzlich auf `/spiele/uebersicht/`
(„Alle Spiele als Tabelle“). Diese Seite ergänzt die paginierte Kachelansicht,
ersetzt sie aber nicht. Sie enthält **alle Spiele in einer nicht paginierten
Tabelle**, damit Sortierung und Filter den gesamten Bestand erfassen.
Auf sämtlichen Spiele-Katalogseiten, einschließlich gefilterter Kataloge
und Folgeseiten, macht „Spiele suchen und filtern“ diesen Zugang sichtbar.

Die Spalten verbinden Statistikwerte, Spielemetadaten und Navigation:

- „Erstvideo“: Jahr des ersten veröffentlichten Videos zum Spiel,
- Titel mit Link zur Spieleseite,
- „Release“: Erscheinungsjahr des Spiels,
- Plattformen und Genres,
- verlinkte Videovorschau,
- „Länge“: summierte Videolaufzeit (keine geschätzte Spieldauer),
- vorhandene Links zu Playlists, MobyGames und Abschlussgespräch.

Die Standardreihenfolge richtet sich nach der Veröffentlichung des ersten
Videos je Spiel, neueste zuerst. Clientseitiges JavaScript ermöglicht
auf- und absteigende Sortierung nach Videoveröffentlichung, Titel,
Erscheinungsjahr und Videolaufzeit. Fehlende Sortierwerte stehen am Ende.
Eine Titelsuche berücksichtigt Teilzeichenfolgen ohne Unterscheidung von
Groß- und Kleinschreibung. System und Genre lassen sich damit kombiniert
filtern, einschließlich ausdrücklich unbekannter Werte. Der Icon-Button „↺“
(„Filter zurücksetzen“) leert alle drei Filter, behält aber die gewählte Sortierung bei.
Trefferzahl, aktive Filter und Sortierung werden angezeigt; ein leerer
Trefferbestand erhält eine eigene Meldung. Ein zusätzlicher Erklärtext
entfällt zugunsten einer kompakten Darstellung.

Alle Zeilen, Metadaten und Links entstehen bereits beim statischen Build.
JavaScript sortiert und filtert nur das vorhandene HTML; es lädt keine
zusätzlichen Daten nach. Ohne JavaScript bleibt die vollständige Tabelle
in ihrer Standardreihenfolge lesbar, interaktive Steuerelemente bleiben
ausgeblendet. Spielemetadaten folgen unverändert
[ADR 0006](0006-spielemetadaten-aus-lokalem-games-dump.md).

## Folgen und Abgrenzung

- Zeitschrift, Gast, Heftausgabe und Spieleigenschaften sind gleichberechtigte
  Navigationszugänge, aber keine neuen Quellen für Inhaltszuordnungen.
- Die Kachelansichten bieten einen übersichtlichen Einstieg; Kalender und
  Tabelle verkürzen gezielte Suchwege.
- Paginierung begrenzt die Größe der normalen Katalogseiten. Die bewusst
  vollständige Spieltabelle ist eine Ausnahme und erzeugt mehr HTML auf
  einer einzelnen Seite.
- Unbekannte Metadaten bleiben sichtbar und werden nicht aus Uploadjahren,
  Titelfragmenten oder Nachbareinträgen geschätzt.
- Echte relative Links, statisches HTML, lokale Styles und progressive
  JavaScript-Erweiterung bewahren die Grundsätze aus ADR 0002.

## Umsetzung

- [Seitengenerierung und Katalogstrukturen](../../src/site-generation/site-render.mjs)
- [Normalisierung, Ausgabezuordnung und Statistikgrundlagen](../../src/content-data/content-data.mjs)
- [Gemeinsames Kachel-Widget](../../src/site-generation/widget/catalog-grid.mjs)
- [Spieltabelle](../../src/site-generation/widget/game-table.mjs)
- [Clientseitige Sortierung und Filter](../../src/site-generation/game-table.js)
- [Kalender- und Katalogstyles](../../src/site-generation/site.css)
