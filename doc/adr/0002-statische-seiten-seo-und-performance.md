# ADR: Statische Seiten mit minimalem JavaScript, SEO und kurzen Ladezeiten

**Status:** Vorgeschlagen
**Datum:** 2026-10-17
**Entscheider:** Christian Harms
**Kontext:** Veröffentlichung des Video-, Zeitschriften- und Spielekatalogs auf GitHub Pages.
**Ausgangspunkt:** [`src/generate-site.mjs`](../../src/generate-site.mjs)

## Kontext

Die Website soll Videos, Zeitschriften, einzelne Ausgaben und Spiele auffindbar
machen. Suchmaschinen müssen Inhalte und Zusammenhänge direkt aus dem
ausgelieferten HTML lesen können, ohne JavaScript auszuführen. Besucher sollen
auch bei langsamen Verbindungen schnell navigieren können.

Bereits vorhanden sind ein Node.js-Build-Script, JSON-Caches für Videos und
Zeitschriftenarchive sowie die Veröffentlichung des Verzeichnisses `docs/`
über GitHub Pages. Das ursprüngliche Build-Script erzeugte lediglich eine Startseite.
Ein strukturierter Spielekatalog wurde auf dieser Grundlage ergänzt.

**Umsetzungsstand (Schritte 1 und 2):** Der Offline-Build erzeugt jetzt
Startseite, News, paginierten Videokatalog, Datenschutzseite,
Sitemap, Robots-Datei und 404. Gemeinsame Templates, lokale Pico-CSS-Version
2.1.1 samt Lizenz, sichere Metadaten und Build-Budgets sind umgesetzt.
Zeitschriftenindex, Zeitschriften-, Jahrgangs- und eindeutige Ausgabenseiten
sind im dritten Schritt hinzugekommen; News und Videos verlinken diese Ziele.
Bestätigte Spieleseiten und Spieleindex sind ebenfalls umgesetzt.
Player-Komfortfunktionen wie Kapitelsteuerung und automatische Fortsetzung
folgen separat.
**Korrigierte Seitenstruktur:** Es gibt keine separate Seite pro Video.
Player und Beschreibungen stehen auf der jeweiligen Ausgabe-/Spieleseite.
Ein kleines lokales Modul wechselt dort die Auswahl per Video-Fragment;
ohne JavaScript bleiben Beschreibungen und YouTube-Links nutzbar.

Anforderungen:

- Vollständige, semantische HTML-Seiten statt einer clientseitig gerenderten App.
- Minimaler JavaScript-Einsatz; Inhalte und Navigation funktionieren ohne JavaScript.
- Zeitschriften- und Spielenamen als sichtbare Inhalte und maschinenlesbare Metadaten.
- Kurze Ladezeiten und eine kleine, lokal ausgelieferte CSS-Basis.
- Keine fremden Ressourcen außer direkt eingebundenen YouTube-Medien
  (Thumbnails und Videoplayer); diese werden nicht lokal kopiert.
- Icons ausschließlich als Unicode-Zeichen oder lokal eingebundene SVG.
- Echte Links mit `href`; externe Ziele werden ausdrücklich gekennzeichnet.
- Statisches Hosting ohne Backend, Datenbank oder Laufzeit-API.

## Entscheidung

### 1. HTML beim Build erzeugen

Wir erweitern das bestehende Node.js-Script und verwenden zunächst keinen
zusätzlichen Site-Generator und kein JavaScript-UI-Framework.
Gemeinsame HTML-Bausteine für Layout, Navigation, Metadaten und Links werden
beim Build wiederverwendet.

Der Ablauf bleibt:

1. Quellen separat abrufen und die lokalen Caches aktualisieren.
2. Videos, erkannte Zeitschriften und Ausgaben sowie später bestätigte
   Spielezuordnungen aus den lokalen Daten zusammenführen.
3. Daraus vollständige HTML-Dateien und lokale Assets in `docs/` erzeugen.
4. Interne Links, Metadaten, strukturierte Daten und Größenbudgets prüfen.
5. Nur das geprüfte Build-Ergebnis auf GitHub Pages veröffentlichen.

`npm run generate:site` benötigt keinen Netzwerkzugriff und startet keine Scraper.
Quellaktualisierung und Build sind zwei unabhängig ausführbare Schritte.
Fehlende technische Pflichtdaten (etwa Video-IDs), ungültige Quellstrukturen oder
kollidierende Ausgabepfade führen zu einem klaren Build-Fehler statt zu
stillschweigend leeren Seiten. Fehlende Beschreibungen und optionale Metadaten
sind zulässig: Die Seite bleibt nutzbar, fehlende Werte werden nicht erfunden.
Unbekannte Ausgaben dürfen als unbekannt angezeigt werden.

Die von den Scraper-Scripts zuvor lokal gespeicherten YouTube-Metadaten und
Beschreibungen sind Bestandteil der statischen Daten. Der Build übernimmt sie
in HTML und strukturierte Daten; der Browser muss sie nicht bei YouTube abrufen.
Medien sind davon getrennt: YouTube-Bilder und -Videos werden weder vom Scraper
noch vom Build heruntergeladen, gespiegelt oder in `docs/` kopiert. Gespeichert
werden dürfen ihre URLs und die Video-IDs für die direkte Einbindung.

### 2. Stabile, crawlbare Seitenstruktur

Vorgesehene Seitentypen:

Die fachliche Gliederung, Jahrgangsseiten und Regeln für Spielereihen werden in
[ADR 0003](0003-seitenstruktur-und-inhaltszuordnung.md) konkretisiert. Die folgende
Tabelle beschreibt den technischen Rahmen, keine Pflicht zur sofortigen
Erzeugung aller Seitentypen.

| Pfad | Inhalt |
|---|---|
| `/` | Einstieg und Navigation zu den Katalogen |
| `/videos/` | Paginierte Videoliste |
| `/zeitschriften/` | Alphabetischer Zeitschriftenindex |
| `/zeitschriften/<slug>/` | Zeitschrift, Ausgaben und zugehörige Videos |
| `/zeitschriften/<slug>/ausgaben/<ausgaben-id>/` | Eindeutig erkannte Ausgabe mit Videos und Archivlinks |
| `/spiele/` | Alphabetischer Spieleindex, sobald Spieledaten vorliegen |
| `/spiele/<slug>/` | Spiel mit zugeordneten Videos und Zeitschriftenausgaben |

Jeder Pfad wird als Verzeichnis mit `index.html` geschrieben. Slugs und IDs sind
eindeutig und stabil; spätere Änderungen eines Anzeigenamens dürfen Links nicht
unbemerkt brechen. Unbekannte Ausgaben bekommen keine spekulative Detailseite.
Seiten ohne belastbaren Inhalt werden nicht vorsorglich angelegt.

Eine zentrale Konfiguration enthält die öffentliche Basis-URL einschließlich
eines eventuellen GitHub-Pages-Projektpfads. Interne Links, Assets, Paginierung,
Canonical-URLs und `og:url` werden relativ zur jeweiligen Seite erzeugt,
nicht als vollständige URL oder als wurzelrelativer Projektpfad. Das HTML kann
dadurch ohne Neugenerierung unter einem anderen Host oder Unterpfad liegen.
Diese Portabilität ist eine bewusste Abweichung von der üblichen Empfehlung,
Canonical- und Open-Graph-URLs absolut auszugeben; relative URLs werden gegen
die Dokumentadresse aufgelöst. Es gibt kein fest verdrahtetes `<base>`-Element.
Sitemap-Einträge verwenden weiterhin absolute HTTPS-URLs; auch die
`Sitemap:`-Referenz in `robots.txt` bleibt eine vollständige URL.
Die Produktions-Basis-URL ist die öffentliche Projektseite dieses Repositorys:
`https://mrchristianharms-byte.github.io/prettyOldPixel/`.
Der Unterpfad `/prettyOldPixel/` ist Bestandteil der aufgelösten
Produktionsadressen, nicht der im HTML gespeicherten relativen Verweise.
Externe YouTube-/Archivadressen bleiben vollständig.

Allgemeine Kataloglisten zeigen höchstens 50 Einträge pro Seite.
Die vollständige Folgenliste eines Spiels bzw. einer einzelnen Ausgabe ist davon ausgenommen und darf
mehr als 50 Videos enthalten; Größenbudgets bleiben zu prüfen.
Blätterabend wird vorrangig nach Zeitschrift und Jahrgang gegliedert statt
durch eine einzige lange Liste erschlossen. Überschreitet eine solche
Teilübersicht dennoch das Limit, bleibt Paginierung möglich.
Jede Folgeseite hat eine eigene
URL, einen passenden Seitentitel und eine selbstreferenzierende Canonical-URL.
Seitennummern sowie vorherige und nächste Seite sind über normale Links erreichbar.
Kein Infinite Scroll als einziger Zugang, keine clientseitigen Hash-Routen
für Seitentypen und keine nur per JavaScript erreichbaren Inhalte.
Echte Abschnittsfragmente `#video-<id>` wählen Videos innerhalb derselben
statischen Detailseite; sie sind keine zusätzlichen indexierbaren Seiten.

### 3. Semantisches HTML und Metadaten

Jede indexierbare Seite enthält bereits im HTML:

- `lang="de"`, UTF-8 und eine passende Viewport-Angabe.
- Einen eindeutigen, beschreibenden `<title>` und eine seitenspezifische
  `meta name="description"`.
- Eine Canonical-URL, genau eine inhaltliche `h1` und eine logische
  Überschriftenhierarchie.
- Semantische Bereiche wie `header`, `nav`, `main`, `article` und `footer`;
  Datumsangaben mit `time datetime`.
- Aussagekräftige Linktexte und sichtbare Zeitschriften- bzw. Spielenamen.
- Open-Graph-Metadaten (`og:title`, `og:description`, `og:url`, `og:type`;
  `og:image` nur bei vorhandenem lokalen Bild oder einem direkt referenzierten
  YouTube-Thumbnail) sowie passende Twitter-Card-Metadaten.
- Schema.org-Daten als eingebettetes JSON-LD, passend zum sichtbaren Inhalt.

Für JSON-LD verwenden wir je nach Seite:

- `CollectionPage` und `ItemList` für Übersichten.
- `VideoObject` für Videos mit bekanntem Titel, Beschreibung,
  Veröffentlichungsdatum, ISO-8601-Dauer und YouTube-Verweis. `thumbnailUrl`
  verweist gegebenenfalls direkt auf das YouTube-Thumbnail, `embedUrl` auf den
  YouTube-Player; es werden keine lokalen Medienkopien angegeben.
- `Periodical` für Zeitschriften und `PublicationIssue` mit `isPartOf` für Ausgaben.
- `VideoGame` für Spiele; Beziehungen zu Videos werden über `about` ausgedrückt.
- `BreadcrumbList` für die sichtbare hierarchische Navigation.

Entitäten bekommen stabile, seitenrelative `@id`-Verweise, die gegen die
Dokumentadresse zur vollständigen Entitäts-URL aufgelöst werden. Interne
`url`- und Breadcrumb-Verweise sind ebenfalls seitenrelativ; externe
Schema.org-, YouTube- und Archivadressen bleiben unverändert.
Zeitschriften- und Spielenamen
stehen in `name`, passende Themen zusätzlich in `about` bzw. `keywords`.
Diese Angaben werden nur aus bestätigten Zuordnungen erstellt. Ein
`meta name="keywords"` ist nicht unsere SEO-Strategie: Google verwendet dieses
Feld nicht für das Ranking. Relevante Namen müssen auch im sichtbaren Inhalt,
Seitentitel und in nachvollziehbaren Verlinkungen vorkommen.

Nicht vorhandene Angaben werden ausgelassen. Wir erfinden keine
Veröffentlichungsdaten, Spieletitel, Bilder oder Bewertungen, um ein Schema zu
füllen. JSON-LD garantiert weder Rankings noch Rich Results. Für eine mögliche
Video-Auszeichnung sind zusätzlich die jeweiligen Suchmaschinenanforderungen zu
prüfen, insbesondere ein gültiges Vorschaubild und die tatsächliche
Abspielbarkeit; eine reine Verweisseite verspricht keine Video-Rich-Results.

Der Build erzeugt außerdem `sitemap.xml`, `robots.txt` mit Sitemap-Verweis und
eine hilfreiche `404.html`. Die Sitemap enthält nur kanonische, indexierbare
Seiten. `lastmod` wird aus tatsächlichen Inhaltsänderungen abgeleitet, nicht
pauschal aus dem Build-Zeitpunkt.

### 4. Kleine CSS-Basis: Pico CSS

Wir wählen **Pico CSS, Version 2**, als schlanke, semantische CSS-Basis.
Es benötigt kein JavaScript und passt zum Ansatz mit weitgehend nativen
HTML-Elementen. Gegenüber umfangreichen Komponentenframeworks bleiben Markup
und Build einfach.

- Bei der Umsetzung wird eine konkrete Patchversion fixiert, keine bewegliche
  `latest`- oder CDN-Referenz.
- Die benötigte minifizierte CSS-Datei wird samt MIT-Lizenz und Versionsangabe
  lokal im Projekt abgelegt und beim Build nach `docs/assets/` kopiert.
- Wenige projektspezifische Regeln ergänzen Pico. Ungenutzte Varianten werden
  nicht zusätzlich ausgeliefert.
- Systemschriften statt Webfonts; kein Font-Download.
- Kein CSS-`@import` und keine externen URLs in `url(...)`.
- Gemeinsam genutzte Assets erhalten Inhalts-Hashes im Dateinamen, damit
  Browser-Caches bei Änderungen zuverlässig aktualisiert werden.

HTML-Caching verwendet die von GitHub Pages gelieferten HTTP-Validatoren
(`Last-Modified` und/oder `ETag`, soweit vorhanden) und deren Cache-Regeln.
Unveränderte Build-Dateien werden wiederverwendet. Eigene Inhaltszeitpunkte
im HTML oder in der Sitemap ersetzen keine HTTP-Header.
Bei der Veröffentlichung werden tatsächliche Response-Header und bedingte
Requests geprüft; der Generator verspricht keine auf GitHub Pages nicht
konfigurierbaren Header oder frei wählbaren Cache-Laufzeiten.

Wir bewerten die tatsächlich ausgelieferte CSS-Größe, nicht nur die
Framework-Bezeichnung. Erfüllt die gewählte Variante das Größenbudget nicht,
wird der Umfang reduziert oder die CSS-Entscheidung neu bewertet.

### 5. JavaScript nur als optionale Verbesserung

Übersichten liefern **kein eigenes ausführbares JavaScript** aus.
Detailseiten nutzen ein kleines lokales Modul zum Wechsel zwischen statisch
vorhandenen Videoabschnitten. Ohne das Modul bleiben alle Beschreibungen und
Fallback-Links sichtbar. JSON-LD
ist ein Datenblock und keine clientseitige Rendering-Logik. Ein eingebundener
YouTube-Player lädt eigene Skripte im externen Frame; diese Ausnahme ist getrennt
vom JavaScript der Website zu betrachten. Inhalte und Navigation bleiben ohne
JavaScript nutzbar, auch wenn die Videowiedergabe JavaScript benötigt.

Native Elemente wie `details`/`summary` und normale Formular- und
Navigationselemente werden bevorzugt. Spätere Komfortfunktionen dürfen kleine,
lokale JavaScript-Module ergänzen, aber niemals Inhalte oder Links voraussetzen.
Keine Hydration, kein SPA-Router und kein Download des gesamten Video- oder
Spielekatalogs beim ersten Seitenaufruf.

[ADR 0004](0004-detailseiten-und-videonavigation.md) konkretisiert eine optionale
lokale Player-Steuerung für Kapitelmarken und Folge-Autoplay nach bewusstem
Wiedergabestart. Dafür ist die offizielle YouTube-IFrame-API nach
Player-Aktivierung auch im Seitendokument als externe Ausnahme erlaubt;
eigene Skripte bleiben im unten genannten Größenbudget.

### 6. Lokale Ressourcen mit Ausnahme für YouTube-Medien

HTML, CSS, eigene optionale Skripte, Favicons, SVG und sonstige lokale Bilder
werden von der eigenen GitHub-Pages-Origin geladen. Die einzige Ausnahme sind
YouTube-Thumbnails und eingebundene YouTube-Videoplayer einschließlich der für
ihren Betrieb notwendigen YouTube-/Google-Medienressourcen. Die Ausnahme erlaubt
keine zusätzlichen Analytics- oder sonstigen Drittanbieterskripte auf der Website.

- Keine CDNs, externen Fonts, Tracker, Analytics-Pixel oder Social-Media-Widgets.
- YouTube-Thumbnails werden direkt von YouTube geladen, in einer zur Anzeige
  passenden angebotenen Auflösung. Keine lokale Kopie, kein Bildproxy und keine
  lokale Neukodierung dieser Bilder.
- YouTube-Videos dürfen über den externen Player eingebunden werden, bevorzugt
  über `youtube-nocookie.com`, ohne Autoplay beim normalen Seitenaufruf.
  Die ausdrücklich abschaltbare Fortsetzung einer gestarteten Spielereihe ist
  in [ADR 0004](0004-detailseiten-und-videonavigation.md) geregelt.
  Auf Übersichtsseiten werden nur
  Thumbnails und Links angezeigt. Auf Ausgabe-/Spieleseiten wird der Player
  vorzugsweise erst auf ausdrückliche Nutzeraktion geladen, damit seine
  Ressourcen den initialen Seitenaufbau nicht belasten.
- Ein normaler, als extern gekennzeichneter YouTube-Link bleibt unabhängig vom
  Player verfügbar. Die externe Einbindung wird für Besucher kenntlich gemacht;
  `youtube-nocookie.com` bedeutet nicht, dass keine Daten übertragen werden.
- Andere Cover und Bilder nur lokal ausliefern, wenn die erforderlichen
  Nutzungsrechte geklärt sind. Sonst ohne Bild darstellen; nicht hotlinken.
- Lokale Bilder werden vorab passend skaliert und komprimiert. Alle Bilder,
  einschließlich YouTube-Thumbnails, werden mit festen `width`/`height`-Angaben
  und passenden Alternativtexten ausgeliefert.
  Bilder unterhalb des sichtbaren Bereichs erhalten `loading="lazy"`;
  das wichtigste sichtbare Bild wird nicht verzögert geladen.
- Kein `preconnect`, `dns-prefetch` oder Prefetch auf fremde Hosts.

Externe Quellen dürfen von den separaten Datenscripts für Metadaten und
Beschreibungen abgefragt werden. Diese Texte werden statisch veröffentlicht;
die direkte Medieneinbindung erfolgt dagegen erst im Browser.

### 7. Echte Links und sichtbare externe Ziele

Navigation erfolgt mit `<a href="…">`, Aktionen mit `<button>`.
Keine klickbaren `div`-Elemente, `javascript:`-URLs oder Links, die erst ein
Skript zusammensetzt. Interne Links bleiben auf der eigenen Website.

Externe Links bekommen `rel="external"` und eine sichtbare, verständliche
Kennzeichnung, beispielsweise:

```html
<a href="https://reetroz.com/issue/cgw-148" rel="external">
  CGW #148 auf reetroz.com <span aria-hidden="true">↗</span>
  <span class="visually-hidden"> (externe Website)</span>
</a>
```

Die Klasse `visually-hidden` wird lokal barrierefrei definiert. Links öffnen
standardmäßig im selben Tab. Falls ein neuer Tab ausdrücklich erforderlich
ist, werden `target="_blank"` und `rel="external noopener noreferrer"` gesetzt
und der neue Tab angekündigt. Redaktionelle externe Links erhalten nicht
pauschal `nofollow`; `sponsored` bzw. `ugc` wird nur bei entsprechender Herkunft
gesetzt.

Icons sind Unicode-Zeichen oder mitgelieferte SVG, keine Icon-Fonts oder
Icon-Dienste. Rein dekorative Icons erhalten `aria-hidden="true"`.
Icons ersetzen keine verständlichen Textbeschriftungen.

Quelltexte und Beschreibungen werden für HTML korrekt escaped. Verlinkbare
Quelldaten müssen erlaubte HTTP(S)-URLs sein; JSON-LD wird sicher serialisiert,
damit Quellinhalte weder HTML noch Skriptblöcke einschleusen können.

### 8. Datenschutzseite und privater Betrieb

Eine statische Seite `/datenschutz/` wird von jeder Seite im Footer verlinkt.
Sie beschreibt die Website als privates, nicht kommerziell genutztes Projekt
und enthält keine Anschrift. Diese Darstellung ist keine pauschale Aussage,
dass gesetzliche Informationspflichten entfallen.

Die Seite erläutert konkret:

- Hosting auf GitHub Pages und die dabei mögliche Verarbeitung von Zugriffsdaten.
- Lokal gespeicherte öffentliche YouTube-Metadaten und Beschreibungen:
  Ihre Anzeige löst keinen Metadatenabruf des Besuchers bei YouTube aus.
- Direkte YouTube-Thumbnails: Bereits beim Laden des Bildes können IP-Adresse
  und weitere technische Request-Daten an den Anbieter übertragen werden.
- YouTube-Player und IFrame-API: Zeitpunkt der Aktivierung, externe Verbindungen
  und die Grenzen des erweiterten Datenschutzmodus.
- Die Auswahl per URL-Fragment und die gegebenenfalls später eingeführte
  abschaltbare Folgenfortsetzung innerhalb derselben Seite; derzeit kein
  Sitzungsspeicher, kein eigenes Tracking und keine Analytics-Dienste.
- Externe Links, deren Ziele erst beim Aufrufen besucht werden.

Formulierungen müssen der tatsächlichen Umsetzung entsprechen. Erforderliche
Einwilligungs- und Informationspflichten sind vor Veröffentlichung zu prüfen;
„privat und nicht kommerziell“ allein beweist keine rechtliche Ausnahme.
Sollten weitere Pflichtangaben erforderlich sein, ist dies vor Veröffentlichung
mit dem Betreiber zu klären, statt eine Anschrift zu erfinden oder ungefragt
zu veröffentlichen.

## Überprüfbare Qualitätsziele

Budgets gelten pro Seitentyp für den initialen Aufruf mit leerem Browser-Cache;
optionale spätere Nutzeraktionen sind getrennt zu messen. Initial geladene
YouTube-Thumbnails zählen zum Transferbudget. Die Requests, Skripte und
Transfergrößen des aktivierten YouTube-Players werden separat ausgewiesen und
nicht dem Budget für eigene Skripte zugerechnet.

| Kriterium | Ziel |
|---|---|
| Nutzbarkeit ohne JavaScript | Alle Texte, internen Links, YouTube- und Archivverweise nutzbar; eingebettete Wiedergabe ausgenommen |
| Automatische Requests an fremde Origins | Nur direkt eingebundene YouTube-Thumbnails bzw. YouTube-Player-Ressourcen |
| Initiale Requests an die eigene Origin | Höchstens 10 |
| Eigenes ausführbares JavaScript | Standard 0; optionale Ergänzungen insgesamt höchstens 5 KiB gzip |
| CSS einschließlich Framework und eigener Regeln | Höchstens 20 KiB gzip |
| HTML einschließlich JSON-LD | Höchstens 50 KiB gzip |
| Initialer Transfer einschließlich sichtbarer Bilder | Höchstens 200 KiB |
| Core Web Vitals, 75. Perzentil, sofern Felddaten vorliegen | LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 |
| Lighthouse, mobile Laborprüfung repräsentativer Seiten | Performance und SEO jeweils mindestens 95 |

Gzip-Größen dienen als reproduzierbares Build-Budget; zusätzlich werden die
tatsächlich übertragenen Bytes auf GitHub Pages gemessen, da die
Hosting-Kompression nicht vom Build kontrolliert wird. Lighthouse ersetzt weder
die HTML- und Datenprüfung noch reale Felddaten und garantiert keine Platzierung
in Suchergebnissen.

Bei der Umsetzung werden Build-Tests für Metadaten, JSON-LD, interne Links,
eindeutige Pfade, den GitHub-Pages-Unterpfad und Größenbudgets ergänzt.
Browserprüfungen erfolgen mit und ohne JavaScript und kontrollieren auch das
Netzwerkprotokoll auf unerlaubte fremde Ressourcen sowie Tastaturbedienung und
Fokusdarstellung. YouTube-Thumbnails und der aktivierte Player werden dabei
ausdrücklich als erlaubte Ausnahmen geprüft; es darf keine lokale Kopie von
YouTube-Medien im Build-Ergebnis entstehen.
Große Listen und lange Beschreibungen gehören zu den Testfällen.

## Alternativen

| Alternative | Bewertung |
|---|---|
| React-/Vue-SPA mit clientseitigem Routing | Unnötige Laufzeit und JavaScript-Pflicht für einen statischen Katalog; nicht gewählt. |
| Astro oder Eleventy mit statischer Ausgabe | Grundsätzlich geeignet; aktuell zusätzliche Werkzeuge ohne notwendigen Nutzen. Bei deutlich wachsender Template-Komplexität erneut prüfen. |
| Bootstrap oder eine umfangreiche UI-Bibliothek | Für die benötigten Seiten zu großer Komponenten- und Gestaltungsumfang. |
| Ausschließlich eigenes CSS | Noch weniger Fremdcode möglich, aber mehr Pflege für konsistente Basiselemente. Kleine eigene Ergänzungen bleiben vorgesehen. |
| CDN für Framework, Fonts oder Icons | Widerspricht der Vorgabe, keine fremden Ressourcen zur Laufzeit zu laden. |

## Konsequenzen

### Vorteile

- Inhalte sind sofort lesbar und ohne JavaScript crawlbar.
- Geringe Ladezeit und keine Hydration; fremde Ressourcen bleiben auf direkt
  eingebundene YouTube-Medien beschränkt.
- Zeitschriften, Ausgaben und Spiele bilden ein sichtbar und maschinenlesbar
  verknüpftes Inhaltsnetz.
- Betrieb bleibt auf GitHub Pages möglich, ohne Serverwartung oder Laufzeit-API.

### Nachteile und offene Voraussetzungen

- Datenänderungen erfordern einen erneuten Build und eine Veröffentlichung.
- Templates, HTML-Escaping, Pfade und Schema.org-Daten müssen gepflegt und getestet werden.
- Bestätigte Spielezuordnungen stehen im gepflegten Katalog `src/games.mjs`;
  neue unbestätigte Spiel-Playlists benötigen weiterhin eine inhaltliche Prüfung.
  Die Produktionsadresse ist festgelegt.
- Lokal gespeicherte Bilder erhöhen das Repository- und Deployment-Volumen;
  Nutzungsrechte müssen vor dem Übernehmen geklärt sein. YouTube-Medien werden
  nicht übernommen und erhöhen dieses Volumen nicht.
- YouTube-Thumbnails und -Player hängen von der Verfügbarkeit und den
  Zugriffsregeln des Anbieters ab und übertragen beim Laden Besucherdaten.
  Datenschutz- und gegebenenfalls Einwilligungsanforderungen sind vor der
  Veröffentlichung zu klären; die technische Erlaubnis ersetzt diese Prüfung nicht.
- CSS-Updates erfolgen bewusst und versioniert statt automatisch über ein CDN.
- Suchmaschinen entscheiden selbst über Indexierung und Darstellung.

Die grundlegenden Katalogseiten und Pico CSS sind inzwischen implementiert;
die übrigen Abschnitte beschreiben weiterhin auch die noch ausstehenden
Ausbaustufen. Reale Hosting-Header, Transferbudgets und Lighthouse-Werte müssen
zusätzlich am veröffentlichten Ergebnis geprüft werden.

## Referenzen

- [Pico CSS: Installation und semantisches HTML](https://picocss.com/docs)
- [Schema.org](https://schema.org/)
- [Google: SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Google: Video structured data](https://developers.google.com/search/docs/appearance/structured-data/video)
- [Google: Nicht unterstütztes Meta-Keywords-Tag](https://developers.google.com/search/docs/crawling-indexing/special-tags)
- [Web Vitals](https://web.dev/articles/vitals)
