# ADR: Detailseiten, Videonavigation und fortlaufende Wiedergabe

**Status:** Vorgeschlagen
**Datum:** 2026-10-17
**Entscheider:** Christian Harms
**Kontext:** Spielinformationen und Zeitschriftenausgaben mit direkt abspielbaren Videos.
**Grundlagen:** [ADR 0002](0002-statische-seiten-seo-und-performance.md) und
[ADR 0003](0003-seitenstruktur-und-inhaltszuordnung.md)

## Kontext

Besucher sollen ein Spiel kennenlernen, mehrere Videos einer Reihe anschauen
und anschließend weitere passende Spiele oder Zeitschriften entdecken können.
Die Detailseiten müssen zugleich als eigenständige, über Suchmaschinen
auffindbare Dokumente funktionieren.

Für Spiele werden gemeinsame Informationen und eine vollständige Videoliste
benötigt. Beim Wechsel der Folge bleibt das Layout gleich; das aktive Video
und seine Beschreibung ändern sich. Für Blätterabend gibt es Detailseiten
zu Zeitschriftenausgaben mit wenigen Heft-Metadaten und den zugehörigen Videos.

Die Quelldaten enthalten bereits Video-Beschreibungen, Playlist-Mitgliedschaften
und Reihenfolgen. Manche Beschreibungen liefern Kapitelmarken und Spielangaben,
beispielsweise `Spiel:`, `Publisher:`, `Entwickler:`, `Releasedatum:` und
`Systeme:`. Diese Informationen sind noch nicht als geprüfter Spielekatalog
strukturiert. Kapitel kommen auch als reine Zeitangaben wie `00:01:30 Gameplay`
vor, nicht nur als Links. YouTube-Kanalverweise kommen beispielsweise als
`https://www.youtube.com/@StayForeverDE` vor.

## Entscheidung

### 1. Informationsseite und stabile Videoseiten

Wir behalten die in ADR 0003 festgelegte Trennung zwischen Entitäten und Videos:

| URL | Funktion |
|---|---|
| `/spiele/<slug>/` | Informationsseite zum Spiel mit Metadaten, Reihenübersicht und Einstieg ins erste Video |
| `/videos/<youtube-id>/` | Kanonische Detailseite des aktiven Videos, mit Spiel- oder Ausgabenkontext |
| `/zeitschriften/<slug>/` | Zeitschriftenübersicht mit Jahrgängen |
| `/zeitschriften/<slug>/<jahr>/` | Jahrgangsübersicht mit Ausgaben |
| `/zeitschriften/<slug>/ausgaben/<ausgaben-id>/` | Informations- und Einstiegsseite zur Ausgabe mit ihren Videos |

Die Zwei-Video-Schwelle für Spieleseiten aus ADR 0003 bleibt bestehen.
Ausgabenseiten werden jetzt für eindeutig identifizierte, mit mindestens einem
Video belegte Ausgaben vorgesehen. Dies konkretisiert die dort bisher optionale
Ausgabenseite. Unklare Ausgaben verbleiben in der vorhandenen
Zeitschriftenübersicht; ihre Videos bleiben über die Videoseite erreichbar.

Ausgaben-ID und Video-ID sind stabile Identitäten, keine laufenden Positionen.
Ein geändertes `2/10` darf deshalb nicht die URL verändern.

Die Informationsseite einer Entität und die einzelnen Videoseiten verwenden
gemeinsame Templates. Alle Videoseiten desselben Spiels zeigen dieselben
Spielinformationen, dieselbe Navigation und dieselbe Reihenübersicht.
Videobezogen ändern sich der Player, die Beschreibung, Kapitel, Partnerverweise,
aktive Markierung, Positionsanzeige sowie Vorher-/Nachher-Links und Metadaten.
Es entstehen keine separaten Kopien einer Videoseite für jede ihrer Kategorien.
Bei mehreren Zuordnungen wird der primäre Kontext deterministisch festgelegt;
weitere Zuordnungen werden zusätzlich verlinkt.

Jede Videoseite wird vollständig als HTML erzeugt. Der Wechsel zu einem anderen
Video erfolgt über einen echten Link zur jeweiligen Videoseite, nicht über
einen clientseitigen Router oder ausschließlich einen wechselnden Player.

### 2. Spielinformationen und Metadaten

Die Spieleseite ist eine Informationsseite, nicht nur eine Playlist-Hülle.
Sie enthält, soweit bestätigt:

- Kanonischen Spieletitel und gegebenenfalls alternative Namen.
- Kurze sachliche Beschreibung des Spiels.
- Entwickler, Publisher, Erscheinungsjahr bzw. belegtes Erscheinungsdatum.
- Plattformen und gegebenenfalls Genre.
- Überblick über vorhandene Durchläufe und Phasen: Unboxing, Spielverlauf,
  Abschlussgespräch, re.consider und weitere zugeordnete Beiträge.
- Liste der zugehörigen Videos mit direkten Links.

Gemeinsame Spielinformationen werden auch auf den zugehörigen Videoseiten
angezeigt. Es werden nur vorhandene, belastbare Daten übernommen.
Ein Eintrag `1990/1991` wird nicht ohne Prüfung zu einem exakten
Veröffentlichungsdatum und ein Plattformhinweis nicht ungeprüft zur Aussage
über jede Version des Spiels.

Metadaten werden aus lokalen Quelldaten aufbereitet und mit Herkunft versehen.
Widersprüche zwischen Beschreibungen werden gemeldet bzw. kuratiert.
Fehlende Daten bleiben ausgelassen oder sichtbar unbekannt. Es wird kein
zusätzlicher externer Abruf im Browser eingeführt.

### 3. Responsive Darstellung und Videoüberschrift

**Breite Bildschirme:**

- Oberhalb des Players stehen Breadcrumbs, Spieletitel und die aktuelle Folge.
- Der Player nutzt die gesamte verfügbare Breite des Seiteninhalts.
  Er wird nicht durch eine seitliche Playlist auf eine schmale Spalte reduziert.
- Unter dem vollbreiten Player stehen Beschreibung und Spielinformationen;
  daneben kann die vollständige Videoliste als zweite Spalte angezeigt werden.
- Alle Videos bleiben als sichtbare Textlinks erreichbar, nach Durchlauf
  gruppiert und mit aktiver Folge, Titel und Position gekennzeichnet.

**Schmale Bildschirme:**

- Einspaltiges Layout mit vollbreitem, responsivem Player ohne horizontales Scrollen.
- Die Videoliste ist über ein Burger-Menü mit Textbeschriftung
  „Videos zum Spiel“ erreichbar. Bevorzugt wird ein natives
  `details`/`summary`-Element, das ohne JavaScript funktioniert.
- Das Menü enthält echte Links und die aktive Folge. Tastaturbedienung,
  sichtbarer Fokus und zugänglicher Zustand bleiben erhalten.
- Keine automatisch nachgeladenen Miniatur-Player in der Folgenliste.

„Volle Breite“ bedeutet 100 % der verfügbaren Inhaltsbreite mit kleinen
Seitenabständen, nicht die Fullscreen-API oder die physische Bildschirmbreite.
Der Player bekommt eine feste Seitenverhältnis-Vorgabe und reservierten Platz,
um Layoutsprünge zu vermeiden; YouTubes Mindestgröße ist zu berücksichtigen.

Die Positionsanzeige lautet beispielsweise:

`Cadaver – Video 1/10: Intro und Unboxing`

Sie erscheint in sichtbarer Überschrift und HTML-`title`. `1/10` ist die
einsbasierte Position in der angezeigten, deduplizierten Wiedergabesequenz,
nicht zwingend die Folgenummer aus dem YouTube-Titel. Eine ursprüngliche Folge
`#0` kann daher Position `1/10` haben; ihr Originaltitel bleibt sichtbar.
Die Gesamtzahl zählt nur zugeordnete, verfügbare Video-Datensätze.
Bei mehreren Durchläufen werden zusätzlich Durchlauf und dessen Reihenfolge
kenntlich gemacht. Die Sortierregeln aus ADR 0003 bleiben maßgeblich;
die Website zeigt die Videos ausdrücklich vom ältesten zum neuesten
Veröffentlichungszeitpunkt, unabhängig von der Playlist-Quellposition.
Die vollständige Folgenliste darf mehr als 50 Videos umfassen.

### 4. Breadcrumbs

Breadcrumbs sind sichtbare echte Links in einem `nav` mit passender Beschriftung
und zusätzlich eine passende `BreadcrumbList` im JSON-LD.
Der aktuelle Eintrag wird mit `aria-current="page"` gekennzeichnet.

Beispiele:

- `Startseite → Spiele → Cadaver → Video 2/10`
- `Startseite → Zeitschriften → PC Games → PC Games 12/1992`

Bei einer Ausgabe mit mehreren Teilen kann auf der Videoseite ein zusätzlicher
Eintrag `Video 2/3` folgen. Der Jahrgang bleibt separat erreichbar, auch wenn er
im gewünschten kompakten Breadcrumb nicht als eigene Stufe erscheint.
Sonderhefte und Doppelausgaben erhalten ihre tatsächliche Bezeichnung statt
eines erfundenen Monats.

### 5. Ausgabenseiten für Blätterabend

Ausgabenseiten verwenden dieselben Grundbausteine wie Spieleseiten:
Breadcrumbs, eindeutiger Titel, Einstieg in die Videos, Video-/Teileliste,
Archivverweise und Empfehlungen.

Die wenigen Heft-Metadaten beschränken sich auf bestätigte Angaben:

- Zeitschriftenname, Ausgabenbezeichnung, Monat bzw. Monate und Jahr.
- Gegebenenfalls Heftnummer oder Kennzeichnung als Sonderheft.
- Passende Links auf kultmags oder reetroz mit erkennbarem Ziel und Match-Typ.

Der aktive Video-Player und seine vollständige Beschreibung erscheinen auf der
verlinkten kanonischen Videoseite mit diesem Ausgabenkontext.
Die Einstiegsseite führt bei einer einzelnen Folge direkt erkennbar zu diesem
Video, bei mehreren Teilen zur geordneten Auswahl. Dadurch werden nicht mehrere
indexierbare Kopien desselben Video-Dokuments erzeugt.

### 6. Beschreibung und Kapitel-Sprungmarken

Die vollständige lokal gespeicherte Videobeschreibung ist bereits im HTML
enthalten. Absätze und Zeilenumbrüche bleiben lesbar; Quellen werden escaped,
nicht als ungeprüftes HTML übernommen.

Kapitel werden beim Build aus folgenden bestätigten Formen erzeugt:

- Zeitzeilen wie `01:30 Gameplay` oder `00:01:30 Gameplay`.
- YouTube-Links auf das aktive Video mit Zeitparametern wie `t=90`,
  `t=1m30s` oder `start=90`.

Zeiten werden in Sekunden normalisiert, auf gültige Werte und, soweit bekannt,
gegen die Videodauer geprüft. Beliebige Zahlen, Aufnahme-Uhrzeiten und Links
auf andere Videos dürfen den aktiven Player nicht unbeabsichtigt steuern.
Andere Video-Links bleiben normale externe Links.

Jede Kapitelmarke ist ein echter Link auf die ursprüngliche YouTube-URL mit
Zeitparameter. Ohne eigenes JavaScript funktioniert sie daher weiterhin.
Mit aktivierter Player-Steuerung wird ein Klick für das aktuelle Video
abgefangen und über `seekTo(seconds, true)` an den bereits aktiven Player
weitergegeben. Ist er noch nicht geladen, wird er nach der Nutzeraktion mit
der gewünschten Startposition initialisiert. Der externe Fallback bleibt
bei fehlender oder fehlerhafter Player-API erreichbar.
Die Kapitelaktion scrollt zum Player, ohne einen unerwarteten Fokusverlust
oder eine automatische Tonwiedergabe zu erzwingen.

### 7. Partner aus Kanalverweisen

Explizite YouTube-Kanalverweise in der Beschreibung werden als Partnerverweise
für das jeweilige Video strukturiert und als „Erwähnte Kanäle / Partner“
angezeigt. Diese Bezeichnung behauptet keine bezahlte Zusammenarbeit.

- Unterstützt werden eindeutig erkennbare Handle- und Kanal-URLs sowie
  bestehende `/c/`- und `/user/`-Kanalverweise.
- Hosts werden exakt als erlaubte YouTube-Hosts geprüft; Watch-, Playlist- und
  Kurzvideo-URLs sind keine Kanalverweise.
- Nachgestellte Satzzeichen werden entfernt, gleiche URLs dedupliziert.
  Unterschiedliche Aliasse werden nur bei bestätigter Kanalidentität zusammengeführt.
- Der eigene Kanal wird nicht als Partner geführt.
- Ohne bekannten Anzeigenamen dient der Handle bzw. die Kanal-ID als Linktext;
  Namen und Logos werden nicht erfunden.
- Externe Links werden gemäß ADR 0002 markiert. Partnerlogos oder andere
  Medien werden nicht zusätzlich von fremden Hosts geladen.

Die Verweise können auf der Spieleseite zusammengefasst werden; ihre Herkunft
aus der jeweiligen Videobeschreibung bleibt nachvollziehbar.

### 8. Nächste Folge und automatische Wiedergabe

Jede Videoseite zeigt unabhängig von JavaScript klare Links zu vorheriger und
nächster Folge sowie zur vollständigen Reihe. Die nächste Folge wird beim Build
aus genau derselben Wiedergabesequenz wie Positionsanzeige und Videoliste ermittelt.

Nach einem bewusst gestarteten Video darf bei dessen Ende automatisch die
nächste Folge starten. Dafür wird auf Detailseiten eine kleine lokale
Player-Steuerung als Progressive Enhancement eingeführt:

1. Player und offizielle YouTube-IFrame-API erst bei Aktivierung der Wiedergabe laden.
2. Einen sichtbaren, abschaltbaren Schalter „Nächste Folge automatisch“ anbieten.
   Er ist für die bewusst gestartete Reihe standardmäßig eingeschaltet;
   beim bloßen Seitenaufruf startet kein Video.
3. Das Ende über den offiziellen `YT.PlayerState.ENDED`-Status erkennen,
   nicht durch einen Timer aus der gespeicherten Dauer schätzen.
4. Wenn eine nächste Folge existiert und die Option aktiv ist, zur echten
   statischen Seite dieser Folge navigieren. Ein kurzlebiger, gleichursprünglicher
   Sitzungsmarker erlaubt dort den Versuch, die Wiedergabe fortzusetzen.
5. Nur ein vom eigenen Ablauf erzeugter Marker für genau die erwartete nächste
   Video-ID darf diesen Versuch auslösen; ein normaler Direktaufruf oder eine
   beliebige URL-Eingabe startet nichts automatisch.
6. Wird Autoplay durch den Browser blockiert oder ist die Folge nicht abspielbar,
   bleibt die korrekte Folgeseite mit sichtbarem Start-/YouTube-Link bedienbar.
   Keine Wiederholungs- oder Weiterleitungsschleife.

Eine Seitennavigation hält URL, Beschreibung, aktive Markierung und SEO-Daten
konsistent, statt nur das Video in einem unveränderten Dokument auszutauschen.
Browser können die automatische Fortsetzung mit Ton nach einer Navigation
verhindern; unterbrechungsfreies Autoplay wird daher nicht garantiert.
Ein Abbruch, deaktiviertes JavaScript oder nicht verfügbarer Sitzungsspeicher
darf die manuelle Folgenavigation nicht verhindern.

Am Reihenende wird nicht ungefragt in ein anderes Spiel oder eine fremde
Playlist gewechselt. Stattdessen erscheinen weitere passende Inhalte als
bewusste Auswahl. Die automatische Fortsetzung gilt zunächst nur für Spielereihen.

**Gezielte Ergänzung zu ADR 0002:** Kapitelsteuerung, Enderkennung und
Folge-Autoplay benötigen eigenes JavaScript. Zusätzlich darf die offizielle
YouTube-IFrame-API nach Player-Aktivierung als externes Steuerungsskript geladen
werden; sie läuft anders als die Player-internen Skripte im Seitendokument.
Sie wird nicht lokal gespiegelt. Andere externe Skripte bleiben ausgeschlossen.
Die lokale Steuerung bleibt im Budget von insgesamt 5 KiB gzip; die
YouTube-API und Player-Ressourcen werden separat gemessen.
Die Datenschutzprüfung aus ADR 0002 gilt auch für diese Einbindung.
Die dort vorgesehene Datenschutzseite erklärt den privaten, nicht kommerziellen
Betrieb ohne Veröffentlichung einer Anschrift sowie die tatsächlichen
YouTube-Verbindungen und die lokale Sitzungsinformation.

### 9. Weiterführende Inhalte und SEO

Unter dem aktiven Video bzw. am Ende der Reihe werden wenige relevante,
statisch generierte Links angeboten:

- Nächste Folge und weitere Durchläufe desselben Spiels.
- Eindeutig zugeordnete verwandte Spiele, sofern belastbare Beziehungen bestehen.
- Weitere Ausgaben derselben Zeitschrift und benachbarte Jahrgänge.
- Rückweg zur Spiel-, Zeitschriften- und Gesamtkatalogübersicht.

Es werden keine sachlichen Beziehungen zwischen Spielen oder Heften erfunden,
nur um Empfehlungen zu füllen. Fehlen passende Empfehlungen, dienen die
Bereichsübersichten als Einstieg. Ziel ist nützliche Anschlussnavigation, nicht
endlose automatische Wiedergabe über Kategoriegrenzen hinweg.

Informationsseiten verwenden `VideoGame` bzw. `PublicationIssue` und die
zugehörigen `ItemList`-Beziehungen. Jede Videoseite enthält ein eigenes
`VideoObject` mit Titel, individueller Beschreibung, Dauer, Datum, erlaubter
YouTube-Thumbnail-URL und `embedUrl`, soweit die Daten vorliegen.
Das Spiel bzw. die Ausgabe wird über passende Beziehungen und stabile `@id`
referenziert. Korrekt erkannte Kapitel können als `Clip` mit Name,
`startOffset`, gegebenenfalls `endOffset` und echtem Zeitlink in `hasPart`
beschrieben werden.

Alle Informationen und Links sind bereits im statischen HTML vorhanden.
Jede Seite erhält eigene Canonical-URL, individuelle Metadaten und passende
Breadcrumbs. Videoseiten verweisen nicht pauschal per Canonical auf die
Spieleseite: Sie besitzen jeweils eigenen Inhalt.
Kapitel-Zeitparameter erzeugen keine zusätzlichen Sitemap-Einträge.
Gemeinsame Spielinformationen werden wiederverwendet, aber die individuelle
Videobeschreibung wird nicht durch identischen allgemeinen SEO-Text ersetzt.
Längere Verweildauer ist ein Nutzungsziel, keine garantierte Rankingwirkung;
Google entscheidet über Indexierung und Rich Results.

## Überprüfung bei der Umsetzung

- Jede Spieleseite zeigt vorhandene Metadaten und verlinkt sämtliche zugeordneten
  Videos; unbekannte Angaben werden nicht erfunden.
- Ein Video an Position 1 von 10 trägt sichtbar und im HTML-Titel `1/10`;
  ursprüngliche Folgenummern, Reihenfolge und URL-Identität bleiben korrekt.
- Desktop zeigt die vollständige Videoliste; mobil ist dieselbe Liste über ein
  ohne JavaScript bedienbares Menü erreichbar.
- Playerbreite, Seitenverhältnis und Mindestgröße funktionieren auf schmalen
  und breiten Ansichten ohne Layoutsprünge oder horizontales Scrollen.
- Breadcrumbs, Canonical-URLs und JSON-LD stimmen mit Entität und aktivem Video überein.
- Zeitzeilen und Zeitlinks springen im aktiven Player an die richtige Position.
  Links auf andere Video-IDs bleiben externe Links; ungültige Zeiten werden
  nicht als Kapitel ausgegeben und bei der Aufbereitung gemeldet.
- Partnerverweise sind dedupliziert, enthalten nicht den eigenen Kanal und
  akzeptieren keine ähnlich aussehenden fremden Hosts als YouTube.
- Nach `ENDED` wird bei aktivierter Option genau die erwartete nächste
  Videoseite aufgerufen; Beschreibung und aktive Markierung passen danach.
- Keine automatische Wiedergabe beim Direktaufruf; kein Weiterwechsel bei
  deaktivierter Option oder am Reihenende.
- Blockiertes Autoplay, Player-Fehler, fehlende API oder gesperrter
  Sitzungsspeicher lassen manuelle Links und verständliche Fehlermeldungen bestehen.
- Eigene Skripte, externe Ausnahmen und initiale Ladebudgets erfüllen ADR 0002.
- Beschreibungen mit Sonderzeichen und nicht vertrauenswürdigen Links bleiben
  sichere Text-/Linkinhalte; es wird kein Quell-HTML ausgeführt.

## Konsequenzen

### Vorteile

- Einheitliche Detailseiten mit Spielinformationen, vollständigen Beschreibungen
  und klarer Folgenavigation.
- Direkte Suchmaschinen-Einstiege sowohl über Spiel bzw. Heft als auch über das
  konkrete Video.
- Komfortable Kapitelsteuerung und optionale fortlaufende Wiedergabe, ohne eine
  SPA einzuführen.
- Gleichwertige Navigation auf Desktop, Mobilgeräten und ohne eigenes JavaScript.

### Risiken und offene Umsetzungsschritte

- Spiel-Metadaten, Kapitel und Kanalverweise müssen aus Texten strukturiert,
  validiert und bei Widersprüchen kuratiert werden.
- Die offizielle Player-API erhöht nach Aktivierung die externen Abhängigkeiten.
- Browserregeln, nicht einbettbare Videos oder YouTube-Änderungen können die
  Wiedergabe und insbesondere Autoplay begrenzen.
- Die Zwei-Video-Schwelle und eindeutige Spiele-/Ausgabenidentitäten bleiben
  Voraussetzungen aus ADR 0003.

Diese ADR beschreibt das geplante Verhalten. Templates, Metadatenaufbereitung,
Kapitelsteuerung und Auto-Fortsetzung sind noch nicht implementiert.

## Referenzen

- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube Player-Parameter](https://developers.google.com/youtube/player_parameters)
- [Schema.org: VideoGame](https://schema.org/VideoGame)
- [Schema.org: PublicationIssue](https://schema.org/PublicationIssue)
- [Schema.org: Clip](https://schema.org/Clip)
