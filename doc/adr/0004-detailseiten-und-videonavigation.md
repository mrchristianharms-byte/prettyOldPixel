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
Phasenerkennung, Kapitelsteuerung, Partnerlisten und automatische Fortsetzung
folgen separat.

## Entscheidung

### 1. Eine Detailseite pro Spiel bzw. Ausgabe

| URL | Funktion |
|---|---|
| `/spiele/<slug>/` | Spielinformationen, vollständige Videoliste, Player und Beschreibungen |
| `/spiele/<slug>/#video-<youtube-id>` | Auswahl eines Videos auf derselben Spieleseite |
| `/zeitschriften/<slug>/` | Zeitschrift, Jahrgänge und Videos |
| `/zeitschriften/<slug>/<jahr>/` | Jahrgang, Ausgaben und zugeordnete Videos |
| `/zeitschriften/<slug>/ausgaben/<ausgaben-id>/` | Heftinformationen, Player und sämtliche Videoteile |
| `/zeitschriften/<slug>/ausgaben/<ausgaben-id>/#video-<youtube-id>` | Auswahl eines Videoteils auf derselben Ausgabenseite |
| `/videos/` | Paginierter Katalog mit Links zu vorhandenen Videoabschnitten bzw. YouTube |

Die Zwei-Video-Schwelle für Spiele bleibt bestehen. Unklare Ausgaben erzeugen
keine spekulative Seite. Solange ein Video keine vorhandene sichere Detailseite
hat, führt sein Link aus News, Katalog oder Zeitschriftenübersicht direkt zu
YouTube und ist extern gekennzeichnet. Das gilt auch für nicht bestätigte
Spielzuordnungen und Spiele unterhalb der Zwei-Video-Schwelle.

Bei mehreren Ausgaben verlinken News und Gesamtkatalog die nach Zeitschriften-Slug
erste sichere Ausgabe. Innerhalb einer Zeitschriftenübersicht bleibt ihr
jeweiliger Ausgabenkontext maßgeblich. Alle bestätigten Zuordnungen sind
zusätzlich erreichbar. Eine Mehrfachzuordnung erzeugt keine Videoseite.
Ohne sichere Ausgabe ist die alphabetisch nach Slug erste qualifizierte
Spieleseite das Linkziel. Innerhalb einer Spieleseite behalten sämtliche
Video-Fragmente und strukturierten Listen ihren eigenen Spielkontext.

Ausgaben- und Video-IDs sind stabile Identitäten, keine laufenden Positionen.
Ein geändertes `2/10` ändert das Video-Fragment nicht.

### 2. Statische Inhalte und minimale Verbesserung durch JavaScript

Alle Videotitel, Veröffentlichungsdaten, Beschreibungen, Metadaten und Links
werden beim Offline-Build ins HTML geschrieben. Es gibt keinen Metadatenabruf
oder Download der gesamten Katalogdaten im Browser.

Ein lokales, inhaltsgehashtes Modul ergänzt auf Detailseiten:

- Auswahl per echtem Link `href="#video-<id>"`, auch aus anderen Seiten.
- Initiale Auswahl aus dem Fragment; ohne Video-Fragment erstes Video.
- Ein- und Ausblenden der bereits statisch vorhandenen Beschreibungen.
- Ein gemeinsamer vollbreiter Player; ein Wechsel ersetzt den bisherigen
  Frame-Inhalt durch ein Vorschaubild und stoppt eine laufende Wiedergabe.
- Markierung der aktiven Folge, Positionsanzeige und Aktualisierung des
  Browser-Titels. Zurück/Vorwärts berücksichtigt Fragmentwechsel.
- Keine automatische Wiedergabe oder Player-Aktivierung durch Direktaufruf,
  ungültiges Fragment oder bloße Auswahl eines anderen Videos.

Ohne JavaScript bleiben sämtliche Beschreibungen sichtbar. Die Videoliste
führt zu echten HTML-Abschnitten. Je Abschnitt stehen ein normaler YouTube-Link
und ein expliziter Aktivierungslink für den gemeinsamen Player bereit.
Der No-JavaScript-Fallback zeigt daher nicht einen leeren Platzhalter.

Der Player lädt YouTube erst nach bewusster Aktivierung, bevorzugt über
`youtube-nocookie.com`. Das sichtbare Vorschaubild kommt direkt von YouTube.
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

Ausgabenseiten zeigen Zeitschrift, Heftbezeichnung, Jahr, Monat(e), Heftnummer
und Sonderheftkennzeichen soweit bekannt sowie gekennzeichnete Archivlinks.
Videoteile folgen den Regeln aus ADR 0003.

### 4. Responsive Darstellung und Navigation

Der Player nutzt die volle verfügbare Inhaltsbreite mit reserviertem
Seitenverhältnis. Die Videoliste verkleinert ihn nicht zu einer Seitenspalte.
Unter dem Player stehen auf Desktop die aktive Beschreibung und daneben die
vollständige Videoliste. Mobil ist diese Liste über ein natives
`details`/`summary`-Menü mit Unicode-Burger und Text erreichbar.
Alle Links funktionieren auch ohne das Modul; Fokus und aktive Auswahl sind
sichtbar und mit Tastatur zugänglich.

Die Positionsanzeige `Video 1/10` ist die einsbasierte Position in der
deduplizierten Liste, nicht die Originalnummer im YouTube-Titel.
Alle Videos eines Spiels bzw. einer Ausgabe bleiben auf derselben Seite,
auch bei mehr als 50 Videos. Übersichten dürfen weiterhin paginiert sein.
Die HTML-Größenbudgets gelten unverändert; Überschreitungen führen zum klaren
Build-Fehler statt einer stillen Aufteilung in Videoseiten.

Breadcrumbs und Canonical bleiben auf der Entitätsseite:

- `Startseite → Spiele → Cadaver`
- `Startseite → Zeitschriften → PC Games → PC Games 12/1992`

Die Videoposition steht im aktiven Inhaltsabschnitt und Browser-Titel.
Der Jahrgang bleibt separat verlinkt. Vorher-/Nachher-Links wechseln das
Video-Fragment innerhalb derselben Seite.

### 5. Kapitel und Partner (späterer Ausbauschritt)

Kapitel stammen aus bestätigten Zeitzeilen wie `01:30 Gameplay` oder
YouTube-Zeitlinks zum betreffenden Video (`t=90`, `t=1m30s`, `start=90`).
Der Build validiert Zeiten und bekannte Videolängen. Zahlen ohne Kontext,
Aufnahme-Uhrzeiten und Links zu anderen Videos steuern nicht den aktiven Player.

Ein Kapitel bleibt ein echter YouTube-Zeitlink. Nach Player-Aktivierung kann
die offizielle IFrame-API den Sprung über `seekTo` übernehmen. Ohne JavaScript,
bei gesperrter API oder nicht geladenem Player bleibt der externe Link nutzbar.
Nur die offizielle YouTube-API ist nach Aktivierung als fremdes
Steuerungsskript erlaubt; keine zusätzlichen Analytics- oder Drittanbieter-Skripte.

Explizite Kanal-URLs aus Beschreibungen können als „Erwähnte Kanäle / Partner“
erscheinen. Exakte Hostprüfung, Deduplizierung, Ausschluss des eigenen Kanals
und Abgrenzung zu Watch-/Playlist-/Shorts-URLs sind erforderlich.
Eine Erwähnung behauptet keine bezahlte Zusammenarbeit. Namen und Logos werden
nicht erfunden oder extern nachgeladen.

### 6. Automatische Folgenfortsetzung (späterer Ausbauschritt)

Manuelle Vorher-/Nachher-Links bleiben immer verfügbar. Nach bewusstem
Wiedergabestart darf innerhalb eines Spiels eine abschaltbare Option
„Nächste Folge automatisch“ die Fortsetzung erlauben.

Die offizielle API erkennt `YT.PlayerState.ENDED`; die gespeicherte Dauer
ersetzt keine Enderkennung. Bei Ende wird auf derselben Spieleseite die nächste
Folge gewählt, das Fragment und die Beschreibung aktualisiert und deren
Wiedergabe versucht. Es gibt weder eine neue Videoseite noch einen
seitenübergreifenden Sitzungsmarker. Browserbeschränkungen sind zu respektieren;
bei blockiertem Autoplay bleibt ein manueller Startlink, keine Schleife.

Ein normaler Direktaufruf startet nichts automatisch. Am Reihenende gibt es
keinen ungefragten Sprung zu einem anderen Spiel oder einer fremden Playlist.
Die derzeitige Implementierung hat weder API-Enderkennung noch Auto-Fortsetzung
und verwendet keinen Local-/Session-Storage dafür.

### 7. SEO, Anschlussnavigation und Inhaltszeitpunkte

Jede Spiel-/Ausgabenseite hat genau eine fragmentlose Canonical-URL und einen
Sitemap-Eintrag. Video-Fragmente sind Auswahl-/Abschnittslinks, keine eigenständig
indexierbaren Seiten. Es gibt keine `/videos/<id>/`-Einträge und keine zusätzlichen
Sitemap-URLs für Kapitel oder Videoauswahl.

JSON-LD enthält die Entität (`VideoGame`, `Periodical`, `PublicationIssue`),
eine passende `CollectionPage`/`ItemList`, `BreadcrumbList` und je vorhandenem
Video ein `VideoObject` mit eigener Beschreibung, Datum, Dauer,
YouTube-Thumbnail und `embedUrl` soweit bekannt. Seine `url` und `@id` zeigen
auf den realen Videoabschnitt. Erkanntes `Clip`-Markup folgt erst mit validierter
Kapitelaufbereitung. Fragmente garantieren keine eigenen Suchergebnisse oder
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
- Player aktiviert erst nach Klick, nur erlaubte externe Medienressourcen.
- Mobile Menüliste, Desktopliste, Fokus und volle Playerbreite funktionieren.
- Canonicals, Sitemap, JSON-LD und alle Fragmentziele sind valide.
- Unveränderte Daten erzeugen identische Dateien und Inhaltszeitpunkte.
