# Pretty Old Pixel: Funktionen und Datenaufbereitung

Zurück zum [Projekteinstieg](../README.md).

Diese Referenz beschreibt Funktionen, Datenformate, Zuordnungsregeln und
Build-Verhalten im Detail. Alle Befehle werden im Projektverzeichnis ausgeführt;
Dateipfade im Text beziehen sich auf dessen Wurzel.

## Inhalt

- [Quellstruktur und Verzeichnisumbau](source-structure.md)
- [Ausführung: lokal und GitHub Actions](source-structure.md#ausführung-lokal-und-github-actions)
- [Generierung und lokale Vorschau](#lokal-bauen)
- [Kanalstatistik](#startseite-kanal-und-themen-in-zahlen)
- [Hardware, Retrospektiven und Gespräche](#hardware-retrospektiven-und-gespräche)
- [Spiele und Reihen](#spiele-und-bestätigte-playlist-zuordnungen)
- [Spielemetadaten: Datenfluss und Pflege des lokalen Dumps](game-metadata-implementation.md)
- [Neue Videos, Titel und fehlende Metadaten](#recherchierte-daten-pflegen)
- [Kapitel und erwähnte Kanäle](#kapitel-und-erwähnte-kanäle)
- [Zeitschriften und Ausgaben](#blätterabend-nach-zeitschrift-und-jahrgang)
- [Medien, SEO und Builds](#medien-seo-und-unveränderte-builds)
- [Tests](#tests)
- [YouTube-Videos](#youtube-videos-cachen)
- [YouTube-Playlists](#youtube-playlists-cachen)
- [YouTube-Transkripte](#youtube-transkripte-einmalig-cachen)
- [Spielebesprechungen aus Transkripten](#spielebesprechungen-aus-transkripten)
- [Blätterabend-Aufbereitung und Archive](#blätterabend-videos-auswerten)
- [Architekturentscheidungen](#architekturentscheidungen)
- [GitHub Pages](#github-pages-veröffentlichen)

Statische Website für GitHub Pages. Die Quelldateien und der Websitegenerator liegen
in `src/`; `npm run generate:site` erzeugt die veröffentlichbaren Dateien in `docs/`.

Öffentliche Einleitungen und SEO-Beschreibungen erläutern den Inhalt:
Spiele, Zeitschriften, Hardware und Gespräche. Hinweise zur Datenaufbereitung
gehören in diese Dokumentation, nicht in Seiteneinleitungen. Originale
Videobeschreibungen, Datenschutz- und Bedienhinweise sowie notwendige Hinweise
auf fehlende oder unsichere Angaben bleiben erhalten.

## Lokal bauen

Voraussetzung: Node.js 22 oder neuer.

```sh
npm ci
npm run generate:site
```

Die Namenskonvention trennt Internetabrufe (`fetch-*` bzw. `fetch:*`) von
lokaler Generierung (`generate-*` bzw. `generate:*`). Der Websitegenerator
heißt `src/generate-site.mjs`, das npm-Ziel `generate:site`; das bisherige
allgemeine `build`-Ziel entfällt. Direkt unter `src/` liegen nur die dünnen
Hauptstarter `fetch-youtube.mjs` (`fetch:all`) und `generate-site.mjs`
(`generate:site`), die `runCli()` aus ihren Implementierungen aufrufen.
Alle weiteren npm-Aufgaben starten das jeweilige Fachmodul direkt,
ohne zusätzlichen Wrapper in `src/`.
Die Fachordner trennen Websitegenerierung (`src/site-generation/`),
YouTube-Kanaldaten (`src/fetch-channel/`), Zeitschriftenarchive und Logos
(`src/fetch-magazine/`), die lokale Spielemetadaten-Pipeline
(`src/fetch-game/`) sowie Transkripte und abgeleitete Zusatzdaten
(`src/extra-data/`). Gepflegte Kataloge und Freigaberegeln liegen unter
`src/data/`, gemeinsame Cachehilfen unter `src/shared/`.
Tests und andere Module importieren die Implementierungen aus diesen
Fachordnern. Die Namen und Optionen der npm-Befehle sowie die Cacheorte
bleiben unverändert; einzelne Scriptpfade liegen jetzt im Fachordner.
Gemeinsam genutzte `site-*`-Module unter `src/site-generation/` sind
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
Projektpfad. Die Brotkrümelnavigation trennt die Ebenen mit dem Unicode-Pfeil
„→“ samt Abstand; der dekorative Trenner ist für Screenreader ausgeblendet.
Canonicals und `og:url` enthalten absolute, selbstreferenzierende Seiten-URLs
aus der konfigurierten Basis-URL, ohne Query oder Fragment. Bei einem anderen
Host oder Unterpfad muss die Website mit `--base-url` neu erzeugt werden.
Paginierung und interne JSON-LD-URLs einschließlich `@id` bleiben seitenrelativ.
Auch die Sitemap und ihre `Sitemap:`-Referenz in `robots.txt` verwenden
vollständige URLs.
Externe YouTube-/Archivlinks und Schema.org-Bezeichner bleiben unverändert.
Die generierten Dateien unter `docs/` sind Build-Artefakte und gehören nicht
in neue Commits; GitHub Actions erzeugt und prüft sie vor dem Deployment.
Das Kopfzeilenlogo und das Favicon verwenden dieselbe optimierte Datei
`src/site-generation/assets/favicon.webp` (70 × 70 Pixel für hochauflösende Displays, unter 1,5 KiB).
`src/site-generation/assets/favicon.jpg` bleibt die Originalvorlage; der Build kopiert das fertige
WebP ohne Bildbibliothek. Das kleine Darstellungs-Skript bleibt vor dem CSS,
damit eine gespeicherte Farbauswahl ohne Aufblitzen des falschen Modus gilt.
Alle Seiten verweisen zusätzlich auf `apple-touch-icon.png` als
180 × 180 Pixel großes PNG für iOS-Startbildschirm-Verknüpfungen. Der Build
kopiert die vorbereitete Datei aus `src/site-generation/assets/`; Logo und Browser-Favicon bleiben WebP.
Alle eingebundenen Inhaltsbilder haben einen nicht leeren Alt-Text:
„Pretty Old Pixel – Logo“, „<Name> – Zeitschriftenlogo“ oder
„Videovorschau: <Videotitel>“. Das gilt auch für die Vorschau im Player-Iframe.
`docs/` ist ausschließlich für die generierte Website reserviert und wird beim
Build vollständig ersetzt. Die Projektdokumentation bleibt unter `doc/`.
Eine vorhandene Ausgabe unter `public/` kann einmalig nach `docs/` verschoben
werden, damit das Build-Manifest und unveränderte Dateizeitpunkte erhalten bleiben.

### Erste Seiten und lokale Vorschau

Die letzte Fußzeile jeder Website-Seite verlinkt die Kanäle
[Pretty Old Pixel auf YouTube](https://www.youtube.com/prettyoldpixel) und
[Pretty Old Pixel auf Twitch](https://www.twitch.tv/prettyoldpixel).
Beide Links sind als externe Ziele gekennzeichnet. Der Seitenfuß steht in einem
gemeinsamen Absatz vom Projektnamen bis zum Twitch-Link, mit kompakten
Linkbeschriftungen „YouTube“ und „Twitch“. Auf schmalen Bildschirmen darf die
Zeile ohne horizontalen Überlauf umbrechen.

Umgesetzt sind Startseite, News mit den 20 neuesten veröffentlichten Videos,
Zeitschriftenindex mit Zeitschriften- und Ausgabenseiten,
Spieleindex und Spieleseiten, Hardware, Retrospektiven sowie Interviews und Gespräche,
Datenschutz, Sitemap, Robots-Datei und 404-Seite. Alle Inhalte stehen direkt im
HTML. Alle Seiten enthalten ein minifiziertes Inline-Skript für den Hell-/Dunkel-Schalter
vor dem Stylesheet; dafür wird keine zusätzliche Ressource geladen.
Ohne manuelle Auswahl folgt die Darstellung `prefers-color-scheme` im Browser,
auch bei Änderungen und ohne JavaScript. Eine manuelle Auswahl wird unter
`pretty-old-pixel:theme` im Local Storage gespeichert und hat Vorrang.
Ohne JavaScript bleibt der Schalter verborgen. Speicherfehler beim Darstellungsmodus
werden ausschließlich mit `console.warn` protokolliert, ohne Meldung auf der Seite;
die Umschaltung auf der aktuellen Seite bleibt möglich.
Nur Spiel-/Ausgabenseiten laden zusätzlich ein kleines lokales JavaScript für die Auswahl
von Video und Beschreibung; ohne JavaScript sind alle Beschreibungen sichtbar.
Es gibt keinen Gesamtkatalog unter `/videos/`. Blätterabend-Videos ohne
eindeutige Ausgabenseite oder Spieleseite erhalten eine Detailseite unter
`/zeitschriften/videos/<videotitel>/`, mit demselben Player und denselben
Videoinformationen wie Ausgabenseiten, ohne erfundene Heftdaten.
Videos unter „Sonstiges“ erhalten entsprechend eine eigene Seite unter
`/sonstiges/<video-id>/`. Titel und Vorschaubilder in Sonstiges und News
verlinken auf diese Seiten; später bestätigte Spiel- oder Themenzuordnungen
ersetzen die Sonstiges-Zuordnung, und ihre bisherigen Detailseiten entfallen.
Videos erscheinen auf thematischen Seiten sowie in der begrenzten News-Übersicht.
Nicht zugeordnete ältere Videos bleiben nur im vollständigen JSON-Cache erhalten.
Beim Build werden alte Katalogseiten einschließlich Sitemap-/Manifest-Einträgen entfernt.
News und Themenübersichten führen zum
Videoabschnitt einer vorhandenen Ausgabe bzw. eines Spiels, bei Blätterabenden
ersatzweise zur Videodetailseite. Auch Hardware, Projekte (Retrospektiven),
Interviews, re.consider und Sonstiges verlinken immer intern: Ohne Spiel-
oder Ausgabeseite wird eine Videodetailseite unter dem ersten zugeordneten
Themenbereich erzeugt und bei Mehrfachzuordnungen gemeinsam verwendet.

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
npm run dev
```

`npm run dev` verwendet `npx http-server docs -a 127.0.0.1 --port 8000`;
beim ersten Aufruf kann `npx` das Vorschaupaket aus der npm-Registry laden.
Der Befehl startet nur den Server; nach Inhaltsänderungen die Website erneut
generieren. Bei belegtem Port lässt sich z. B. mit `npm run dev -- -p 8001`
ein anderer Port wählen. Alternativ mit vorhandenem Python 3:
`python3 -m http.server 8000 --bind 127.0.0.1 --directory docs`.
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
stehen in `src/data/data-games.mjs`, die bestätigten Zuordnungen für weitere Bereiche
in `src/data/data-sections.mjs`. Es gibt keine Links auf noch nicht erzeugte Bereichsseiten.

### Startseite: Kanal und Themen in Zahlen

Die Startseite zeigt keine Liste neuer Videos, sondern ein responsives
Statistikraster mit Gesamtzahl öffentlicher Videos, Zeitschriften,
unterschiedlichen Heftausgaben, qualifizierten Spielereihen, Playlists und
Videostunden (abgerundet). Fehlende Laufzeiten werden als Teilsumme kenntlich
gemacht; bei vollständig fehlenden Laufzeiten entfällt diese Kennzahl.
Eine zusätzliche Angabe zur Videogeschichte entfällt.
Statistik- und Themenkacheln stehen mobil zweispaltig mit kompakten Abständen.
Alle Kennzahlen kommen aus dem
lokalen normalisierten Datenbestand; zukünftige Videos werden nicht gezählt.

Themenkacheln verlinken vorhandene Bereiche mit ihrer jeweiligen Videoanzahl.
Die Zeitschriftenbox zeigt stattdessen die Anzahl unterschiedlicher Zeitschriften
ohne Videozahl; die Beschreibung der Spielebox nennt zusätzlich die Anzahl
unterschiedlicher veröffentlichter Spiele. Beide Zahlen werden bei jedem Build aus dem
normalisierten Datenbestand ermittelt.
Unter „Die Themen entdecken“ ergänzen vier Infoboxen für Genre, Entwickler,
Publisher und Spieleplattformen jeweils die fünf Werte mit den meisten Spielen. Die Überschriften
sind nicht verlinkt; jeder Wert erhält einen eigenen Link zur gefilterten
Spieleliste und seine Spieleanzahl. Es gelten dieselben Zählregeln und
die Mindestzahl von zwei verschiedenen Spielen wie für die Filterseiten;
bei weniger als fünf passenden Filtern erscheinen nur die vorhandenen Werte;
ohne passenden Filter entfällt die jeweilige Box. Bei gleicher Trefferzahl
entscheidet der alphabetische Name. Die Auswahl wird bei jedem Build aktualisiert.
Plattformlinks führen auf `/spiele/plattform/<name>/`. Maßgeblich sind die
Katalogplattformen, sonst die ausgewählten Metadatenplattformen; Mehrfachplattformen
zählen je Plattform einmal pro Spiel, zusätzliche Veröffentlichungen nicht mehrfach.
Mehrfachzuordnungen zählen innerhalb eines Bereichs nur einmal; die Bereiche
sind untereinander nicht addierbar. Die separate News-Seite mit den 20 neuesten
Veröffentlichungen bleibt über die Hauptnavigation erreichbar; einen zusätzlichen
News-Button im Startseiteninhalt gibt es nicht. Die Statistik braucht
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
  Die sechs englischsprachigen Beiträge mit Mata Haggis-Burridge sind
  manuell dem Thema „Immersion in Videospielen“ zugeordnet, in der
  Reihenfolge Part 1/6 bis Part 6/6, und entfallen aus Sonstiges.
  Zusätzlich ordnet die Titelregel `^\s*Themenblock\s+Vietnam\b`
  (ohne Beachtung der Groß-/Kleinschreibung) passende Videos automatisch
  dem Thema „Themenblock Vietnam“ zu, aktuell zwei Beiträge. Diese Gruppe
  folgt den manuell gepflegten Themen; ihre Videos stehen chronologisch,
  unbekannte Veröffentlichungsdaten zuletzt. Explizite Zuordnungen und
  Ausschlüsse haben Vorrang. Neue passende Videos werden ohne manuelle
  Video-ID-Liste aufgenommen und entfallen aus Sonstiges.
- `/interviews/` enthält acht bestätigte Interviews/Gespräche mit sichtbaren
  Personen- und Themenangaben, neueste zuerst. Bekannte Spielzuordnungen
  werden wiederverwendet, nicht aus zufälligen Erwähnungen im Text erfunden.
  Dazu gehört auch das Interview mit Andreas und Oliver über die C64-Version
  von Eye of the Beholder, das nicht in der Interview-Playlist enthalten ist.
- `/sonstiges/` enthält automatisch alle öffentlichen Videos ohne Zuordnung
  zu einem veröffentlichten Spiel, Blätterabend/Zeitschriften oder einem der
  bestätigten Themenbereiche. Die Liste verwendet dieselben Videoeinträge
  wie News, neueste zuerst, unbekannte Veröffentlichungsdaten am Ende,
  mit höchstens 60 Videos pro Seite. News und bloße Playlist-Mitgliedschaften
  zählen nicht als thematische Zuordnung. Sobald ein Video anderweitig
  einsortiert wird, entfällt es automatisch aus Sonstiges.
- `/reconsider/` enthält automatisch alle öffentlichen Videos mit der
  eigenständigen Bezeichnung `re.consider` im Titel, unabhängig von
  Groß-/Kleinschreibung. Die Reihe stellt einzelne Spiele mit einem Video
  pro Spiel vor. Die Seite verwendet dieselben Videoeinträge wie News,
  neueste zuerst, mit höchstens 60 Videos pro Seite und unbekannten Daten
  am Ende. Diese Videos entfallen aus Sonstiges; vorhandene weitere
  Zuordnungen bleiben erhalten. Die Zwei-Video-Schwelle für Spieleseiten
  wird dadurch nicht verändert.
- `src/data/data-sections.mjs` hält explizite Video-IDs, Themen, bei Gesprächen Personen
  und bei Retrospektiven die Reihenfolge, außerdem je Bereich den Kurznamen
  für die Hauptnavigation (`navigationName`) und die Gruppe vor bzw. nach dem
  Trenner (`olderFormat`). Titel, Beschreibungen und bestätigte
  Playlist-Mitgliedschaften wurden hierfür geprüft. Änderungen der
  Playlist-Mitgliedschaft allein erzeugen keine ungeprüften Zuordnungen.
  Neue Titel-/Playlist-Kandidaten werden beim Build als Prüfhinweis gemeldet.
  Fehlen bestätigte Beiträge im öffentlichen Cache, werden sie ausgelassen
  und bei vorhandenem Quellplaylist-Kontext ausdrücklich gemeldet.
- Der Verpackungsbeitrag `bwVnfQJ-WEw` ist manuell re.ware (Hardware)
  zugeordnet und erscheint nicht unter Sonstiges. Der gemischte Beitrag `XDvGVislnJg` behandelt laut
  Beschreibung Hardware-Reinigung und trägt einen entsprechenden Hinweis.
  re.list, re.collect und Community-Formate erhalten ohne bestätigte Zuordnung keine Themenübersicht.
- Bereiche haben höchstens 60 Einträge pro Übersichtsseite. Fehlende
  Beschreibungen sind zulässig; unbekannte Daten stehen bei Hardware und
  Interviews am Ende. Zukünftige oder fehlende Videos werden nicht publiziert.
  Leere Bereiche erzeugen weder Seiten noch Navigationslinks.
- Startseite, Hauptnavigation, News und zugehörige Detailseiten
  verlinken die vorhandenen Bereiche. Die erweiterten Navigationslinks
  umbrechen auf schmalen Displays. Videolinks führen zu vorhandenen
  Spiel-/Ausgabeabschnitten, bei Sonstiges zu eigenen Videodetailseiten
  sowie bei allen anderen Themen ersatzweise zu eigenen Videodetailseiten.
  Einzelvideoseiten verwenden lesbare, aus dem Videotitel gebildete Pfade
  statt YouTube-IDs, etwa `hardware/mein-amiga-1200/`. Das gilt auch für
  Interviews, Retrospektiven, Sonstiges, re.consider und unbekannte Heftausgaben.
  Sonderzeichen werden normalisiert; Titelpfade sind auf 160 Zeichen begrenzt.
  Gleiche Titel erhalten bei Bedarf einen numerischen Zusatz, niemals eine ID.
  Die Auswahl bleibt bei geänderter Quellreihenfolge gleich. Interne Links,
  Canonicals und Sitemap verwenden dieselben Pfade; alte ID-Seiten entfallen
  beim nächsten Build. Video-Fragmente und externe YouTube-Adressen bleiben
  für Player und Folgenauswahl unverändert.
  Die Sonstiges-Detailseiten verwenden den gemeinsamen Player und das
  vorhandene Laufzeitskript; die Listen bleiben ohne Player. Vorschaubilder verwenden das
  gemeinsame Videoeintrags-Widget und werden direkt von YouTube geladen.
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
| [`src/data/data-games.mjs`](../src/data/data-games.mjs) | Geprüfte Spieltitel, Plattformen, Playlist-IDs, Aliasse, zusätzliche und ausgeschlossene Video-IDs; einfache Muster zur Bildung der Spielidentität. |
| [`src/data/data-game-dump-decisions.json`](../src/data/data-game-dump-decisions.json) | Explizit geprüfte Games-Dump-Zuordnungen für bekannte mehrdeutige Titel. |
| [`src/data/data-game-dump-policy.json`](../src/data/data-game-dump-policy.json) | Plattformregel für die ausschließlich dumpbasierte Metadatenaufbereitung. |
| [`src/data/data-sections.mjs`](../src/data/data-sections.mjs) | Geprüfte Videozuordnungen für Hardware, Retrospektiven und Gespräche mit Themen, Personen und Folgenreihenfolge. |

### Neue Videos oder Titel aufnehmen

1. `npm run fetch:all` lädt neue öffentliche Videos und prüft die
   Playlist-Mitgliedschaften erneut. Für Blätterabende anschließend
   `npm run dev:fetch:archives` und `npm run dev:generate:blaetterabend` ausführen.
   Die Originaltitel und Beschreibungen bleiben als Quellen erhalten;
   sie werden nicht durch redaktionell geratene Metadaten ersetzt.
2. `npm run generate:site` ausführen und die Build-Hinweise prüfen.
   Eine neue Folge in einer bereits bestätigten Spielplaylist wird automatisch
   dem Spiel zugeordnet. Fehlt sie dort, ihre Zugehörigkeit anhand von Titel,
   Beschreibung und Quellplaylist prüfen und erst dann als Zusatzvideo in
   `src/data/data-games.mjs` aufnehmen. Bekannte Ausschlüsse bleiben bestehen.
3. Bei einem **neuen Spieltitel** eine eigene bestätigte Spielidentität in
   `src/data/data-games.mjs` anlegen: kanonischer Name, gegebenenfalls Plattform,
   Quellplaylist oder explizit geprüfte `videoIds` sowie belegte Aliasse.
   Eine Playlist ist bei einer vollständig manuell bestätigten Videoreihe
   nicht erforderlich; die Zwei-Video-Schwelle gilt weiterhin. Ähnliche Namen, Nachfolger,
   Plattformversionen und Neuauflagen nicht ungeprüft zusammenlegen.
   Der Slug aus Name und Plattform ist zugleich der Metadaten-Katalogschlüssel;
   bestehende IDs nicht beiläufig ändern. Nach Katalogänderungen den lokalen
   Dump-Report ergänzen beziehungsweise neu importieren und den fertigen Cache
   mit `npm run dev:prepare:game-metadata` erneuern.
   Eine Spieleseite entsteht erst ab zwei unterschiedlichen verfügbaren
   Nicht-`re.minder`-Videos. Ausnahme: genau ein verfügbares Video aus einer
   bestätigten Spielplaylist, dessen Veröffentlichung höchstens zwei
   Kalendermonate zurückliegt.
4. Für neue **Hardware-, Retrospektiven- oder Gesprächsbeiträge** die konkrete
   Video-ID in `src/data/data-sections.mjs` nach Prüfung ergänzen. Thema und bei
   Gesprächen die Personen belegen; bei Retrospektiven zusätzlich die
   Reihenfolge pflegen. Ein Titelmuster oder eine Playlist-Mitgliedschaft
   ist dort nur ein Prüfhinweis, keine automatische Freigabe.

### Fehlende oder widersprüchliche Metadaten

- **Erscheinungsjahr:** Ausschließlich aus den Veröffentlichungen des lokalen
  Games-Dumps übernehmen. Genau eine ausgewählte Plattform und vollständig
  datierte Veröffentlichungen sind Voraussetzung für ein pauschales Jahr;
  dann zählt das früheste. Mehrfachplattformen oder undatierte Einträge bleiben
  ohne pauschales Jahr. Ausnahme: Ein ausdrücklich freigegebenes `releaseYear`
  in `src/data/data-game-dump-decisions.json` darf bei mehreren Plattformen
  das früheste vollständig belegte Dump-Jahr übernehmen. Für „Der Patrizier“
  ist 1992 freigegeben; Amiga, Atari ST und DOS bleiben erhalten.
  Für „B.S.S. Jane Seymour“ ist 1990 als Erstveröffentlichungsjahr freigegeben;
  die abweichende DOS-Veröffentlichung von 1991 bleibt separat erhalten.
  Keine manuell recherchierten oder externen Ersatzwerte.
- **Kein belastbarer Beleg:** Nicht raten. Der Generator meldet ein fehlendes
  Erscheinungsjahr und zeigt es als unbekannt. Spieleseiten und Videozuordnungen
  bleiben auch ohne Metadaten verfügbar. Ungültige oder veraltete fertige
  Metadatencaches brechen den Build ab.
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
  `src/extra-data/generate-blaetterabend.mjs`; danach die Blätterabend-Datei neu erzeugen.
  Ungeklärte Angaben bleiben in den vorhandenen unbekannten Gruppen sichtbar.

Zum Abschluss `npm test` und `npm run generate:site` ausführen und die betroffenen
Kacheln, Detailseiten und Quellenlinks in der lokalen Vorschau kontrollieren.
Geänderte `src/data/data-*`-Dateien samt Tests/Dokumentation versionieren; die Website
unter `docs/` bleibt ein generiertes Artefakt. Das Umbenennen von Datendateien
erfordert zugleich aktualisierte Imports und Dokumentationsverweise.

### Spiele und bestätigte Playlist-Zuordnungen

- `/spiele/` zeigt qualifizierte Spiele alphabetisch, mit maximal 60 Spielen je
  Übersichtsseite. `/spiele/<slug>/` enthält die Spielinformationen, sämtliche
  Videos, Beschreibungen und einen gemeinsamen Player. Auch mehr als 60 Videos
  eines Spiels bleiben auf dieser einen Seite.
- Spielüberschriften mit weniger als 20 Zeichen erhalten bei genau einem
  bekannten System den Zusatz ` - <System>`; `MS-DOS` wird dabei als `DOS`
  angezeigt, etwa `Aces of the Pacific - DOS`. Vorrang hat die gepflegte
  Plattform, sonst der eindeutige Umfang freigegebener Spielmetadaten.
  Bleibt die Überschrift danach unter 20 Zeichen oder ist kein System
  eindeutig bekannt, folgt der Zusatz ` - Spielinformationen und Videos`.
  Damit hat jede Spieleseiten-H1 mindestens 20 Zeichen; Namen ab 20 Zeichen
  bleiben unverändert. Bereits am Titelende genannte Systeme werden nicht
  erneut angehängt. Die Regel wird bei jeder Seitengenerierung angewendet.
  Spielidentität, URLs und strukturierte Spieldaten ändern sich dadurch nicht.
  Videotitel bleiben eigene Überschriften; Beschreibungen folgen ohne die
  je Folge wiederholte Zwischenüberschrift „Videobeschreibung“.
- Genre, Entwickler und Publisher in den Spielinformationen verlinken auf
  gefilterte Spielelisten unter `/spiele/genre/<wert>/`,
  `/spiele/entwickler/<wert>/` und `/spiele/publisher/<wert>/`.
  Diese Unterseiten und Links entstehen nur, wenn mindestens zwei verschiedene
  Spiele der veröffentlichten Spieleliste denselben Metadatenwert haben.
  Jedes Spiel zählt je Wert einmal, auch bei mehreren passenden Veröffentlichungen.
  Es werden nur eindeutig zugeordnete Metadaten berücksichtigt; Entwickler und
  Publisher weiterer Veröffentlichungen zählen ebenfalls. Publisher-Labels
  bleiben Zusatzangaben und sind keine eigenen Filter.
  Die gefilterten Listen verwenden dieselben Kacheln, die alphabetische
  Reihenfolge und die Paginierung mit maximal 60 Spielen je Seite.
  Filter-H1 mit weniger als 20 Zeichen werden ausgeschrieben, etwa
  „Spiele des Publishers Sierra“, „Spiele des Entwicklers Ocean“,
  oder „Spiele im Genre Action“. Bereits ausreichend lange Überschriften
  wie „Spieleplattformen: DOS“ bleiben unverändert.
  Bleibt die H1 zu kurz, folgt „– Retrospiele und Videos“.
  Titel, Meta-Beschreibung und Einleitung verwenden dieselbe Formulierung;
  Filterwerte, Brotkrümel und URLs bleiben unverändert.
  Sinkt die Trefferzahl unter zwei, entfallen beim nächsten Build sowohl
  die Unterseiten als auch die Links.
- `src/data/data-games.mjs` hält ausdrücklich geprüfte Spielidentitäten mit festen
  Playlist-IDs, kanonischem Namen, bekannten Plattformen, Quellschreibweisen
  und gegebenenfalls bestätigten zusätzlichen Video-IDs fest. Die Zuordnung
  basiert auf Playlist- und Mitgliedstiteln, nicht allein dem Formatnamen.
  Ähnliche Titel, Nachfolger und Plattformvarianten werden nicht automatisch
  zusammengelegt. Der Slug hängt von der gepflegten Identität ab, nicht von
  späteren Änderungen des gescrapten Playlist-Titels.
- [`cache/game-metadata/ready.json`](../cache/game-metadata/ready.json) ist die
  einzige Quelle der Spielmetadaten beim Website-Build. Der Cache wird aus dem
  lokalen Games-Dump aufbereitet; auch Jahre kommen ausschließlich daraus.
  Quellenlinks erscheinen als Link-Icons. Nicht eindeutig zugeordnete Titel
  bleiben unverifiziert. [Datenfluss und Pflege](game-metadata-implementation.md).
- Der aktuelle Katalog enthält 147 geprüfte Spielidentitäten aus den
  143 re.play-Playlists, der ebenfalls geprüften 1942-Playlist und der
  manuell bestätigten Patrizier-Reihe mit 17 Videos einschließlich re.minder und streamstag sowie Airships: Conquer
  the Skies (vier Videos) und Hyperspace Delivery Service (sechs Videos)
  ohne eigene Quellplaylist. Die beiden re.invented-Spiele verwenden explizite
  `videoIds`, nicht die gesamte gemischte Formatplaylist. Die konkrete
  Aufnahmeplattform bleibt mangels Beleg offen; Erscheinungsjahre sind
  mit den Steam-Veröffentlichungen belegt. Andere re.invented-Titel bleiben
  vorerst in Sonstiges. Zusätzlich
  ist die re.connect-Playlist zu Railroad Tycoon Deluxe demselben Spiel
  zugeordnet; ihre allgemeine Formatvorstellung ist explizit ausgeschlossen.
  Wizardry hat bisher nur ein Video und erhält daher noch keine Seite.
  Fehlende Playlist-Mitgliedschaften werden nicht aus dem Titel geraten:
  Acht geprüfte re.play-Folgen sind explizit über `videoIds` ergänzt
  (Wing Commander II, Raptor, Heretic, They Stole a Million, Christoph Kolumbus,
  Die Siedler, System Shock und Super Mario Bros. 2).
- Eine Seite entsteht ab zwei unterschiedlichen verfügbaren Videos aus dem
  öffentlichen Video-Cache. Nicht verfügbare Mitglieder, fehlende Videos und
  doppelte Playlist-Einträge erfüllen die Schwelle nicht. Bestätigte
  re.minder-Beiträge ergänzen eine qualifizierte Reihe, heben aber keine
  Ein-Video-Reihe über diese Schwelle.
  Ausnahme für neue Reihen: Genau ein verfügbares Nicht-re.minder-Video
  aus einer bestätigten Spielplaylist genügt, wenn sein bekanntes
  Veröffentlichungsdatum höchstens zwei Kalendermonate vor dem Build liegt
  (UTC, Grenzzeitpunkt eingeschlossen; fehlende Monatstage werden auf das
  Monatsende begrenzt). Die Ausnahme gilt nicht für reine manuelle
  Einzelzuordnungen. Ohne zweites Video entfällt die Spieleseite nach
  Ablauf der Frist beim nächsten Build wieder.
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
- `src/site-generation/site-game-series.mjs` erkennt Abschnitte nur aus ausdrücklichen
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

Katalogkacheln auf Spiele- und Zeitschriftenübersichten halten ihren Titel
oben und richten die folgenden Fakten gemeinsam am unteren Kachelrand aus.
Die Kachelhöhe wird innerhalb jeder Rasterzeile angeglichen; der Abstand
zwischen Titel und Fakten nimmt die verbleibende Höhe auf.

### Kapitel und erwähnte Kanäle

Spiel- und Ausgabeseiten zeigen im jeweiligen Videoabschnitt die erkannten
Kapitel und explizit erwähnten YouTube-Kanäle aus der Beschreibung.
Erkannte Kapitelzeilen samt zugehöriger Kapitelüberschrift und gültige
Zeitlinks zum eigenen Video werden in der sichtbaren Videobeschreibung
nicht erneut ausgegeben. Begleittexte, ungültige Zeitangaben und Links
zu anderen Videos bleiben erhalten; die Originalbeschreibung im Cache
und in den strukturierten Daten bleibt unverändert.
`src/site-generation/site-video-details.mjs` bereitet diese Daten rein offline auf:

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

Kapitel erzeugen keine zusätzlichen Seiten oder Sitemap-Adressen.
Die offizielle IFrame-API von `https://www.youtube.com/iframe_api` lädt erst
nach bewusster oder bereits gemerkter Player-Freigabe, einmal pro Dokument.
Der Frame bleibt auf `youtube-nocookie.com`, mit `enablejsapi=1` und der
tatsächlichen Browser-Origin. Fehler oder ausbleibende Antworten werden
sichtbar gemeldet; externe Links und der manuelle Player bleiben verfügbar.

Wiederverwendbare HTML-Komponenten liegen als ES-Module unter `src/site-generation/widget/`;
`src/site-generation/site-render.mjs` importiert sie direkt:

Die verpflichtende zentrale Wiederverwendung und Zuständigkeitsgrenzen
beschreibt [ADR 0005](adr/0005-wiederverwendbare-widgets-und-komponenten.md).

- `video.mjs`: `videoWidget` mit Player, Vorschau und Bedienelementen sowie
  `playerPoster` für die Vorschau beim Folgenwechsel.
- `episode-list.mjs`: `episodeList` als unabhängig scrollbar dargestellte
  Folgenliste mit Fragmentlinks, Laufzeiten, Datum und Spielkontext.
  Der aktive Eintrag ist markiert und wird bei Hash-Einstieg, Folgenwechsel
  und Öffnen der Liste innerhalb ihres Scrollbereichs sichtbar gehalten,
  ohne dafür die gesamte Seite zu verschieben.
  Zugehörige YouTube-Playlists stehen direkt darunter in der rechten
  Seitenspalte als reine Links ohne Überschrift oder Aufzählungszeichen.
- `catalog-grid.mjs`: gemeinsame Spiele-/Zeitschriftenkacheln.
  Bei Zeitschriften mit nur einem bekannten Jahrgang entfällt die
  Jahrgangsliste; Heftjahre und Jahrgangsanzahl bleiben erhalten.
- `metadata.mjs`: gemeinsame semantische Metadatenliste.
- `pagination.mjs`: vorherige/nächste Übersichtsseite, aktuelle Seitenzahl
  und aufklappbare Liste aller Seiten.
- `game-discussions.mjs`: erkannte Spielebesprechungen mit Zeitmarken,
  hinter dem Link Erscheinungsjahr, Entwickler und Publisher in Klammern
  (höchstens zwei Namen je Rolle, gleiche Firmen nur einmal), und Hinweis auf
  ungeprüfte Vorschläge auf Blätterabend-Ausgabenseiten.
- `magazine-logo.mjs`: lokal gespeichertes Zeitschriftenlogo mit
  Quellenlink zu Kultmags auf der jeweiligen Zeitschriftenseite.

- `navigation.mjs`: gemeinsame Hauptnavigation mit relativen Links und
  Markierung des aktiven Bereichs auch auf Unterseiten. Das Widget erhält
  eine fertige Liste `{ route, name, separator }` und enthält keine
  Bereichslogik. Die Liste baut `siteNavigation` in `site-data.mjs` einmal als
  `model.navigation`; `layout` reicht sie nur weiter.
  Feste Einstiege sind „News“, „Blätterabend“ (Zeitschriften) und „re.play“
  (Spiele), jeweils nur bei vorhandenen Daten. Die Namen der Themenbereiche
  stehen als `navigationName` in `src/data/data-sections.mjs`: „re.ware“
  (Hardware), „Projekte“ (Retrospektiven), „Interviews“. Bereiche mit
  `olderFormat: true` folgen nach einem sichtbaren, für Screenreader
  ausgeblendeten `|`; dazu gehört auch das automatisch erzeugte „Sonstiges“.
  „re.consider“ (`olderFormat: false`) steht davor. Die URLs bleiben unverändert.
- `archive-links.mjs`: Archivordner-, Lese- und Downloadlinks als Inline-Gruppe
  oder Liste, einschließlich Hinweis bei fehlendem Archiv.
- `video-panel.mjs`: Videoinformationen mit Metadaten, Kapiteln, erwähnten
  Kanälen, Beschreibung, Zeitschriftenverweisen und Teilnavigation.
  Der Renderer übergibt Position, Nachbarvideos und Spielabschnitt/Reihe;
  Auswahl, Reihenfolge und Gruppierung bleiben dort. `descriptionHtml`
  bleibt aus Kompatibilitätsgründen auch aus `site-render.mjs` exportiert.
- `video-entry.mjs`: `videoListEntry` für jeden einzelnen Beitrag in News,
  Hardware, Retrospektiven, Interviews und Sonstiges sowie für Videos in
  Zeitschriften- und Jahrgangslisten; `videoList` setzt daraus die Liste
  zusammen. Überschriftenebene, Personen, Thema, Hinweise und Themenverweise
  bleiben je nach Seitenkontext erhalten. Die Gruppierung von Retrospektiven
  und die Auswahl/Sortierung der Videos liegen weiterhin im Seitengenerator.
  Der Titel steht über die volle Breite. Darunter steht eine kleine
  16:9-Vorschau links; Datum, Kategorie und Beschreibung stehen rechts daneben
  und sind linksbündig ausgerichtet. Thumbnail und Titel
  verlinken dasselbe interne Videoziel bzw. YouTube. Die Vorschaubilder kommen
  direkt von YouTube (`i.ytimg.com`), mit reservierter Bildfläche, Lazy Loading
  und asynchronem Decoding; die Datenschutzseite beschreibt diesen Abruf.
  Zeitschriftenlisten übergeben zusätzlich den jeweiligen Ausgabenkontext
  und gegebenenfalls die Teilnummer als Titelpräfix. Titel und Thumbnail
  führen dadurch auch bei mehreren Zeitschriftenzuordnungen zur passenden
  Ausgabe. Ausgabenüberschriften und deren Archivlinks bleiben separat.

HTML-Escaping und externe Links liegen gemeinsam in `src/site-generation/site-html.mjs`,
Datums-/Laufzeitformatierung in `src/site-generation/site-format.mjs`. Widgets importieren
gemeinsame interne Video- und Themenlinks aus `src/site-generation/site-video-links.mjs`, aber
nicht den Seitengenerator; so entstehen keine zyklischen Abhängigkeiten.
Styles bleiben in `src/site-generation/site.css`, Browserinteraktion in `src/site-generation/video-series.js`
und der globale Hell-/Dunkel-Schalter in `src/site-generation/theme.js`.
Der Seitengenerator minifiziert das Theme-Skript beim Build mit Terser und
bettet es direkt ins HTML ein; eine separate Theme-JavaScript-Datei entfällt.
Das Inline-Skript zählt weiterhin zum JavaScript-Budget der jeweiligen Seite.
Die Widget-Module werden nur beim Build ausgeführt, nicht zusätzlich im Browser.

Alle eingebetteten Videos verwenden das gemeinsame `videoWidget`:
Player, Vorschau-/Fehlerhinweise und eine einheitliche Steuerzeile mit
Aktivierung zurücksetzen, Folgenoption, direktem YouTube-Link und manuellem
Start bei blockierter Wiedergabe. Spiel- und Heftausgabenseiten setzen genau
eine Instanz ein; Übersichtsseiten ohne Player erhalten kein leeres Widget.

„Nächste Folge automatisch“ steht nur bei mehr als einem Video in der
zugehörigen Folgenliste zur Verfügung und ist ohne
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

H1, sichtbare Einleitung und Meta-Beschreibung benennen denselben Seiteninhalt.
Die Meta-Beschreibung übernimmt den Seitentitel; im Fließtext stehen der
Zeitschriften-/Gastname und die Begriffe der H1, etwa „Blätterabend-Videos“.
Jahrgänge und Ausgaben werden ausdrücklich genannt, Folgeseiten zusätzlich
mit Seitennummer. Die automatisch erzeugten Einleitungen ergänzen die
unveränderten Originalbeschreibungen der Videos.

Jahrgangsgruppen heißen beispielsweise „Jahrgang 1996 – Ausgaben“;
Sonderhefte stehen separat unter „Jahrgang 1996 – Sonderhefte“.
Einträge ohne bekanntes Heftjahr folgen am Ende unter „Jahrgang unbekannt“.
Ein bekanntes Heftjahr kann auch bei noch ungeklärter Einzelheftnummer
erhalten bleiben; die Jahrgangsüberschrift macht hierzu keine Aussage.
Zeitschriften mit mehr als 30 unterschiedlichen Videos zeigen auf ihrer Übersichtsseite
statt der Jahrgangsliste einen Kalender mit den Jahrgängen als Spalten und den
Ausgabennummern 1 bis 12 als Zeilen. Die Jahreszahlen springen zum Anker
`#jahr-<jahr>` auf derselben Seite; jede gefundene Ausgabe verlinkt direkt zum
zugehörigen Video.
Unter 768 Pixel Breite erscheint statt des Kalenders eine gut antippbare
Jahrgangsliste. In der Seitenüberschrift des Zeitschriftenindex führt der Sprunglink
„Gäste“ direkt zum Gästebereich, auch über Seitengrenzen.
Alle Spiele-Katalogseiten bieten den Einstieg „Spiele suchen und filtern“.
Die Gesamttabelle kombiniert eine Titelsuche mit System- und Genrefiltern;
„Filter zurücksetzen“ leert die Filter ohne Änderung der Sortierung.
„Erstes Video“, „Erscheinungsjahr“ und „Videolaufzeit“ unterscheiden
Videoveröffentlichung, Spieljahr und summierte Videolängen.

- `/zeitschriften/` zeigt die erkannten Zeitschriften alphabetisch sowie eine
  Gruppe „Weitere Blätterabende“ für nicht sicher zugeordnete Blätterabend-Videos.
  Unter „Blätterabend mit Gast“ erscheinen zusätzlich alphabetische Gästekacheln mit Videozahl
  und Anzahl bekannter Ausgaben. Schon ein Gastauftritt genügt für eine Kachel.
- `/zeitschriften/gaeste/<gast>/` bündelt die Ausgaben und Videoteile mit diesem
  Gast, mit derselben Jahrgangs-/Ausgabengruppierung, Archivlinks, relativen
  Heftlinks und Paginierung wie die Zeitschriftenlisten, aber ohne eigenen Player.
  Ungeklärte Zeitschriften und Heftdaten bleiben gekennzeichnet sichtbar.
  Gäste werden beim Offline-Build dynamisch aus dem Titelzusatz „mit NAME“
  bzw. „mit @Handle“ der veröffentlichten Blätterabend-Videos ermittelt.
  Titeltrenner, „in der …“ und „und dem/der …“ beenden die Namensangabe;
  Angaben wie „Chat-Vote“ zählen nicht als Gast.
  Ein zweiter Durchlauf sucht die bekannten Gastnamen und Handles (auch ohne
  @ sowie über bestätigte Kanalhandles) in weiteren Blätterabend- und
  Zeitschriften-Videotiteln. So wird beispielsweise „Power Play – Strategie
  für Geniesser – Steinwallen“ dem bereits bekannten Gast @Steinwallen
  zugeordnet. Groß-/Kleinschreibung wird ignoriert; Teilnamen und mehrdeutige
  Namenszuordnungen werden nicht ergänzt. Videos außerhalb des
  Zeitschriftenbereichs und bloße Erwähnungen in Beschreibungen zählen nicht.
  Bereits ausdrücklich zugeordnete Gastvideos bleiben unverändert; etwa
  „Christian @StayForeverDE“ wird nicht zusätzlich einem bloßen „Christian“
  zugeordnet.
  Bestätigte YouTube-Kanäle sind einmalig geprüft und statisch in
  [`src/data/data-magazine-guest-channels.mjs`](../src/data/data-magazine-guest-channels.mjs)
  hinterlegt. Auf der Gastseite verlinkt der @Handle in der Überschrift den
  Kanal über dessen lesbare `https://www.youtube.com/@Name`-Adresse statt einer
  Kanal-ID-URL. Der Build führt keine Kanalabfragen aus.
  Nicht gefundene und neue, ungeprüfte Handles sowie Gäste ohne @ bleiben
  unverlinkt. Neue Kanalzuordnungen müssen manuell geprüft und ergänzt werden.
  Derselbe Handle wird unabhängig von Groß-/Kleinschreibung zusammengefasst;
  die ausführlichste im Titel belegte Namensform wird angezeigt. Unterschiedliche
  Handles (auch mit/ohne Unterstrich) und bloße Vornamen werden nicht ohne Beleg
  zusammengelegt. Mehrere ausdrücklich mit „und“ oder „&“ verbundene Gäste
  werden einzeln erfasst. Neue oder geänderte Titel aktualisieren Gästekacheln,
  Unterseiten, Sitemap und Manifest beim nächsten Build automatisch.
- `/zeitschriften/<slug>/` listet alle Ausgaben und Videos einer Zeitschrift
  auf einer einzigen, nicht paginierten Seite, gruppiert nach Jahrgang. Es gibt
  keine separaten Jahrgangsseiten: Der erste Abschnitt eines Jahrgangs trägt
  den Anker `#jahr-<jahr>` (bzw. `#jahr-unbekannt`), Jahrgangsliste, Kalender
  und Links „Jahrgang <jahr>“ in Videoeinträgen springen dorthin.
  „Jahrgang unbekannt“ bleibt sichtbar; das Uploadjahr ersetzt kein Heftjahr.
  Je Jahrgang stehen reguläre Ausgaben nach Monat bzw. Heftnummer und
  Sonderhefte als getrennte Gruppe. Doppelausgaben bleiben ein
  Heft; die Videos dazu stehen nach Teilnummer, anschließend Datum und ID.
  Fehlt eine Teilnummer, bleibt dieses Video an seinem chronologischen Platz;
  die bekannten Teilnummern werden relativ zueinander geordnet. Ein früheres
  unnummeriertes Video wird nicht pauschal hinter „Teil 2“ verschoben.
- `/zeitschriften/<slug>/<hefttitel-slug>/` wird nur bei ausreichend eindeutigen
  Heftdaten erzeugt. Die Seite enthält Heftangaben, Archivlinks, einen gemeinsamen
  Player und alle Videobeschreibungen. Die Auswahl erfolgt per
  `#video-<youtube-id>` auf derselben Seite. Weder Zeitschriftenseiten noch
  einzelne Ausgaben werden paginiert; nur der Zeitschriftenindex und
  Gästeseiten teilen sich ab 60 Einträgen auf.
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
  `/zeitschriften/amiga-joker/amiga-joker-1-1990/`. Der Slug beginnt immer mit
  dem Zeitschriftennamen und kollidiert so nicht mit `seite/`.
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
  Links neben dem Markennamen steht auf jeder Seite das lokal gespeicherte
  Kanal-Logo (zugleich Favicon). Eine weiße Fläche mit grauem Rahmen grenzt
  es auch im Dark Mode ab; reservierte Bildmaße verhindern Layoutsprünge.
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
  Das CSS-Raster zeigt bereits auf kleinen Mobilgeräten zwei Spalten,
  ab 768px drei, ab 1024px vier und ab 1280px höchstens
  fünf Spalten. Alphabetische Reihenfolge, Links und Paginierung mit
  höchstens 60 Einträgen funktionieren unverändert ohne JavaScript.
  Unter 480px sind Kachelabstände, Innenabstände und Schriftgrößen kompakter;
  lange Titel und Metadaten umbrechen ohne horizontalen Überlauf.
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
- Pico CSS **2.1.1** liegt einschließlich MIT-Lizenz unter `src/site-generation/vendor/`.
  Die unveränderte Originaldatei `pico-2.1.1.min.css` bleibt als Quelle erhalten.
  `npm run dev:generate:css` erzeugt mit PurgeCSS aus den Generator-/Widget-
  Templates und Browser-Skripten die eingecheckte Fassung
  `pico-2.1.1.site.min.css`. Nicht benötigte Framework-Komponenten und
  ungenutzte Variablen werden entfernt. Dynamische Hell-/Dunkel-Selektoren,
  Überschriftenregeln und die in `site.css` verwendeten Variablen bleiben erhalten.
  Der Build bündelt nur die reduzierte Fassung mit `src/site-generation/site.css`
  zu einer lokalen Datei mit Inhalts-Hash. Es werden keine Fonts, CDNs oder
  anderen externen Assets geladen. Das Stylesheet bleibt synchron eingebunden,
  damit Layout, Darstellung und Bedienbarkeit auch ohne JavaScript erhalten bleiben.
  Nach Template- oder Browserzustandsänderungen `dev:generate:css` und `dev:test`
  ausführen; der Reproduzierbarkeitstest erkennt eine veraltete CSS-Fassung.
  Die Produktionstests begrenzen das aktuelle Bundle auf weniger als 10 KiB gzip
  und verlangen mindestens 30 Prozent weniger gzip-Bytes als mit dem vollständigen
  Framework. Das allgemeine harte Build-Budget bleibt bei 20 KiB.
  PurgeCSS ist ausschließlich eine lokale Entwicklungsabhängigkeit; der
  Seitenbuild führt es nicht aus. Der Parser-Override in `package.json` verwendet
  die korrigierte `postcss-selector-parser`-Version ab 7.1.6 statt der
  verwundbaren, transitiv angeforderten 6.x-Fassung.
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
  Videodetailseiten nutzen die volle Fensterbreite mit seitlichen Abständen.
  Ab 768 Pixeln füllt der Player im 16:9-Format den gesamten Platz neben der
  Folgenliste, ohne maximale Inhaltsbreite oder Höhenbegrenzung.
  Mobil bleibt die Playerhöhe auf höchstens 60 Prozent der Viewporthöhe begrenzt.
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
  Lokale Builds entfernen dabei auch ältere Hash-Versionen von CSS und
  JavaScript; nur die aktuell verwendeten Versionen bleiben erhalten.
  Das Aufräumen erfolgt erst mit dem erfolgreichen Austausch der Ausgabe,
  nicht durch vorzeitiges Löschen des letzten funktionierenden Builds.
  Nur in GitHub Actions (`GITHUB_ACTIONS=true`) werden historische Assets
  für noch im Browser gecachte HTML-Seiten weiter aufbewahrt.
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
führte zum Zeitpunkt der Meldung kein eigenes JavaScript aus und griff nicht
auf Local Storage zu. Inzwischen lädt sie das lokale Skript für den
Hell-/Dunkel-Schalter und dessen Einstellung.
Die Ursache der Microsoft-Einstufung ist damit nicht geklärt und die Warnung
nicht aufgehoben. Für eine Neubewertung dient „Report that this site does not
contain threats“ in der Warnungsseite; Schutzfunktionen nicht pauschal abschalten.

Vor einer öffentlichen Freigabe müssen die tatsächliche Medien-Einbindung und
die Datenschutz-/Informationspflichten rechtlich geprüft werden. Die vorhandene
Datenschutzseite beschreibt die Umsetzung als privates, nicht kommerzielles
Projekt ohne Anschrift, behauptet aber keine pauschale gesetzliche Ausnahme.

## Tests

Alle Testdateien liegen in `tests/` (`*.test.mjs`). Die Actions-taugliche
Auswahl umfasst YouTube-Abrufe, Seitenbuild, Darstellung und Browser-Skripte:

```sh
npm test
```

Die vollständige Suite einschließlich lokaler Archiv-, Logo-, Spielzuordnungs-
und Transkriptaufgaben läuft ausschließlich lokal mit Entwicklungsabhängigkeiten:

```sh
npm ci
npm run dev:test
```

`sharp` ist eine Entwicklungsabhängigkeit und wird nur zur lokalen
Bildkonvertierung geladen. Die Pages-Jobs installieren vor Tests und Build
nur die regulären Abhängigkeiten mit `npm ci --ignore-scripts --omit=dev`.
Terser ist eine reguläre Abhängigkeit, da `generate:site` es benötigt;
Sharp und PurgeCSS bleiben Entwicklungsabhängigkeiten für lokale Aufbereitungsaufgaben.
Vorhandene Logo-Varianten werden weiterhin ohne Laden der Bildbibliothek veröffentlicht.
Lokale Datenpflegebefehle tragen durchgehend das Präfix `dev:`.

## YouTube-Videos cachen

Das Script liest alle öffentlichen Videos eines YouTube-Kanals und speichert
Video-ID, Titel, Beschreibung, Länge und Veröffentlichungsdatum in
`cache/youtube-videos.json`.

### Abrufweg: YouTube Data API v3 oder anonym

Ist `GOOGLE_YT_DATA_API_KEY` als Umgebungsvariable gesetzt oder ersatzweise in
der lokalen `.env` eingetragen, nutzen `fetch:videos`, `fetch:playlists` und
`fetch:all` die offizielle
[YouTube Data API v3](https://developers.google.com/youtube/v3). Ein leerer
Wert gilt als nicht gesetzt; die Umgebungsvariable hat Vorrang vor `.env`.
Ohne Schlüssel lesen die Scripts wie bisher anonym die öffentlichen
YouTube-Webseiten. Die Zugriffe auf die API liegen in
`src/fetch-channel/youtube-data-api.mjs`; der Schlüssel wird nur im Header
`x-goog-api-key` gesendet und erscheint nicht in URLs, Logs oder Fehlermeldungen.
Beim Start nennt jedes Script den Abrufweg und die Herkunft des Schlüssels,
z. B. `YouTube-Abruf: offizielle YouTube Data API v3 (GOOGLE_YT_DATA_API_KEY aus .env).`
oder `YouTube-Abruf: anonyme Fetch-Skripte über öffentliche YouTube-Seiten (GOOGLE_YT_DATA_API_KEY nicht gesetzt).`
Der Schlüssel selbst wird nie ausgegeben.

Beide Wege schreiben dasselbe Cacheformat. Unterschiede der API:

- Laufzeiten sind dort aufgerundet und deshalb oft eine Sekunde länger als
  beim anonymen Abruf. Bereits gecachte Videos werden nicht neu geladen.
- `publishedAt` steht in UTC (`…Z`) statt mit der Pacific-Zeitzone der
  Webseite; Sortierung und inkrementeller Abgleich vergleichen Zeitpunkte.
- `playlists.list` liefert alle öffentlichen Playlists des Kanals, auch solche,
  die nicht auf dessen Playlist-Seite erscheinen. Gelöschte und private
  Playlist-Einträge werden wie auf der Webseite ausgelassen.
- Ein Lauf kostet etwa eine Kontingenteinheit je 50 Videos bzw. je
  Playlist-Seite (Standardkontingent 10.000 Einheiten pro Tag). Bei
  `quotaExceeded` bricht der Lauf mit einem Hinweis ab; Rate-Limits und
  Serverfehler werden wie beim anonymen Abruf wiederholt.

Für den Kanal https://www.youtube.com/@PrettyOldPixel:

```sh
npm run fetch:videos
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
# Videos und danach – nur bei neuen Videos – Playlists aktualisieren:
npm run fetch:all

# Nur Playlists aktualisieren:
npm run fetch:playlists

# Optional einen anderen Kanal angeben (gilt für beide neuen Tasks):
npm run fetch:playlists -- https://www.youtube.com/@PrettyOldPixel
```

`src/fetch-channel/fetch-youtube-playlists.mjs` liest (mit oder ohne API-Key, siehe
[Abrufweg](#abrufweg-youtube-data-api-v3-oder-anonym)) die öffentlichen Playlists
des Kanals und alle Seiten ihrer Mitgliederlisten. Bis zu drei Playlists werden
parallel geladen; innerhalb einer Playlist werden Fortsetzungen nacheinander
abgefragt. Der gemeinsame Task `fetch:all` lädt zuerst die Videos und danach
die Playlists. Findet er keine neuen Videos und ist der Playlist-Cache
vollständig, überspringt er den Playlist-Abruf. Bei einem Fehler endet er mit
einem Fehlerstatus; schlägt der Videoabruf fehl, werden keine Playlists geladen.
`npm run fetch:playlists` lädt die Playlists immer. Die Scripts schreiben
getrennte Cache-Dateien.

In GitHub Actions schreibt `fetch:videos` die Zahl neuer Videos als
Step-Output `new-videos`; der Playlist-Schritt läuft nur bei einem Wert
ungleich `0` oder bei manuellem Start mit `force_playlists`. Playlist-Änderungen
ohne neues Video (z. B. Umsortierungen) werden dadurch erst mit dem nächsten
neuen Video oder einem erzwungenen Lauf übernommen.

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
npm run dev:fetch:archives
npm run dev:generate:blaetterabend
```

`src/fetch-magazine/fetch-archives.mjs` aktualisiert ausschließlich die Archive-Caches für
die im Video-Cache erkannten Zeitschriften. GameStar erhält zusätzlich
Heftlinks von PC Games Database, Amiga Action von AMR einschließlich Logo. Kultmags wird für die übrige Archivsuche
zuerst geprüft; reetroz bleibt der Fallback für dort fehlende Zeitschriften. Mit
`npm run dev:fetch:archives:refresh` werden die Quellen unabhängig vom Cache-Alter
neu abgefragt. Das erzeugt noch keine neue Blätterabend-Datei.

`src/extra-data/generate-blaetterabend.mjs` liest anschließend ausschließlich lokale
JSON-Dateien und lädt auch bei veralteten Caches nichts aus dem Internet.
Fehlende benötigte Cache-Dateien führen zu einem Fehler mit Hinweis auf
`dev:fetch:archives`, nicht zu einem automatischen Abruf. Zum bisherigen kombinierten
Refresh-Aufruf gehören jetzt zwei Schritte:

```sh
npm run dev:fetch:archives:refresh
npm run dev:generate:blaetterabend
```

Danach erzeugt `npm run generate:site` die Website aus den aktuellen JSON-Daten.

Titel ohne erkannte Zeitschrift oder Ausgabe werden beim Lauf aufgelistet.
Numerische Doppelausgaben wie `4-5/1988`, `4+5/1988` und `4/5 1988`
werden als ein Heft mit beiden Monaten erkannt und mit dem Archiv abgeglichen.
Neue Zeitschriften oder Schreibweisen werden in der Liste `MAGAZINES` in
`src/extra-data/generate-blaetterabend.mjs` ergänzt.
Die bestätigte Titelbezeichnung „Computer Gaming World – 15th Anniversary“
wird als Ausgabe #148 (11/1996) erkannt; auf dem
[Cover](https://assets.reetroz.com/covers/cgw-148.jpg) sind beide Angaben zu sehen.
Fehlt eine eindeutige Ausgabenangabe, bleibt die Ausgabe unbekannt. Eine
bekannte Heftnummer allein (etwa ACE Nr. 49) genügt bei fehlendem Heftdatum
für eine eigene Detailseite. Übersichtstitel, Videotitel und Thumbnail
verlinken dann intern auf diese Seite, auch ohne Archivlink. Das Jahr bleibt
unbekannt; es wird kein Jahrgang und kein Erscheinungsdatum erfunden.
Solche nummerierten Ausgaben werden ohne eindeutigen gemeinsamen Archivtreffer
nicht mit datierten Ausgaben zusammengelegt.

Bei unbekannter Ausgabe weist die Logmeldung gegebenenfalls auf die
verlinkte Archiv-Übersichtsseite hin.
Explizit bestätigte Heftzuordnungen stehen nach Video-ID in
`CONFIRMED_MAGAZINE_TITLES`: `6R6Go1LhCMI` („Nach Zuschauerabstimmung“)
ist vom Nutzer als Power Play 10/1990 bestätigt. Für
`wcxhTV2oA5U` („PC Gamer 5/94 … Stream II“) ist ausschließlich PC Gamer UK
5/1994 bestätigt. Der Originaltitel bleibt unverändert; die Zuordnung gilt
nicht für andere gleichlautende Titel.

### Links auf kultmags.com

Auf Heft-Detailseiten stehen die Archivlinks direkt unter dem Player
als dritte Metadatenspalte nach Zeitschrift und Ausgabe.
Erscheinungsjahr, Heftnummer und Monate bleiben für Zuordnung und
Jahrgangsnavigation intern erhalten, werden hier aber nicht als
zusätzliche Metadatenspalten angezeigt. Die Symbole behalten
ihre zugänglichen Beschriftungen und werden hier zusätzlich durch sichtbare
Texte für Archivordner, Lesen und Download ergänzt. Eine separate
Archivlinks-Sektion entfällt; Übersichtslisten bleiben bei kompakten Symbolen.

Jede erkannte Zeitschrift bekommt ein Feld `kultmags` mit einem Link in das
Archiv von [kultmags.com](https://www.kultmags.com/mags.php)
(`src/fetch-magazine/fetch-kultmags.mjs`):

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
`npm run dev:fetch:archives:refresh` werden sie neu geladen (zusammen mit
dem reetroz-Cache). Ein vollständiger Abruf braucht etwa 140 Seitenaufrufe, mit
200 ms Pause zwischen den Aufrufen.

### Zeitschriftenlogos von Kultmags

`npm run dev:fetch:archives` liest auf der jeweiligen Magazinübersicht das
`img` innerhalb von `.archive-title-image`. Relative Bildadressen werden
gegen `https://www.kultmags.com/` aufgelöst. Nur PNG, JPEG, GIF und WebP
vom HTTPS-Host `www.kultmags.com` werden übernommen, ohne Weiterleitungen
und mit maximal 2 MiB pro Bild. Die Bildsignatur wird geprüft.

Beim Abruf erzeugt `sharp` zusätzlich verlustfreies WebP und GIF, ohne
Größenänderung und unter Erhalt vorhandener Animationen.
Das Magazin-JSON erhält `logo: { url, file, variants: [{ file, sha256 }] }`, bei fehlendem Titelbild
`logo: null`. Die Bilddateien liegen in `cache/kultmags/logos/` mit
dem SHA-256-Inhaltsnamen des Originals als gemeinsamem Basisnamen:
Original, GIF und WebP unterscheiden sich ausschließlich in der Dateiendung.
Die Varianten haben zur Inhaltsprüfung einen separaten SHA-256-Wert im JSON.
Ist das Original bereits GIF oder WebP, wird dieselbe Datei wiederverwendet.
Bei älteren, noch frischen Archiv-Caches wird nur
die Magazinübersicht für das Logo nachgeladen; die vorhandenen
Ausgabenlisten und ihr ursprüngliches Abrufdatum bleiben erhalten.
Weitere Läufe verwenden den Cache; ein Archiv-Refresh prüft auch Logos neu.
Bestehende frische Logo-Caches ohne Varianten oder mit alten Variantennamen werden lokal nachkonvertiert,
ohne die Bilddatei oder Heftlisten erneut abzurufen.
Nach einem erfolgreichen Online-Abruflauf entfernt das Script nicht mehr
referenzierte Bilddateien aus dem Logo-Verzeichnis. Dabei werden die Referenzen
aller gespeicherten Magazin-JSONs geprüft, nicht nur der aktuell angefragten.
Offline-Builds verändern den Cache nicht.

`npm run generate:site` übernimmt diese Dateien rein offline nach
`docs/assets/magazine-logos/`. Die jeweilige Zeitschriftenseite zeigt
das Logo responsiv unter der Überschrift, mit Alternativtext und
nach tatsächlicher Dateigröße sortierten `picture`-Quellen: Der Browser
lädt die kleinste von ihm unterstützte Datei (einschließlich Original).
Für Browser ohne `picture` dient die kleinste Nicht-WebP-Datei als Fallback.
Das Logo erhält einen
Quellenlink zur Magazinübersicht auf Kultmags. Ausgabenseiten
bleiben unverändert. Ohne Logo wird kein leerer Bildbereich ausgegeben.
Beim Seitenaufruf wird kein Bild vom Archivserver nachgeladen.
Vorhandene, beschädigte oder fehlende referenzierte Bilddateien werden
als Buildfehler gemeldet. Der Logo-Cache ist wie der übrige Archivcache
nicht Git-ignoriert und muss für einen GitHub-Pages-Build mit bereitstehen.

### GameStar bei PC Games Database

```sh
npm run dev:fetch:gamestar
npm run dev:fetch:gamestar -- --refresh
npm run generate:site
```

`src/fetch-magazine/fetch-pcgamesdatabase.mjs` lädt ausschließlich die öffentliche
[GameStar-Archivübersicht](https://www.pcgamesdatabase.de/gamestar.php).
Sie enthält bereits die direkten Heftlinks; einzelne Heftseiten werden
nicht zusätzlich abgerufen. Nur tatsächliche Links auf
`gamestar.php?mag=gamestar&vol=MM/YYYY` desselben Hosts werden übernommen.
Unverlinkte Datumsangaben und doppelte Verweise werden nicht als neue
Ausgaben gespeichert. Ein nicht mehr erkennbares Seitenformat führt
zu einem Fehler, ohne einen vorhandenen Cache zu überschreiben.

Der Cache verwendet das Kultmags-Magazinformat:
`cache/pcgamesdatabase/index.json` und
`cache/pcgamesdatabase/magazines/gamestar.json` mit `name`, `url`,
`fetchedAt`, `sections` und `issues`. Ausgaben enthalten Jahr,
Monat in `numbers`, Titel und `pageUrl`; `readerUrl`, `downloadUrl` und
`coverUrl` bleiben mangels belegter Ziele `null`. Standardmäßig gilt
eine Cache-Laufzeit von 365 Tagen. `--refresh` erzwingt einen Neuabruf.
Zusätzlich lädt der Fetcher das fest konfigurierte
[GameStar-Logo](https://www.pcgamesdatabase.de/images/gamestar.jpg)
in `cache/pcgamesdatabase/logos/`. Frische ältere Caches werden nur um
das Logo ergänzt, ohne die Heftübersicht neu abzurufen. Die Zeitschriftenseite
zeigt das Bild als lokales Asset mit „Logoquelle: PC Games Database“.
Format, Größe und Inhalt werden wie bei den übrigen Magazinlogos geprüft.
Auch `dev:fetch:archives` berücksichtigt diese Quelle, wenn GameStar im
Video-Cache vorkommt.

Die lokale Blätterabend-Generierung ergänzt bei vorhandenem Cache das
Feld `pcgamesdatabase` im gleichen Linkformat wie `kultmags`.
Nur Jahr und genau ein bekannter Monat erlauben einen Hefttreffer;
Sonderhefte, unklare Datumsangaben oder fehlende Ausgaben führen zur
Archivübersicht. Heftnummern werden nicht mit Kalendermonaten verwechselt.
Die Quelle ergänzt vorhandene Kultmags-/reetroz-Verweise, statt sie zu ersetzen.

Der Website-Build liest diesen Cache zusätzlich direkt ein: Nach
`dev:fetch:gamestar` ist deshalb keine erneute Blätterabend-Generierung nötig.
Die Links erscheinen in Zeitschriften-/Jahrgangslisten und in der dritten
Metadatenspalte auf Heftseiten als „PC Games Database: Ausgabe“.
Der Build bleibt offline und verwendet auch veraltete Daten unverändert.
Ohne diesen optionalen Cache bleiben bestehende Archivlinks erhalten;
ein beschädigter vorhandener Cache wird als Fehler gemeldet.
Der neue Cache ist für den GitHub-Pages-Build ebenfalls mit bereitzustellen.

### Amiga Action bei Amiga Magazine Rack (AMR)

```sh
npm run dev:fetch:amiga-action
npm run dev:fetch:amiga-action -- --refresh
npm run generate:site
```

`src/fetch-magazine/fetch-amr.mjs` liest ausschließlich die
[Amiga-Action-Übersicht](https://amr.abime.net/issues_1) sowie das
[Magazinlogo](https://amr.abime.net/logos/amiga_action_logos.png).
Heftseiten werden nicht einzeln abgerufen. Die Jahrgangstabelle gibt
Jahr und Monat durch die Spalten Jan bis Dec vor, der Linktext nennt
die fortlaufende Heftnummer. Die zusätzliche Xmas-Spalte bleibt als
Sonderausgabe ohne erfundenen Kalendermonat gespeichert.

Der Cache liegt in `cache/amr/index.json` und
`cache/amr/magazines/amiga-action.json` im Kultmags-Magazinformat.
Ausgaben enthalten zusätzlich `issueNumber`. `pageUrl` verweist auf
die belegte `https://amr.abime.net/issue_<id>`-Heftseite; Reader- und
Downloadlinks werden nicht erfunden und bleiben `null`.
Der Cache gilt 365 Tage, `--refresh` erzwingt einen neuen Abruf.
Auch `dev:fetch:archives` berücksichtigt AMR bei Amiga-Action-Videos.

Heftnummern oder Jahr und Monat dürfen einen eindeutigen Treffer ergeben.
Widersprüchliche Nummern-/Datumsangaben führen nur zur Übersicht,
genau wie fehlende Angaben oder mehrdeutige Treffer.
Die Blätterabend-Datei erhält bei vorhandenem AMR-Cache ein zusätzliches
Feld `amr`, vorhandene Archivverweise bleiben erhalten.
Der Site-Build liest den optionalen AMR-Cache direkt und vollständig offline,
ohne eine erneute Blätterabend-Generierung zu verlangen.
Archivlinks erscheinen in den Listen und Heft-Metadaten als „AMR: Ausgabe“.

Das Logo wird unter `cache/amr/logos/` gespeichert, mit derselben
Größen-, Format- und Inhaltsprüfung wie Kultmags-Logos.
Beim Build wird es als lokales Asset übernommen und auf der
Amiga-Action-Zeitschriftenseite mit „Logoquelle: AMR“ angezeigt.
Es wird nicht beim Seitenaufruf von AMR geladen.
Fehlende referenzierte oder beschädigte Bilder führen zu einem Buildfehler.
Der AMR-Cache ist nicht Git-ignoriert und muss für GitHub Pages mit bereitstehen.

### Links auf reetroz.com (internationale Zeitschriften)

Die Projektbezeichnung `PC Gamer` wird ausdrücklich dem Archiveintrag
`PC Gamer (US)` zugeordnet, auch bei bereits vorhandenen Index-Caches.
`PC Gamer US` bleibt ebenfalls gültig. `PC Gamer UK` ist eine getrennte
Ausgabe und wird nicht auf das US-Archiv umgeleitet.

kultmags.com enthält nur deutsche Zeitschriften. Für Zeitschriften, die dort
fehlen (`kultmags: null`), wird im Archiv von
[reetroz.com](https://reetroz.com/catalog) gesucht (`src/fetch-magazine/fetch-reetroz.mjs`), z. B.
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

## YouTube-Transkripte einmalig cachen

```sh
yt-dlp --version
npm run dev:fetch:transcripts
```

Das separate Script `src/extra-data/fetch-youtube-transcripts.mjs` benötigt zusätzlich
ein aktuelles [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) im `PATH`.
Es ist kein npm-Paket und wird nicht automatisch installiert.
Es verwendet die bereits vorhandenen drei Quellcaches und dieselben
Zuordnungen wie die Website. Nur öffentliche, nicht zukünftige Videos mit
Blätterabend- oder Zeitschriftenzuordnung werden ausgewählt, auch wenn die
genaue Heftausgabe unbekannt ist. Mehrfachzuordnungen erzeugen keinen
doppelten Abruf.

### Methode und Grenzen

Die offizielle [YouTube Captions API](https://developers.google.com/youtube/v3/docs/captions/download)
benötigt OAuth und Bearbeitungsrechte am Video; ein öffentlicher Videolink
allein genügt nicht. Für dieses Projekt ist ausdrücklich der öffentliche
Abruf ohne Anmeldung gewählt:

1. yt-dlp ermittelt ausschließlich Videometadaten und verfügbare
   Untertitelspuren (`--skip-download --dump-single-json`).
2. Bevorzugt werden manuelle deutsche, automatische deutsche, manuelle
   englische und automatische englische Untertitel, danach andere Sprachen.
   Unter gleichrangigen Sprachen wird eine als `-orig` markierte Spur bevorzugt.
   Automatische Spuren können von YouTube übersetzt sein; Sprache und
   Kennzeichnung als automatische Untertitel werden gespeichert.
3. Genau eine Spur wird im JSON3-Format direkt vom HTTPS-Endpunkt
   `youtube.com/api/timedtext` geladen und in zeitmarkierte Textsegmente
   umgewandelt. Andere Hosts, Pfade und Weiterleitungen werden abgelehnt.

Es gibt keinen Audio-/Videodownload, keine eigene Spracherkennung,
keine Cookies oder Anmeldung und keinen Drittanbieter-Transkriptdienst.
Lokale yt-dlp-Konfigurationen werden ignoriert, der yt-dlp-Dateicache
ist deaktiviert. Zwischen aufeinanderfolgenden neuen Videoabrufen liegen
15 Sekunden Pause; zwischen Metadatenabruf und Untertitelanfrage zusätzlich
drei Sekunden. Cachetreffer benötigen keine Pause.
Untertitel können fehlen; YouTube kann öffentliche Abrufe auch blockieren
oder begrenzen. Das Script umgeht keine Zugangssperren. HTTP-Fehler,
Bot-Abfragen, Extraktorfehler und ungültige oder leere Antworten sind
technische Fehler, nicht der Nachweis fehlender Untertitel.

### Dauerhafter Cache

Pro Video entsteht `cache/youtube-transcripts/<video-id>.json`:

Die Ausgabe nennt zunächst die Videoanzahl und das Cacheverzeichnis.
Jedes Video wird mit `[Position/Gesamt · Prozent]`, ID und Titel angezeigt.
Für neue Abrufe folgt die YouTube-Adresse; Ergebnisse enthalten Sprache,
manuelle/automatische Untertitel und Segmentanzahl. Übersprungene
Cacheeinträge erzeugen keine Einzelmeldung. Die Abschlussübersicht
zählt neue Transkripte, fehlende Untertitel, Cachetreffer und Fehler.
Die Prozentanzeige beschreibt die Position im Durchlauf, nicht den
Downloadfortschritt eines einzelnen Videos.

```json
{
  "status": "available",
  "language": "de",
  "automatic": true,
  "segments": [
    { "startMs": 1250, "durationMs": 3000, "text": "Beispieltext" }
  ],
  "version": 1,
  "videoId": "a0000000000",
  "checkedAt": "2026-10-17T19:00:00.000Z",
  "source": "youtube-public-captions"
}
```

Zeitmarken und Dauern sind Millisekunden ab Videobeginn. Fehlt eine Dauer
in der Quelle, bleibt `durationMs` ausdrücklich `null`. Textteile eines
JSON3-Ereignisses werden zusammengefügt; überlappende bzw. rollierende
Untertitel bleiben als Quellsegmente erhalten und werden nicht spekulativ
dedupliziert. Originale JSON3-Antworten und kurzlebige signierte Abruf-URLs
werden nicht im Cache gespeichert.

Sind keine öffentlichen Untertitel vorhanden, wird stattdessen
`status: "unavailable"` mit `reason: "no-public-captions"` gespeichert.
**Beide Zustände gelten dauerhaft:** Es gibt kein Ablaufdatum, keine
Last-Modified-Abfrage und keinen Refresh-Schalter. Weitere Läufe lesen
für diese IDs nur den lokalen Cache und stellen keine yt-dlp- oder
Untertitelanfrage. Auch später bei YouTube ergänzte Untertitel werden
deshalb nicht nachgeladen.

Technische Fehler werden pro Video sichtbar protokolliert, erzeugen keinen
Erfolgseintrag und führen nach dem Durchlauf zu einem Fehler-Exitcode.
Vorübergehende HTTP-Serverfehler (500, 502, 503, 504) beim Untertitelabruf
werden höchstens zweimal nach fünf bzw. zehn Sekunden wiederholt.
Andere Fehler werden nicht automatisch wiederholt.

**Bei HTTP 429 („Too Many Requests“) stoppt der gesamte Lauf sofort**
mit Fehler-Exitcode, auch wenn yt-dlp das Rate-Limit meldet. Es gibt weder
einen Retry noch einen Abruf des nächsten Videos; Sperrdateien werden
normal aufgeräumt. Die Zwischenbilanz heißt dann „Abgebrochen“.
Ein vorhandener `Retry-After`-Header wird ausgegeben: vor einem manuellen
Neustart mindestens diese Wartezeit beachten. Ohne solche Angabe lässt
sich keine zuverlässige Sperrdauer nennen; nicht sofort wieder starten.
429 bezeichnet eine Anfragedrosselung, beweist aber weder eine dauerhafte
Sperre noch, dass alle Videos gleichermaßen betroffen sind. Größere
Abstände reduzieren die Anfragerate, garantieren aber keine Freigabe.
Bereits gespeicherte Ergebnisse bleiben unverändert und werden beim
späteren Neustart ohne Netzwerkanfrage übersprungen.

Fehlgeschlagene und noch nicht bearbeitete Videos können beim nächsten
Lauf erneut versucht werden.
Ein beschädigter vorhandener Cache wird gemeldet, nicht durch einen
erneuten Abruf ersetzt. Dateien werden atomar geschrieben; eine exklusive
`<video-id>.lock`-Datei verhindert gleichzeitige Abrufe derselben ID.
Nach einem Prozessabbruch kann eine Sperre liegen bleiben: erst prüfen,
dass kein Abruf mehr läuft, dann diese konkrete Sperrdatei manuell entfernen.

Der Befehl ist absichtlich weder Teil von `fetch:all` noch der
Seitengenerierung oder GitHub-Pages-Pipeline. Die fertigen Transkriptdateien
werden in Git versioniert, aber nicht als Website-Inhalt veröffentlicht.
Sperr- und temporäre Schreibdateien bleiben Git-ignoriert.

## Spielebesprechungen aus Transkripten

```sh
npm run dev:generate:games-from-transcript -- _PHiFsxtF0k
```

`src/extra-data/generate-games-from-transcript.mjs` analysiert bewusst jeweils ein
bereits lokal gespeichertes Transkript. Es benötigt Node.js 22, eine lokale
`.env` und einen laufenden OpenAI-kompatiblen Modellserver, aktuell Ollama
mit `qwen3:14b`. Es lädt `.env` selbst; bereits gesetzte Prozessvariablen
haben Vorrang. Ohne verfügbare Untertitel oder bei ungültiger Konfiguration
bricht es ausdrücklich ab.

### Verarbeitung und Modellaufgabe

- Stabile Segment-IDs entsprechen den nullbasierten Positionen im
  Originaltranskript. Texte werden nur bezüglich Leerraum normalisiert.
  Wiederholungen werden nicht pauschal entfernt, damit keine tatsächliche
  Gesprächswiederholung verloren geht.
- Kernfenster umfassen höchstens drei Minuten bzw. ein begrenztes
  Textbudget. Bis zu 30 Sekunden Nachbarkontext pro Seite helfen bei
  Übergängen. Jedes Originalsegment liegt in genau einem Kernfenster.
  Kerngrenzen sind keine Gesprächsgrenzen: Beide Modellaufrufe sollen
  Einführungen und Abschlüsse im gesamten gelieferten Kontext suchen.
  Fortsetzungsflags beziehen sich auf die äußeren Textfenstergrenzen,
  nicht auf den Kern. Die Fensteraufteilung bleibt für vorhandene
  Zwischenstände unverändert.
- Das Modell erkennt Hauptbesprechungen, Einführungen und Themenwechsel
  im Kontext des chronologischen Zeitschriftenlesens. Vergleiche,
  Quizantworten, Werbung und Rückblicke auf eigene Aufnahmen sollen keine
  Spielebesprechung erzeugen.
- Ein zweiter Modellaufruf prüft vorhandene Vorschläge unabhängig auf
  `review`, `quiz`, `personal-update`, `comparison` oder `uncertain`.
  Nur als `review` eingestufte Vorschläge werden übernommen. Für diese
  muss die Prüfung vollständige, gegebenenfalls korrigierte Abschnitte
  liefern: Titel, Anfang, Ende, Namensbeleg und Fortsetzungsflags.
  Vermischte Vorschläge dürfen in mehrere Besprechungen aufgeteilt werden;
  jeder Teil muss den ursprünglichen Vorschlag und den Kernbereich berühren.
  Alle korrigierten Abschnitte werden erneut auf gültige Segmentverweise
  und gegenseitige Überschneidungen geprüft.
  Ein Fenster ohne Vorschläge benötigt diesen zweiten Aufruf nicht.
- Der Namensbeleg muss das Hauptspiel tatsächlich nennen, gegebenenfalls
  als eindeutig zuordenbare ASR-Variante. Ein bloßes „Ja“ oder ein Satz
  ohne Spielnamen reicht nicht. Eindeutige Transkriptfehler dürfen mit
  stützendem Kontext normalisiert werden (etwa Wing Commander II).
  Eine verspätete Antwort auf eine frühere Frage darf nicht das danach
  besprochene Spiel umbenennen (Jurassic World Evolution / Trespasser).
  Rückkehr zu einem früheren Spiel wird als eigener Abschnitt behandelt
  (Tiny Little Slug / Syndicate). Lange persönliche Aufnahmeberichte
  bleiben unabhängig von ihrer Dauer ausgeschlossen.
  Sprechernamen, Anreden und Chatbegrüßungen (etwa Selma) sind keine
  Spieltitel. Plattform-/Versionsangaben wie „Schneider CPC Version“
  dürfen den Spieltitel nicht ersetzen. Der tatsächliche Titel muss im
  gelieferten Kontext belegbar sein; andernfalls entfällt der Treffer.
  Auch bei bekanntem Spiel bleiben Rückblicke auf eigene Videos und
  Abstimmungen über die nächste Portierungsfolge ausgeschlossen.
- Das Modell liefert Segmentverweise statt frei geschätzter Zeiten.
  Erkennung und Kontextprüfung ignorieren schnelle Folgen von Spielnamen,
  Ranglisten, Zuschauerabstimmungen und Auszählungen, auch mit kurzen
  Kommentaren zu einzelnen Titeln. Die Gesamtlänge einer solchen Liste
  zählt nicht als Besprechung eines Hauptspiels.
  Vorschläge müssen mindestens 30 Sekunden zusammenhängend dasselbe
  Hauptspiel behandeln. Diese Mindestdauer wird zusätzlich nach dem
  Zusammenführen fensterübergreifender Abschnitte anhand der Quellzeiten
  erzwungen (30 Sekunden eingeschlossen). Kürzere Fensterteilstücke dürfen
  nur bei erkennbarer Fortsetzung erhalten bleiben. Fehlende Segmentdauer
  wird nicht erfunden; ein offenes Ende hebt die Mindestdauer nicht auf.
  Vorhandene Fenster bleiben zur Wiederaufnahme unverändert und werden nicht
  erneut klassifiziert; der 30-Sekunden-Filter gilt auch für deren Vorschläge
  beim neuen Zusammenführen. Bereits fertige Gesamtanalysen bleiben geschützt.
  Die Reihenfolge der Abschnitte in einer Antwort ist beliebig; sie werden
  nach Segment-ID sortiert. Liegt das Belegsegment direkt vor bzw. hinter
  dem genannten Abschnitt, wird der Abschnitt um dieses Segment erweitert
  und das im Log vermerkt; weiter entfernte Belege bleiben ein Fehler. Liegt ein Erkennungsvorschlag vollständig in
  einem anderen (etwa ein kurz erwähntes Spiel mitten in einer Besprechung),
  wird er als Nebentreffer verworfen und im Log genannt. Bei teilweiser
  Überschneidung endet der frühere Abschnitt vor dem Beginn des späteren
  (`endReason: "next-game"`), sofern seine Belegstelle erhalten bleibt;
  die Kontextprüfung kann die Grenze danach korrigieren. Sonst bleibt die
  Überschneidung ein Fehler, und die Rückmeldung nennt beide Abschnitte.
  Die Kontextprüfung erhält die Vorschläge als `proposals` mit
  ausdrücklichem `candidateIndex`; fehlende Entscheidungen werden mit Index
  zurückgemeldet.
  Ungültige JSON-Ausgaben, unbekannte IDs, überlappende Abschnitte innerhalb
  eines Fensters und abgeschnittene Antworten werden höchstens dreimal
  angefragt, mit fünf bzw. zehn Sekunden Pause. Das Modell erhält bei
  ungültigen Antworten den konkreten Validierungsfehler und muss die
  Antwort vollständig neu erzeugen. Es gibt keine stillen Ersatzwerte
  und keine scheinbar erfolgreich leere Analyse nach einem Fehler.
  Erkennung und Kontextprüfung besitzen jeweils dieses Versuchslimit.
  Beide Prompts erklären dieselben Endregeln ausdrücklich:
  `endReason: "window-end"` erfordert `continuesAfter: true`.
  Abgelehnte Vorschläge liefern keine Besprechungsabschnitte. Bei weiteren
  Versuchen bleiben alle bisherigen Validierungsfehler dieser Phase im
  Feedback, damit wechselnde Schemafehler gemeinsam korrigiert werden.
  Jeder fehlgeschlagene Versuch, auch der letzte, protokolliert Phase,
  Versuch, Eingabezeichen, Ausgabelimit, gegebenenfalls Kontextlimit,
  Endgrund und vom Server gelieferte Eingabe-/Ausgabetokenzahlen.
  Fehlende Serverstatistiken stehen als `null` im Log. Verworfene
  Modelltexte werden JSON-escaped bis höchstens 6000 Zeichen ausgegeben,
  längere Antworten ausdrücklich als gekürzt markiert. Diese lokalen
  Konsolenlogs können Transkriptausschnitte enthalten; Zugangsdaten und
  Request-Header werden nicht ausgegeben.
  Dasselbe gilt für Zeitüberschreitungen, Verbindungsfehler und HTTP
  408/429/500/502/503/504 des lokalen Modellservers. Andere HTTP-Fehler
  (etwa falsche Konfiguration oder fehlendes Modell) brechen sofort ab.
  Bei `finish_reason: length` wird stattdessen das Ausgabelimit für den
  nächsten Versuch erhöht: 4096, 8192, höchstens 16384 Tokens. Der vollständige
  Originaltext bleibt erhalten, abgeschnittene JSON-Teile werden nie übernommen.
  Fehlende oder anders unvollständige Antworten werden davon unterschieden.
- Derselbe Spieltitel wird über Fenstergrenzen nur bei überlappenden
  Abschnitten oder ausdrücklich zusammenhängenden unmittelbaren
  Nachbarfenstern zusammengeführt. Spätere Wiederaufnahmen bleiben separat.
  Belegt ein Nachbarfenster einen Abschluss am selben letzten Segment,
  ersetzt dieser ein zuvor offenes Ende.
  Konflikte zwischen Fenstern bleiben zur Prüfung gekennzeichnet.
- Ein exakter, normalisierter Vergleich mit bekannten Spielnamen und
  Aliasen kann eine `gameId` ergänzen. Bei unbekannten oder mehrdeutigen
  Titeln bleibt sie `null`; es gibt keine automatische unscharfe Zuordnung.

Startzeiten stammen aus dem ersten Segment. Endzeiten stammen aus Start
plus Dauer des letzten Segments und werden gegebenenfalls am nächsten
Besprechungsbeginn begrenzt. Bei fehlender Dauer, offenem Fortgang oder
widersprüchlichen Grenzen bleibt `endMs` ausdrücklich `null`.
Die Modellgrenzen bleiben Schätzungen auf Untertitelgenauigkeit, keine
framegenauen Schnitte.

### Katalogkandidaten und Jahresprüfung

Ein lokaler Titelindex aus dem MobyGames-Dump (`gdb.sql`, gitignored) hilft
dem Modell bei ASR-verzerrten Titeln:

```sh
npm run dev:build:game-title-index -- --input gdb.sql
```

`src/fetch-game/build-game-title-index.mjs` schreibt
zwei gitignorierte Dateien:

- `cache/game-title-index.json` (Version 3, ca. 84 MB, rund 180.000 Spiele,
  kompaktes JSON mit einer Zeile je Spiel): je Spiel `id` (MobyGames-`mobyid`),
  `title`, `alternativeTitles` (`{ title, info }`), `genres`, `firstYear`,
  `platforms` (nur Nummern aus dem Plattformindex), `publishers`,
  `developers`, `companies` (Vereinigung beider, höchstens acht; nutzt die
  Kandidatensuche) und `releases`. Releases sind Tupel in der Reihenfolge von
  `releaseColumns` (`mobyreleaseid`, `year`, `platform` als Nummer,
  `publisher`, `developer`, `countries`, `publabel`; Firmen als Rohtext).
  Kopffelder: `source` (Dump-Hash), `importedRows`, `platformIndex`.
  Daraus erzeugt auch `dev:import:game-dump` den Spielemetadaten-Report, ohne
  `gdb.sql` erneut zu lesen.
- `cache/game-platform-index.json` (329 Plattformen): `platforms` als
  `{ id, name }`, nach Namen sortiert und ab 1 nummeriert. Der Dump enthält
  keine Plattform-IDs, daher sind die Nummern lokal und gelten nur zusammen
  mit dem Titelindex desselben Builds (gleicher `source.sha256`). Anderer
  Pfad: `--platform-output datei.json`.

Fehlt der Titelindex, warnt die Analyse und arbeitet ohne Kandidaten
(`candidateSource: "none"`). Ein Index im alten Format (Version 1 oder 2) wird
abgelehnt und muss neu gebaut werden.

`src/extra-data/transcript-game-candidates.mjs` sucht ohne Sprachmodell:

- Nur Spiele aus dem Heftzeitraum: drei Jahre vor bis ein Jahr nach dem
  jüngsten Heftjahr des Videos (aus den Video–Zeitschriften-Zuordnungen).
- Titelvarianten mit und ohne Untertitel bzw. führendes „The“; exakte
  n-Gramm-Treffer (1–5 Wörter) und lautähnliche Treffer per Kölner Phonetik
  (z. B. „Felken“ = Falcon, „Gunchip“ ≈ Gunship).
- Lautähnliche Treffer nur, wenn mindestens ein Wort großgeschrieben und
  nicht häufig ist. Häufig sind Wörter, die in mindestens 40 % (mindestens
  drei) aller Transkripte vorkommen. Titel nur aus solchen Wörtern
  (etwa „Mission“) werden nicht gesucht.
- Eine Herstellernennung innerhalb von ±90 Sekunden stärkt einen Treffer.

Jedes Fenster erhält die zehn bestbewerteten Kandidaten als
`catalogCandidates` (`title`, `year`, gehörte Schreibweisen, Segment-IDs).
Die Prompts behandeln sie als Namenshilfe, nicht als Pflichtauswahl: Ein
Titel aus der Liste ist nur zu verwenden, wenn das Gespräch das Spiel
tatsächlich bespricht; Spiele außerhalb der Liste bleiben möglich. Die
Fensteraufteilung bleibt fest, damit auch Abschnitte ohne erkennbaren
Titelanker erfasst und Läufe fortsetzbar bleiben.

Nach dem Zusammenführen prüft die Analyse jeden Titel gegen den Index:
Erschienen alle gleichnamigen Spiele erst nach Heftjahr + 1, wird der
Abschnitt nach `discarded` verschoben (etwa Wasteland 3 in einem Heft von
1988). Ein Titel gilt auch als gefunden, wenn er dem Haupttitel vor „:“
entspricht (Police Quest). Titel ohne Indexeintrag bleiben erhalten,
erhalten aber das Issue `not-in-title-index`.

### Optional: größeres Ollama-Kontextfenster

`max_tokens` begrenzt nur die **Ausgabe**, nicht das Kontextfenster.
Der Denkmodus von Modellen wie qwen3 wird per `reasoning_effort: "none"`
(native API: `think: false`) abgeschaltet; aktuelle Ollama-Versionen
ignorieren den Prompt-Schalter `/no_think`, und ungezeigter Denktext würde
sonst das Ausgabelimit verbrauchen. Bei `stream: false` bricht Nodes `fetch`
außerdem nach 300 Sekunden ohne Antwortheader ab; die Fehlerdiagnose zeigt
dann `"cause":"UND_ERR_HEADERS_TIMEOUT"`.
Für Ollama lässt sich das echte Kontextfenster explizit in `.env` setzen:

```dotenv
OLLAMA_NUM_CTX=32768
```

Alternativ nur für einen Lauf:

```sh
OLLAMA_NUM_CTX=32768 npm run dev:generate:games-from-transcript -- _PHiFsxtF0k
```

Damit verwendet das Skript für Modellaufrufe Ollamas lokale native
`/api/chat`-API statt `/v1/chat/completions`, mit `options.num_ctx` und
`options.num_predict`. Voraussetzung ist eine lokale `OPENAI_BASE_URL`
mit Pfad `/v1`; Modell und API-Key bleiben wie konfiguriert.
Nach einer am Ausgabelimit abgeschnittenen Antwort werden sowohl Kontext
als auch Ausgabe für den nächsten Versuch verdoppelt, der Kontext bis
höchstens 131072 Tokens. Gültige Startwerte sind 4096–131072.
Die Anpassung wird im Retry-Log angezeigt und gilt für Erkennung und
Kontextprüfung getrennt. Ein größeres Fenster benötigt mehr RAM/VRAM und
muss vom Modell unterstützt werden; es garantiert keine gültige Antwort.
Ohne Parameter bleibt die OpenAI-kompatible API erhalten.
Vorhandene fertige Fenster werden weiterhin unverändert wiederverwendet;
Fenstergrenzen, Segment-IDs und Modellidentität ändern sich dadurch nicht.
Nach wie vor höchstens drei Versuche je Phase, anschließend expliziter Fehler.

### Ergebnis und Wiederaufnahme

Die separate Ergebnisdatei lautet
`cache/game-discussions/<video-id>.json`. Sie enthält:

- Quell- und Kataloghash, Modellname, Analyseversion (aktuell 4),
  `candidateSource` (`<Index-SHA-256>:<von>-<bis>` oder `none`) und
  Erstellungszeit.
- `status: "needs-review"` und die Liste `discussions`.
- Je Abschnitt Titel, optionale `gameId`, `startMs`, `endMs`,
  erste/letzte Segment-ID, `confidence`, `endReason` und `issues`.
- Eine belegende Originaltextstelle mit Segment-ID und Zeitmarke.
- Mit Titelindex zusätzlich `titleIndexId`, `firstYear`, `developers` und
  `publishers` je Abschnitt. Die Firmen stammen nur aus Releases des
  Erstveröffentlichungsjahrs (keine späteren Re-Releases); im Dump
  zusammengefasste Namen werden getrennt und bereinigt. Ältere Analysen ohne
  Firmen ergänzt ein erneuter Aufruf über `titleIndexId`, ohne Modellaufruf
  und ohne Titel, Zeiten oder Status zu ändern. Dazu kommt die Liste `discarded` mit wegen des Erscheinungsjahres verworfenen
  Abschnitten (`reason: "released-after-issue"`).
- Gesamtstatus `status: "needs-review"`; die Modell-Konfidenz ist kein
  kalibrierter Zuverlässigkeitswert. Nach Prüfung der ganzen Liste am Video
  `status: "reviewed"` setzen, um sie zu veröffentlichen. Ein Prüffeld je
  Abschnitt gibt es nicht; ein veraltetes `reviewed` aus älteren Läufen wird
  ignoriert.

Beim Zusammenführen gelten Vorschläge mit derselben eindeutigen
Katalog-ID oder demselben normalisierten Titel als dasselbe Spiel. Direkt
aneinandergrenzende oder überlappende Abschnitte werden vereinigt;
Wiederaufnahmen nach anderem Inhalt bleiben getrennte Sprungmarken.
Modellantworten werden gestreamt (SSE bzw. NDJSON), damit lange
Antworten nicht an Nodes Wartegrenze für Antwortheader scheitern.

Fensterergebnisse werden als `<video-id>.window-<nummer>.json` lokal
zwischengespeichert. Nach einem Fehler werden beim nächsten Aufruf passende
Zwischenstände wiederverwendet. Fortschrittsmeldungen zeigen Fenster,
Segmentbereich, Modell und Vorschlagsanzahl.

Zusätzlich werden gültige Erkennungsvorschläge bereits **vor** der
Kontextprüfung als `<video-id>.candidates-window-<nummer>.json`
gespeichert. Scheitert nur die Kontextprüfung, setzt ein Neustart direkt
bei dieser Prüfung fort. Diese Dateien sind keine fertigen Analysen und
werden nicht auf der Website angezeigt. Fensterdateien älterer
Analyseversionen (bis 3) oder mit anderer Kandidatenquelle passen nicht und
führen zu einem Fehler; vor einem Neulauf archivieren. Vor dem ersten Modellaufruf werden
alle vorhandenen Fenster geprüft und gezählt; nur fehlende Fenster werden
analysiert, auch bei Lücken zwischen fertigen Fenstern. Quelle, Modell,
Endpunkt und Analyseversion müssen weiterhin passen, beschädigte oder
unpassende Zwischenstände werden nicht überschrieben.
Ein geänderter Spielekatalog der Website verhindert die Fortsetzung nicht: Er wird nicht
an das Modell übergeben und dient erst beim abschließenden Zusammenführen
zur Zuordnung von Spiel-IDs. Diese Änderung wird ausdrücklich gemeldet.
Ein neu gebauter Titelindex mit anderem Dump ändert dagegen
`candidateSource` und verhindert die Fortsetzung.
Vorhandene Fenster- und Vorschlagsdateien bleiben bis zum erfolgreichen
Abschluss bytegenau unverändert.

Erst nachdem die Gesamtanalyse atomar gespeichert wurde, löscht das Skript
die zu dieser Video-ID gehörenden `window-<nummer>.json`- und
`candidates-window-<nummer>.json`-Dateien einschließlich ihrer `.tmp`-Reste.
Bei Analyse- oder Schreibfehlern bleiben die Zwischenstände erhalten.
Auch beim erneuten Aufruf mit einer passenden fertigen Gesamtanalyse
werden verbliebene Fensterdateien ohne Modellaufruf aufgeräumt.
Andere Video-IDs, Transkripte und Gesamtanalysen bleiben unberührt.
Fehler beim Aufräumen werden ausdrücklich gemeldet; die bereits
gespeicherte Gesamtanalyse bleibt erhalten.

Nach ausgeschöpften Versuchen nennt die Fehlermeldung Fenster,
Segmentbereich und Fehlerphase. Zur Wiederaufnahme denselben Befehl
erneut ausführen:

```bash
npm run dev:generate:games-from-transcript -- _PHiFsxtF0k
```

Erfolgreiche Fenster werden dabei ohne Modellaufruf wiederverwendet.
Strg+C und SIGTERM brechen laufende Modellanfragen bzw. Retry-Pausen ab
und räumen die Analysesperre auf. Bei hartem Prozessabbruch (z. B.
SIGKILL/Stromausfall) kann `<video-id>.json.lock` liegen bleiben.
Das Script meldet den konkreten Pfad: erst sicherstellen, dass kein
Analyseprozess mehr läuft, dann nur diese verwaiste Sperre manuell
entfernen. Sperren werden nicht automatisch gelöscht oder übernommen.

Vorhandene Gesamtanalysen werden nicht erneut angefragt oder überschrieben,
auch nicht nach manueller Prüfung. Passen Quelle, Spielekatalog, Modell oder
Analyseversion nicht mehr, erscheint ein Fehler statt automatischem Ersetzen.
Für eine bewusst neue Analyse vorhandene Ergebnisse und Zwischenstände
zunächst manuell archivieren. Eine exklusive `.lock`-Datei verhindert
gleichzeitige Verarbeitung derselben Video-ID; verwaiste Sperren nur nach
Prüfung auf einen noch laufenden Prozess entfernen.

Nur Gesamtanalysen `cache/game-discussions/<video-id>.json` und fertige
Transkripte `cache/youtube-transcripts/<video-id>.json` werden in Git
versioniert. Fenster, Vorschläge, Sperren und temporäre Schreibdateien
bleiben Git-ignoriert. Die Analyse ändert keine Spielzuordnungen und
veröffentlicht selbst nichts.
Beim nächsten Website-Build werden abgeschlossene Analysen zusammen mit
dem passenden Transkript für Blätterabend-Ausgabenseiten eingelesen:
Das Widget `src/site-generation/widget/game-discussions.mjs` zeigt erkannte Spielnamen
und Zeitmarken im jeweiligen Videobereich. Veröffentlicht werden nur
Analysen mit `status: "reviewed"`, dann alle ihre Abschnitte; Analysen mit
`needs-review` werden trotzdem vollständig validiert.
Zur lokalen Vorschau ungeprüfter Vorschläge den Build mit
`SHOW_UNREVIEWED_GAME_DISCUSSIONS=1 npm run generate:site` starten (nur der
Wert `1` schaltet die Vorschau ein). Enthält die Liste ungeprüfte Abschnitte,
steht darüber „Spielnamen und Zeitmarken können ungenau sein.“
Ungeprüfte Einträge tragen im HTML `data-unreviewed-video="<video-id>"`.
Daran erkennt der Build die betroffenen Seiten und listet am Ende jede mit
`http://127.0.0.1:8000/<route>`, Video-ID, Anzahl und Videotitel (auch als
`unreviewedPages` im Rückgabewert von `generateSite`). Mit Schalter, aber
ohne ungeprüfte Abschnitte meldet er „keine ungeprüften
Spielebesprechungen“. Im regulären Build kommt der Marker nicht vor.
Ein aktiver, bereiter Player springt über die bestehende Kapitelsteuerung
zur Stelle; ohne Aktivierung, ohne JavaScript oder bei fehlender Steuerung
führt der Link zu YouTube mit Zeitmarke. Ein nur vorbereiteter Player
merkt die Startstelle vor, ohne automatisch abzuspielen.

Nur `<video-id>.json` wird verwendet, nicht die Fenster-Zwischenstände.
Ohne abgeschlossene Analyse oder ohne Freigabe der Analyse bleibt der Bereich unsichtbar.
Quellhash, Video-ID, Segmentverweise und Zeitgrenzen werden geprüft;
beschädigte oder veraltete Analysen führen zu einem sichtbaren Buildfehler.
Das Rohtranskript und Modell-Metadaten werden nicht ins HTML übernommen.
Spielnamen und Zeitmarken werden dagegen als statische Seiteninhalte
publiziert, wenn die Quelldateien beim Build vorhanden sind.
Eingecheckte Gesamtanalysen und Transkripte stehen damit auch einem
frischen GitHub-Actions-Build ohne Modellaufruf zur Verfügung.

Nur Loopback-Endpunkte sind erlaubt; Weiterleitungen werden abgelehnt.
Transkripte werden ausschließlich an das konfigurierte lokale Modell gesendet.

### Vorschläge prüfen und freigeben

Der Gesamtablauf mit Vorschau steht in der
[Blätterabend-Spielebesprechungen](../blaetterabend_games.md#ablauf).
Geprüft wird direkt in `cache/game-discussions/<video-id>.json`:

- **Verwerfen:** falsche Abschnitte aus `discussions` löschen. Da die Liste
  als Ganzes freigegeben wird, dürfen danach nur korrekte Abschnitte übrig
  bleiben.
- **Titel korrigieren:** `title` ändern. Die Website zeigt `title`,
  `startMs`, `endMs` sowie `firstYear`, `developers` und `publishers`;
  `gameId`, `titleIndexId`, `evidence`, `issues` und `confidence` sind
  Prüfhilfen. Gehört der Indextreffer zu einem anderen Spiel, die drei
  Metadatenfelder ebenfalls korrigieren oder entfernen.
- **Grenzen korrigieren:** Die Segment-ID ist der nullbasierte Index in
  `segments` von `cache/youtube-transcripts/<video-id>.json`. Beim Ändern
  müssen gelten: `startMs` = `startMs` des Segments `firstSegmentId`;
  `endMs` ist `null` oder höchstens Start plus Dauer des Segments
  `lastSegmentId`; Abschnitte bleiben nach `startMs` aufsteigend sortiert.
  Die passende Segment-ID zu einer Videozeit liefert zum Beispiel
  `node -e 'const s=require("./cache/youtube-transcripts/<video-id>.json").segments;const t=<sekunden>*1000;console.log(s.findLastIndex((x)=>x.startMs<=t))'`.
- **Fehlenden Abschnitt ergänzen:** möglich mit denselben Pflichtfeldern
  (`title`, `startMs`, `endMs`, `firstSegmentId`, `lastSegmentId` und
  `confidence`).
- **Freigeben:** nach vollständiger Prüfung `"status": "needs-review"` →
  `"reviewed"`. Erst dann erscheint die ganze Liste im regulären Build.

Die Analysedatei darf nach der Prüfung bearbeitet bleiben: Ein erneuter
Aufruf von `dev:generate:games-from-transcript` erkennt die vorhandene Analyse
und ruft kein Modell auf. Ändert sich das Transkript, passt der gespeicherte
`transcriptHash` nicht mehr, und der Build bricht mit einer Meldung ab.

### Qualität und Grenzen

Der erste lokale Versuch mit einem Quizabschnitt lieferte einen falschen
Spieletreffer. Mit der zusätzlichen Kontextprüfung wurde dieser konkrete
Treffer verworfen. Das ist ein Funktionstest, kein Nachweis einer allgemeinen
Erkennungsquote. Automatische Transkripte können Titel stark verfälschen;
Fenstergrenzen können Zusammenhang verlieren und beide Modellaufrufe können
denselben Fehler machen. Vor Übernahme müssen Treffer und ausgelassene
Besprechungen anhand einer manuell markierten Stichprobe geprüft werden.
Das geplante Präzisionsziel von 90 Prozent ist noch nicht nachgewiesen.

### Erkennung gegen eine Referenz bewerten

Manuell markierte Referenzen liegen unter
`src/data/game-discussion-references/<video-id>.json`:

- `status`: `draft` (Entwurf) oder `confirmed` (am Video geprüft).
- `discussions`: erwartete Abschnitte mit `title`, optional `aliases`
  (z. B. ASR-Schreibweisen), `startMs` und `endMs`.
- `unclear`: Bereiche mit offener Einschätzung; Treffer dort werden nicht gewertet.
- `rejected`: bewusst verworfene Erwähnungen (nur zur Dokumentation).

```bash
npm run dev:evaluate:game-discussions -- 63foHISC8ms \
  cache/game-discussions/63foHISC8ms.json doc/examples/63foHISC8ms-copilot.csv
```

Vorhersagen können Analyse-JSONs oder CSVs mit `startMs,durationMs` und
einer Titelspalte `gameTitle`, `spieletitel` oder `title` sein. Referenz
und Vorhersage werden eins zu eins zugeordnet, wenn sie mindestens die
Hälfte des kürzeren Abschnitts überlappen. Ausgegeben werden Präzision
(korrekte Titel / gewertete Vorschläge), Abdeckung (korrekte Titel /
Referenzabschnitte) und der Anteil korrekter Treffer mit Start- und
Endabweichung bis 15 Sekunden. Ergebnisse gegen eine `draft`-Referenz sind
nur vorläufig.

## Lokale Sprachmodell-Konfiguration

Die lokale `.env` enthält die OpenAI-kompatible Konfiguration für die
Transkriptanalyse mit Ollama:

```dotenv
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
OPENAI_MODEL=qwen3:14b
OPENAI_API_KEY=
```

`.env` ist Git-ignoriert; `.env.example` dokumentiert die Variablen ohne
Zugangsdaten. Lokales Ollama benötigt keinen API-Key. Der Endpunkt ist
OpenAI-kompatibel, nicht eine OpenAPI-Spezifikation.
Node.js 22 kann die Datei ohne zusätzliche Abhängigkeit mit
`node --env-file=.env ...` laden. Das Analysescript lädt sie bereits selbst.
Bestehende Fetch- und Website-Buildscripts verwenden sie nicht und
übertragen keine Transkripte.

## Architekturentscheidungen

Architecture Decision Records liegen in `doc/adr/`:

- [ADR 0001: YouTube-Kanal-Metadaten ohne offizielle API laden](adr/0001-youtube-metadaten-ohne-offizielle-api.md)
- [ADR 0002: Statische Seiten mit minimalem JavaScript, SEO und kurzen Ladezeiten](adr/0002-statische-seiten-seo-und-performance.md)
- [ADR 0003: Seitenstruktur und Zuordnung von Videos zu Inhaltsbereichen](adr/0003-seitenstruktur-und-inhaltszuordnung.md)
- [ADR 0004: Detailseiten, Videonavigation und fortlaufende Wiedergabe](adr/0004-detailseiten-und-videonavigation.md)
- [ADR 0005: Wiederverwendbare Widgets und Komponenten](adr/0005-wiederverwendbare-widgets-und-komponenten.md)
- [ADR 0006: Spielemetadaten ausschließlich aus lokalem Games-Dump (angenommen)](adr/0006-spielemetadaten-aus-lokalem-games-dump.md)
- [ADR 0007: Katalogübersichten und erweiterte Navigation](adr/0007-kataloguebersichten-und-erweiterte-navigation.md)
- [ADR 0008: Transkripte und Spieleabschnitte in Blätterabenden (vorgeschlagen)](adr/0008-transkripte-und-spieleabschnitte-in-blaetterabenden.md)

## GitHub Pages veröffentlichen

Der Workflow in `.github/workflows/pages.yml` baut die Website bei Pushes auf
den Branch `main`, bei manuellen Starts und nach erfolgreichem Abschluss
von `Update YouTube caches` auf `main`. Er veröffentlicht `docs/` über
GitHub Pages. Die Verkettung erfolgt über `workflow_run`, nicht über den
Cache-Push mit `GITHUB_TOKEN`. Der nachgelagerte Build liest den aktuellen
Stand von `main`, auch wenn der Abruf keine Cacheänderungen ergeben hat.
Nach fehlgeschlagenen oder abgebrochenen Abrufen werden Build und Deployment
übersprungen. Die drei Jobs laufen nacheinander: `test` → `build` → `deploy`.
`test` führt `npm test` aus; `build` startet nur bei Erfolg und verwendet
denselben getesteten Commit. Erst nach erfolgreichem Build folgt `deploy`.
Beide Node.js-Jobs installieren zuvor die im Lockfile festgelegten Abhängigkeiten;
der npm-Downloadcache wird über `actions/setup-node` wiederverwendet.

Lokale `dev:`-Aufbereitungsaufgaben laufen dabei nicht. Vorhandene manuelle
Zuordnungen und fertige Metadaten-/Analyse-Caches bleiben erhalten und
werden weiterhin verwendet. Aktiviere im Repository unter
**Settings → Pages** die Bereitstellung über **GitHub Actions**.
