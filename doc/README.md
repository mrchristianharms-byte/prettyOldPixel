# Pretty Old Pixel: Funktionen und Datenaufbereitung

Zurück zum [Projekteinstieg](../README.md).

Diese Referenz beschreibt Funktionen, Datenformate, Zuordnungsregeln und
Build-Verhalten im Detail. Alle Befehle werden im Projektverzeichnis ausgeführt;
Dateipfade im Text beziehen sich auf dessen Wurzel.

## Inhalt

- [Generierung und lokale Vorschau](#lokal-bauen)
- [Kanalstatistik](#startseite-kanal-und-themen-in-zahlen)
- [Hardware, Retrospektiven und Gespräche](#hardware-retrospektiven-und-gespräche)
- [Spiele und Reihen](#spiele-und-bestätigte-playlist-zuordnungen)
- [Neue Videos, Titel und fehlende Metadaten](#recherchierte-daten-pflegen)
- [Kapitel und erwähnte Kanäle](#kapitel-und-erwähnte-kanäle)
- [Zeitschriften und Ausgaben](#blätterabend-nach-zeitschrift-und-jahrgang)
- [Medien, SEO und Builds](#medien-seo-und-unveränderte-builds)
- [Tests](#tests)
- [YouTube-Videos](#youtube-videos-cachen)
- [YouTube-Playlists](#youtube-playlists-cachen)
- [Blätterabend-Aufbereitung und Archive](#blätterabend-videos-auswerten)
- [Architekturentscheidungen](#architekturentscheidungen)
- [GitHub Pages](#github-pages-veröffentlichen)

Statische Website für GitHub Pages. Die Quelldateien und der Websitegenerator liegen
in `src/`; `npm run generate:site` erzeugt die veröffentlichbaren Dateien in `docs/`.

## Lokal bauen

Voraussetzung: Node.js 22 oder neuer.

```sh
npm run generate:site
```

Die Namenskonvention trennt Internetabrufe (`fetch-*` bzw. `fetch:*`) von
lokaler Generierung (`generate-*` bzw. `generate:*`). Der Websitegenerator
heißt `src/generate-site.mjs`, das npm-Ziel `generate:site`; das bisherige
allgemeine `build`-Ziel entfällt. Gemeinsam genutzte `site-*`-Module sind
Bausteine des Websitegenerators, keine separaten Abrufscripts.
Überwiegend recherchierte, dauerhaft gepflegte Daten und einfache
Zuordnungsmuster erhalten den Präfix `data-`; ausführende Scraper,
Generatoren und deren Logik behalten ihre bisherigen Präfixe.

Der Build liest ausschließlich die vorhandenen lokalen JSON-Dateien unter
`cache/` und benötigt keinen Netzwerkzugriff. Scraper werden nicht automatisch
gestartet. Beide YouTube-Caches müssen vollständig sein und alle drei
Quelldateien zum selben Kanal gehören; sonst bricht der Build mit einer
Fehlermeldung ab und erhält die letzte erfolgreiche Ausgabe.

Die Produktionsadresse lautet
https://mrchristianharms-byte.github.io/prettyOldPixel/.
Alle internen Links und Assets werden relativ zur jeweiligen Seite erzeugt,
z. B. `../news/` oder `../../assets/site.<hash>.css`, ohne fest eingebauten
Projektpfad. Auch Canonicals, `og:url`, Paginierung und interne JSON-LD-URLs
einschließlich `@id` sind seitenrelativ. Nur die Sitemap enthält vollständige
Seiten-URLs; ihre `Sitemap:`-Referenz in `robots.txt` bleibt ebenfalls absolut.
Externe YouTube-/Archivlinks und Schema.org-Bezeichner bleiben unverändert.
Die generierten Dateien unter `docs/` sind Build-Artefakte und gehören nicht
in neue Commits; GitHub Actions erzeugt und prüft sie vor dem Deployment.
`docs/` ist ausschließlich für die generierte Website reserviert und wird beim
Build vollständig ersetzt. Die Projektdokumentation bleibt unter `doc/`.
Eine vorhandene Ausgabe unter `public/` kann einmalig nach `docs/` verschoben
werden, damit das Build-Manifest und unveränderte Dateizeitpunkte erhalten bleiben.

### Erste Seiten und lokale Vorschau

Umgesetzt sind Startseite, News mit den 20 neuesten veröffentlichten Videos,
Zeitschriftenindex mit Zeitschriften-, Jahrgangs- und Ausgabenseiten,
Spieleindex und Spieleseiten, Hardware, Retrospektiven sowie Interviews und Gespräche,
Datenschutz, Sitemap, Robots-Datei und 404-Seite. Alle Inhalte stehen direkt im
HTML. Nur Spiel-/Ausgabenseiten laden ein kleines lokales JavaScript für die Auswahl
von Video und Beschreibung; ohne JavaScript sind alle Beschreibungen sichtbar.
**Es gibt weder einen Gesamtkatalog unter `/videos/` noch separate Videoseiten.**
Videos erscheinen auf thematischen Seiten sowie in der begrenzten News-Übersicht.
Nicht zugeordnete ältere Videos bleiben nur im vollständigen JSON-Cache erhalten.
Beim Build werden alte Katalogseiten einschließlich Sitemap-/Manifest-Einträgen entfernt.
News und Themenübersichten führen zum
Videoabschnitt einer vorhandenen Ausgabe bzw. eines Spiels, sonst direkt zu YouTube.

Archivverweise auf Zeitschriftenseiten erscheinen als kleine Ordner-, Lese-
und Downloadsymbole in Klammern neben dem jeweiligen Zeitschriften-/Ausgabentitel,
einmal pro Ausgabe statt an jedem Videolink; auf schmalen Displays
dürfen sie natürlich umbrechen. Die vollständige
Beschriftung mit Anbieter und Hinweis auf die externe Website bleibt für
Screenreader und als Tooltip erhalten. Auch die Archivübersicht einer Ausgabe
verwendet diese Symbole; Lese-/Downloadlinks erscheinen nur bei bestätigten
Hefttreffern. Die Icons sind eingebettete SVGs ohne zusätzliche Netzabfragen.

Für eine lokale Vorschau ohne Projekt-Unterpfad:

```sh
npm run generate:site -- --base-url http://localhost:8000/
python3 -m http.server 8000 --bind 127.0.0.1 --directory docs
```

Dann http://localhost:8000/ öffnen. Der HTML-/Asset-Baum funktioniert unverändert
im Webroot oder in einem beliebigen Unterverzeichnis. Vor einem manuellen
Produktions-Upload erneut `npm run generate:site` ohne lokale Basis-URL ausführen,
damit Sitemap und Robots-Referenz auf die Produktionsadresse zeigen. Ein reiner
Wechsel der Basis-URL ändert weder HTML noch dessen `lastModified`.
Für die Vorschau einen HTTP-Server verwenden: Verzeichnislinks und ES-Module
funktionieren beim direkten Öffnen per `file://` nicht browserübergreifend.
Wird `404.html` vom Hoster unter einer beliebig tiefen, nicht existierenden URL
ausgeliefert, beziehen sich relative Links auf diese angefragte URL; ohne
serverseitige Umleitung kann eine statische relative Fehlerseite das nicht
für alle Pfadtiefen ausgleichen.

Die gemeinsame Datenaufbereitung verknüpft Playlist-Mitgliedschaften per Video-ID
und normalisiert Zeitschriften mit Ausgaben und Archivlinks. Videos einer
Playlist werden zusätzlich chronologisch vom ältesten zum neuesten sortiert;
Quellpositionen und Mehrfacheinträge bleiben separat erhalten. Fehlende oder
nicht verfügbare Mitglieder werden gemeldet und nicht als Videos erfunden.
Playlist-Titel allein bestätigen noch kein Spiel. Die geprüften Spielezuordnungen
stehen in `src/data-games.mjs`, die bestätigten Zuordnungen für weitere Bereiche
in `src/data-sections.mjs`. Es gibt keine Links auf noch nicht erzeugte Bereichsseiten.

### Startseite: Kanal und Themen in Zahlen

Die Startseite zeigt keine Liste neuer Videos, sondern ein responsives
Statistikraster mit Gesamtzahl öffentlicher Videos, Zeitschriften,
unterschiedlichen Heftausgaben, qualifizierten Spielereihen, Playlists und
Videostunden (abgerundet). Fehlende Laufzeiten werden als Teilsumme kenntlich
gemacht; bei vollständig fehlenden Laufzeiten entfällt diese Kennzahl.
Der belegbare Kanalbeginn wird als Datum des ältesten erfassten öffentlichen
Videos angezeigt, ausdrücklich nicht als unbekanntes Gründungsdatum.
Unbekannte Datumswerte werden nicht erfunden. Alle Kennzahlen kommen aus dem
lokalen normalisierten Datenbestand; zukünftige Videos werden nicht gezählt.

Themenkacheln verlinken vorhandene Bereiche mit ihrer jeweiligen Videoanzahl.
Mehrfachzuordnungen zählen innerhalb eines Bereichs nur einmal; die Bereiche
sind untereinander nicht addierbar. Ein Link führt weiterhin zur separaten
News-Seite mit den 20 neuesten Veröffentlichungen. Die Statistik braucht
keine externen Ressourcen oder Laufzeit-JavaScript.

### Hardware, Retrospektiven und Gespräche

- `/hardware/` enthält derzeit 14 geprüfte Hardwarebeiträge, neueste zuerst:
  Gerätevorstellungen, Restaurationsprojekte, PC-Grundlagen und Bastelstreams.
  Es gibt keine Unterseiten nach Gerät, Hersteller oder Jahr.
- `/retrospektiven/` enthält die Format-Einleitung und zwölf Beiträge zur
  Geschichte der Flugsimulationen, gruppiert nach Thema und geprüfter
  Folgenreihenfolge. Die zwei Originaltitel mit `#11` bleiben unverändert;
  die Reihenfolge ergibt sich aus der bestätigten Themenreihe, nicht aus
  einer bloßen Titelsortierung. Es gibt keine eigenen Themenunterseiten.
- `/interviews/` enthält acht bestätigte Interviews/Gespräche mit sichtbaren
  Personen- und Themenangaben, neueste zuerst. Bekannte Spielzuordnungen
  werden wiederverwendet, nicht aus zufälligen Erwähnungen im Text erfunden.
  Dazu gehört auch das Interview mit Andreas und Oliver über die C64-Version
  von Eye of the Beholder, das nicht in der Interview-Playlist enthalten ist.
- `src/data-sections.mjs` hält explizite Video-IDs, Themen, bei Gesprächen Personen
  und bei Retrospektiven die Reihenfolge. Titel, Beschreibungen und bestätigte
  Playlist-Mitgliedschaften wurden hierfür geprüft. Änderungen der
  Playlist-Mitgliedschaft allein erzeugen keine ungeprüften Zuordnungen.
  Neue Titel-/Playlist-Kandidaten werden beim Build als Prüfhinweis gemeldet.
  Fehlen bestätigte Beiträge im öffentlichen Cache, werden sie ausgelassen
  und bei vorhandenem Quellplaylist-Kontext ausdrücklich gemeldet.
- Der reine Verpackungsbeitrag `bwVnfQJ-WEw` ist ausdrücklich von Hardware
  ausgeschlossen. Der gemischte Beitrag `XDvGVislnJg` behandelt laut
  Beschreibung Hardware-Reinigung und trägt einen entsprechenden Hinweis.
  re.list, re.collect und Community-Formate erhalten ohne bestätigte Zuordnung keine Themenübersicht.
- Bereiche haben höchstens 60 Einträge pro Übersichtsseite. Fehlende
  Beschreibungen sind zulässig; unbekannte Daten stehen bei Hardware und
  Interviews am Ende. Zukünftige oder fehlende Videos werden nicht publiziert.
  Leere Bereiche erzeugen weder Seiten noch Navigationslinks.
- Startseite, Hauptnavigation, News und zugehörige Detailseiten
  verlinken die vorhandenen Bereiche. Die erweiterten Navigationslinks
  umbrechen auf schmalen Displays. Videolinks führen zu vorhandenen
  Spiel-/Ausgabeabschnitten oder extern zu YouTube; keine zusätzlichen
  Videoseiten, Player, Vorschaubilder oder Laufzeitscripte.
- Auch diese Seiten werden rein offline erzeugt und folgen den relativen
  URL-, Sitemap-, Größenbudget- und Änderungsdatum-Regeln des übrigen Builds.
  Kapitel-Zeitlinks und erwähnte Kanäle stehen auf den Spiel-/Ausgabenseiten.
  Nach Player-Freigabe ergänzt die offizielle YouTube-IFrame-API Kapitelsprünge
  und eine optionale Folgenfortsetzung auf Spiel- und Heftausgabenseiten.

## Recherchierte Daten pflegen

Die Dateien mit Präfix `data-` sind der dauerhaft gepflegte Datenbestand,
nicht automatisch erzeugte Caches:

| Datei | Pflegeinhalt |
| --- | --- |
| [`src/data-games.mjs`](../src/data-games.mjs) | Geprüfte Spieltitel, Plattformen, Playlist-IDs, Aliasse, zusätzliche und ausgeschlossene Video-IDs; einfache Muster zur Bildung der Spielidentität. |
| [`src/data-game-release-years.json`](../src/data-game-release-years.json) | Pro Spiel-ID ein Erscheinungsjahr (`year`), eine öffentliche Quellen-URL (`source`) und bei Bedarf eine kurze Erklärung (`note`). |
| [`src/data-sections.mjs`](../src/data-sections.mjs) | Geprüfte Videozuordnungen für Hardware, Retrospektiven und Gespräche mit Themen, Personen und Folgenreihenfolge. |

### Neue Videos oder Titel aufnehmen

1. `npm run fetch:all` lädt neue öffentliche Videos und prüft die
   Playlist-Mitgliedschaften erneut. Für Blätterabende anschließend
   `npm run fetch:archives` und `npm run generate:blaetterabend` ausführen.
   Die Originaltitel und Beschreibungen bleiben als Quellen erhalten;
   sie werden nicht durch redaktionell geratene Metadaten ersetzt.
2. `npm run generate:site` ausführen und die Build-Hinweise prüfen.
   Eine neue Folge in einer bereits bestätigten Spielplaylist wird automatisch
   dem Spiel zugeordnet. Fehlt sie dort, ihre Zugehörigkeit anhand von Titel,
   Beschreibung und Quellplaylist prüfen und erst dann als Zusatzvideo in
   `src/data-games.mjs` aufnehmen. Bekannte Ausschlüsse bleiben bestehen.
3. Bei einem **neuen Spieltitel** eine eigene bestätigte Spielidentität in
   `src/data-games.mjs` anlegen: kanonischer Name, gegebenenfalls Plattform,
   Quellplaylist und belegte Aliasse/Zusatzvideos. Ähnliche Namen, Nachfolger,
   Plattformversionen und Neuauflagen nicht ungeprüft zusammenlegen.
   Der Slug aus Name und Plattform ist zugleich der Schlüssel in
   `src/data-game-release-years.json`; bestehende IDs nicht beiläufig ändern.
   Eine Spieleseite entsteht erst ab zwei unterschiedlichen verfügbaren
   Nicht-`re.minder`-Videos.
4. Für neue **Hardware-, Retrospektiven- oder Gesprächsbeiträge** die konkrete
   Video-ID in `src/data-sections.mjs` nach Prüfung ergänzen. Thema und bei
   Gesprächen die Personen belegen; bei Retrospektiven zusätzlich die
   Reihenfolge pflegen. Ein Titelmuster oder eine Playlist-Mitgliedschaft
   ist dort nur ein Prüfhinweis, keine automatische Freigabe.

### Fehlende oder widersprüchliche Metadaten

- **Erscheinungsjahr:** Eine verlässliche öffentliche Quelle zur konkreten
  Spiel-/Plattformversion recherchieren und Jahr plus Quellen-URL in
  `src/data-game-release-years.json` dauerhaft pflegen. Für eine festgelegte
  Plattform zählt ihre früheste Veröffentlichung, andernfalls die
  Erstveröffentlichung des Spiels; Gold-/Deluxe-Ausgaben gesondert prüfen.
  Nicht das Video-Uploadjahr und nicht ungeprüft eine Jahreszahl aus der
  Beschreibung übernehmen. Unterschiede zu anderen Plattformen oder
  Neuauflagen bei Bedarf im `note`-Feld erklären.
- **Kein belastbarer Beleg:** Nicht raten. Der Generator meldet ein fehlendes
  Erscheinungsjahr und zeigt es als unbekannt. Der Vollständigkeitstest
  verlangt für jede gepflegte Spielidentität einen Jahresbeleg; eine neue
  Identität ist deshalb erst mit diesem Beleg veröffentlichungsfertig.
  Ungültige Jahreszahlen oder Quellen-URLs brechen den Build ab.
- **Laufzeit, Veröffentlichungsdatum oder Beschreibung fehlen:** Keine
  Ersatzwerte erfinden. Fehlende Laufzeiten bleiben unbekannt und
  Gesamtlaufzeiten werden als Teilsumme gekennzeichnet. Undatierte Videos
  erscheinen nicht in den News und stehen auf passenden Detailseiten am Ende.
  Eine fehlende Beschreibung ist zulässig. Bereits  Videodetails
  werden nicht allein wegen ihres Alters neu geladen; erneutes `fetch:all`
  behebt fehlende Angaben älterer Cache-Einträge daher nicht automatisch.
- **Zeitschrift oder Ausgabe unklar:** Keine spekulative Heftseite erzeugen.
  Titel, Beschreibung und Archivtreffer prüfen. Bestätigte Sonderzuordnungen
  bzw. neue Zeitschriftentitel gehören zu den Zuordnungsdaten/-mustern in
  `src/generate-blaetterabend.mjs`; danach die Blätterabend-Datei neu erzeugen.
  Ungeklärte Angaben bleiben in den vorhandenen unbekannten Gruppen sichtbar.

Zum Abschluss `npm test` und `npm run generate:site` ausführen und die betroffenen
Kacheln, Detailseiten und Quellenlinks in der lokalen Vorschau kontrollieren.
Geänderte `src/data-*`-Dateien samt Tests/Dokumentation versionieren; die Website
unter `docs/` bleibt ein generiertes Artefakt. Das Umbenennen von Datendateien
erfordert zugleich aktualisierte Imports und Dokumentationsverweise.

### Spiele und bestätigte Playlist-Zuordnungen

- `/spiele/` zeigt qualifizierte Spiele alphabetisch, mit maximal 60 Spielen je
  Übersichtsseite. `/spiele/<slug>/` enthält die Spielinformationen, sämtliche
  Videos, Beschreibungen und einen gemeinsamen Player. Auch mehr als 60 Videos
  eines Spiels bleiben auf dieser einen Seite.
- `src/data-games.mjs` hält ausdrücklich geprüfte Spielidentitäten mit festen
  Playlist-IDs, kanonischem Namen, bekannten Plattformen, Quellschreibweisen
  und gegebenenfalls bestätigten zusätzlichen Video-IDs fest. Die Zuordnung
  basiert auf Playlist- und Mitgliedstiteln, nicht allein dem Formatnamen.
  Ähnliche Titel, Nachfolger und Plattformvarianten werden nicht automatisch
  zusammengelegt. Der Slug hängt von der gepflegten Identität ab, nicht von
  späteren Änderungen des gescrapten Playlist-Titels.
- `src/data-game-release-years.json` pflegt je Spielidentität ein recherchiertes
  Erscheinungsjahr mit Quellen-URL. Bei festgelegter Plattform zählt die
  früheste Veröffentlichung dieser Version, andernfalls die Erstveröffentlichung
  des Spiels; Gold-/Deluxe-Ausgaben werden gesondert berücksichtigt.
  Die Spielekachel zeigt das Jahr, die Spieleseite zusätzlich den Quellenlink
  mit Anbietername, etwa „Wikipedia“, „C64-Wiki“ oder „Internet Archive“.
  Uploadjahre und widersprüchliche Jahresangaben in Videobeschreibungen sind
  keine automatische Grundlage. Fehlende Jahre werden beim Build gemeldet
  und sichtbar als unbekannt angezeigt; ungültige Jahre oder Quellen brechen
  den Build ab. Neue Spielidentitäten benötigen ebenfalls einen Quellenbeleg.
- Der aktuelle Katalog enthält 144 geprüfte Spielidentitäten aus den
  143 re.play-Playlists und der ebenfalls geprüften 1942-Playlist. Zusätzlich
  ist die re.connect-Playlist zu Railroad Tycoon Deluxe demselben Spiel
  zugeordnet; ihre allgemeine Formatvorstellung ist explizit ausgeschlossen.
  Wizardry hat bisher nur ein Video und erhält daher noch keine Seite.
- Eine Seite entsteht ab zwei unterschiedlichen verfügbaren Videos aus dem
  öffentlichen Video-Cache. Nicht verfügbare Mitglieder, fehlende Videos und
  doppelte Playlist-Einträge erfüllen die Schwelle nicht. Bestätigte
  re.minder-Beiträge ergänzen eine qualifizierte Reihe, heben aber keine
  Ein-Video-Reihe über diese Schwelle.
- Neue Mitglieder bestätigter Playlists werden beim nächsten Offline-Build
  übernommen; Entfernungen ebenfalls. Neue, noch nicht bestätigte re.play-/
  re.connect-Playlists erzeugen einen Build-Hinweis statt einer geratenen
  Spielezuordnung. Ihre Videos bleiben im lokalen Cache erhalten.
- Die vollständige Liste läuft chronologisch von alt nach neu, einschließlich
  Zeitzonen und stabiler Video-ID bei Zeitgleichheit. Undatierte Videos stehen
  gekennzeichnet am Ende. Playlistposition und originale Folgenummer im Titel
  ändern diese Reihenfolge nicht.
- Spieletitel, belegte Hauptplattform und Quellschreibweisen werden sichtbar
  und als `VideoGame`-Metadaten ausgegeben. Entwickler, Publisher, Genre und
  Erscheinungsjahr bleiben ohne Beleg offen; die Quellen sind verlinkt.
- News, Startseite und Navigation führen zu vorhandenen
  Spieleseiten bzw. ihren `#video-<id>`-Abschnitten. Die Spielezuordnung ist auch
  neben einer Zeitschriftenzuordnung sichtbar. Ohne eigene Ausgabe hat ein
  Video die alphabetisch nach Slug erste bestätigte Spieleseite als Ziel.
- Abschnitts-/Reihenangaben stehen in der vollständigen Folgenliste und beim
  ausgewählten Video. Die Reihenfolge bleibt chronologisch, auch wenn nach
  einem Abschlussgespräch noch weitere Spielvideos erscheinen. Eine zusätzliche
  Übersicht „Abschnitte und Reihen“ wird nicht angezeigt.
- `src/site-game-series.mjs` erkennt Abschnitte nur aus ausdrücklichen
  Titelmerkmalen und bestätigtem Playlist-Kontext. Eine Folgenummer `#0` oder
  `#1` allein ist kein Intro; „Abschluss Level 1“ ist kein Abschlussgespräch.
  Bei widersprüchlichem oder fehlendem Formatkontext bleibt der Beitrag als
  „Weitere Beiträge“ zugänglich. Erkennung und Quellbelege stehen
  im normalisierten Seitenmodell; es gibt keine neuen Online-Abfragen.
- Quellreihen werden anhand der bestätigten Playlists und Titel-Formate
  unterschieden, etwa re.play, streamstag und re.connect beim selben Spiel.
  Ausdrückliche Angaben wie „Staffel 2“, „Durchlauf 2“ oder „2. Durchlauf“
  kennzeichnen benannte Durchläufe. Die Angabe gilt ab diesem datierten Video
  bis zur nächsten Angabe innerhalb derselben Quellreihe; undatierte Videos
  erben sie nicht. Sinkende Folgenummern, lange Pausen oder „Neustart“ erzeugen
  keinen geratenen neuen Durchlauf. Unbenannte Quellreihen erhalten keine
  erfundene Staffelnummer.
- Nur belegte, nicht leere Abschnitte werden dargestellt. Diese Übersicht
  funktioniert ohne zusätzliches JavaScript und ohne weitere Unterseiten.

### Kapitel und erwähnte Kanäle

Spiel- und Ausgabeseiten zeigen im jeweiligen Videoabschnitt die erkannten
Kapitel und explizit erwähnten YouTube-Kanäle aus der Beschreibung.
`src/site-video-details.mjs` bereitet diese Daten rein offline auf:

- Kapitelzeilen verwenden `MM:SS` oder `HH:MM:SS` mit Beschriftung. Ein
  aufsteigender Block ab `00:00` braucht mindestens zwei Einträge; ohne
  Nullbeginn ist eine direkte Überschrift wie `Kapitel:` oder `Timestamps:`
  erforderlich. Bloße Aufnahme-Uhrzeiten und Zahlen werden nicht übernommen.
- Zeitlinks müssen zum betreffenden Video führen. `t=90`, `t=1m30s`,
  `start=90` und `#t=90` werden unterstützt. Negative/ungültige Zeiten und
  Marken ab der bekannten Videolänge werden ausgelassen. Doppelte Sekunden
  erscheinen nur einmal, vorhandene Kapitelbeschriftungen haben Vorrang.
- Alle Kapitel bleiben echte, gekennzeichnete externe YouTube-Zeitlinks.
  Bei bereitem, aktiviertem Player übernimmt `seekTo` den normalen Klick
  während Wiedergabe/Pause. Ein noch nicht gestartetes Video wird mit
  `cueVideoById({videoId, startSeconds})` nur an der Marke bereitgestellt,
  nicht automatisch abgespielt. Gleiches gilt für eigene Kapitel-Direktlinks.
  Ohne Freigabe, ohne JavaScript oder bei gesperrter API öffnet sich YouTube.
  Strg-/Befehl-Klick bleibt ebenfalls ein normaler externer Link.
- `VideoObject.hasPart` enthält dieselben Kapitel als Schema.org-`Clip` mit
  Beschriftung, Sekundenoffset und eigenem Zeitlink
  `./?t=<sekunden>#video-<id>` auf derselben Spiel-/Ausgabenseite. Nach Freigabe
  springt der Player zu dieser validierten Marke, ohne Autoplay. Es entsteht
  keine neue Seite; der Canonical bleibt ohne Query und Fragment.
  Das Ende ist der Beginn
  des nächsten Kapitels oder die bekannte Videolänge. Beim letzten Kapitel
  ohne bekannte Dauer bleibt `endOffset` weg; es wird kein Ende erfunden.
- „Erwähnte Kanäle / Partner“ enthält nur explizite HTTPS-Kanal-URLs auf
  YouTube (`/@handle`, `/channel/id`, `/c/name`, `/user/name`).
  Watch-, Playlist- und Shorts-Links sowie der eigene Kanal sind ausgeschlossen.
  Hosts werden exakt geprüft, identische Kanaladressen dedupliziert.
  Ohne verifizierten Namen wird nur die Handle-/URL-Kennung angezeigt;
  Logos oder andere Ressourcen werden nicht nachgeladen.
- Erwähnungen behaupten keine bezahlte Zusammenarbeit. Leere Abschnitte
  entfallen; die Originalbeschreibung bleibt unverändert sichtbar.

Es gibt keine zusätzlichen Videoseiten oder Sitemap-Adressen.
Die offizielle IFrame-API von `https://www.youtube.com/iframe_api` lädt erst
nach bewusster oder bereits gemerkter Player-Freigabe, einmal pro Dokument.
Der Frame bleibt auf `youtube-nocookie.com`, mit `enablejsapi=1` und der
tatsächlichen Browser-Origin. Fehler oder ausbleibende Antworten werden
sichtbar gemeldet; externe Links und der manuelle Player bleiben verfügbar.

Wiederverwendbare HTML-Komponenten liegen als ES-Module unter `src/widget/`;
`src/site-render.mjs` importiert sie direkt:

- `video.mjs`: `videoWidget` mit Player, Vorschau und Bedienelementen sowie
  `playerPoster` für die Vorschau beim Folgenwechsel.
- `episode-list.mjs`: `episodeList` als unabhängig scrollbar dargestellte
  Folgenliste mit Fragmentlinks, Laufzeiten, Datum und Spielkontext.
- `catalog-grid.mjs`: gemeinsame Spiele-/Zeitschriftenkacheln.
- `metadata.mjs`: gemeinsame semantische Metadatenliste.
- `video-entry.mjs`: `videoListEntry` für jeden einzelnen Beitrag in News,
  Hardware, Retrospektiven und Interviews; `videoList` setzt daraus die Liste
  zusammen. Überschriftenebene, Personen, Thema, Hinweise und Themenverweise
  bleiben je nach Seitenkontext erhalten. Die Gruppierung von Retrospektiven
  und die Auswahl/Sortierung der Videos liegen weiterhin im Seitengenerator.
  Der Titel steht über die volle Breite. Darunter steht eine kleine
  16:9-Vorschau links; Datum, Kategorie und Beschreibung stehen rechts daneben
  und sind linksbündig ausgerichtet. Thumbnail und Titel
  verlinken dasselbe interne Videoziel bzw. YouTube. Die Vorschaubilder kommen
  direkt von YouTube (`i.ytimg.com`), mit reservierter Bildfläche, Lazy Loading
  und asynchronem Decoding; die Datenschutzseite beschreibt diesen Abruf.

HTML-Escaping und externe Links liegen gemeinsam in `src/site-html.mjs`,
Datums-/Laufzeitformatierung in `src/site-format.mjs`. Widgets importieren
gemeinsame interne Video- und Themenlinks aus `src/site-video-links.mjs`, aber
nicht den Seitengenerator; so entstehen keine zyklischen Abhängigkeiten.
Styles bleiben in `src/site.css`, Browserinteraktion in `src/video-series.js`.
Die Widget-Module werden nur beim Build ausgeführt, nicht zusätzlich im Browser.

Alle eingebetteten Videos verwenden das gemeinsame `videoWidget`:
Player, Vorschau-/Fehlerhinweise und eine einheitliche Steuerzeile mit
Aktivierung zurücksetzen, Folgenoption, direktem YouTube-Link und manuellem
Start bei blockierter Wiedergabe. Spiel- und Heftausgabenseiten setzen genau
eine Instanz ein; Übersichtsseiten ohne Player erhalten kein leeres Widget.

„Nächste Folge automatisch“ steht auf Spiel- und Heftausgabenseiten und ist ohne
bisherige Auswahl aus. Ein- und Ausschalten wird als separater boolescher Wert
`pretty-old-pixel:youtube-auto-next` im Local Storage gemerkt und bei bereiter
Player-Steuerung wiederhergestellt. Neue Seiten starten weiterhin kein Video.
Nach Einschalten und echtem `PLAYING`-Ereignis kann ein
`ENDED`-Ereignis die nächste datierte Folge derselben Seite mit `loadVideoById`
starten. Die gespeicherte Videolänge wird nicht als Endtimer verwendet.
Am Reihenende oder vor undatierten Videos wird gestoppt, niemals zu einem
anderen Spiel oder einer anderen Heftausgabe gewechselt. Manuelle Auswahl und Zurück/Vorwärts verwenden
`cueVideoById` ohne Wiedergabestart. Automatische Wechsel aktualisieren
URL-Fragment, Beschreibung, Position und Browser-Titel ohne Seitennavigation.
Browserseitig blockierte Wiedergabe deaktiviert die Fortsetzung und bietet
„Video manuell starten“. Sicherheitsstopps ändern nur den laufenden Zustand,
nicht die gespeicherte Auswahl. Das Zurücksetzen der Player-Aktivierung lässt
diese getrennte Auswahl bestehen. Speicherfehler werden sichtbar gemeldet.
Der direkte YouTube-Link steht in derselben Zeile unter dem Player
und folgt der aktiven Folge. Der zusätzliche Aktivierungslink im Videopanel
entfällt; die Aktivierung über das Vorschaubild bleibt erhalten. Ohne JavaScript
bleiben direkte YouTube-Links je Videopanel erreichbar.
Der Hinweis zu Vorschaubild und Aktivierung wird bei aktiviertem Player
ausgeblendet und nach Zurücksetzen wieder angezeigt; Status- und
Fehlermeldungen bleiben unabhängig davon sichtbar.
Alle Metadatenlisten unter dem Player (Spiel-/Heftdaten sowie die Angaben
zur ausgewählten Folge) stehen
nebeneinander in gleich breiten Spalten, auch bei schmaler Darstellung.
Lange Werte und Beschriftungen umbrechen innerhalb ihrer Spalte.

### Blätterabend nach Zeitschrift und Jahrgang

Jahrgangsgruppen heißen beispielsweise „Jahrgang 1996 – Ausgaben“;
Sonderhefte stehen separat unter „Jahrgang 1996 – Sonderhefte“.
Einträge ohne bekanntes Heftjahr folgen am Ende unter „Jahrgang unbekannt“.
Ein bekanntes Heftjahr kann auch bei noch ungeklärter Einzelheftnummer
erhalten bleiben; die Jahrgangsüberschrift macht hierzu keine Aussage.

- `/zeitschriften/` zeigt die erkannten Zeitschriften alphabetisch sowie eine
  Gruppe „Weitere Blätterabende“ für nicht sicher zugeordnete Blätterabend-Videos.
- `/zeitschriften/<slug>/` bündelt die Jahrgänge und Videos einer Zeitschrift.
  „Jahrgang unbekannt“ bleibt sichtbar; das Uploadjahr ersetzt kein Heftjahr.
- `/zeitschriften/<slug>/<jahr>/` zeigt reguläre Ausgaben nach Monat bzw.
  Heftnummer und Sonderhefte als getrennte Gruppe. Doppelausgaben bleiben ein
  Heft; die Videos dazu stehen nach Teilnummer, anschließend Datum und ID.
  Fehlt eine Teilnummer, bleibt dieses Video an seinem chronologischen Platz;
  die bekannten Teilnummern werden relativ zueinander geordnet. Ein früheres
  unnummeriertes Video wird nicht pauschal hinter „Teil 2“ verschoben.
- `/zeitschriften/<slug>/ausgaben/<hefttitel-slug>/` wird nur bei ausreichend eindeutigen
  Heftdaten erzeugt. Die Seite enthält Heftangaben, Archivlinks, einen gemeinsamen
  Player und alle Videobeschreibungen. Die Auswahl erfolgt per
  `#video-<youtube-id>` auf derselben Seite. Nur Übersichten werden bei mehr
  als 60 Einträgen paginiert, nicht die Videos einer einzelnen Ausgabe.
- Ein Jahr allein oder ein generisches „Sonderheft 1996“ erzeugt ohne
  eindeutigen Archivtreffer bzw. Sonderheftnummer keine spekulative Detailseite.
  Diese Videos bleiben im passenden Jahrgang oder in der unbekannten Gruppe.
- Fehlende Heftdaten dürfen aus anderen Einträgen mit **demselben eindeutigen
  Archivtreffer** ergänzt werden. Ein Ordnerlink allein genügt nicht.
  Widersprüchliche Angaben werden gemeldet und nicht zu einer Ausgabe vereinigt.
- Interne Ausgaben-IDs verwenden einen Hash der Heftidentität: bei regulären Heften
  Jahr und Monate bzw. Nummer, bei Sonderheften einen eindeutigen Archivlink
  bzw. Jahr und Sonderheftnummer. Eine reine Titel-/Beschriftungskorrektur ändert
  die Identität nicht. Eine Korrektur bisher unbekannter Identitätsdaten kann
  eine neue Zuordnung erzeugen; alte generierte Seiten werden entfernt.
- Der öffentliche Ausgabepfad verwendet dagegen den normalisierten
  Zeitschriftennamen plus endgültige Heftbezeichnung, beispielsweise
  `/zeitschriften/amiga-joker/ausgaben/amiga-joker-1-1990/`.
  Titelgleiche, aber unterschiedliche Sonderhefte erhalten deterministische
  `-variante-N`-Zusätze. Die Titel werden erst nach der Zusammenführung der
  Heftdaten bestimmt. Titelkorrekturen können damit den öffentlichen Pfad
  ändern, ohne die interne Heftidentität zu ändern. News, Übersichten,
  Canonicals, JSON-LD und Sitemap verwenden gemeinsam den neuen Pfad.
  Alte Hash-Pfade werden beim Neugenerieren entfernt, nicht weitergeleitet.
- Heft-, Spiel- und Videometadaten stehen in kompakten semantischen
  Definitionslisten: auf breiten Displays als mehrspaltiges Raster, unter
  576 Pixeln einspaltig mit Beschriftung und Wert nebeneinander. Lange Werte
  umbrechen; fehlende optionale Angaben werden nicht ergänzt.
- News und Themenübersichten verlinken Zeitschrift, Jahrgang und vorhandene
  Ausgabenseite einschließlich Video-Fragment. Mehrfachzuordnungen bleiben
  erhalten. Ausgaben-Breadcrumbs gehören zur gemeinsamen Seite; der aktive
  Videoabschnitt zeigt `Video 2/3`. Aus News/Themenübersichten ist die alphabetisch nach
  Slug erste eindeutige Ausgabe das Ziel. Innerhalb der Zeitschriftenübersicht
  führt der Link zur jeweiligen Ausgabe. Ohne sichere Ausgabenseite wird
  eine vorhandene Spieleseite genutzt; ohne sicheres internes Ziel wird
  direkt YouTube verlinkt.
- Archivordner sind als solche beschriftet, direkte Heft-/Lese-/Downloadlinks
  entsprechend ihrem Match-Typ. Cover werden nicht extern eingebunden.

### Medien, SEO und unveränderte Builds

- Die Hauptnavigation enthält die Themenbereiche und News; der Markenlink
  führt weiterhin zur Startseite, ebenso die Brotkrümelnavigation.
  Alle Überschriften verwenden eine gemeinsame kompakte Schriftgröße;
  Spiele-Kacheltitel sind mit 0,95rem zusätzlich verkleinert, um Umbrüche
  zu reduzieren. Lange Titel bleiben vollständig und dürfen umbrechen.
  Seitliche Innenabstände von mindestens 1rem halten auch auf schmalen
  Displays Titel und Navigation vom Fensterrand fern.
- Zeitschriften- und Spieleübersicht verwenden dieselben Kacheln mit
  Titel und vorhandenen Metadaten. Neben der Videoanzahl steht die
  summierte Gesamtlaufzeit der zugehörigen Videos, nach der Summierung auf
  die nächste volle Minute gerundet (ab 30 Sekunden aufwärts), beispielsweise
  `3:06 h` (Stunden:Minuten). Jeder Fakt steht in einem eigenen Absatz: Plattform,
  Erscheinungsjahr, Videoanzahl, Laufzeit bzw. Jahrgänge. Fehlende Laufzeiten werden als bekannte Teilsumme mit
  Anzahl erfasster Videos bzw. als „Gesamtlaufzeit unbekannt“ kenntlich
  gemacht; Videos werden innerhalb einer Kachel nicht doppelt gezählt.
  Die Jahrgangsanzahl wird nur bei bekannten Heftjahren angezeigt; ohne
  Heftjahr entfällt die Angabe statt „0 Jahrgänge“. Heftnummern allein oder
  das Veröffentlichungsdatum eines Videos ergeben keinen Heftjahrgang.
  Das CSS-Raster zeigt eine Spalte,
  ab 480px zwei, ab 768px drei, ab 1024px vier und ab 1280px höchstens
  fünf Spalten. Alphabetische Reihenfolge, Links und Paginierung mit
  höchstens 60 Einträgen funktionieren unverändert ohne JavaScript.
- Mengenangaben unterscheiden Einzahl und Mehrzahl (`1 Video`, `2 Videos`,
  `1 Jahrgang`, `2 Jahrgänge`). Video-Veröffentlichungsdaten erscheinen
  kompakt als `23.11.2016, 18:42`, in der schmalen Folgenliste nur als
  `23.11.2016`. Alle sichtbaren Datumsangaben auf sämtlichen Seiten verzichten
  auf Zeitzonen-Zusätze oder UTC-Offsets. Die Berechnung der Video-Daten bleibt
  in `Europe/Berlin`, einschließlich Sommerzeit;
  maschinenlesbare ISO-Zeitstempel bleiben unverändert.
  Die [Regeln für kompakte UI-Komponenten](../.github/instructions/ui-components.instructions.md)
  gelten für Änderungen an Renderer, Styles und zugehörigen Tests.
- Sichtbare Seitentexte beschreiben Themen, Videos und Bedienung für Besucher.
  Spiel- und Ausgabenseiten trennen Metadaten und weitere Inhalte mit
  horizontalen Linien. Redundante Startlinks und Hinweise zur sichtbaren
  Folgenreihenfolge entfallen. Informationen zur YouTube-Einbindung stehen
  auf der Datenschutzseite, erreichbar über den Link im Seitenfuß.
  Interne Auswahlregeln, Cachezugriffe und Buildabläufe stehen nur in dieser
  Dokumentation und den ADRs, nicht in den Einleitungen der Website.
- Pico CSS **2.1.1** liegt einschließlich MIT-Lizenz unter `src/vendor/`.
  Der Build bündelt es mit `src/site.css` zu einer lokalen Datei mit
  Inhalts-Hash. Es werden keine Fonts, CDNs oder anderen externen Assets geladen.
- Bereits erzeugte CSS- und JavaScript-Dateien mit passendem Inhalts-Hash
  bleiben bei späteren Builds erhalten. GitHub Pages kann HTML noch zehn
  Minuten zwischenspeichern; dessen ältere Asset-URLs dürfen nach einem
  Deployment nicht ins Leere laufen. Neue Seiten laden nur die aktuelle
  Version, und nur diese zählt zum jeweiligen Übertragungsbudget.
  Historische Assets werden nicht automatisch bereinigt; pro geänderter
  CSS-/JavaScript-Version wächst das Deployment um eine weitere Datei.
- Spiel-/Ausgabenseiten zeigen zunächst ein direkt von YouTube geladenes
  Vorschaubild. Ein bewusster Klick aktiviert den Player von
  `youtube-nocookie.com`, auch ohne eigenes JavaScript.
  Mit JavaScript wird die Aktivierung unter
  `pretty-old-pixel:youtube-player-enabled` im Local Storage gespeichert.
  Weitere Videos und Seitenbesuche laden dann direkt den Player, ohne Autoplay.
  „YouTube-Aktivierung zurücksetzen“ unter dem Player löscht die Einstellung
  und stellt das Vorschaubild wieder her. Gesperrter Browser-Speicher wird
  sichtbar gemeldet; die manuelle Aktivierung bleibt nutzbar. Ohne JavaScript
  wird nichts gespeichert. Ein normaler YouTube-Link bleibt verfügbar.
- Auf der Spiel-/Ausgabenseite wechseln Videoauswahl, aktive Beschreibung und
  Browser-Titel ohne Seitenwechsel. Ein gemeinsamer Player verhindert parallele
  Wiedergaben; bei einer anderen Auswahl wird abhängig von der gemerkten
  Aktivierung der Player oder das Vorschaubild geladen, niemals automatisch
  abgespielt. Nur die ausdrücklich eingeschaltete Folgenfortsetzung darf
  nach dem Videoende die nächste Folge starten. Direktlinks und Zurück/Vorwärts
  verwenden Video-Fragmente.
  Mobil steht die Videoliste in einem nativen Burger-Menü. Auf Spieleseiten
  beginnt sie auf Desktop als rechte Seitenleiste auf Höhe des Seitentitels.
  Spiele und Ausgaben nutzen dasselbe Detailtemplate: kompakter einzeiliger
  Titel, unmittelbar darunter der Player, dann sämtliche Metadaten,
  Reiheninformationen und Beschreibungen. Lange Titel werden optisch mit
  Auslassung gekürzt, bleiben aber als vollständiger Text und Tooltip verfügbar.
  Mobil steht das Menü unter dem Player, nicht vor dem Titel.
  Die schmalere Seitenleiste zeigt Nummer, Titel, Laufzeit und Datum in kleiner
  Schrift. Ihre Liste ist unabhängig scrollbar, auch per Tastatur, ohne den
  Hauptplayer mitzuscrollen. Auf Desktop bleibt das Menü beim Scrollen
  erreichbar; mobil bleibt es aufklappbar mit begrenzter Listenhöhe.
  Kompakte Kopf- und Navigationsabstände sowie eine auf 60 Prozent der Viewporthöhe begrenzte
  Playerhöhe halten das Video beim normalen Seitenaufruf im sichtbaren Bereich.
  Direkte Video-Fragmente wählen mit JavaScript den richtigen Beitrag und
  richten den sichtbaren Ausschnitt am Player aus, auch wenn der Browser
  seinen nativen Fragmentsprung erst nach dem Laden ausführt.
- Beschreibungen, Titel und strukturierte Daten werden sicher escaped.
  HTTP(S)-Links in Beschreibungen und Archivverweise sind extern gekennzeichnet.
- News verwenden `publishedAt` einschließlich Zeitzone, nicht Abrufzeiten.
  Fehlende Beschreibungen sind zulässig. Videos mit unbekanntem Datum bleiben auf
  bestätigten Themenseiten sichtbar; zukünftige Videos werden nicht veröffentlicht.
- Der Build prüft alle internen Links und Fragmente, Canonicals, JSON-LD sowie
  die Budgets von 20 KiB gzip CSS, 5 KiB gzip eigenem JavaScript und
  50 KiB gzip HTML je Seite. Auch lange Reihen müssen diese Budgets einhalten.
- Ein frisches, geprüftes Ausgabeverzeichnis ersetzt die vorherige Ausgabe;
  entfernte Seiten bleiben nicht liegen. Identische Dateien werden einschließlich
  Dateizeit übernommen. Bei ungültigen Quellen bleibt die bestehende Website
  unberührt.
- `docs/build-manifest.json` enthält je Seite Inhalts-Fingerabdruck und
  `contentPublishedAt` aus den zugehörigen Video-Veröffentlichungen sowie
  `lastModified` für die zuletzt beim Erzeugen festgestellte Änderung am HTML.
  Die Sitemap gibt diesen Wert als standardkonformes `<lastmod>` mit
  UTC-Datum und Uhrzeit aus. Nur ein geänderter Inhalts-Fingerabdruck setzt
  einen neuen Zeitpunkt; identische Seiten behalten ihn. Neue Seiten, alte
  Manifeste ohne Änderungsdatum und Builds ohne Vorhistorie erhalten den
  Zeitpunkt der ersten Erzeugung mit dieser Datierung.
  `fetchedAt` und `checkedAt` sind keine Änderungsgrundlage.
  JSON-LD-`dateModified` bleibt vorerst ausgelassen.
- GitHub Actions sichert das Manifest und `docs/assets/` per branchbezogenem
  Actions-Cache und stellt beides vor dem nächsten Build wieder her.
  So bleiben Sitemap-Daten und ältere Asset-Versionen auch bei frischen
  Checkouts erhalten. HTML wird nicht gecacht. Bei einem Cache-Verlust wird
  eine neue Ausgangsdatierung gesetzt; ältere Assets sind dann nur vorhanden,
  wenn sie noch im lokalen Ausgabeordner liegen. Für lückenlose
  Asset-Verfügbarkeit darf dieser Cache nicht gelöscht werden.
- HTTP-`Last-Modified`, `ETag`, Kompression und zehn Minuten HTML-Cachezeit
  werden von GitHub Pages bestimmt, nicht durch HTML-Metadaten.
  Die Wiederverwendung vollständiger HTML-Ausgaben über CI-Läufe hinweg
  bleibt eine optionale spätere Optimierung.

### Grenzen der Veröffentlichungsprüfung

Automatisierte Tests prüfen Freigabe, API-Ladefehler/Timeouts, Kapitelsprünge,
Opt-in/Opt-out, API-`ENDED`-Ereignisse, undatierte Folgen, Reihenende,
Autoplay-Blockierung, Zurücksetzen und veraltete API-Rückmeldungen.
Build-Prüfungen kontrollieren interne Links, JSON-LD und die unveränderten
Budgets (20 KiB CSS, 5 KiB eigenes JavaScript, 50 KiB HTML, jeweils gzip).
Browserprüfungen ergänzen Desktop/Mobil, Netzabrufe und den Ohne-JavaScript-Fallback.

Lokaler Prüfstand für Player-Stand `917343c` vom 17.10.2026:
168 Tests unter Node.js 22 erfolgreich;
435 HTML-Seiten. CSS 13.558, eigenes JavaScript 3.555 und größtes HTML
15.727 Bytes gzip. Ein unveränderter Folgebuild übernimmt alle Dateien.
Im Browser wurden Kapitelsprünge, eigene Zeitmarken-URLs, Fortsetzung,
Autoplay-Blockierung und Zurücksetzen mit einer kontrollierten API geprüft;
bei 320 Pixeln entsteht kein horizontaler Überlauf. Ohne JavaScript bleiben
alle sieben Folgen der geprüften Spieleseite und ihre externen Kapitel-Links
sichtbar. Der integrierte Prüf-Browser brach auch einen unabhängig eingebundenen
echten YouTube-Iframe ab. Reale Medienwiedergabe bis zum Videoende ist deshalb
dadurch nicht bestätigt; API-Ereignistests ersetzen diese Prüfung nicht.

Der Player-Stand `917343c` wurde mit Actions-Lauf `39045706603` erfolgreich
auf GitHub Pages veröffentlicht. Live geprüft: Startseite, Spiele- und
Ausgabenseite, Datenschutz und Zeitschriftenübersicht liefern HTTP 200;
CSS/JavaScript haben korrekte MIME-Typen und Inhalts-Hashes. Kapitel-URLs
bleiben auf dem jeweiligen Seitenpfad, Offset-Grenzen und Canonicals sind
gültig. ETag-Anfragen liefern 304, Cache-Control lautet `max-age=600`,
und die vorige CSS-Version bleibt mit HTTP 200 erreichbar.
Vor Aktivierung wurde im Browser nur das YouTube-Vorschaubild, nicht API
oder Player angefordert. Ein kalter Abruf übertrug rund 14,2 kB CSS und
3,9 kB JavaScript einschließlich Antwort-Overhead. Auch live bleibt der
Player auf Desktop/Mobil im anfänglichen sichtbaren Bereich; kein
horizontaler Überlauf bei 390px. Ein separat gestarteter Chrome bestätigte
zusätzlich die echte API-Bereitschaft und das Bereitstellen der Zeitmarke;
eine laufende Medienwiedergabe bis zum echten Ende ließ sich auch dort
nicht bestätigen.

Eine technische Prüfung ist keine verbindliche Datenschutz- oder Rechtsfreigabe.
Der Betreiber muss insbesondere erforderliche Betreiber-/Kontaktangaben,
Einwilligung für externe YouTube-Medien einschließlich Vorschaubildern sowie
die dauerhafte Player-Freigabe prüfen lassen. Die Datenschutzseite nennt
Hosting, direkte Bildabrufe, Player/API, Local Storage, Zurücksetzen und
die nur seitenbezogene Folgenfortsetzung.

Am 17.10.2026 wurde eine Microsoft-Defender-Browser-Protection-Warnung
„Phishing threat“ für die Zeitschriftenübersicht gemeldet. Diese Übersicht
führt kein eigenes JavaScript aus und greift nicht auf Local Storage zu.
Die Ursache der Microsoft-Einstufung ist damit nicht geklärt und die Warnung
nicht aufgehoben. Für eine Neubewertung dient „Report that this site does not
contain threats“ in der Warnungsseite; Schutzfunktionen nicht pauschal abschalten.

Vor einer öffentlichen Freigabe müssen die tatsächliche Medien-Einbindung und
die Datenschutz-/Informationspflichten rechtlich geprüft werden. Die vorhandene
Datenschutzseite beschreibt die Umsetzung als privates, nicht kommerzielles
Projekt ohne Anschrift, behauptet aber keine pauschale gesetzliche Ausnahme.

## Tests

Alle Testdateien liegen in `tests/` (`*.test.mjs`) und werden ausgeführt mit:

```sh
npm test
```

## YouTube-Videos cachen

Das Script liest alle öffentlichen Videos eines YouTube-Kanals ohne API-Key über
die öffentlichen YouTube-Webseiten aus und speichert Video-ID, Titel,
Beschreibung, Länge und Veröffentlichungsdatum in `cache/youtube-videos.json`.

Für den Kanal https://www.youtube.com/@PrettyOldPixel:

```sh
npm run fetch:videos
```

Für einen beliebigen Kanal:

```sh
npm run fetch:youtube -- https://www.youtube.com/@PrettyOldPixel
# oder
npm run fetch:youtube -- PrettyOldPixel
```

Beim ersten Lauf werden alle Seiten der Upload-Playlist geladen und die Details
jedes Videos abgerufen. Der Fortschritt wird nach jeder Seite gespeichert; ein
abgebrochener Lauf lädt beim nächsten Start nur noch fehlende Videos. Nach einem
vollständigen Lauf nutzt das Script `lastModified` aus der Cache-Datei und lädt
nur später veröffentlichte Videos. Geplante Livestreams und Premieren werden
erst übernommen, wenn sie veröffentlicht sind.

Bereits geladene YouTube-Videodetails werden ohne zeitlichen Ablauf
wiederverwendet, also auch über ein Jahr hinaus. Ihr Alter allein löst keinen
erneuten Detailabruf aus. Titel-/Beschreibungskorrekturen älterer Videos
werden dadurch nicht automatisch nachgeladen. Die Upload-Liste wird weiterhin
inkrementell auf neue Videos geprüft. Playlist-Mitgliedschaften werden wie
bisher bei jedem Abruf überprüft; sie sind keine unveränderlichen Videodetails.

## YouTube-Playlists cachen

```sh
# Videos und Playlists gleichzeitig aktualisieren:
npm run fetch:all

# Nur Playlists aktualisieren:
npm run fetch:playlists

# Optional einen anderen Kanal angeben (gilt für beide neuen Tasks):
npm run fetch:playlists -- https://www.youtube.com/@PrettyOldPixel
```

`src/fetch-youtube-playlists.mjs` liest ohne API-Key die öffentlichen Playlists
des Kanals und alle Seiten ihrer Mitgliederlisten. Bis zu drei Playlists werden
parallel geladen; innerhalb einer Playlist werden Fortsetzungen nacheinander
abgefragt. Der gemeinsame Task wartet auf beide Scripts und endet bei einem
Fehler mit einem Fehlerstatus. Die Scripts schreiben getrennte Cache-Dateien.

Das Ergebnis liegt in `cache/youtube-playlists.json`:

```json
{
  "channel": { "id": "UC…", "handle": "PrettyOldPixel", "title": "Pretty Old Pixel", "url": "https://www.youtube.com/@PrettyOldPixel" },
  "fetchedAt": "2026-10-17T11:00:00.000Z",
  "lastModified": "2026-10-17T10:00:00.000Z",
  "complete": true,
  "playlists": [
    {
      "id": "PL…",
      "title": "re.play - Cadaver",
      "description": "",
      "url": "https://www.youtube.com/playlist?list=PL…",
      "videoCount": 1,
      "videos": [
        { "position": 1, "videoId": "glGHg5Mj2xs", "title": "Cadaver …", "availability": "listed" }
      ],
      "lastModified": "2026-10-17T10:00:00.000Z",
      "checkedAt": "2026-10-17T11:00:00.000Z"
    }
  ]
}
```

Bei jedem Folgelauf werden Übersicht und Mitgliedschaften erneut geprüft:
YouTube bietet öffentlich keinen verlässlichen Änderungszeitpunkt, und auch
ältere Videos können neu einsortiert, entfernt oder verschoben werden.
`checkedAt` bezeichnet die letzte erfolgreiche Prüfung, `lastModified` die
lokale Erkennung einer Änderung, nicht einen von YouTube gelieferten Zeitpunkt.
Unveränderte Playlists behalten `lastModified`; neue und geänderte Playlists
werden ergänzt bzw. ersetzt. Nicht mehr im Kanal gelistete Playlists werden
erst nach einem vollständig erfolgreichen Lauf entfernt.

Reihenfolge und doppelte Video-Einträge bleiben erhalten; `position` beginnt
bei 1. `videoCount` zählt gelieferte Einträge, nicht eindeutige Videos.
`availability: "listed"` bedeutet nur, dass YouTube den Eintrag liefert, nicht
dass seine öffentliche Abspielbarkeit separat geprüft wurde. Explizit nicht
abspielbare klassische Einträge erhalten `"unavailable"`. YouTube kann verborgene
Einträge ganz auslassen.

Die Daten verweisen über `videoId` auf `cache/youtube-videos.json`. Beschreibungen,
Dauer und Veröffentlichungsdatum einzelner Videos werden nicht erneut geladen.
Playlist-Einträge ohne Gegenstück im Video-Cache bleiben als Verweise erhalten,
etwa wenn sie fremde Videos betreffen. Keine Bilder oder Videos werden kopiert.

Nach jeder vollständig gelesenen Playlist wird atomar gespeichert. Bei Fehlern
bleiben erfolgreiche Aktualisierungen und der vorherige Stand fehlgeschlagener
Playlists erhalten; `complete` bleibt `false`, und der nächste Lauf prüft erneut.
Seitennavigation, Playlist-Titel und vollständige Mitgliedschaften werden nicht
anhand bloßer Playlist-Verweise in Videobeschreibungen geschätzt.
Zeitgleiche Aufrufe desselben Scripts auf dieselbe Cache-Datei sind zu vermeiden.

## Blätterabend-Videos auswerten

Aus der Video-Liste in `cache/youtube-videos.json` werden alle Videos mit
„Blätterabend“ im Titel gefiltert. Ein zweiter Durchlauf prüft die übrigen
Videotitel auf bekannte Zeitschriftennamen mit unmittelbar anschließender
Ausgabenangabe (einschließlich Sonderheft) oder dem Leseformat `[re.read]`.
So werden auch ältere `PowerPlay … [streamstag]`-Beiträge berücksichtigt,
etwa `YzelSZYeuFo` als Power Play 4/1994. Bloße Namensüberschneidungen wie
„ACE“ in „Ace of Aces“ oder „Joystick reparieren“ reichen nicht aus.
Die Reihenfolge des Quellcaches bleibt erhalten; ein Video erscheint nur einmal.
Beide Durchläufe gelten auch für die Ermittlung benötigter Archive-Caches.
Für jedes Video werden Zeitschrift, Ausgabe
(Nummer, Monat(e), Jahr, Sonderheft) und ggf. der Teil (`Teil 2`, `Stream II`)
aus dem Titel erkannt und in `cache/blaetterabend-videos.json` gespeichert.

```sh
npm run fetch:archives
npm run generate:blaetterabend
```

`src/fetch-archives.mjs` aktualisiert ausschließlich die Archive-Caches für
die im Video-Cache erkannten Zeitschriften. Kultmags wird zuerst geprüft;
reetroz bleibt der Fallback für dort fehlende Zeitschriften. Mit
`npm run fetch:archives:refresh` werden beide Quellen unabhängig vom Cache-Alter
neu abgefragt. Das erzeugt noch keine neue Blätterabend-Datei.

`src/generate-blaetterabend.mjs` liest anschließend ausschließlich lokale
JSON-Dateien und lädt auch bei veralteten Caches nichts aus dem Internet.
Fehlende benötigte Cache-Dateien führen zu einem Fehler mit Hinweis auf
`fetch:archives`, nicht zu einem automatischen Abruf. Zum bisherigen kombinierten
Refresh-Aufruf gehören jetzt zwei Schritte:

```sh
npm run fetch:archives:refresh
npm run generate:blaetterabend
```

Danach erzeugt `npm run generate:site` die Website aus den aktuellen JSON-Daten.

Titel ohne erkannte Zeitschrift oder Ausgabe werden beim Lauf aufgelistet. Neue
Zeitschriften oder Schreibweisen werden in der Liste `MAGAZINES` in
`src/generate-blaetterabend.mjs` ergänzt.
Die bestätigte Titelbezeichnung „Computer Gaming World – 15th Anniversary“
wird als Ausgabe #148 (11/1996) erkannt; auf dem
[Cover](https://assets.reetroz.com/covers/cgw-148.jpg) sind beide Angaben zu sehen.
Fehlt eine eindeutige Ausgabenangabe, bleibt die Ausgabe unbekannt. Die
Logmeldung weist dann gegebenenfalls auf die verlinkte Archiv-Übersichtsseite hin.
Explizit bestätigte Heftzuordnungen stehen nach Video-ID in
`CONFIRMED_MAGAZINE_TITLES`: `6R6Go1LhCMI` („Nach Zuschauerabstimmung“)
ist vom Nutzer als Power Play 10/1990 bestätigt. Der Originaltitel bleibt
unverändert; die Zuordnung gilt nicht für andere gleichlautende Titel.

### Links auf kultmags.com

Jede erkannte Zeitschrift bekommt ein Feld `kultmags` mit einem Link in das
Archiv von [kultmags.com](https://www.kultmags.com/mags.php)
(`src/fetch-kultmags.mjs`):

- `match: "issue"`: Die passende Ausgabe wurde gefunden, mit `title`, `pageUrl`,
  `readerUrl` (Online-Reader, falls vorhanden), `downloadUrl` und `coverUrl`.
  `matchedBy` nennt den Weg dorthin: `month` (Monat/Doppelheft), `number`
  (Heft- oder Sonderheftnummer) oder `keyword` (Thema des Sonderhefts).
- `match: "folder"`: Die Zeitschrift ist im Archiv, die Ausgabe aber nicht
  eindeutig zuzuordnen. Dann zeigt der Link auf den Jahrgangs- bzw.
  Sonderheft-Ordner.
- `null`: Die Zeitschrift gibt es auf kultmags.com nicht.

Die Zeitschriftenliste und die Ausgabenlisten der benötigten Zeitschriften
werden in `cache/kultmags/` gespeichert. Ausgabendetails werden regulär
365 Tage wiederverwendet, der Zeitschriftenindex weiterhin 30 Tage, damit neue
Zeitschriften gefunden werden können. Mit
`npm run fetch:archives:refresh` werden sie neu geladen (zusammen mit
dem reetroz-Cache). Ein vollständiger Abruf braucht etwa 140 Seitenaufrufe, mit
200 ms Pause zwischen den Aufrufen.

### Links auf reetroz.com (internationale Zeitschriften)

kultmags.com enthält nur deutsche Zeitschriften. Für Zeitschriften, die dort
fehlen (`kultmags: null`), wird im Archiv von
[reetroz.com](https://reetroz.com/catalog) gesucht (`src/fetch-reetroz.mjs`), z. B.
Computer Gaming World, PC Gamer (US) und Computer Games Strategy Plus. Das
Ergebnis steht im Feld `reetroz` im selben Format wie `kultmags`:

- `match: "issue"` über `matchedBy: "number"` (Heftnummer, z. B. `#148`) oder
  `"month"` (Monat und Jahr, z. B. `1/90`). `pageUrl` und `readerUrl` zeigen auf
  die Ausgabenseite mit Online-Reader. Downloads bietet reetroz nicht an,
  `downloadUrl` ist deshalb `null`.
- `match: "folder"` verlinkt die Übersichtsseite der Zeitschrift.
- `null`: Die Zeitschrift gibt es auch auf reetroz.com nicht.

Der Katalog (`cache/reetroz/index.json`) und je eine Ausgabenliste pro
benötigter Zeitschrift (`cache/reetroz/magazines/<slug>.json`) werden ebenfalls
getrennt gecacht: der Katalog 30 Tage, die Ausgabendetails 365 Tage.
Ein vollständiger Abruf braucht nur 1 Seitenaufruf plus 1 pro
Zeitschrift, weil eine Zeitschriftenseite alle Ausgaben enthält.

Die einjährige Wiederverwendung ist eine lokale Cache-Regel, keine Garantie
für die Erreichbarkeit externer Inhalte. Abgelaufene Archivdaten werden nicht
automatisch gelöscht: Fetch-Scripts aktualisieren sie bei Bedarf, lokale
Generatoren können vorhandene Caches unabhängig vom Alter weiterverwenden.
Ein ausdrücklich angeforderter Refresh darf die Jahresfrist übergehen.

## Architekturentscheidungen

Architecture Decision Records liegen in `doc/adr/`:

- [ADR 0001: YouTube-Kanal-Metadaten ohne offizielle API laden](adr/0001-youtube-metadaten-ohne-offizielle-api.md)
- [ADR 0002: Statische Seiten mit minimalem JavaScript, SEO und kurzen Ladezeiten](adr/0002-statische-seiten-seo-und-performance.md)
- [ADR 0003: Seitenstruktur und Zuordnung von Videos zu Inhaltsbereichen](adr/0003-seitenstruktur-und-inhaltszuordnung.md)
- [ADR 0004: Detailseiten, Videonavigation und fortlaufende Wiedergabe](adr/0004-detailseiten-und-videonavigation.md)

## GitHub Pages veröffentlichen

Der Workflow in `.github/workflows/pages.yml` baut die Website bei Pushes auf
den Branch `main` und veröffentlicht `docs/` über GitHub Pages. Aktiviere im
Repository unter **Settings → Pages** die Bereitstellung über **GitHub Actions**.
