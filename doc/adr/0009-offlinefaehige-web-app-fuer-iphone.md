# ADR 0009: Offlinefähige Web-App für das iPhone

**Status:** Angenommen; Umsetzung ausstehend
**Datum:** 2026-10-23
**Entscheider:** Christian Harms
**Kontext:** Eine separate Offline-App erzeugt ihre Ansichten lokal aus JSON;
die öffentliche statische Website bleibt erhalten.
**Grundlagen:** [ADR 0002: Statische Seiten, SEO und Performance](0002-statische-seiten-seo-und-performance.md),
[ADR 0003: Seitenstruktur und Inhaltszuordnung](0003-seitenstruktur-und-inhaltszuordnung.md),
[ADR 0004: Detailseiten und Videonavigation](0004-detailseiten-und-videonavigation.md),
[ADR 0005: Wiederverwendbare Widgets](0005-wiederverwendbare-widgets-und-komponenten.md)

## Kontext

Die öffentliche Website besteht aus über 600 vorgerenderten HTML-Seiten.
Zusätzlich soll der Katalog als App auf dem iPhone installierbar sein und
nach einem ersten vollständigen Download ohne Netz funktionieren.

**Die Vorgaben zu wenig JavaScript, vollständigem HTML ohne JavaScript und
Verzicht auf einen clientseitigen Router gelten für die öffentliche Website,
nicht für die separate Offline-App.** In der App sind JavaScript als
Voraussetzung und lokal aus JSON erzeugte Ansichten ausdrücklich gewünscht.
Statisch bleibt dort das Hosting: kein Backend und keine Laufzeit-API.

Die erste Fassung dieser ADR schlug vor, alle HTML-Seiten mit einem Service
Worker zu speichern. Eine JSON-App wurde fälschlich wegen der für die
öffentliche Website geltenden Regeln verworfen. Diese Entscheidung wird
nach der Klarstellung und anhand der Größenmessung revidiert.

### Größenmessung und Schätzung

Messstand: 2026-10-23, 608 HTML-Seiten, 2.164 Videos und 147 Spiele.
MB bezeichnet dezimale Megabyte. Die JSON-Messungen entstanden aus dem
vorhandenen normalisierten Inhaltsmodell, ohne eine App zu implementieren.

| Bestandteil | Unkomprimierte Nutzdaten | Gzip |
|---|---:|---:|
| 608 bestehende HTML-Seiten | 15,10 MB | 2,76 MB |
| Inhaltsmodell als JSON, nahezu unverändert | 8,21 MB | 0,82 MB |
| JSON mit Videos nur einmal statt zusätzlich in Playlists | 4,99 MB | 0,54 MB |
| Kompakter JSON-Entwurf mit weniger abgeleiteten und mehrfach gespeicherten Daten | 3,54 MB | 0,43 MB |
| Bestehende lokale Bilder und Icons | 1,93 MB | kaum zusätzliche Einsparung |

Die HTML-Gzip-Größe ist die Summe der einzeln komprimierten Seiten.
Die zuvor genannten rund 1,3 MB bezogen sich auf das gemeinsame Komprimieren
aller HTML-Dateien und bilden getrennte HTTP-Antworten nicht korrekt ab.
Die JSON-Werte beziehen sich dagegen jeweils auf eine gemeinsam
komprimierte JSON-Datei; eine Aufteilung in mehrere Dateien kann sie erhöhen.

Die kompakte Projektion entfernt unter anderem doppelte Beschreibungen und
ableitbare URLs, Datums-/Dauerformatierungen und Gruppierungen. Sie ist noch
kein auf Funktionsgleichheit geprüfter Export. Die verbleibenden Daten müssen
alle Ansichten einschließlich Spieleabschnitten und Quellen abdecken;
fehlende Inhalte dürfen nicht zugunsten der Größenangabe entfallen.

Für die vollständige App einschließlich HTML-Hülle, JSON, CSS, JavaScript
und vorhandener lokaler Bilder ergibt sich folgende **Planungsschätzung**:

| Variante | Lokale Nutzdaten | Komprimierter Erstdownload |
|---|---:|---:|
| Bestehende HTML-Seiten mit gemeinsamen Ressourcen offline speichern | ca. 17 MB | ca. 4,8 MB |
| Separate JSON-App | ca. 5–6 MB | ca. 2,5–3 MB |

Damit spart die JSON-App voraussichtlich etwa zwei Drittel der lokalen
Nutzdaten. Die Downloadersparnis ist kleiner, weil sich wiederholtes HTML
bereits gut komprimieren lässt. Nicht enthalten sind YouTube-Videos und
YouTube-Thumbnails, Browser-Verwaltungsaufwand und temporäre Update-Kopien.
Cache Storage wird nicht pauschal mit der komprimierten Übertragungsgröße
angesetzt; die tatsächliche Speicherbelegung ist auf dem Gerät zu messen.
Ein vollständiger alter und neuer App-Stand können während eines Updates
vorübergehend ungefähr den doppelten Platz benötigen.

## Entscheidung

Wir bauen eine **separate, statisch gehostete Progressive Web App (PWA)
mit JSON-Daten und clientseitigem JavaScript-Rendering**. Die öffentliche
Website wird weder ersetzt noch in eine Single-Page-App umgebaut.

```text
Caches + Bestandsdaten
└── Gemeinsames Datenmodul unter src/content-data/
    └── Einmal geladenes und normalisiertes Inhaltsmodell
        ├── Website-Generator → fertige HTML-Seiten
        └── App-Generator → JSON + App-Hülle unter app/
```

Die neue Entscheidung bevorzugt die JSON-App wegen des geringeren
Speicherbedarfs und des einmaligen Speicherns gemeinsamer Inhalte. Sie
akzeptiert dafür einen zusätzlichen Renderer und Funktionstests. Ein
nativer Wrapper und eine App-Store-Veröffentlichung sind nicht vorgesehen.

### 1. Zwei Ausgaben aus einer Datenquelle

- **Genau ein Ladeweg:** Das Lesen der Caches und der gepflegten
  Bestandsdaten, ihre Validierung, Normalisierung und Zusammenführung
  gehören in ein gemeinsames Datenmodul in einem eigenen Verzeichnis
  `src/content-data/`. Es liegt ausdrücklich außerhalb von
  `src/site-generation/` und einem künftigen App-Generator-Verzeichnis.
  Die bisherige Datenaufbereitung aus `site-data.mjs` und die zugehörige
  gemeinsame Anreicherung werden bei der Umsetzung dorthin herausgelöst,
  nicht für die App kopiert.
- Der übergeordnete Build lädt über diesen gemeinsamen Einstieg den
  Datenstand einmal und reicht dasselbe normalisierte Inhaltsmodell an
  Website- und App-Generator weiter. Beide Generatoren lesen weder Caches
  noch Bestandsdateien selbst und verändern das gemeinsame Modell nicht.
  Ein separat aufrufbares Build-Ziel muss ebenfalls diesen Einstieg nutzen;
  ein paralleler Loader oder eine eigene Normalisierung sind ausgeschlossen.
- Das gemeinsame Datenmodul kennt keine HTML-Templates, App-Ansichten oder
  Service Worker. Zielabhängige Darstellung und der kompakte JSON-Export
  bleiben in den jeweiligen Generatoren. Das Modul läuft beim Build unter
  Node.js, nicht im Browser.
- Der bestehende Website-Build und alle öffentlichen URLs bleiben erhalten.
  SEO, vollständiges HTML, Nutzung ohne JavaScript und die bisherigen
  Seitenbudgets aus ADR 0002 gelten dort unverändert.
- Der Build erzeugt zusätzlich `docs/app/` aus demselben normalisierten
  Modell und demselben geprüften Datenstand. Kein zweiter Datenpflegeweg,
  kein Zugriff der App auf interne Roh-Caches, Dumps oder Prüfberichte.
- Videos, Spiele, Zeitschriften, Ausgaben, Playlists und Belege werden
  möglichst einmal gespeichert und über IDs verbunden. Ein versioniertes
  JSON-Schema definiert Beziehungen und erforderliche Felder.
- Abgeleitete Gruppierungen und Anzeigeformate entstehen im App-Renderer.
  Gemeinsam nutzbare Formatierungen und Widgets werden wiederverwendet,
  soweit sie browserfähig sind. Node.js-Dateisystem- oder Pfadmodule werden
  nicht in den Browser übernommen; die Website benötigt keine Hydration.
- Inhalte und Funktionsumfang bleiben gleich: Navigation, Übersichten,
  Filter, Sortierung, Beschreibungen, Kapitel, Spieleabschnitte, Quellen und
  Videoauswahl. Onlinefähige Player-Funktionen bleiben online verfügbar.
  Eine große UI-Bibliothek ist dafür keine Voraussetzung.
- Daten werden wie im Website-Renderer sicher ausgegeben. JSON-Inhalte
  dürfen weder ungeprüft als HTML noch als unvalidierte Linkziele dienen.

### 2. App-Einstieg, Routing und Installation

Die App liegt unter `app/`, bei GitHub Pages also beispielsweise unter
`/prettyOldPixel/app/`. Die Website verlinkt dort einen ausdrücklich
gewählten App-Einstieg; ein normaler Website-Besuch lädt weder die
App-Daten noch registriert er den App-Service-Worker.

- Ein eigenes `app/manifest.webmanifest` verwendet relative Werte
  `id: "./"`, `start_url: "./"` und `scope: "./"` sowie
  `display: "standalone"`, deutsche Namen, Farben und passende lokale Icons.
  Manifest-Link und Registrierung stehen nur in der App-Hülle.
- Installation auf dem iPhone erfolgt über Safari → Teilen →
  „Zum Home-Bildschirm“. HTTPS ist Voraussetzung, `localhost` dient
  zum Testen. Die erste vollständige Offline-Einrichtung braucht Netz.
- Die App nutzt Hash-Routing, etwa `app/#/spiele/`. Damit kann GitHub Pages
  jeden Einstieg über dieselbe HTML-Datei ausliefern, ohne serverseitige
  Rewrite-Regeln oder einen zweckentfremdeten 404-Redirect.
- Vorhandene Video- und Kapitel-Fragmente werden in definierten
  App-Routenzustand übersetzt, statt mit dem Routing-Fragment zu kollidieren.
  Zurück/Vorwärts, direkte App-Links, Fokuswechsel und Seitentitel werden
  unterstützt. Unbekannte Routen erhalten eine verständliche Fehleransicht.
- Interne Links bleiben in der App. Teilen und „Auf Website öffnen“
  verwenden die entsprechenden unveränderten öffentlichen URLs.
  Externe Ziele bleiben normale, gekennzeichnete Links.

### 3. Lokale Speicherung und Updates

`app/sw.js` kontrolliert ausschließlich den Bereich `app/`, nicht die
öffentliche Website. Er wird mit einem zur App-Basis aufgelösten Pfad
registriert, unabhängig von der gerade dargestellten Ansicht.

- Ein vom Build erzeugtes Offline-Manifest beschreibt genau die benötigte
  App-Hülle, JSON-Daten und Assets mit Inhalts-Hashes und Gesamtversion.
  Es ist vom vorhandenen Website-`build-manifest.json` getrennt; die
  Fingerprints der 608 HTML-Seiten müssen nicht heruntergeladen werden.
- Gemeinsame lokale Ressourcen können direkt aus ihren bisherigen
  Asset-URLs geladen und im App-Cache gespeichert werden. Ihre Einträge
  stehen explizit im Offline-Manifest. Fremde Hosts gehören nicht dazu.
- Beim bewussten ersten App-Aufruf werden die vollständigen App-Daten
  geladen. Fortschritt und Fehler werden angezeigt; „Offline bereit“
  erscheint erst nach vollständig geprüfter Speicherung. Eine Installation
  auf dem Home-Bildschirm allein ist kein Nachweis dafür.
- Cache Storage enthält Hülle, JSON und Assets. Kleine Einstellungen
  bleiben getrennt in Local Storage; eine zusätzliche IndexedDB-Kopie
  desselben Katalogs ist zunächst nicht nötig.
- Ein App-Start mit Netz prüft auf Updates. Ein neuer Stand wird separat
  vorbereitet; unveränderte Dateien können aus dem alten Stand übernommen,
  geänderte anhand ihrer Hashes geladen werden. Erst ein vollständiger,
  schemakompatibler Stand wird zur Nutzung angeboten.
- Laufende Ansichten verwenden bis zum bestätigten Neustart konsistente
  Daten und passenden Renderer-Code. Alte Caches werden erst entfernt,
  wenn kein aktiver App-Client sie mehr benötigt. Ein fehlgeschlagenes
  Update beschädigt den bisherigen Offline-Stand nicht.
- Ein vollständiges Neuladen und Löschen der eigenen Offline-Daten ist
  ausdrücklich möglich. Speicherfehler und Netzfehler werden angezeigt,
  nicht als erfolgreicher Download behandelt.

### 4. Medien und Grenzen von Offline

Die Lockerung betrifft den JavaScript-Einsatz, nicht die bisherige
Medienpolitik: keine Spiegelung oder Vorabdownloads von YouTube-Inhalten.

- Eigene lokale Logos und Icons gehören zum Offline-Paket.
- YouTube-Thumbnails bleiben direkte Online-Ressourcen. Es gibt zunächst
  auch keinen eigenen Thumbnail-Laufzeitcache. Der in der ersten Fassung
  vorgeschlagene Cache entfällt; seine Größe und opaque Responses wären
  nicht zuverlässig durch die Bild-Nutzdaten begrenzt.
- Offline zeigt die App lokale Platzhalter statt fehlender Thumbnails
  und weist auf die erforderliche Verbindung für Videos hin. Die oben
  genannten 5–6 MB versprechen deshalb keinen Offline-Medienkatalog.
- YouTube-Player, Kapitelsteuerung und Folgenfortsetzung werden nur online
  und gemäß den bestehenden Aktivierungsregeln genutzt. `navigator.onLine`
  allein beweist keine Erreichbarkeit; Verbindungsfehler brauchen eine
  verständliche Anzeige und eine erneute Versuchsmöglichkeit.
- Externe Websites, Archive und Streams bleiben onlineabhängig.

### 5. Größenziele und iPhone-Verhalten

- Die 5–6 MB lokal und 2,5–3 MB Download sind vorläufige Ziele für den
  heutigen Datenbestand, keine gemessene Größe einer fertigen App.
  Die Umsetzung misst Datenexport, Renderer und Gesamtpaket getrennt.
  Budgetüberschreitungen werden erklärt, nicht durch Inhaltsverlust kaschiert.
- Die strengen JavaScript-Seitenbudgets der Website begrenzen die App
  nicht. Für die App gelten eigene Messungen von Gesamtgröße, Startzeit,
  Arbeitsspeicher und Bedienbarkeit auf einem echten iPhone.
- WebKit kann lokale Daten unter Speicher- oder Nutzungsdruck entfernen.
  Speicherpersistenz darf, soweit unterstützt, angefragt, aber nicht
  garantiert werden. Der App-Start prüft die Vollständigkeit und bietet
  bei fehlenden Daten eine erneute Online-Einrichtung an.
- Nicht voraussetzen, dass der Safari-Tab und die Home-Bildschirm-App
  denselben Cache oder dieselben Einstellungen teilen. Offline-Bereitschaft
  muss in der installierten App selbst geprüft werden.
- Updates hängen nicht von Hintergrundsynchronisation ab. Ein bereits
  vollständig gespeicherter Stand muss ohne Serverkontakt starten können.

### 6. Dokumentation und Abnahme

Die Datenschutzseite und eine Installationsanleitung erläutern lokale
Speicherung, Online-Medien, Offline-Bereitschaft, Updates und das gezielte
Löschen der App-Daten. Kein Tracking und kein Installations-Pop-up.
Das Entfernen des Home-Bildschirm-Icons wird nicht als garantiertes Löschen
aller Website-Daten beschrieben.

Die Umsetzung wird anhand folgender Prüfungen abgenommen:

1. Architekturtests sichern den gemeinsamen Ladeweg: Cache- und
   Bestandsdatenzugriffe für beide Ausgaben liegen im gemeinsamen
   Datenmodul, nicht in den Generatoren. Exporttests prüfen IDs,
   Referenzen, Schema, veröffentlichbare Inhalte und Vollständigkeit
   aller bisherigen Inhaltstypen.
2. Vergleichstests mit dem Website-Modell für Katalogzahlen, Zuordnungen,
   Filter, Sortierung, Beschreibungen, Kapitel und Spieleabschnitte.
3. Regressionstests: öffentliche URLs und SEO bleiben erhalten; kein
   App-Bundle/-Datenabruf und kein App-Worker beim normalen Website-Besuch;
   die Website-Budgets und der Betrieb ohne JavaScript bleiben gewahrt.
4. Browsertests für direkte App-Links, Zurück/Vorwärts, öffentliche
   Teilen-Links, Fokus, Dark Mode und mobile Ansichten.
5. Offline- und Updatetests: Kaltstart im Flugmodus, vollständige Navigation
   ohne Netz, unterbrochener Erstdownload, Speicherfehler, inkompatibles
   Schema, abgebrochenes Update und mehrere gleichzeitig offene Clients.
6. Prüfung auf echtem iPhone: Installation, Offline-Bereitschaft,
   Neustart, Medienhinweise, Update und Wiederherstellung nach Datenverlust.
7. Größenbericht mit separat komprimierten ausgelieferten Dateien,
   unkomprimierten Nutzdaten und tatsächlicher Speicherbelegung auf dem
   Gerät; Startzeit und Arbeitsspeicher werden ebenfalls erfasst.

## Alternativen und Neubewertung

| Alternative | Bewertung |
|---|---|
| Alle bestehenden HTML-Seiten offline speichern | Wenig zusätzlicher Renderer-Aufwand und hohe unmittelbare Funktionsgleichheit, aber ca. 17 MB Nutzdaten. Als einfachere Rückfalloption möglich, nicht mehr bevorzugt. |
| Separate JSON-App | **Gewählt:** ca. 5–6 MB Nutzdaten bei gleicher Inhaltsbasis. JavaScript-Rendering ist für diese App ausdrücklich erlaubt. |
| Öffentliche Website durch eine SPA ersetzen | Verworfen: unnötiger Verlust der HTML-/SEO-/No-JavaScript-Eigenschaften der öffentlichen Website. |
| Nativer Wrapper für die JSON-App | Optional bei späterem Bedarf an nativer Verteilung oder gebündelten Daten; erfordert einen zusätzlichen iOS-Build- und Verteilungsweg. Für das aktuelle Ziel nicht nötig. |
| YouTube-Medien lokal spiegeln | Nicht Bestandteil der Entscheidung. Zusätzliche Speicher- und Rechtefragen; Videos würden die Paketgröße wesentlich bestimmen. |
| ZIP-Export in die Dateien-App | Kein verlässlicher Ersatz für Web-App-Hosting und Service Worker auf iOS. |

## Konsequenzen

Die öffentliche Website behält ihre bisherigen Stärken. Die Offline-App
nutzt JSON und JavaScript ohne deren Einschränkungen zu übernehmen.
Gemeinsame Inhalte werden nur einmal pro App-Stand gespeichert, und die
600 Seiten sind Ansichten auf Daten statt 600 gespeicherte HTML-Dokumente.

Zusätzlich zu Export, Offline-Verwaltung und iOS-Prüfungen muss nun ein
App-Renderer gepflegt werden. Wiederverwendbare Logik reduziert diesen
Aufwand, ersetzt aber keine Tests auf funktionale Gleichheit. Die App
benötigt JavaScript; dies ist eine bewusste, nur für die App geltende
Entscheidung. Eine PWA bietet keine Garantie für dauerhaft unverlierbare
lokale Daten.

## Umsetzungsschritte

1. Gemeinsame Datenaufbereitung nach `src/content-data/` herauslösen und
   den bestehenden Website-Build darauf umstellen, ohne sein Verhalten zu
   ändern. Den Datenstand einmal laden und an beide Build-Ziele reichen;
   Architektur- und Regressionstests sichern diesen einzigen Ladeweg.
2. Versioniertes JSON-Schema und vollständigen normalisierten Export aus
   dem gemeinsamen Modell entwickeln; Größen- und Vergleichstests.
3. App-Hülle und browserfähigen Renderer unter `app/` ergänzen; Routing,
   bestehende Funktionen und öffentliche Teilen-Links abdecken.
4. Eigenes Manifest und Icons, App-Service-Worker sowie vollständigen,
   versionierten Offline-Download mit Status- und Fehleranzeige ergänzen.
5. Konsistente Updates, Neustart und gezieltes Löschen der App-Daten
   implementieren; Offline-Medienhinweise ergänzen.
6. Website-Einstieg, Datenschutz und Installationsanleitung ergänzen, ohne
   die App bei normalen Website-Besuchen automatisch zu laden.
7. Funktionsgleichheit, Paketgröße und Verhalten auf echtem iPhone prüfen.
