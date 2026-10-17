# ADR: Seitenstruktur und Zuordnung von Videos zu Inhaltsbereichen

**Status:** Vorgeschlagen
**Datum:** 2026-10-17
**Entscheider:** Christian Harms
**Kontext:** Thematische Erschließung der Videos für Besucher und Suchmaschinen.
**Grundlage:** [ADR 0002: Statische Seiten, SEO und Performance](0002-statische-seiten-seo-und-performance.md)

## Kontext

Die statische Website soll nicht nur eine chronologische Videoliste anbieten.
Besucher sollen über Zeitschriftennamen, Jahrgänge und Spieletitel direkt zu
passenden Videos gelangen. Neue Videos müssen nach einer Aktualisierung der
Quelldaten automatisch in die bestehende Struktur einsortiert werden.

Die wichtigsten Bereiche sind Blätterabend, Spielereihen und Hardware.
Nach Prüfung der vorhandenen Videodaten wurden zusätzlich Retrospektiven sowie
Interviews und Gespräche als eigene Bereiche ausgewählt.

Diese ADR konkretisiert die Seitenstruktur aus ADR 0002. Insbesondere ergänzt
sie Jahrgangsseiten und Regeln für Spielereihen. Die Anforderungen an statisches
HTML, SEO, echte Links, lokale Assets und die Ausnahme für YouTube-Medien
gelten unverändert.

## Bestandsaufnahme und verfügbare Daten

Untersucht wurde der lokale Cache `cache/youtube-videos.json` mit 2.159 Videos
am 2026-10-17. Die folgenden Zahlen zählen Treffer in Titeln, nicht abschließend
klassifizierte Inhalte. Ein Video kann mehrere Merkmale besitzen.

| Merkmal im Titel | Videos | Einordnung |
|---|---:|---|
| Blätterabend | 240 | Zeitschriftenbereich; bereits separat extrahiert |
| re.play | 1.614 | Grundlage für Spielereihen |
| re.consider | 8 | Ergänzung zur jeweiligen Spielereihe |
| re.minder | 18 | Ergänzung einer vorhandenen passenden Spielereihe |
| re.connect | 23 | Zunächst kein eigener Bereich und keine pauschale Spielezuordnung |
| Spieleabend | 24 | Zunächst separat prüfen |
| re.invented | 18 | Zunächst separat prüfen; auch Blätterabend-Treffer enthalten |
| re.trospektive | 13 | Eigener Bereich Retrospektiven |
| re.list | 8 | Vorerst kein eigener Bereich |
| re.ware | 11 | Kandidaten für Hardware; auch Verpackungsthemen enthalten |
| Interview | 7 | Kandidaten für Interviews und Gespräche |
| Talk with Joseph Hewitt IV of Westwood | 1 | Weiterer Gesprächskandidat |
| re.collect | 1 | Vorerst kein eigener Bereich |

Weitere mögliche Themen sind Wichteln und Adventstreams. Dafür wird zunächst
keine eigene Kategorie eingeführt. Wortfragmente wie „advent“ reichen nicht
zur Klassifikation, weil sie auch in „Adventure“ vorkommen.

Der Video-Cache enthält Video-ID, Titel, Beschreibung, Dauer und Datum.
Die strukturierten Playlist-Daten liegen separat in
[`cache/youtube-playlists.json`](../../cache/youtube-playlists.json) vor.
Der vollständig abgeschlossene Abruf vom 2026-10-17 enthält:

| Playlist-Daten | Anzahl |
|---|---:|
| Öffentliche Kanal-Playlists | 158 |
| Playlist-Einträge einschließlich Mehrfachvorkommen | 2.092 |
| Unterschiedliche Video-IDs in den Playlists | 2.078 |
| Playlists mit re.play im Titel | 143 |

Das Script
[`src/fetch-youtube-playlists.mjs`](../../src/fetch-youtube-playlists.mjs)
liefert je Playlist `id`, `title`, `description`, `url`, `videoCount`, `videos`,
`lastModified` und `checkedAt`. Jeder Mitgliedseintrag enthält `position`
(beginnend bei 1), `videoId`, `title` und `availability`. Reihenfolge und
doppelte Einträge bleiben erhalten. Die Titel der 143 re.play-Playlists sind
Kandidaten für Spielereihen, nicht automatisch 143 bestätigte Spiele.

`npm run fetch:all` aktualisiert Video- und Playlist-Cache parallel;
`npm run fetch:playlists` aktualisiert nur Playlists, mit bis zu drei
gleichzeitigen Playlist-Abrufen. Jeder Folgelauf prüft die Mitgliedschaften
erneut, damit auch Umsortierungen und Entfernungen erkannt werden.
`lastModified` bezeichnet den lokal erkannten Änderungszeitpunkt, nicht ein
YouTube-Änderungsdatum; unveränderte Playlists behalten ihn.

Bei 318 Videos finden sich zusätzlich Playlist-Verweise in der Beschreibung.
Diese können fremde oder thematisch andere Playlists betreffen und beweisen
keine Mitgliedschaft. Maßgeblich sind die tatsächlich abgefragten
Mitgliederlisten im Playlist-Cache.

Datenerfassung, bestätigte Spielezuordnung, Spieleseiten sowie konservative
Abschnitts-/Reihenerkennung sowie Hardware-, Retrospektiven- und
Interviewübersichten sind umgesetzt. Statische Kapitel-Zeitlinks und explizite
Kanalverweise ergänzen die Videoabschnitte. API-Player-Komfortfunktionen folgen separat.

## Entscheidung

### 1. Navigation und gemeinsame Detailseiten

Die Hauptnavigation enthält News und die fünf Inhaltsbereiche:

1. News
2. Blätterabend / Zeitschriften
3. Spiele
4. Hardware
5. Retrospektiven
6. Interviews und Gespräche

Die Startseite verlinkt diese Bereiche und hebt die News hervor. Stabile
Detailseiten je Spiel bzw. Ausgabe bleiben erhalten. Ein kanalweiter Gesamtkatalog
wird nicht mehr erzeugt: `/videos/` samt Folgeseiten, Navigation und Verweisen
entfällt. Alte Ausgaben werden beim Build aus Dateien, Sitemap und Manifest entfernt.
Der vollständige Video-Cache bleibt die Datenbasis; nicht zugeordnete ältere Videos
erhalten keine Ersatzseite. Die begrenzte News-Übersicht bleibt bestehen.
Die Startseite zeigt statt neuer Videos ein responsives Statistikraster mit
Video-, Zeitschriften-, Heft-, Spiele- und Playlistzahlen sowie bekannten
Videostunden. Der älteste öffentliche Upload belegt den Beginn der erfassten
Videogeschichte, nicht das unbekannte Gründungsdatum. Verlinkte Themenkacheln
zeigen Videozahlen; Mehrfachzuordnungen machen diese Zahlen nicht addierbar.
Videos werden innerhalb dieser Seiten über `#video-<id>` ausgewählt.
Ohne sichere vorhandene Detailseite führen Videolinks direkt zu YouTube.

| Pfad | Inhalt |
|---|---|
| `/` | Einstieg mit News-Verweis und den fünf Inhaltsbereichen |
| `/news/` | Die 20 neuesten veröffentlichten Videos mit Links zu ihren Inhaltsbereichen |
| `/zeitschriften/` | Blätterabend-Übersicht nach Zeitschrift |
| `/zeitschriften/<slug>/` | Zeitschrift mit Jahrgängen und zugehörigen Videos |
| `/zeitschriften/<slug>/<jahr>/` | Blätterabend-Videos eines Jahrgangs, nach Ausgabe |
| `/spiele/` | Alphabetischer Index qualifizierter Spieletitel |
| `/spiele/<slug>/` | Zusammengehörige Videoreihe zu einem konkreten Spiel |
| `/hardware/` | Flache, bei Bedarf paginierte Videoliste |
| `/retrospektiven/` | Übersicht der Retrospektiven |
| `/interviews/` | Übersicht der Interviews und Gespräche |
| `/datenschutz/` | Datenschutz und Hinweise zum privaten, nicht kommerziellen Betrieb; im Footer verlinkt |

[ADR 0004](0004-detailseiten-und-videonavigation.md) konkretisiert die
Detailansichten: Eindeutig identifizierte Ausgaben mit zugehörigen Videos erhalten
eine eigene Informations- und Einstiegsseite. Jahrgangsseiten bleiben der
übergeordnete Zugang. Unklare Ausgaben erzeugen keine spekulative Detailseite.
Spiel-/Heftinformationen, Player und sämtliche Videobeschreibungen stehen auf
derselben Detailseite; es gibt keine separate Videoseite.
Kapitelsteuerung und fortlaufende Wiedergabe sind ebenfalls dort beschrieben.

Paginierung ist keine zusätzliche thematische Unterstruktur. Allgemeine Listen
mit mehr als 50 Einträgen werden entsprechend ADR 0002 über echte Links aufgeteilt.
Spieleseiten und einzelne Ausgabenseiten zeigen dagegen die vollständige Folgenliste,
auch bei mehr als 50 Videos. Blätterabend wird nach Zeitschrift und Jahrgang
aufgeteilt; nur bei weiterhin zu großen Teilübersichten ist zusätzliche
Paginierung nötig.
Ein Video ist ein Abschnitt auf einer vorhandenen Entitätsseite und darf in
mehreren passenden Bereichen verlinkt werden. Canonical und Sitemap gehören
zur Seite, nicht zu einzelnen Video-Fragmenten.

### 2. Blätterabend: Zeitschrift, Jahrgang, Ausgabe

Grundlage ist `cache/blaetterabend-videos.json` mit den erkannten
Zeitschriften, Ausgaben, Teilen und Archivlinks.

- Der Zeitschriftenindex ist alphabetisch nach kanonischem Zeitschriftennamen
  sortiert. Abweichende Schreibweisen werden zusammengeführt.
- Jede Zeitschriftenseite zeigt die vorhandenen Jahrgänge mit Links und die
  zugehörigen Videos. Umfangreiche Listen werden paginiert.
- Jahrgangsseiten zeigen die Ausgaben in aufsteigender Monats- bzw.
  Ausgabenreihenfolge. Sonderhefte werden deutlich als solche gekennzeichnet
  und erhalten eine eigene Gruppe innerhalb des Jahrgangs.
- Mehrere Videos derselben Ausgabe stehen zusammen, zuerst nach bekanntem
  Teil, ansonsten nach Veröffentlichungsdatum und abschließend Video-ID.
  Bei nur teilweise nummerierten Videos behalten die unnummerierten Videos
  ihren chronologischen Platz; die nummerierten Videos werden relativ
  zueinander nach Teil geordnet. So wird ein früherer unnummerierter Einstieg
  nicht automatisch hinter „Teil 2“ einsortiert.
- Archivlinks auf kultmags oder reetroz erscheinen an der passenden Ausgabe.
  Ein Übersichtslink wird nicht als Link auf ein eindeutig erkanntes Heft
  ausgegeben.
- Ein Video mit mehreren Zeitschriften wird unter jeder zutreffenden
  Zeitschrift verlinkt, ohne separate Videodetailseiten anzulegen.

**Jahrgang bedeutet das Erscheinungsjahr der Zeitschrift**, nicht das
Veröffentlichungsjahr des YouTube-Videos. Ein 2026 veröffentlichtes Video zu
PC Games 12/1992 gehört nach `/zeitschriften/pc-games/1992/`.

Ein Jahr darf nur aus einer erkannten Ausgabe oder einer eindeutig
abgeglichenen Archiv-Ausgabe stammen. Ist kein Jahr bekannt, bleibt das Video
in einer sichtbaren Gruppe „Jahrgang unbekannt“ auf der Zeitschriftenseite.
Es wird nicht dem Aufnahmejahr zugeordnet. Videos ohne erkannte Zeitschrift
stehen in einer Gruppe „Zeitschrift ungeklärt“ in der Blätterabend-Übersicht.
Unbekannte Angaben bleiben auch in den Metadaten unbekannt.

**Umgesetzt:** Zeitschriftenindex, Zeitschriften-, Jahrgangs- und eindeutig
belegte Ausgabenseiten mit bis zu 50 Einträgen pro Seite. News, Videokatalog und
Themenlinks führen zu den vorhandenen Zielen. Reguläre Hefte werden über Jahr
und Monate bzw. Heftnummer identifiziert; Sonderhefte über einen eindeutigen
Archivtreffer bzw. Jahr und Sonderheftnummer. Ein Jahr allein oder eine
generische Sonderheftbezeichnung reicht nicht für eine Ausgabenseite.
Fehlende Heftdaten dürfen aus weiteren Einträgen mit demselben eindeutigen
Archivtreffer ergänzt werden; Ordnerlinks reichen dafür nicht aus.
Widersprüche werden gemeldet. Titelkorrekturen ohne Identitätsänderung ändern
die Ausgaben-ID nicht.

Öffentliche Ausgabepfade werden davon getrennt aus Zeitschriftenname und
finaler Heftbezeichnung gebildet, zum Beispiel
`/zeitschriften/amiga-joker/ausgaben/amiga-joker-1-1990/`.
Erst nach der Zusammenführung aller Heftdaten wird der lesbare Slug festgelegt.
Unterschiedliche Hefte mit demselben Slug erhalten deterministische
`-variante-N`-Zusätze; Quellreihenfolge und Abrufzeit spielen keine Rolle.
Die interne Hash-ID bleibt erhalten, erscheint aber nicht mehr im Pfad.
Eine Titelkorrektur kann den öffentlichen Pfad ändern. Alle Links und
SEO-Metadaten verwenden die neue Route; alte Hash-Pfade werden nicht als
zusätzliche Seiten oder Weiterleitungen ausgegeben.

### 3. Spielereihen: ein konkreter Spieletitel als Entität

Eine Spieleseite bündelt Videos zu **einem konkreten Spiel**, nicht automatisch
zu einer gesamten Franchise. Beispielsweise bleiben Wing Commander und
Wing Commander II getrennte Spiele. Plattformvarianten und Neuauflagen werden
nicht allein aufgrund ähnlicher Titel zusammengelegt.

Eine eigene Seite und ein Eintrag im Spieleindex entstehen, wenn mindestens
**zwei unterschiedliche öffentliche Videos** sicher derselben Spielereihe
zugeordnet sind. Doppelte Playlist-Einträge oder Mehrfachzuordnungen derselben
Video-ID zählen nur einmal. Maßgeblich ist die Vereinigung bestätigter
Playlist-Mitglieder, re.play- und re.consider-Videos zu diesem Spiel.

Eine Playlist allein reicht nicht als Spieleidentität: Format-, Themen- und
Sammelplaylists können mehrere Spiele enthalten. Erforderlich sind eine
bestätigte Zuordnung der Playlist zu einem Spiel und die Mitgliedschaften der
Videos. Mehrere Playlists dürfen demselben Spiel zugeordnet werden.
Die Implementierung pflegt diese Identitäten ausdrücklich in
[`src/games.mjs`](../../src/games.mjs): 144 geprüfte Einzelspiel-Identitäten
einschließlich der nicht mit re.play betitelten 1942-Playlist. Auch die
Railroad-Tycoon-Deluxe-Playlist aus re.connect ist nach Mitgliederprüfung diesem
Spiel zugeordnet; die allgemeine Formatvorstellung ist explizit ausgeschlossen.
Bekannte Quellschreibweisen und Zusatzbeiträge werden dort ebenfalls gepflegt.
Neue unbestätigte re.play-/re.connect-Playlists werden als Build-Hinweis gemeldet.
Sie erzeugen keine automatisch erratene Spieleseite. Die Spielidentität und
ihr Slug ändern sich nicht durch einen geänderten Cache-Playlist-Titel.
Die vorhandenen Mitgliedschaften werden über
`playlists[].videos[].videoId` mit `videos[].id` im Video-Cache verknüpft.
Playlist-Titel und -Beschreibung liefern Kontext; vollständige Video-Metadaten
und Beschreibungen stammen weiterhin aus dem Video-Cache.

`availability: "listed"` bestätigt nur, dass YouTube den Eintrag geliefert hat,
nicht dessen öffentliche Abspielbarkeit. Einträge mit `"unavailable"` oder ohne
Gegenstück im öffentlichen Video-Cache zählen nicht zur Zwei-Video-Schwelle.
Sie bleiben als ungeklärte Verweise nachvollziehbar, erzeugen aber keine
erfundenen Videodetails.

Die typische Darstellung auf einer Spieleseite ist:

1. Intro / Unboxing
2. Spielverlauf mit den Folgen in ihrer Reihenfolge
3. Abschlussgespräch
4. Weitere Beiträge zum Spiel, insbesondere spätere re.play-Durchläufe,
   re.consider und ergänzende re.minder-Videos

Nicht jede Reihe hat alle Phasen. Es werden nur vorhandene Abschnitte
angezeigt. Eine Folgennummer allein beweist kein Unboxing oder Abschlussgespräch;
dafür werden Playlist-Kontext und eindeutige Titelmerkmale verwendet.
Später gestartete Durchläufe bleiben als eigene Gruppe erkennbar, damit mehrfach
vorhandene Folgenummern nicht vermischt werden.

**Umgesetzt:** Die Spieleseite hat eine zusätzliche statische Übersicht
„Abschnitte und Reihen“ mit echten Links auf die vorhandenen Video-Fragmente.
Abschnitte und Quellreihen stehen auch bei jeder Folge und ihrer Beschreibung.
Es entstehen weder neue Videoseiten noch leere Phasen. Die Erkennung steht in
[`src/site-game-series.mjs`](../../src/site-game-series.mjs).

Ausdrückliche Titelmerkmale belegen Intro/Unboxing, Abschlussgespräch/Fazit
und Interview. re.consider und re.minder bleiben eigene Beitragsarten, auch
wenn deren Titel ebenfalls „Intro“ oder „Fazit“ enthält. Sonstige Mitglieder
bestätigter re.play-/re.connect-Reihen und ausdrücklich markierte Spielstreams
werden dem Spielverlauf zugeordnet. Fehlender oder widersprüchlicher
Formatkontext bleibt unter „Weitere Beiträge / ungeklärt“ sichtbar. Die
Quellbelege werden im normalisierten Modell erhalten.

Quellplaylist und Format bilden die Basis einer unterscheidbaren Reihe.
Ausdrückliche Angaben „Staffel N“, „Durchlauf N“ und „N. Durchlauf“ gelten ab
dem betreffenden datierten Video bis zum nächsten Marker derselben Quellreihe.
Sie greifen nicht auf andere Playlists, Formate oder undatierte Folgen über.
Vorherige Videos erhalten keine nachträglich geratene Staffelnummer.
Folgenummer-Resets, „Neustart“, ein Abschlussgespräch oder zeitliche Lücken
beweisen allein keinen neuen Durchlauf. Die Gruppen dienen der Orientierung,
nicht einer Umordnung der chronologischen Gesamtliste.

Die Wiedergabereihenfolge läuft vom **zuerst veröffentlichten Video zum
letzten, neuesten Video**. Sortiert wird aufsteigend nach dem tatsächlichen
`publishedAt`-Zeitpunkt unter Berücksichtigung der Zeitzone, bei gleichem
Zeitpunkt stabil nach Video-ID. Diese Reihenfolge gilt einheitlich für
Folgenliste, Positionsanzeige, Vorher-/Nachher-Links und automatische Fortsetzung.
Durchläufe bleiben kenntlich, auch wenn die chronologische Liste mehrere enthält.

Die ursprüngliche `position` im Playlist-Cache bleibt als Quellinformation
unverändert erhalten, bestimmt aber nicht die Wiedergabereihenfolge der Website.
Eine rückwärts sortierte YouTube-Playlist wird für die Website entsprechend
chronologisch angeordnet. Ursprüngliche Folgenummern einschließlich „#0“ oder
„21,5“ bleiben in den Titeln erhalten, sind aber kein Sortierschlüssel.
Fehlende oder ungültige Veröffentlichungszeiten werden gemeldet; solche Videos
bleiben in einer separat gekennzeichneten Gruppe erreichbar, werden aber nicht
mit einem erfundenen Zeitpunkt in die automatische Wiedergabesequenz eingefügt.

**re.minder:** Ein eindeutig erkanntes re.minder-Video wird einer bereits
qualifizierten passenden Spielereihe als weiterer Beitrag hinzugefügt.
Es löst selbst keine neue Spieleseite aus und hebt auch eine Ein-Video-Reihe
nicht allein über die Zwei-Video-Schwelle.

Andere Formate wie re.connect, re.invented und Spieleabend werden nicht
pauschal anhand des Formats zugeordnet. Eine bestätigte Mitgliedschaft in
einer Spiel-Playlist darf berücksichtigt werden; ansonsten bleiben diese
Beiträge zunächst nur im lokalen Cache, sofern keine andere bestätigte Zuordnung besteht.

Spielbezogene Interviews können sowohl auf der Spieleseite als auch im
Interviewbereich verlinkt sein. Unboxing ist eine Phase einer Spielereihe und
keine eigene Hauptkategorie.

### 4. Hardware ohne thematische Unterstruktur

`/hardware/` zeigt Hardware-Videos in absteigender Veröffentlichungsreihenfolge.
Es gibt zunächst keine Unterseiten nach Gerät, Hersteller oder Jahr.
Notwendige Paginierung bleibt möglich; ohne vorhandene Spiel-/Ausgabenseite
führen Videolinks vorerst direkt zu YouTube.

`re.ware` sowie eindeutige Hardwaretitel liefern Zuordnungskandidaten.
Verpackungsaufbereitung oder gemischte Themen werden geprüft, statt jeden
re.ware-Beitrag ungeprüft als Hardware zu behandeln.

**Umgesetzt:** 14 bestätigte Beiträge aus den Hardware-/re.ware-Playlists und
geprüften einzelnen Hardwaretiteln. Die Zuordnung steht explizit in
[`src/sections.mjs`](../../src/sections.mjs). Der reine Verpackungsbeitrag
`bwVnfQJ-WEw` bleibt ausgeschlossen; der gemischte Beitrag `XDvGVislnJg`
ist wegen der ausdrücklich beschriebenen Hardware-Reinigung enthalten und
sichtbar als gemischtes Thema gekennzeichnet.

### 5. Zusätzliche ausgewählte Bereiche

**Retrospektiven:** `/retrospektiven/` bündelt die re.trospektive-Beiträge.
Zusammengehörige Folgen werden nach Thema und Folgenreihenfolge gruppiert,
beispielsweise die Geschichte der Flugsimulationen. Eigene Themenunterseiten
sind vorerst nicht erforderlich.

**Interviews und Gespräche:** `/interviews/` zeigt bestätigte Interviews und
Gespräche mit erkennbaren Personen- und Themenangaben. Die Titelsuche nach
„Interview“ oder „Talk“ ist ein Kandidatenfilter, keine ausreichende endgültige
Klassifikation. Zugehörige Spiele werden verlinkt, sofern eindeutig bekannt.

**Umgesetzt:** Die Retrospektivenübersicht enthält die Formateinleitung und
zwölf Flugsimulationsfolgen. Themen und Reihenfolge sind explizit geprüft;
doppelte Originalnummern wie `#11` bleiben im Titel und bestimmen die Reihenfolge
nicht allein. Acht Interviews/Gespräche besitzen bestätigte Personen- und
Themenangaben. Das C64-Eye-of-the-Beholder-Interview mit Andreas und Oliver
ist anhand seiner Beschreibung auch ohne Interview-Playlist zugeordnet.
Bestehende Spielzuordnungen werden unverändert verlinkt.

Alle drei Bereiche sind statische `CollectionPage`-/`ItemList`-Übersichten
mit höchstens 50 Einträgen pro Seite, Breadcrumbs und relativen internen URLs.
Hardware und Gespräche sind nach Veröffentlichung absteigend sortiert,
undatierte Videos zuletzt. Retrospektiven bleiben thematisch und nach Folge
gruppiert. Nur nicht leere Bereiche erscheinen in Navigation und Startseite;
News und betroffene Spiel-/Ausgabenseiten zeigen Bereichslinks.
Ohne eigene Entitätsseite führen Videoverweise direkt zu YouTube.
Es entstehen keine neuen Video-, Geräte- oder Themenunterseiten und keine
zusätzlichen Player oder Laufzeitscripte. Scraper bleiben vom Build getrennt.

Neue Playlist-Mitglieder oder passende Titelwörter werden lediglich als
Prüfkandidaten gemeldet. Sie werden weder automatisch klassifiziert noch
aufgrund zufälliger Erwähnungen einem Spiel zugeordnet. Reine
Verpackungsthemen erhalten ebenso wie andere nicht ausgewählte Formate keine
eigene Übersicht; ihre Daten bleiben im lokalen Cache erhalten.

re.list, re.collect, Community-Veranstaltungen und weitere Formate werden
zunächst nicht zu Hauptbereichen. Ihre Videos bleiben im lokalen Cache
erhalten. Eine spätere Erweiterung erfordert eine bewusste Entscheidung.

### 6. Stabile Datenzuordnung und Aktualisierung

Die Inhaltsaufbereitung erzeugt vor dem HTML-Build eine eindeutige,
nachvollziehbare Zuordnung aus den lokalen Quelldaten:

- Video-ID als Schlüssel und zur Deduplizierung.
- Stabile Zeitschriften- und Spiele-IDs sowie kanonische Namen und Aliasse.
- Bestätigte Playlist-ID, Video-Mitgliedschaften und Reihenfolge, soweit vorhanden.
- Kategorie, Spiel, Zeitschrift, Ausgabe, Jahrgang, Durchlauf und Phase, soweit
  sicher erkennbar.
- Herkunft der Zuordnung, etwa Titelregel, Archivabgleich, Playlist oder
  ausdrücklich gepflegte Korrektur.

Diese Angaben beschreiben das benötigte Datenmodell. Der separate Playlist-Cache
liefert inzwischen IDs, Titel und geordnete Mitgliedschaften; Spieleidentitäten,
Phasen und die fachliche Spielezuordnung müssen vor der Generierung belastbarer
Spieleseiten ergänzt werden.

Titelregeln berücksichtigen Formatmarker, Teile und Schreibvarianten.
Ein Spiel wird nicht anhand eines beliebigen Vorkommens seines Namens in der
Beschreibung zugeordnet. Kuratierte Aliasse und Korrekturen liegen getrennt
von generierten Dateien und bleiben bei einem Neuabruf erhalten.

Nach einer Aktualisierung der Quellen werden Zuordnungen und Website neu
generiert:

1. Unabhängige Quellenpflege: Video- und Playlist-Daten mit `npm run fetch:all`
   aktualisieren und Blätterabend-Daten einschließlich Archivzuordnungen erzeugen.
2. Separater Website-Build: Ausschließlich die vorhandenen lokalen JSON-Daten
   einlesen, Spielereihen und weitere Bereiche zuordnen; unklare Fälle melden.
3. Alle betroffenen Übersichten, Jahrgänge und Detailseiten bauen.
4. Interne Links, Schwellenwerte, Sortierung, Metadaten und Sitemap prüfen.

Scraper starten nicht automatisch den Website-Build, und der Build startet
keine Scraper. Ein unveränderter JSON-Bestand muss ohne erneuten Abruf jederzeit
erneut baubar sein.

Für eine Veröffentlichung müssen beide YouTube-Caches `complete: true`
enthalten und zum selben Kanal gehören. Bei einem fehlgeschlagenen Abruf bleibt
der Playlist-Cache mit den erfolgreichen Zwischenständen und den vorherigen
Daten fehlgeschlagener Playlists als unvollständig markiert. Ein solcher
Zwischenstand darf nicht als vollständiger neuer Katalog veröffentlicht werden.
Nicht mehr gelistete Playlists werden erst nach einem vollständig erfolgreichen
Abgleich entfernt. Das Entfernen aus einer Playlist bedeutet nicht automatisch,
dass das betreffende Video aus dem vollständigen Video-Cache verschwindet.

Neue Zeitschriften und Jahrgänge erhalten automatisch Seiten, sobald sie sicher
erkannt sind und Videos enthalten. Neue Spieleseiten entstehen beim Erreichen
der Zwei-Video-Schwelle. Neu erkannte Zeitschriftennamen benötigen gegebenenfalls
eine ergänzte Erkennungsregel; ein Archivindex allein erkennt nicht automatisch
alle Namen in Videotiteln.

Der Build verwendet ein frisches Ausgabeverzeichnis, damit entfernte Seiten
nicht versehentlich veröffentlicht bleiben. Bestehende Slugs bleiben bei
unveränderter Identität stabil; Umbenennungen und entfernte Inhalte werden
bewusst behandelt, nicht stillschweigend auf andere Entitäten umgebogen.
Wiederholte Builds derselben Quelldaten ergeben dieselbe Zuordnung und Sortierung.

### 7. Auffindbarkeit über Zeitschriften- und Spieletitel

Suchmaschinen erhalten die Zielbegriffe im bereits generierten HTML,
nicht erst nach Filtern oder Nachladen im Browser.

Beispiele für Seitentitel:

- `PC Games – Blätterabend-Videos | Pretty Old Pixel`
- `PC Games 1992 – Ausgaben und Blätterabend-Videos | Pretty Old Pixel`
- `Wing Commander II – Unboxing, Spielverlauf und Abschlussgespräch | Pretty Old Pixel`

Der letzte Titel ist nur passend, wenn die genannten Inhalte tatsächlich
vorhanden sind. Jede Seite hat eine spezifische Beschreibung, sichtbare
Überschriften und nachvollziehbare Links aus der übergeordneten Übersicht.
Spielenamen werden nicht mit Formatmarkern oder Folgenummern als
Entitätsname gespeichert.

JSON-LD verwendet die in ADR 0002 festgelegten Entitäten: `Periodical`,
`PublicationIssue`, `VideoGame`, `VideoObject`, `ItemList` und `BreadcrumbList`.
Jahrgangsseiten sind Sammlungen von Ausgaben und Videos, keine erfundene einzelne
`PublicationIssue`. Beschreibungen, Themen und Beziehungen entsprechen dem
sichtbaren Seiteninhalt. Hardware, Retrospektiven und Interviews erhalten
ebenfalls aussagekräftige Übersichtsmetadaten.

Es werden keine leeren Suchwortseiten und keine zusätzlichen
Videodetailseiten pro Video oder Kategorie erzeugt. Gute technische Auffindbarkeit ist das
Ziel; Indexierung und Rankings können nicht garantiert werden.

### 8. News: die neuesten 20 Videos

`/news/` zeigt kanalweit die **20 neuesten unterschiedlichen veröffentlichten
Videos** aus dem vollständigen Video-Cache. Sind weniger vorhanden, werden alle
angezeigt. Es gibt keine Beschränkung auf Spiele oder Blätterabend und keine
eigene News-Paginierung und keinen verlinkten Gesamtkatalog.

- Sortiert wird absteigend nach `publishedAt`, bei identischen Zeitpunkten
  stabil nach Video-ID. Datumswerte werden als Zeitpunkte verglichen, nicht
  als Strings mit möglicherweise unterschiedlichen Zeitzonen.
- Ausschlaggebend ist das Veröffentlichungsdatum samt Uhrzeit des Videos,
  nicht der Scraper-Abruf, die Playlist-Position oder das Datum der Aufnahme.
- Fehlende oder ungültige Veröffentlichungszeiten werden gemeldet. Solche
  Videos werden nicht mit dem Abrufdatum aufgefüllt und nicht in die datierte
  Top-20-Liste aufgenommen. Noch nicht veröffentlichte Videos werden ausgeschlossen.
- Jeder Eintrag enthält Titel, sichtbares Veröffentlichungsdatum mit
  maschinenlesbarem `time datetime` und einen direkten Link auf
  den Abschnitt `#video-<id>` einer vorhandenen Spiel-/Ausgabenseite bzw.
  ohne sicheres Ziel direkt zu YouTube. Ein optionales Thumbnail folgt ADR 0002.
- Blätterabend-Einträge verlinken die Zeitschriftenübersicht und, soweit
  vorhanden, die zugehörige Zeitschrift, den Jahrgang und die Ausgabenseite.
- Spiele-Einträge verlinken die Spieleübersicht und die vorhandene Spieleseite.
  Die News umgehen nicht die Zwei-Video-Schwelle: Es werden keine Links auf
  noch nicht erzeugte Spieleseiten ausgegeben.
- Bei mehreren sicheren Zuordnungen werden die passenden Ziele verlinkt.
  Andere Formate verweisen auf ihren vorhandenen Bereich; ungeklärte Videos
  führen in den News direkt über externe Links zu YouTube.

Die News sind vollständig statisch und besitzen einen eigenen Titel,
Beschreibung, Canonical-URL sowie `CollectionPage`/`ItemList`-Metadaten.
Ihre Frische entsteht durch neue veröffentlichte Videos, nicht durch ein
wechselndes „Heute aktualisiert“-Label.

### 9. Inhaltsabhängige Updates und Änderungszeitpunkte

Scraper stellen aktualisierte JSON-Dateien bereit; ein separat gestarteter
Build prüft diese auf relevante Inhaltsänderungen. Ein erfolgreicher Scraper-Lauf
erzwingt weder einen Build noch eine Veröffentlichung.
Der reine Abruf ist keine Inhaltsänderung:
`fetchedAt`, `checkedAt`, Cache-Dateizeit und der lokale Änderungszeitpunkt
einer Playlist dürfen keine Seiten künstlich als neu kennzeichnen.
Die grundlegende Website-Aufbereitung für Startseite, News, Videokatalog und
Ausgabenseiten mit eingebetteten Videoabschnitten ist implementiert. Der Build vergleicht die tatsächlich erzeugten
Dateiinhalte, übernimmt identische Dateien mit ihrer Dateizeit und schreibt
Fingerabdrücke sowie videoabhängige Inhaltszeitpunkte in ein Build-Manifest.
Die HTML-Ausgabe wird derzeit vollständig berechnet; eine frühzeitige
Abhängigkeitsauflösung sowie persistente HTML-Vorartefakte in CI bleiben ein späterer
Optimierungsschritt. Das Build-Manifest wird bereits über einen branchbezogenen
Actions-Cache wiederhergestellt. Zeitschriften- und bestätigte Spiele-Entitätsseiten
einschließlich ihrer Verlinkung sind inzwischen ergänzt; News verlinken
weiterhin keine nicht erzeugten Ziele.

Für jede Seite wird ein stabiler Fingerabdruck über ihre tatsächlich relevanten
Daten und Links gebildet. Dazu gehören die angezeigten Video-IDs und Felder,
Zuordnungen, Reihenfolge, Linkziele sowie verwendete Templates und Assets.
Reine Prüfzeitpunkte gehören nicht dazu.

- Gleicher Fingerabdruck: HTML und gespeicherte Seitenmetadaten unverändert
  wiederverwenden, kein neuer Änderungszeitpunkt.
- Geänderter Fingerabdruck: Nur die betroffene Seite und ihre tatsächlich
  veränderten abhängigen Übersichten neu erzeugen. Eine geänderte Linkliste ist
  ebenfalls eine echte Änderung.
- Das frische Ausgabeverzeichnis wird aus wiederverwendeten unveränderten und
  neu erzeugten Dateien zusammengesetzt. Entfernte Seiten werden nicht übernommen.

Die News-Datei wird somit nur bei einer veränderten Top-20-Auswahl, relevanten
Eintragsdaten oder neuen bzw. geänderten Linkzielen aktualisiert. Ein Spiel,
das durch ein zweites Video eine eigene Seite erhält, kann auch Links in
bestehenden News-Einträgen verändern. Wächst nur ein anderer Teil des Katalogs,
bleiben unveränderte News und nicht betroffene Seiten unangetastet.

Der videoabhängige Inhaltszeitpunkt einer Seite wird aus dem neuesten gültigen
`publishedAt` ihrer inhaltlich zugehörigen Videos abgeleitet, einschließlich
Datum, Uhrzeit und Zeitzone. Gespeichert wird eine normalisierte UTC-Zeit.
Für die News zählen die angezeigten Videos. Globale Navigationslinks übertragen
nicht den neuesten Kanalzeitpunkt auf jede Seite.

Der videoabhängige Wert heißt im Manifest `contentPublishedAt`.
Ein erst später entdecktes altes Video erhält dadurch keinen erfundenen
neuen Veröffentlichungszeitpunkt. Für identische Daten bleibt der Wert identisch.

**Grenze der Aussagekraft:** Titelkorrekturen, neue Archivlinks, entfernte
Videos oder Template-Änderungen können den Inhalt ändern, ohne dass sich der
neueste Video-Veröffentlichungszeitpunkt erhöht. Der Fingerabdruck muss solche
Änderungen trotzdem erkennen; dafür wird kein neues Video-Datum erfunden.
Der videoabhängige Inhaltszeitpunkt ist daher nicht automatisch ein belegter
technischer Änderungszeitpunkt der Seite.

Für das gewünschte Sitemap-`lastmod` wird deshalb ein getrennter technischer
Wert `lastModified` im Manifest geführt: der UTC-Zeitpunkt, an dem der Build
erstmals den aktuellen HTML-Fingerabdruck erzeugt hat. Bei unverändertem
Fingerabdruck bleibt der gespeicherte Zeitpunkt erhalten. Echte Änderungen
an Beschreibungen, Links, Listen oder Templates setzen ihn neu, auch wenn
kein neueres Video existiert. Dies ist ein Seitenänderungsdatum und kein
behauptetes YouTube-Veröffentlichungsdatum.

Beim ersten Build, bei der Migration alter Manifeste ohne diesen Wert oder
bei verlorener Historie gilt der aktuelle Erzeugungszeitpunkt als Ausgangswert.
Das Manifest wird zwischen CI-Läufen per Actions-Cache erhalten. Ohne
wiederherstellbaren Cache kann keine ältere Änderungszeit rekonstruiert werden.
Auch Seiten ohne datierte Videos erhalten so ein reales Erzeugungsdatum.
JSON-LD-`dateModified` bleibt vorerst ausgelassen. HTTP-`Last-Modified` wird bei
GitHub Pages vom Hosting bestimmt und lässt sich nicht durch HTML-Metadaten setzen.

Browser-Caching und Inhaltsdatierung werden getrennt geprüft: Maßgeblich für
die Wiederverwendung im Browser sind die realen GitHub-Pages-Response-Header.
Die Veröffentlichung prüft vorhandene `Last-Modified`-/`ETag`-Validatoren sowie
bedingte Requests (`If-Modified-Since` bzw. `If-None-Match`) und gegebenenfalls
`304 Not Modified`. Ein HTML-Meta-Tag oder Sitemap-`lastmod` konfiguriert
dieses Verhalten nicht. Eigene Assets nutzen zusätzlich Inhalts-Hashes gemäß
ADR 0002; ein unveränderter Build darf diese nicht austauschen.

## Überprüfung bei der Umsetzung

- Ein neues Blätterabend-Video wird beim Neubau bei der richtigen Zeitschrift
  und im Erscheinungsjahr der Ausgabe einsortiert.
- Eine neue erkannte Zeitschrift bzw. ein neuer Jahrgang erzeugt die zugehörigen
  Seiten und Links.
- Mehrere Teile einer Ausgabe bleiben gruppiert; ein Video mit zwei
  Zeitschriften ist an beiden Stellen erreichbar.
- Ein Spieletitel mit einem Video erzeugt keine Spieleseite; zwei verschiedene
  bestätigte Videos tun dies. Dieselbe Video-ID in zwei Playlists zählt einmal.
- Playlist-Mitglieder werden per Video-ID mit dem Video-Cache verknüpft;
  nicht verfügbare oder dort fehlende Videos erfüllen die Spiele-Schwelle nicht.
- Playlist-Mitgliedschaftsänderungen werden übernommen; die Website sortiert
  unabhängig von Quellpositionen chronologisch von alt nach neu. Folgenliste,
  Positionsanzeige und automatische Fortsetzung verwenden dieselbe Reihenfolge.
- Ein re.minder-Video wird einer vorhandenen Reihe hinzugefügt, erfüllt aber
  nicht selbst die Schwelle.
- Spätere Durchläufe und re.consider-Beiträge erscheinen beim richtigen Spiel;
  Franchise-Nachfolger werden nicht allein wegen Namensähnlichkeit vermischt.
- Hardware bleibt ohne thematische Unterseiten; ausgewählte zusätzliche
  Bereiche und Mehrfachzuordnungen bleiben erreichbar.
- Unklare Zuordnungen und fehlende Playlist-Daten werden sichtbar gemeldet,
  nicht als erfolgreiche leere Kataloge behandelt.
- Unvollständige oder zu unterschiedlichen Kanälen gehörende YouTube-Caches
  verhindern die Veröffentlichung eines vermeintlich vollständigen Katalogs.
- Alle Seiten und Zuordnungen funktionieren ohne clientseitiges Routing;
  Metadaten, Canonical-URLs, Sitemap und interne Links entsprechen ADR 0002.
- News enthalten höchstens 20 unterschiedliche Videos in korrekter
  Veröffentlichungsreihenfolge, auch bei unterschiedlichen Zeitzonen.
- Jeder News-Eintrag führt zum Video und zu den tatsächlich vorhandenen
  passenden Übersichts- bzw. Entitätsseiten, niemals zu nicht erzeugten Seiten.
- Ein unveränderter Scraper-Folgelauf erzeugt weder neue Seiteninhalte noch
  künstlich erhöhte Änderungszeitpunkte.
- Neue Zuordnungen, Linkänderungen und Entfernungen aktualisieren betroffene
  Seiten auch dann, wenn kein neueres Video-Datum vorliegt.
- Videoabhängige Zeitstempel stammen aus `publishedAt`, nicht aus Abruf- oder
  Build-Zeiten; unbelegte Sitemap-Änderungsdaten werden ausgelassen.
- Fehlende Beschreibungen und optionale Metadaten verhindern keinen Build.
- Build und Scraper funktionieren unabhängig; ein Build ruft keine Quellen ab.
- Vollständige Spiel-Folgenlisten funktionieren auch bei mehr als 50 Videos.
- Die Datenschutzseite ist im Footer erreichbar; Browser-Caching wird anhand
  der tatsächlichen Hosting-Header statt nur HTML-Zeitangaben geprüft.

## Konsequenzen

### Vorteile

- Einstieg über Zeitschrift, Jahrgang und konkreten Spieletitel statt nur Datum.
- Neue Inhalte erweitern die Seitenstruktur nach definierten Regeln.
- Spielereihen bleiben auch mit Unboxing, mehreren Durchläufen und Nachbetrachtungen
  an einer Stelle auffindbar.
- Wenige klare Hauptbereiche ohne unnötig tiefe Hardware-Navigation.

### Risiken und offene Umsetzungsschritte

- Playlist-Mitgliedschaften müssen aus dem separaten Playlist-Cache eingebunden
  werden; Verweise in Beschreibungen ersetzen diesen Schritt nicht.
- Spieleidentitäten, Aliasse und unklare Themen benötigen teilweise kuratierte
  Zuordnungen. Reine Titelheuristiken reichen nicht für jeden Fall.
- Doppelte Zuordnungen sind gewollt, dürfen aber weder separate Videoseiten
  erzeugen noch Zählungen innerhalb einer Reihe vervielfachen.
- Inhalte unterhalb der Spiele-Schwelle bleiben zunächst ausschließlich über
  andere bestätigte passende Bereiche erreichbar; ansonsten bleiben sie im lokalen Cache.

Diese ADR dokumentiert die geplante Seitenstruktur und die getroffenen
Kategorieentscheidungen. Video- und Playlist-Erfassung, News und
die Zeitschriftenstruktur bis zu Ausgabenseiten sowie bestätigte Spieleidentitäten
und Spieleseiten mit Abschnitts-/Reihenübersicht sind umgesetzt.
Hardware-, Retrospektiven- und Interviewübersichten sind ebenfalls umgesetzt.
Kapitel-Zeitlinks und erwähnte Kanäle sind in den Spiel-/Ausgabepanels umgesetzt.
API-Kapitelsteuerung, automatische Fortsetzung und abschließende
Veröffentlichungsprüfungen folgen separat.
