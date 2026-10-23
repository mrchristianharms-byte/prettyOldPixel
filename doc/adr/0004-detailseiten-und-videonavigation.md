# ADR: Detailseiten, Videonavigation und fortlaufende Wiedergabe

**Status:** Vorgeschlagen; Seitenstruktur durch Nutzerentscheidung korrigiert
**Datum:** 2026-10-17
**Entscheider:** Christian Harms
**Grundlagen:** [ADR 0002](0002-statische-seiten-seo-und-performance.md) und
[ADR 0003](0003-seitenstruktur-und-inhaltszuordnung.md)

## Kontext und Korrektur der bisherigen Auslegung

Die ursprünglich hier beschriebene Trennung in Informationsseiten und eine
zusätzliche `/videos/<youtube-id>/`-Seite für jedes Video entsprach nicht der
gewünschten Struktur. Der Nutzer hat ausdrücklich festgelegt:
**Videos werden innerhalb der Spiel- oder Zeitschriftenausgabenseite ausgewählt.**
Nicht sicher zugeordnete Videos werden vorerst direkt bei YouTube verlinkt.

Es entsteht keine neue Seite pro Video. Die Auswahl verändert Player und
Beschreibung, nicht die gemeinsame Spiel- bzw. Heftinformation. Die
Videobeschreibungen bleiben Bestandteil des statischen HTML.

**Umsetzungsstand:** Ausgabe- und Spieleseiten mit gemeinsamem Player,
vollständiger Videoliste, Beschreibungen und lokalem Videowechsel-Modul sind
umgesetzt. Spiele erhalten geprüfte Playlist-/Video-Zuordnungen, belegte
Hauptplattformen und Quellschreibweisen aus dem gepflegten Spielekatalog.
Abschnitts-/Reihenerkennung mit statischen Sprunglinks ist ebenfalls umgesetzt.
Statische Kapitel-Zeitlinks und explizite Kanalverweise sind umgesetzt.
Die Player-Aktivierung wird im Browser gemerkt und kann zurückgesetzt werden;
das lädt weitere Player ohne Autoplay.
API-Kapitelsteuerung, `Clip`-Metadaten und die standardmäßig ausgeschaltete
automatische Fortsetzung auf Spiel- und Heftausgabenseiten sind umgesetzt.
Alle eingebetteten Player verwenden das gemeinsame `videoWidget` mit
identischen Bedienelementen; Übersichtsseiten bleiben ohne Player.

## Entscheidung

### 1. Eine Detailseite pro Spiel bzw. Ausgabe

| URL | Funktion |
|---|---|
| `/spiele/<slug>/` | Spielinformationen, vollständige Videoliste, Player und Beschreibungen |
| `/spiele/<slug>/#video-<youtube-id>` | Auswahl eines Videos auf derselben Spieleseite |
| `/zeitschriften/<slug>/` | Zeitschrift mit allen Ausgaben und Videos auf einer Seite |
| `/zeitschriften/<slug>/#jahr-<jahr>` | Sprung zum Jahrgang auf derselben Zeitschriftenseite |
| `/zeitschriften/<slug>/<hefttitel-slug>/` | Heftinformationen, Player und sämtliche Videoteile |
| `/zeitschriften/<slug>/<hefttitel-slug>/#video-<youtube-id>` | Auswahl eines Videoteils auf derselben Ausgabenseite |

Die Zwei-Video-Schwelle für Spiele bleibt bestehen. Unklare Ausgaben erzeugen
keine spekulative Seite. Solange ein Video keine vorhandene sichere Detailseite
hat, führt sein Link aus News oder Zeitschriftenübersicht direkt zu
YouTube und ist extern gekennzeichnet. Das gilt auch für nicht bestätigte
Spielzuordnungen und Spiele unterhalb der Zwei-Video-Schwelle.

Bei mehreren Ausgaben verlinken News die nach Zeitschriften-Slug
erste sichere Ausgabe. Innerhalb einer Zeitschriftenübersicht bleibt ihr
jeweiliger Ausgabenkontext maßgeblich. Alle bestätigten Zuordnungen sind
zusätzlich erreichbar. Eine Mehrfachzuordnung erzeugt keine Videoseite.
Ohne sichere Ausgabe ist die alphabetisch nach Slug erste qualifizierte
Spieleseite das Linkziel. Innerhalb einer Spieleseite behalten sämtliche
Video-Fragmente und strukturierten Listen ihren eigenen Spielkontext.

Ausgaben- und Video-IDs sind stabile Identitäten, keine laufenden Positionen.
Ein geändertes `2/10` ändert das Video-Fragment nicht.
Die interne Ausgaben-ID ist nicht der öffentliche Dateipfad: Dieser enthält
den normalisierten Zeitschriften-/Hefttitel gemäß ADR 0003.

### 2. Statische Inhalte und minimale Verbesserung durch JavaScript

Alle Videotitel, Veröffentlichungsdaten, Beschreibungen, Metadaten und Links
werden beim Offline-Build ins HTML geschrieben. Es gibt keinen Metadatenabruf
oder Download der gesamten Katalogdaten im Browser.

Ein lokales, inhaltsgehashtes Modul ergänzt auf Detailseiten:

- Auswahl per echtem Link `href="#video-<id>"`, auch aus anderen Seiten.
- Initiale Auswahl aus dem Fragment; ohne Video-Fragment erstes Video.
- Ein- und Ausblenden der bereits statisch vorhandenen Beschreibungen.
- Ein gemeinsamer Player über die Breite der linken Inhaltsspalte; ein Wechsel ersetzt den bisherigen
  Frame-Inhalt und stoppt eine laufende Wiedergabe. Je nach gespeicherter
  Aktivierung lädt der neue Player oder ein Vorschaubild.
- Markierung der aktiven Folge, Positionsanzeige und Aktualisierung des
  Browser-Titels. Zurück/Vorwärts berücksichtigt Fragmentwechsel.
- Keine automatische Wiedergabe. Ohne zuvor gemerkte Aktivierung laden
  Direktaufrufe, ungültige Fragmente oder eine andere Videoauswahl keinen Player.

Ohne JavaScript bleiben sämtliche Beschreibungen sichtbar. Die Videoliste
führt zu echten HTML-Abschnitten. Je Abschnitt stehen ein normaler YouTube-Link
und ein expliziter Aktivierungslink für den gemeinsamen Player bereit.
Der No-JavaScript-Fallback zeigt daher nicht einen leeren Platzhalter.

Der Player lädt YouTube erstmals nach bewusster Aktivierung, bevorzugt über
`youtube-nocookie.com`. Die Aktivierung wird mit JavaScript unter
`pretty-old-pixel:youtube-player-enabled` im Local Storage gespeichert und
gilt auch für folgende Seitenbesuche, bis sie über den Button unter dem Player
oder durch Löschen der Browserdaten zurückgesetzt wird. Es wird kein
Wiedergabeverlauf gespeichert und kein Autoplay eingeschaltet. Ein gesperrter
Browser-Speicher wird sichtbar gemeldet; die Aktivierung bleibt manuell möglich.
Ohne JavaScript bleibt die Freigabe auf den jeweiligen Player beschränkt.
Das sichtbare Vorschaubild kommt direkt von YouTube.
Es gibt keine lokale Medienkopie. Die lokale Steuerung bleibt insgesamt
innerhalb von 5 KiB gzip.

### 3. Spielinformationen, Phasen und Reihenfolge

Eine Spieleseite enthält soweit belegt kanonischen Titel, Beschreibung,
Entwickler, Publisher, Erscheinungsdatum/-jahr, Plattformen und Genre.
Metadaten erhalten nachvollziehbare Herkunft; widersprüchliche oder fehlende
Angaben werden nicht erfunden. Mehrere Spiele derselben Franchise bleiben
getrennt. Die Spieleseite ist keine reine Playlist-Hülle.

Vorhandene Phasen wie Unboxing, Spielverlauf, Abschlussgespräch, spätere
re.play-Durchläufe und re.consider bleiben kenntlich. Die Reihenfolge aller
verfügbaren Spielvideos läuft numerisch nach `publishedAt` vom ältesten zum
neuesten, bei Zeitgleichheit nach ID. Ursprüngliche Folgenummern wie `#0` oder
`21,5` bleiben im Originaltitel, bestimmen aber nicht die Reihenposition.
Unbekannte Veröffentlichungsdaten bleiben separat erreichbar und werden nicht
in eine erfundene Autoplay-Sequenz einsortiert.

Eine zusätzliche Übersicht „Abschnitte und Reihen“ wird nicht angezeigt.
Die Videoliste enthält die `#video-<id>`-Links. Jede Folge zeigt
ihren Abschnitt und ihre Reihe sowohl in der vollständigen Liste als auch
beim aktiven Video. Die Gruppierung ändert weder Positionsnummern noch
Vorher-/Nachher-Links oder JSON-LD-Listenreihenfolge. Sie funktioniert statisch
und benötigt kein weiteres Laufzeitscript.

Abschnitte beruhen auf expliziten Titelmerkmalen und bestätigtem Playlist-Kontext
gemäß ADR 0003, nicht auf geratenen Folgenummern. Quellreihen unterscheiden
Playlists und Formate; ausdrückliche Staffel-/Durchlaufmarker gelten nur ab
ihrem datierten Video innerhalb derselben Quellreihe. Unklare Beiträge bleiben
entsprechend gekennzeichnet und zugänglich. Es werden weder fehlende
Abschlussgespräche noch zusätzliche Durchläufe erfunden.

Ausgabenseiten zeigen Zeitschrift, Heftbezeichnung, Jahr, Monat(e), Heftnummer
und Sonderheftkennzeichen soweit bekannt sowie gekennzeichnete Archivlinks.
Videoteile folgen den Regeln aus ADR 0003.

Heft-, Spiel- und aktive Videometadaten sind kompakte semantische
Definitionslisten mit gruppierten Beschriftungs-/Wertpaaren. Alle Listen
stehen unabhängig von der Bildschirmbreite in einer gemeinsamen Zeile mit
gleich breiten Spalten und Beschriftungen oberhalb der Werte. Lange Titel und Werte
umbrechen innerhalb ihrer Spalte; es gibt weder abgeschnittene Informationen
noch horizontales Scrollen. Die Darstellung benötigt kein JavaScript.

### 4. Responsive Darstellung und Navigation

Spiel- und Ausgabenseiten verwenden dasselbe Template auf Grundlage des
Spielelayouts. Die vollständige Videoliste beginnt auf Desktop rechtsbündig
auf Höhe des Seitentitels. Links stehen der kompakte einzeilige Titel und
direkt darunter der gemeinsame Player; alle Metadaten, Reiheninformationen
und Beschreibungen folgen unter dem Video. Lange Seitentitel werden optisch
mit Auslassung dargestellt, bleiben als vollständiger Text und Tooltip erhalten.
Der Player nutzt die Spaltenbreite mit reserviertem Seitenverhältnis und
höchstens 60 Prozent der kleinen Viewporthöhe. Kopfbereich und Navigation
haben reduzierte vertikale Abstände.
Die schmalere rechte Spalte zeigt Nummer und Titel ohne Präfix „Video“,
darunter Laufzeit und Veröffentlichungsdatum in kleiner Schrift. Das Menü
bleibt auf Desktop erreichbar; seine Liste scrollt unabhängig mit begrenzter
Höhe und ohne Scrollweitergabe an die Hauptseite. Sie ist per Tastatur
fokussierbar. Mobil bleibt die Listenhöhe auf 45 Prozent des Viewports begrenzt.
Unter 768 Pixeln steht das native `details`/`summary`-Menü mit Unicode-Burger
und Text auf beiden Seitentypen unter dem Player und vor den Metadaten.
Alle Links funktionieren auch ohne das Modul; Fokus und aktive Auswahl sind
sichtbar und mit Tastatur zugänglich.
Bei initialen Video-Fragmenten richtet das Modul den sichtbaren Ausschnitt
am Player aus. Der aktive Inhaltsabschnitt erhält dazu einen passenden
Scroll-Abstand, damit ein später nativer Browser-Fragmentsprung den Player
nicht wieder aus dem sichtbaren Bereich schiebt. Ohne JavaScript bleibt
die normale Navigation zu den vollständigen Beschreibungen erhalten.

Die Positionsanzeige `Video 1/10` ist die einsbasierte Position in der
deduplizierten Liste, nicht die Originalnummer im YouTube-Titel.
Alle Videos eines Spiels bzw. einer Ausgabe bleiben auf derselben Seite,
auch bei mehr als 60 Videos. Das gilt auch für Zeitschriftenseiten (alle
Ausgaben auf einer Seite); andere Übersichten dürfen weiterhin paginiert sein.
Die HTML-Größenbudgets gelten unverändert; Überschreitungen führen zum klaren
Build-Fehler statt einer stillen Aufteilung in Videoseiten.

Breadcrumbs und Canonical bleiben auf der Entitätsseite:

- `Startseite → Spiele → Cadaver`
- `Startseite → Zeitschriften → PC Games → PC Games 12/1992`

Die Videoposition steht im aktiven Inhaltsabschnitt und Browser-Titel.
Der Jahrgang bleibt separat verlinkt. Vorher-/Nachher-Links wechseln das
Video-Fragment innerhalb derselben Seite.

### 5. Kapitel und Partner

**Umgesetzt:** Die Beschreibung wird offline in Kapitel und erwähnte Kanäle
aufbereitet. Sichtbare Kapitel bleiben externe Zeitlinks. Im aktivierten,
bereiten Player übernimmt die offizielle IFrame-API normale Kapitelauswahl.
Zeitzeilen benötigen einen aufsteigenden Block mit mindestens zwei Einträgen
ab Null oder eine direkte Kapitel-/Zeitmarkenüberschrift. Dies vermeidet
Fehltreffer bei einzelnen Uhrzeiten. Bekannte Videolängen begrenzen die Marken,
gleiche Sekunden werden dedupliziert. Leere Abschnitte entfallen.
Die Darstellung liegt pro Video in dessen Spiel-/Ausgabepanel und funktioniert
unverändert ohne JavaScript; die Originalbeschreibung bleibt erhalten.

Kapitel stammen aus bestätigten Zeitzeilen wie `01:30 Gameplay` oder
YouTube-Zeitlinks zum betreffenden Video (`t=90`, `t=1m30s`, `start=90`).
Der Build validiert Zeiten und bekannte Videolängen. Zahlen ohne Kontext,
Aufnahme-Uhrzeiten und Links zu anderen Videos steuern nicht den aktiven Player.

Ein Kapitel bleibt ein echter YouTube-Zeitlink. Nach Player-Aktivierung
übernimmt die offizielle IFrame-API den Sprung über `seekTo` während
Wiedergabe/Pause. Ein noch nicht gestartetes Video oder ein Kapitel-Direktlink
wird per `cueVideoById({videoId, startSeconds})` ohne Wiedergabestart
bereitgestellt. Ohne JavaScript,
bei gesperrter API oder nicht geladenem Player bleibt der externe Link nutzbar.
Nur die offizielle YouTube-API ist nach Aktivierung als fremdes
Steuerungsskript erlaubt; keine zusätzlichen Analytics- oder Drittanbieter-Skripte.
Strg-/Befehl-Klick bleibt ein normaler externer Link. Die API lädt einmal pro
Dokument erst nach Freigabe, mit zehn Sekunden Timeout für Laden und
Player-Bereitschaft. Fehler werden sichtbar gemeldet; sie ersetzen Links nicht
durch wirkungslose Schaltflächen.

Explizite Kanal-URLs aus Beschreibungen können als „Erwähnte Kanäle / Partner“
erscheinen. Exakte Hostprüfung, Deduplizierung, Ausschluss des eigenen Kanals
und Abgrenzung zu Watch-/Playlist-/Shorts-URLs sind erforderlich.
Eine Erwähnung behauptet keine bezahlte Zusammenarbeit. Namen und Logos werden
nicht erfunden oder extern nachgeladen.

### 6. Automatische Folgenfortsetzung

Manuelle Vorher-/Nachher-Links bleiben immer verfügbar. Nach bewusstem
Wiedergabestart darf innerhalb eines Spiels oder einer Heftausgabe eine abschaltbare Option
„Nächste Folge automatisch“ die Fortsetzung erlauben. Ohne bisherige Auswahl
ist sie aus und bis zur API-Bereitschaft deaktiviert. Die ausdrückliche
Ein-/Aus-Auswahl wird getrennt von der Player-Freigabe im Local Storage unter
`pretty-old-pixel:youtube-auto-next` gemerkt. Sie startet beim Seitenaufruf
keine Wiedergabe. Sicherheitsstopps ändern nicht die gespeicherte Auswahl.

Die offizielle API erkennt `YT.PlayerState.ENDED`; die gespeicherte Dauer
ersetzt keine Enderkennung. Bei Ende wird auf derselben Spiel- bzw. Ausgabenseite die nächste
Folge gewählt, das Fragment und die Beschreibung aktualisiert und deren
Wiedergabe versucht. Es gibt weder eine neue Videoseite noch einen
seitenübergreifenden Sitzungsmarker. Browserbeschränkungen sind zu respektieren;
bei blockiertem Autoplay bleibt ein manueller Startlink, keine Schleife.

Ein normaler Direktaufruf startet nichts automatisch. Am Reihenende gibt es
keinen ungefragten Sprung zu einem anderen Spiel, einer anderen Heftausgabe oder einer fremden Playlist.
Die Implementierung verlangt `PLAYING` für das aktive Video vor `ENDED`
und berücksichtigt nur die unmittelbar folgende datierte Folge.
Undatierte Videos, Reihenende, Playerfehler und Autoplay-Sperren stoppen
die Fortsetzung. Nur die Ein-/Aus-Auswahl wird lokal gemerkt, kein Verlauf
oder Wiedergabefortschritt; Session Storage wird nicht verwendet.
Manuelle Auswahl oder Zurücknavigation lädt per `cueVideoById`, automatische
Fortsetzung per `loadVideoById`. Der automatische Wechsel aktualisiert das
Fragment mittels History-API ohne nativen Seitensprung. Ein blockierter
Start bietet „Video manuell starten“ und deaktiviert die automatische Option.

### 7. SEO, Anschlussnavigation und Inhaltszeitpunkte

Jede Spiel-/Ausgabenseite hat genau eine fragmentlose Canonical-URL und einen
Sitemap-Eintrag. Video-Fragmente sind Auswahl-/Abschnittslinks, keine eigenständig
indexierbaren Seiten. Es gibt keine `/videos/<id>/`-Einträge und keine zusätzlichen
Sitemap-URLs für Kapitel oder Videoauswahl.

JSON-LD enthält die Entität (`VideoGame`, `Periodical`, `PublicationIssue`),
eine passende `CollectionPage`/`ItemList`, `BreadcrumbList` und je vorhandenem
Video ein `VideoObject` mit eigener Beschreibung, Datum, Dauer,
YouTube-Thumbnail und `embedUrl` soweit bekannt. Seine `url` und `@id` zeigen
auf den realen Videoabschnitt. `hasPart` enthält validierte Kapitel als `Clip`
mit Name, `startOffset` und eigenem Zeitlink `./?t=<sekunden>#video-<id>` auf
derselben Entitätsseite. Nach Freigabe springt der Player zu dieser
validierten Marke ohne Autoplay; unbekannte oder ungültige Marken werden
nicht angewendet. Der Canonical bleibt ohne Query und Fragment. `endOffset` ist
der nächste Kapitelbeginn oder die bekannte Gesamtdauer; ohne bekannte letzte
Grenze wird es weggelassen. Ohne Kapitel entsteht kein `hasPart`.
Fragmente garantieren keine eigenen Suchergebnisse oder
Video-Rich-Results.

Weitere Ausgaben, Jahrgänge, Spiele und Bereichsübersichten werden als echte
Links angeboten. Beziehungen werden nicht für Empfehlungen erfunden.
News führen auf vorhandene Videoabschnitte, sonst YouTube. Alle Inhaltsänderungen
und Linkwechsel beeinflussen den Fingerabdruck; Abruf- und Build-Zeiten nicht.
HTTP-Caching und belegbare Änderungszeitpunkte bleiben getrennt gemäß ADR 0002/0003.

## Überprüfung

- Keine separate Videoseite oder Links zu entfernten Videoseiten im Build.
- Genau eine Detailseite pro Ausgabe/Spiel mit vollständigen Beschreibungen.
- Direktlink, Auswahl, Zurück/Vorwärts und Titel wechseln konsistent.
- Ohne JavaScript sind alle Abschnitte und externen Fallbacks zugänglich.
- Ein Wechsel stoppt die alte Wiedergabe, ohne neue Wiedergabe zu starten.
  Ausnahme: ausdrücklich eingeschaltete Fortsetzung nach echtem Videoende.
- Player aktiviert erst nach Klick oder zuvor gespeicherter Freigabe, nur
  erlaubte externe Medienressourcen; Zurücksetzen wirkt auf folgende Besuche.
- API-Sperren, fehlende Bereitschaft und blockiertes Autoplay werden gemeldet.
- Reale externe Kapitel-Links funktionieren ohne API und ohne JavaScript.
- Opt-out, Reihenende, unbekannte Datumswerte und veraltete Player-Ereignisse
  lösen keine unerwünschte Fortsetzung aus.
- Mobile Menüliste, Desktopliste, Fokus und volle Playerbreite funktionieren.
- Canonicals, Sitemap, JSON-LD und alle Fragmentziele sind valide.
- Unveränderte Daten erzeugen identische Dateien und Inhaltszeitpunkte.
