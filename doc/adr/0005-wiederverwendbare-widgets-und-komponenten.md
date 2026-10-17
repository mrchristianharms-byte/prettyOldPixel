# ADR: Wiederverwendbare Widgets und Komponenten

**Status:** Angenommen
**Datum:** 2026-10-17
**Entscheider:** Christian Harms
**Grundlagen:** [ADR 0002](0002-statische-seiten-seo-und-performance.md),
[ADR 0003](0003-seitenstruktur-und-inhaltszuordnung.md) und
[ADR 0004](0004-detailseiten-und-videonavigation.md)

## Kontext

Die Website besitzt unterschiedliche Seitentypen: Startseite, News,
Spielekatalog und Spielinformationen, Zeitschriften mit Jahrgängen und
Heftausgaben sowie Hardware, Retrospektiven und Interviews.
Diese Seiten dürfen individuell aufgebaut sein. Viele ihrer Bestandteile
erfüllen jedoch dieselbe Aufgabe: Navigation, Informationsanzeigen,
Videoeinbindung und Listeneinträge.

Wenn solche Bestandteile je Seite eigenes Markup erhalten, entstehen
abweichende Darstellung, Beschriftung, Bedienung und Barrierefreiheit.
Korrekturen müssen mehrfach vorgenommen werden und erreichen möglicherweise
nicht alle Seiten.

## Entscheidung

### 1. Gemeinsame Bestandteile sind zwingend Widgets

Wiederverwendbare UI-Bestandteile werden als zentrale Widgets bzw.
Komponenten in ES-Modulen unter **`src/widget/`** definiert.
Alle betreffenden Seiten müssen diese Implementierung verwenden.
Das gilt insbesondere für:

- Navigation, beispielsweise Seitennavigation und Folgenlisten.
- Informationsanzeigen, beispielsweise Metadaten und Archivverweise.
- Videoeinbindung mit Vorschau, Hinweisen und Bedienelementen.
- Wiederkehrende Listen- und Katalogeinträge.

Eine individuelle Seitengestaltung rechtfertigt keine Kopie eines bereits
vorhandenen Widgets. Neue wiederkehrende Bestandteile werden vor ihrer
Mehrfachverwendung extrahiert. Bestehende zentrale Layout-Bestandteile
wie Hauptnavigation und Brotkrümel sollen bei ihrer weiteren Modularisierung
ebenfalls in diesem Ordner liegen, nicht als seitenspezifische Varianten.

### 2. Seitenkomposition bleibt im Renderer

Der Seitengenerator bestimmt weiterhin Auswahl, Reihenfolge, Gruppierung,
Seitennummerierung, Routen und den fachlichen Kontext der Inhalte.
Widgets erhalten die dafür vorbereiteten Daten und erzeugen das gemeinsame
HTML. Widgets dürfen andere Widgets zusammensetzen.

Notwendige Varianten werden ausdrücklich und überschaubar über Parameter
abgebildet, etwa Archivlinks als Liste oder inline sowie unterschiedliche
Überschriftenebenen. Es entsteht kein universelles Widget mit beliebigen
Layout- und Verhaltensschaltern.

### 3. Gemeinsame Hilfen und bestehendes Verhalten bleiben erhalten

- HTML-Escaping und externe Links kommen aus `src/site-html.mjs`.
- Datums- und Laufzeitformatierung kommen aus `src/site-format.mjs`.
- Interne Video- und Themenverweise kommen aus `src/site-video-links.mjs`.
- Widgets importieren nicht den Seitengenerator; zyklische Abhängigkeiten
  sind zu vermeiden.
- Styles bleiben in `src/site.css`, Browserinteraktion in
  `src/video-series.js`. Die Widget-Module laufen ausschließlich beim Build.
- Eine Extraktion ändert nicht nebenbei HTML, Linkziele, zugängliche
  Beschriftungen, Datenschutzverhalten oder JavaScript-Anknüpfungspunkte.
- Es werden dafür keine zusätzlichen Browser-Skripte oder Abhängigkeiten
  eingeführt.

## Bereits vorhandene Widgets

Stand dieser Entscheidung:

| Modul unter `src/widget/` | Exporte | Aufgabe und Einsatz |
|---|---|---|
| `navigation.mjs` | `navigation` | Gemeinsame Hauptnavigation aller Seiten mit relativen Links und aktivem Bereich; Auswahl und Reihenfolge der Einträge kommen aus dem Renderer. |
| `video.mjs` | `videoWidget`, `playerPoster` | Gemeinsamer Player mit Aktivierungsvorschau, Statushinweisen und Steuerzeile auf Spiel- und Heftausgabenseiten; Vorschau auch beim Folgenwechsel. |
| `episode-list.mjs` | `episodeList` | Eigenständig scrollbar dargestellte Folgenliste mit Fragmentlinks, Datum, Laufzeit und optionalem Spielabschnitt bzw. Reihenbezug. |
| `catalog-grid.mjs` | `catalogGrid` | Einheitliches responsives Katalograster für Spiele und Zeitschriften mit Titelverweisen und getrennten Faktenzeilen. |
| `metadata.mjs` | `metadata` | Semantische Metadatenliste für Spiel-, Heft- und Videoinformationen. |
| `video-entry.mjs` | `videoListEntry`, `videoList` | Beiträge und Listen für News, Hardware, Retrospektiven, Interviews, Sonstiges sowie Zeitschriften und Jahrgänge: Titel über die volle Breite, darunter Thumbnail links und linksbündige Informationen rechts daneben. Optionaler Ausgabenkontext und Teilnummer erhalten die passenden Videoziele. |
| `pagination.mjs` | `pagination` | Vorherige/nächste Übersichtsseite, aktuelle Seitenzahl und aufklappbare Liste aller Seiten. |
| `archive-links.mjs` | `archiveLinks` | Einheitliche Archivordner-, Lese- und Downloadlinks mit Symbolen, als Inline-Gruppe oder Liste sowie Hinweis bei fehlendem Archiv. |
| `video-panel.mjs` | `videoPanel`, `descriptionHtml` | Videoinformationen einschließlich Metadaten, Kapiteln, erwähnten Kanälen, Beschreibung, Zeitschriftenverweisen und Navigation zu benachbarten Teilen. |
| `game-discussions.mjs` | `gameDiscussions` | Erkannte Spielnamen und Zeitbereiche auf Blätterabend-Ausgabenseiten mit Prüfhinweis und Sprungmarken über die gemeinsame Kapitelsteuerung. |
| `magazine-logo.mjs` | `magazineLogo` | Lokales Zeitschriftenlogo mit Alternativtext und Quellenlink auf Zeitschriftenseiten. |

`descriptionHtml` ist ein Formatierungshelfer innerhalb des
Videoinformationsmoduls und bleibt zur Kompatibilität auch aus
`src/site-render.mjs` exportiert.

## Prüfung

- Widget-Tests prüfen Markup, sicheres Escaping, Varianten und Leerzustände.
- Seitentests prüfen den tatsächlichen Einsatz in allen betroffenen Seitentypen.
- Bei reinen Extraktionen soll ein Vorher-/Nachher-Vergleich bestätigen,
  dass das erzeugte HTML unverändert bleibt.
- Der bestehende Build prüft weiterhin interne Links, Fragmente,
  strukturierte Daten und Größenbudgets.

## Konsequenzen

Korrekturen an gemeinsamen Komponenten wirken zentral auf alle nutzenden
Seiten. Darstellung, Bedienung und Barrierefreiheit bleiben konsistent,
während die Seiten ihre individuelle Zusammenstellung behalten.
Der Renderer wird übersichtlicher und die Komponenten sind isoliert testbar.

Änderungen an einem Widget betreffen bewusst mehrere Seitentypen und müssen
entsprechend breit geprüft werden. Rein einmalige Seiteninhalte müssen
nicht künstlich in Kleinstkomponenten zerlegt werden; wiederverwendbare
Bestandteile dürfen dagegen nicht erneut direkt im Renderer implementiert
werden.
