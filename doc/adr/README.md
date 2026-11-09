# Architekturentscheidungen: verbindlicher Stand

ADR 0001 bis 0015 sind auf ausdrückliche Entscheidung des Auftraggebers
**abgeschlossen**. Ihre Architekturentscheidungen bleiben verbindlich, soweit
sie nicht durch eine spätere Entscheidung präzisiert oder ersetzt werden.

## Leseregeln und Abschluss

- Bei einem sachlichen Widerspruch hat die höhere ADR-Nummer Vorrang. Sie
  ersetzt nur die betroffene Regel, nicht automatisch die gesamte ältere ADR.
  Explizite Nachträge innerhalb einer ADR ersetzen deren frühere Aussagen zum
  selben Thema. Querverweise auf höhere Nummern ändern diese Reihenfolge nicht.
- Die Abschnitte zum aktuellen Regelstand in den einzelnen ADRs und dieser
  Index grenzen die heute geltenden Entscheidungen von der Historie ab.
- Datierte Bestandsaufnahmen, Testzahlen, Scanergebnisse und Messungen bleiben
  historische Nachweise. Sie sind weder aktuelle Produktionszahlen noch eine
  erneute Abnahme durch die Dokumentationsbereinigung.
- Frühere offene Umsetzungsschritte und Abnahmepläne sind keine offenen
  Abschlussbedingungen mehr. Noch nicht nachgewiesene Prüfungen werden als
  verbleibende Betriebsrisiken akzeptiert; optionale Erweiterungen sind nicht
  Bestandteil des abgeschlossenen Umfangs. Daraus folgt ausdrücklich nicht,
  dass jede früher geplante Funktion implementiert oder jede Prüfung bestanden ist.
- Eine Wiederaufnahme oder Erweiterung benötigt eine neue Entscheidung.
  Sicherheits-, Datenschutz- und rechtliche Betreiberpflichten bleiben bestehen.

## Übersicht und Vorrang

| ADR | Status | Verbindlicher Umfang und spätere Präzisierungen |
|---|---|---|
| [0001](0001-youtube-metadaten-ohne-offizielle-api.md) | Abgeschlossen | Anonymer, abhängigkeitsfreier Metadatenabruf als Grundlage. ADR 0010 präzisiert gezielte Playlist-Läufe; ADR 0013 dokumentiert zusätzlich den optionalen offiziellen API-Zugriff. Keine globale npm-Abhängigkeitsfreiheit. |
| [0002](0002-statische-seiten-seo-und-performance.md) | Abgeschlossen | Statisches Website-HTML, SEO, Budgets und progressive Verbesserung. ADR 0007 erlaubt die interaktive Spieltabelle, ADR 0009 die getrennte JSON-App, ADR 0011 Build-Abhängigkeiten und Agentenausgaben, ADR 0012 die Domain, ADR 0013 das Prozessskript und lokale Diagrammstyles, ADR 0014 Statistiken, ADR 0015 bestätigte Einzelspiele und re.consider-Detailseiten. |
| [0003](0003-seitenstruktur-und-inhaltszuordnung.md) | Abgeschlossen | Kuratierte Inhaltszuordnung und Entitätsseiten. ADR 0007 erweitert die Katalogzugänge, ADR 0010 ersetzt den pauschalen vollständigen Playlist-Folgelauf, ADR 0014 ergänzt Statistiken, ADR 0015 präzisiert Spielequalifikation und re.consider-Seiten. |
| [0004](0004-detailseiten-und-videonavigation.md) | Abgeschlossen | Gemeinsame Player und Videoabschnitte auf Entitätsseiten. Die unabhängigen re.consider-Detailseiten und parallele Wiedergabe sind nach ADR 0015 ausdrücklich erlaubt. |
| [0005](0005-wiederverwendbare-widgets-und-komponenten.md) | Abgeschlossen | Gemeinsame Widgets, Formatierung und Seitenkomposition. ADR 0009 grenzt Browserwiederverwendung in der App ab; ADR 0013 erlaubt gekapselte Diagrammstyles und das Prozessskript. |
| [0006](0006-spielemetadaten-aus-lokalem-games-dump.md) | Abgeschlossen | Dump als reguläre Faktenquelle; der explizite Steam-Nachtrag für Airships bleibt die eng begrenzte Ausnahme. ADR 0008 vereinheitlicht den Titelindex, ADR 0015 dokumentiert den erweiterten Import. |
| [0007](0007-kataloguebersichten-und-erweiterte-navigation.md) | Abgeschlossen | Kataloge, Kalender und progressive Spieltabelle. ADR 0014 ergänzt Statistiken; ADR 0015 erweitert deren Grundgesamtheit. |
| [0008](0008-transkripte-und-spieleabschnitte-in-blaetterabenden.md) | Abgeschlossen | Getrennte Quellen-, Analyse- und Veröffentlichungspipeline. Beliebige geeignete LLMs über OpenAI-kompatible APIs, lokal oder extern; keine Ollama-Pflicht. Veröffentlichung erst nach manueller Freigabe der gesamten Videoanalyse. |
| [0009](0009-offlinefaehige-web-app-fuer-iphone.md) | Abgeschlossen | Separate Offline-App aus demselben Inhaltsmodell. Historisch fehlende Geräte-/Speichermessungen sind akzeptierte Nachweisgrenzen, keine behaupteten Testerfolge. |
| [0010](0010-gezielter-playlist-abruf-nach-neuen-videos.md) | Abgeschlossen | Gezielte Playlist-Suche nach neuen Videos; vollständiger Abgleich bleibt gesondert möglich. |
| [0011](0011-agentenlesbare-inhalte-und-maschinenlesbare-zugaenge.md) | Abgeschlossen | Statisches Markdown, Agenteneinstieg und Read-only-API. Erfolgreicher iPhone-Test vom Auftraggeber bestätigt. Edge-Negotiation, Content Signals und externe Header-/Scan-Nachweise sind keine Abschlussbedingungen; keine Aktivierung wird behauptet. |
| [0012](0012-eigene-domain-mit-cloudflare-und-github-pages.md) | Abgeschlossen | Eigene Domain, GitHub Pages als Origin, Cloudflare als Proxy; vorhandene Cache-Regeln bleiben erhalten. Nicht separat belegte Dashboard-Einstellungen bleiben Betreiberverantwortung. |
| [0013](0013-statische-prozessseite-zur-entstehung-der-website.md) | Abgeschlossen | Gemeinsame Prozessdaten für HTML, App und Markdown; lokale SVG-Simulation ohne neue Netzwerkprozesse. Historische Deployment-Vorbehalte sind keine offenen Abschlussbedingungen. |
| [0014](0014-spielestatistiken-fuer-re-play.md) | Abgeschlossen | Buildzeit-Statistiken einschließlich Entwicklerdiagramm. ADR 0015 erweitert den zugrunde liegenden Spielekatalog; historische Zahlen bleiben Snapshots. |
| [0015](0015-re-consider-spiele-im-katalog.md) | Abgeschlossen | Bestätigte Ein-Video-Spiele über `confirmedSingle`; zeitlich begrenzte Ausnahme für neue bestätigte Playlist-Reihen bleibt erhalten. re.consider-Detailseiten bestehen unabhängig neben Spieleseiten. |

## Bestätigte Abnahme

Der Auftraggeber hat ADR 0011 auf einem echten iPhone erfolgreich getestet
und als „OK“ abgenommen. Gerätetyp, iOS-Version, einzelne Prüfschritte und
Messwerte wurden nicht angegeben. Diese Bestätigung wird nicht in einen
Nachweis für Content-Negotiation, Cloudflare-Header, externe Scanner oder die
vollständige Geräteprüfliste aus ADR 0009 umgedeutet.
