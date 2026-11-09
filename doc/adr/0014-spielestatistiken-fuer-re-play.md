# ADR 0014: Spielestatistiken für re.play

- Status: Abgeschlossen.
- Regelstand: Es gelten die [Vorrang- und Abschlussregeln](README.md).
  Die Statistik einschließlich des Entwicklerdiagramms wird beim Build aus
  dem aktuellen Inhaltsmodell erzeugt. ADR 0015 erweitert diese Grundgesamtheit
  um bestätigte re.consider-Einzelspiele. Die folgenden Zahlen sind historische
  Snapshots und keine festgeschriebenen Produktionswerte; die Abnahmeliste
  dokumentiert Prüfkriterien, keine offenen Abschlussbedingungen.
- Datum: 2026-11-01.
- Ergänzt [ADR 0006](0006-spielemetadaten-aus-lokalem-games-dump.md),
  [ADR 0007](0007-kataloguebersichten-und-erweiterte-navigation.md) und
  [ADR 0011](0011-agentenlesbare-inhalte-und-maschinenlesbare-zugaenge.md).
- Umfang: zusätzliche Statistikseite unter re.play mit Erscheinungsjahren,
  Genres, Publishern und belegten Gemeinsamkeiten zwischen Spielen.

## Kontext

Die re.play-Übersicht bietet Spielelisten und gemeinsame Metadatenfilter.
Eine eigene Seite soll zeigen, aus welchen Erscheinungsjahren die gespielten
Titel stammen und welche Genres und Publisher im Katalog besonders häufig
vertreten sind. Eine zeitliche Übersicht soll zusätzlich als SVG verfügbar sein.

„Gespielt“ bezeichnet hier ein Spiel mit einer veröffentlichten Spieleseite
nach den bestehenden Katalogregeln. Das belegt weder einen vollständigen
Durchlauf noch einen Abschluss. Wiederholte Durchläufe, Folgen, Playlists
und Erinnerungsbeiträge dürfen die Anzahl der Spiele nicht erhöhen.
Bloße Erwähnungen in Blätterabenden gehören nicht zur Grundgesamtheit.

## Untersuchung des aktuellen Bestands

### Datenbasis und Reproduzierbarkeit

Untersucht wurde das lokale öffentliche Inhaltsmodell aus
`loadContentData("./cache", { now })`, mit
`now = 2026-11-01T13:41:53.295+01:00`. Dieser feste Zeitpunkt berücksichtigt
auch die bestehende Regel für neue Einzelvideo-Reihen und schließt zukünftige
Veröffentlichungen aus. Die Ergebnisse sind ein lokaler Datenstand, keine
Abfrage der live veröffentlichten Website und keine Besucherstatistik.

Quellen und vorhandene Regeln:

- [Inhaltsmodell](../../src/content-data/content-data.mjs):
  Grundgesamtheit `model.games`, jeweils einmal je `game.id`.
- [Spielzuordnungen](../../src/data/data-games.mjs):
  bestätigte Playlists, Zusatzvideos und katalogisierte Plattformen.
- [Freigegebene Metadaten](../../src/fetch-game/game-metadata-ready.mjs):
  `cache/game-metadata/ready.json`, einschließlich Plattformumfang und Quellen.
- [Metadatenfilter](../../src/content-data/game-filters.mjs):
  Genres sowie Publisher und Entwickler aus den ausgewählten Veröffentlichungen;
  Dubletten je Spiel und Merkmalswert werden entfernt.

SHA-256 des untersuchten Cachebestands:

| Datei | SHA-256 |
|---|---|
| `cache/game-metadata/ready.json` | `a53238377f6fec4e14b1dd45b4bf1c9cff0d7511f3a630bba018f935d8cfa6c8` |
| `cache/youtube-videos.json` | `0842a937379d9c2987db629ecc3850dfe95c1e524f349eba16b8bd25f6a7bf54` |
| `cache/youtube-playlists.json` | `791f833d390b1073595059e99c941e3e6ea52b43222984706b9365d83fb9a34c` |

Diese Prüfsummen identifizieren die untersuchten Dateien; für eine vollständige
Wiederholung werden außerdem derselbe Quellstand und dessen Zuordnungen benötigt.

### Erscheinungsjahre

Der Bestand enthält **148 Spiele**. Alle 148 haben freigegebene Metadaten
(`ready`) und ein bekanntes Erscheinungsjahr. Die Jahre reichen von 1980
bis 2019. Am häufigsten sind **1992 und 1994 mit jeweils 20 Spielen**.

| Erscheinungsjahr | Spiele | Erscheinungsjahr | Spiele |
|---|---:|---|---:|
| 1980 | 1 | 1991 | 15 |
| 1982 | 1 | 1992 | 20 |
| 1983 | 2 | 1993 | 14 |
| 1984 | 5 | 1994 | 20 |
| 1985 | 9 | 1995 | 9 |
| 1986 | 8 | 1996 | 5 |
| 1987 | 3 | 1998 | 1 |
| 1988 | 5 | 2008 | 1 |
| 1989 | 11 | 2018 | 1 |
| 1990 | 16 | 2019 | 1 |

Alle übrigen Jahre innerhalb von 1980 bis 2019 haben in diesem Bestand
null Spiele. Die Summe beträgt 148, „Erscheinungsjahr unbekannt“ ist derzeit 0.

Das Jahr ist das bereits verwendete `game.releaseYear`: das früheste belegte
Jahr im freigegebenen Plattformumfang, nicht zwingend die weltweite
Erstveröffentlichung auf irgendeiner Plattform. Es darf nicht durch ein
anderes Jahr aus zusätzlichen Editionen oder Veröffentlichungen ersetzt werden.
Bei mehreren Plattformen oder unvollständigen Datierungen gelten weiterhin
die bestehenden Freigaberegeln aus ADR 0006.

Die neueren Werte sind kein Anlass, Titel auszuschließen:
„Tom Clancy's EndWar“ ist im Katalog für PSP mit 2008 zugeordnet,
„Airships: Conquer the Skies“ für Windows mit 2018 und
„Hyperspace Delivery Service“ für Windows mit 2019.
Eine künstliche Retro-Jahresgrenze würde den aktuellen Katalog verfälschen.

### Welche Zuordnung zeigt die meisten Gemeinsamkeiten?

„Zusammenhang“ bedeutet hier eine gemeinsame belegte Metadatenzuordnung,
keine statistisch nachgewiesene Abhängigkeit oder Aussage über die gesamte
Spielebranche. Für den Vergleich werden zwei Kennzahlen getrennt ermittelt:

1. **Verbundene Spiele:** Titel, die mindestens einen Merkmalswert mit
   mindestens einem anderen Titel teilen.
2. **Unterschiedliche Spielpaare:** ungeordnete Paare verschiedener Spiel-IDs
   mit mindestens einem gemeinsamen Wert innerhalb der jeweiligen Dimension.
   Ein Paar zählt je Dimension nur einmal, auch bei mehreren gemeinsamen Werten.

Bei 148 Spielen gibt es insgesamt `148 × 147 / 2 = 10.878` mögliche Paare.
Die Dimensionen überschneiden sich; ihre Paarzahlen dürfen nicht addiert werden.

| Dimension | Spiele mit Angaben | Unterschiedliche Werte | Werte mit mindestens 2 Spielen | Verbundene Spiele | Unterschiedliche Spielpaare |
|---|---:|---:|---:|---:|---:|
| Genre | 148 | 9 | 8 | 148 | 4.031 |
| Publisher | 147 | 110 | 35 | 121 | 669 |
| Entwickler, zum Vergleich | 135 | 88 | 19 | 70 | 193 |
| Plattform, zum Vergleich | 148 | 10 | 5 | 144 | 4.609 |

**Unter den angefragten Dimensionen verbindet Genre die meisten Spiele.**
Alle 148 Titel teilen mindestens ein Genre mit einem anderen Titel.
Über alle untersuchten Dimensionen erzeugt Plattform die meisten Spielpaare,
vor allem durch die große MS-DOS-Gruppe mit 92 Spielen. Genre erreicht
dagegen die größere Abdeckung verbundener Titel.

Große Gruppen und grobe Kategorien erzeugen zwangsläufig viele Paare.
Die Zahlen sind daher ein Maß für die Vernetzung dieses Katalogs, kein
Beleg dafür, dass Genre oder Plattform die „bessere“ Klassifikation wäre.

### Häufigste Genres und Publisher

Die Genres ergeben 199 Zuordnungen auf 148 Spiele; mehrere Genres je Spiel
sind erlaubt. Publisher ergeben 253 Zuordnungen auf 147 Spiele mit Angaben.
Summen und Prozentwerte über mehrere Kategorien sind deshalb nicht disjunkt.

| Genre | Spiele |
|---|---:|
| Action | 63 |
| Simulation | 48 |
| Strategie | 43 |
| Role-playing (RPG) | 19 |
| Adventure | 17 |
| Racing / Driving | 4 |
| Compilation | 2 |
| Sports | 2 |
| Puzzle | 1 |

| Publisher, Top 10 | Spiele |
|---|---:|
| MicroProse | 23 |
| U.S. Gold Ltd. | 13 |
| Electronic Arts, Inc. | 12 |
| Virgin | 11 |
| Softgold Computerspiele GmbH | 9 |
| Capcom Co., Ltd. | 8 |
| Ocean Software Ltd. | 8 |
| Activision, Inc. | 7 |
| Nintendo Co., Ltd. | 7 |
| Strategic Simulations, Inc. | 7 |

Bei „Airships: Conquer the Skies“ fehlt der Publisher im vorhandenen
freigegebenen Datensatz. Das Spiel bleibt in der Gesamtzahl und erscheint
für diese Dimension unter „Publisher unbekannt“. Ein Publisher wird weder
aus dem Entwickler noch aus vermuteter Selbstveröffentlichung abgeleitet.
Für die Statistik ist keine neue Quelle erforderlich; vollständige
Publisherabdeckung würde eine gesonderte, belegte Datenpflege voraussetzen.

Publishernamen entsprechen den vorhandenen normalisierten Cachewerten.
Regionale Firmen und kombinierte Werte wie
„Electronic Arts, Inc., ORIGIN Systems, Inc.“ bleiben eigenständige Werte.
Kommas sind kein sicherer Trenner für Firmennamen. Kein zusätzliches
Zusammenführen von Konzernen, Labels, Tochtergesellschaften oder Schreibweisen
allein für die Statistik; solche Änderungen gehören in die gemeinsame,
quellenbelegte Metadatenaufbereitung.

### Gemeinsamkeiten zwischen Genre und Publisher

Für jede Kombination wird die Schnittmenge ihrer Spiel-IDs gezählt.
Die stärkste Kombination nach absoluter Anzahl ist
**Simulation × MicroProse mit 15 Spielen**.

| Genre | Publisher | Gemeinsame Spiele | Anteil an den Spielen dieses Publishers |
|---|---|---:|---:|
| Simulation | MicroProse | 15 | 15 von 23 |
| Strategie | MicroProse | 10 | 10 von 23 |
| Action | Capcom Co., Ltd. | 8 | 8 von 8 |
| Action | U.S. Gold Ltd. | 7 | 7 von 13 |
| Action | Nintendo Co., Ltd. | 6 | 6 von 7 |
| Simulation | U.S. Gold Ltd. | 6 | 6 von 13 |

„Simulation × MicroProse“ umfasst ATAC: The Secret War Against Drugs,
Dogfight / Air Duel, Elite Plus, F-19 Stealth Fighter, F15 Strike Eagle II,
Gunship 2000, Knights of the Sky, Lightspeed, M1 Tank Platoon,
Microprose Formula One Grand Prix, Red Storm Rising, Sid Meier's Covert Action,
Silent Service, Task Force 1942 und The Ancient Art of War in the Skies.

Eine große Schnittmenge und ein hoher Anteil sind unterschiedliche Aussagen:
MicroProse/Simulation führt nach Anzahl, Capcom/Action umfasst alle acht
hier katalogisierten Capcom-Spiele. Das ist keine Aussage über sämtliche
Veröffentlichungen dieser Publisher. Mehrfachgenres können denselben Titel
in mehreren Kombinationen erscheinen lassen.

## Entscheidung

Nachtrag vom 2026-11-01: Nach dieser Bestandsauswertung wurden Entwickler und
Publisher für Airships mit „David Stark“ ergänzt, belegt durch Steam und
ausdrücklich freigegeben in der Ergänzung zu ADR 0006. Die oben angegebenen
Prüfsummen und Kennzahlen beschreiben den Stand vor dieser Ergänzung.
Im ergänzten Bestand sind 148 Spiele mit Publisher belegt, es gibt
111 Publisherwerte und 254 Publisherzuordnungen. David Stark ist eine
Einzelzuordnung; die gemeinsamen Spielpaare und Top-Kombinationen ändern sich
dadurch nicht. Die geplante Seite verwendet immer den aktuellen Inhaltsstand.

### 1. Eigene Seite unter re.play

- Route `spiele/statistik/`, Titel „re.play – Spielestatistiken“.
- Einstieg über einen Textlink „Spielestatistiken“ in der re.play-Übersicht;
  keine Verlängerung der Hauptnavigation.
- Oben auf der Statistikseite, vor den Auswertungen, steht eine kompakte
  Seitennavigation zu „re.play“ (`spiele/`) und „Alle Spiele als Tabelle“
  (`spiele/uebersicht/`). Die anderen Spieleübersichten erhalten dort ebenfalls
  einen Link zu „Spielestatistiken“. Die jeweils aktuelle Seite ist erkennbar;
  Hauptnavigation und Breadcrumbs bleiben zusätzlich erhalten.
- Die Seite dient vor allem der Exploration: kompakte Übersichten führen
  zu weiteren Spielen und bestehenden thematischen Listen, statt sämtliche
  Metadatenzuordnungen dauerhaft auf einer langen Seite auszubreiten.
- Abschnitte: Erscheinungsjahre, Genres, Publisher,
  „Gemeinsamkeiten zwischen Genre und Publisher“.
- Gemeinsame Aggregation im Inhaltsdatenbereich, Darstellung durch den
  Seitengenerator und wiederverwendbare Diagramm-Widgets.
- Bestehende Widgets unter `src/site-generation/widget/` werden wiederverwendet:
  `metadata.mjs` für Kennzahlen und `catalog-grid.mjs`, sofern Spiele als Kacheln
  dargestellt werden. `game-table.mjs` bleibt die Komponente der bestehenden
  vollständigen Spieleübersicht; keine zweite Implementierung ihrer Tabelle.
  Gemeinsame Link-, Escaping- und Mengenformatierungshelfer bleiben verbindlich.
- Die obere Seitennavigation übernimmt die bestehenden Spiele-Querverweise
  und deren Gestaltung. `navigation.mjs` ist derzeit ausschließlich die
  Hauptnavigation mit mobilem Menü; diese darf nicht unverändert als zweite
  Hauptnavigation eingesetzt werden. Benötigte gemeinsame Seitennavigation
  wird dort als eigene Widget-Funktion ergänzt, nicht je Seite dupliziert.
  Neue Widgets entstehen nur für die bisher nicht vorhandene Statistik-SVG-
  Darstellung; das vorhandene Prozessdiagramm wird nicht zweckentfremdet.
- Website und Offline-App verwenden dieselben Zahlen und Zählregeln.
  Canonical, Breadcrumbs, Sitemap, Markdown und Agenten-Einstiege werden
  beim Umsetzen mitgeführt; ein vorhandener allgemeiner Seitenkatalog
  berücksichtigt die neue Seite. Kein neuer eigenständiger API-Endpunkt nötig.
- Die Zahlen entstehen beim Build aus `model.games`, ohne Browsermessung,
  Live-Abfragen, neue Datenquellen oder zusätzliche Paketabhängigkeiten.
  Der Stand dieser ADR wird nicht als statische Produktionszahl festgeschrieben.

### 2. Zeitliche Übersicht als verlinktes SVG

- Das SVG zeigt ausschließlich die Jahre 1980 bis 1999, und davon nur Jahre
  mit mindestens zwei Spielen. Einzeljahre, Jahre außerhalb des Zeitraums und
  Jahre ohne Spiele erhalten keine Balken. Die vollständige Jahresaggregation
  und Gesamtzahl bleiben unverändert; „Erscheinungsjahr unbekannt“ steht
  separat außerhalb der Zeitachse.
- Jahreszahlen und Balken für dargestellte Jahre verlinken direkt auf die
  gefilterte Spieleübersicht unter `spiele/jahr/<jahr>/`.
- Die Zeitachse umfasst fest 1980 bis 1999; Jahresabstände bleiben proportional,
  ausgelassene Jahre werden nicht zusammengeschoben oder als Nullwerte
  ausgegeben. Die Y-Achse beginnt bei 0. Keine logarithmische Achse.
- Das SVG nutzt `viewBox`, lesbare Achsen, ganzzahlige Mengen,
  zugänglichen Titel und Beschreibung sowie ausreichende Kontraste für
  helle und dunkle Darstellung. Keine Animation und kein Diagramm-JavaScript.
  Die Jahreslabels bleiben auf schmalen Bildschirmen lesbar und das Diagramm
  darf keinen Seitenüberlauf verursachen.
- Ohne Jahre mit mindestens zwei Spielen zwischen 1980 und 1999 zeigt das
  Diagramm eine ausdrückliche Erklärung statt leerer Balken. Die bisherige
  Jahrestabelle entfällt.

### 3. Genre- und Publisherstatistik

- Alle Werte einschließlich Einzelzuordnungen und unbekannter Angaben
  werden erfasst. Der bestehende Filterhelfer allein reicht nicht:
  Er blendet Werte mit weniger als zwei Spielen absichtlich aus.
- Je Spiel und normalisiertem Wert einmal zählen, auch bei mehreren
  regionalen Veröffentlichungen mit demselben Publisher.
- Genre und Publisher erhalten absteigend sortierte Tabellen; bei Gleichstand
  wird nach bestehender deutscher Namenssortierung geordnet.
- Für Genres und Publisher gibt es je ein horizontales SVG-Balkendiagramm;
  das Publisher-Diagramm zeigt wie die Tabelle die Top 10.
  Die Publisher-Tabelle zeigt die Top 10; weitere Publisher sind in einem
  standardmäßig geschlossenen Bereich „Weitere Publisher“ erreichbar.
  Ein nicht disjunkter „Rest“ darf nicht als Anzahl unterschiedlicher Spiele
  dargestellt werden. Kein Kreisdiagramm für Mehrfachzuordnungen.
- Prozentwerte beziehen sich ausdrücklich auf alle katalogisierten Spiele;
  bekannte Abdeckung und unbekannte Angaben werden daneben ausgewiesen.
- Vorhandene Genre-/Publisher-Filter werden verlinkt, sofern sie existieren.
  Bei Einzelzuordnungen wird direkt auf das Spiel verwiesen.

### 4. Kombinationen statt unübersichtlichem Netzwerk

- Die Top-10-Schnittmengen von Genre und Publisher werden als Tabelle gezeigt:
  Genre, Publisher, gemeinsame Spielanzahl und zugehörige Spiele.
  Berücksichtigt werden Kombinationen mit mindestens zwei Spielen.
- Sortierung: gemeinsame Anzahl absteigend, anschließend Genre und Publisher
  alphabetisch. Die Grenze liegt bei exakt 10 Kombinationen, auch bei
  Gleichstand; gibt es weniger geeignete Kombinationen, werden nur diese gezeigt.
  Die Begrenzung betrifft die Darstellung, nicht die vollständige Aggregation.
- Jede Kombination enthält einen standardmäßig geschlossenen Bereich
  „Gemeinsame Spiele ansehen“ mit direkten Links zu allen Spielen dieser
  Schnittmenge. So bleiben die 10 Tabellenzeilen kompakt, ohne die Auswahl
  der erreichbaren Spiele zusätzlich zu beschneiden. Native `details`/`summary`
  funktionieren auf der Website ohne JavaScript und per Tastatur.
- Die zugehörigen Spiele werden direkt verlinkt; getrennte Genre- und
  Publisher-Links dürfen nicht als kombinierter Filter ausgegeben werden.
- Bestehende Genre- und Publisherseiten werden zusätzlich als breitere
  Explorationseinstiege verlinkt. Es entstehen keine neuen Kombinationsseiten
  und keine weitere vollständige Kombinationstabelle. Markdown stellt dieselben
  ausgewählten Jahresgruppen und Kombinationen mit ihren Spiellinks dar;
  rein visuelle Aufklappzustände sind dort nicht erforderlich.
- Keine Netzwerk- oder Sankey-Grafik in der ersten Fassung: 110 Publisherwerte
  und Mehrfachgenres wären schwer lesbar und suggerierten disjunkte Flüsse.
- Die Darstellung erläutert Mehrfachzuordnungen und die Grenzen des
  Katalogvergleichs. Keine Aussagen über Ursache, Popularität, Qualität
  oder den Abschluss eines Spiels.

## Folgen und Abnahme

Die Seite bietet einen neuen Recherche-Einstieg ohne zusätzliche
Browserverbindungen. Fehlende Angaben bleiben sichtbar, während alle
Oberflächen dieselbe geprüfte Datengrundlage nutzen. Die ursprünglichen
Spieleseiten, Zuordnungen und Quellenregeln bleiben unverändert.

Bei der Umsetzung sind mindestens folgende Prüfungen erforderlich:

- Die vollständige Jahresaggregation plus unbekannte Jahre ergibt exakt die
  Anzahl eindeutiger Spiele. Alle bekannten Jahresgruppen und unbekannte Jahre
  ergeben gemeinsam dieselbe Gesamtzahl.
- Das SVG enthält nur Jahre 1980–1999 mit mindestens zwei Spielen;
  Jahreszahlen und Balken der dargestellten Jahre führen zum passenden
  Jahresfilter. Zeitabstände bleiben proportional und unbekannte Jahre liegen
  außerhalb der Zeitachse.
- Die Kombinationstabelle enthält höchstens 10 Einträge mit mindestens zwei
  Spielen, deterministisch sortiert; Gleichstände erweitern das Limit nicht.
- Jede angezeigte Jahresgruppe und Kombination verlinkt genau ihre zugehörigen
  Spiele. Aufklappbereiche, breitere Filterlinks und „Alle Spiele ansehen“
  unterstützen die Exploration ohne eine unbegrenzt lange Standardansicht.
- Obere Seitennavigation und Querverweise funktionieren auf allen betroffenen
  Spieleübersichten, einschließlich App-Routen und Markdown. Bestehende Widgets
  und Formatierungshelfer werden genutzt; keine duplizierte Hauptnavigation
  oder zweite Implementierung vorhandener Spielekacheln und Tabellen.
- Mehrere Folgen, Durchläufe, Veröffentlichungen oder identische
  Metadatenwerte erhöhen die Anzahl eines Spiels je Kategorie nicht.
- Mehrfachgenres und mehrere unterschiedliche Publisher bleiben zulässig;
  gesperrte oder fehlende Metadaten führen zu explizit unbekannten Angaben.
- Null-, Einzel- und Mehrzahlfälle sowie Zeitlücken, Gleichstände,
  Sonderzeichen, kombinierte Firmennamen und fehlende Jahre sind abgedeckt.
- SVG, Tabellen, App und Markdown enthalten dieselben Aggregationen.
  Der direkte SVG-Download ist intern erreichbar und korrekt ausgeliefert.
- Gemeinsame Spielpaare werden ungeordnet dedupliziert;
  Schnittmengen werden aus IDs berechnet, nicht aus Summen von Zuordnungen.
- Mobilansicht, Tastaturzugang, helle/dunkle Darstellung, SVG-Zugänglichkeit,
  interne Links und bestehende Build-Größenbudgets werden geprüft.
- Die Untersuchung dieser ADR ist ein belegter Snapshot, kein Test mit
  dauerhaft festgeschriebener Kataloggröße von 148 Spielen.


## Ergänzung vom 2026-11-03: Entwicklerdiagramm

Die Statistikseite ergänzt einen Abschnitt „Entwickler“ analog zum
Publisher-Abschnitt: Abdeckung der Angaben und Balkendiagramm der Top 10,
dessen Beschriftungen auf die Entwicklerfilterlisten bzw. bei
Einzelzuordnungen zur Spieleseite verlinken.
