# Agentenregeln für Pretty Old Pixel

Diese Datei ist der gemeinsame, werkzeugunabhängige Einstieg für Coding-Agenten
wie GitHub Copilot und Rusty IDE. Sie gilt für das gesamte Repository.
Projektspezifische Regeln hier pflegen, nicht in mehreren IDE-Dateien kopieren.

## Vor jeder Änderung lesen

1. [Projekteinstieg](README.md) für Zweck und Bedienung.
2. [ADR-Index und verbindlicher Stand](doc/adr/README.md), anschließend die
   für die Aufgabe einschlägigen ADRs. ADR 0001–0015 sind abgeschlossen;
   ihre Entscheidungen bleiben verbindlich. Bei sachlichen Widersprüchen hat
   die höhere Nummer nur für die betroffene Regel Vorrang. Explizite Nachträge
   ersetzen frühere Aussagen innerhalb derselben ADR.
3. [Quellstruktur](doc/source-structure.md) und die betroffenen Module und Tests.
   [Funktionsreferenz](doc/README.md) beschreibt Datenformate und Abläufe.
4. Bei Website-UI-Änderungen zusätzlich die
   [UI-Komponentenregeln](.github/instructions/ui-components.instructions.md)
   lesen, auch wenn das Werkzeug deren `applyTo` nicht automatisch auswertet.

Der aktuelle ADR-Regelstand hat Vorrang vor älteren Statusangaben,
Bestandszahlen und pauschalen Aussagen in Übersichten. Historische Messungen
sind keine aktuellen Sollwerte oder erneut bestandenen Tests. Widersprüche
benennen, nicht stillschweigend eine neue Architektur daraus ableiten.
Abgeschlossene ADRs nicht als offene Aufgabenliste abarbeiten; Erweiterungen
oder abweichende Architekturentscheidungen mit dem Auftraggeber klären.

## Architektur und Zuständigkeiten

Pretty Old Pixel ist eine statische Katalogwebsite mit separater Offline-App
und maschinenlesbaren Ausgaben. Node.js-ES-Module bilden die Build- und
Datenpipeline; kein Browser-Framework oder Backend ohne neue Entscheidung.

```text
Abruf / redaktionelle Pflege → cache/ + src/data/
                            → src/content-data/: loadContentData
                            → HTML + Offline-App + Markdown/API
                            → gemeinsamer Build nach docs/
```

| Pfad | Zuständigkeit |
|---|---|
| `src/content-data/` | Ein gemeinsames validiertes Inhaltsmodell; Einstieg `content-data.mjs`. Keine Renderer-Abhängigkeit. |
| `src/site-generation/` | HTML-Website und Build-Orchestrierung in `generate-site.mjs`. `site-render.mjs` komponiert Seiten; `widget/` enthält wiederverwendbares Markup. |
| `src/app-generation/` | Separate JSON-App: `generate-app.mjs`, `app-model.mjs`, `app-views.mjs`, Browsercode, Player und Offline-Verwaltung. Nutzt das gemeinsame Modell, keinen eigenen Inhalts-Cache-Loader. |
| `src/ai-bot-generation/` | Markdown aus gerendertem HTML, `llms.txt`, öffentliche statische Read-only-API und API-Katalog. Keine zweite redaktionelle Datenhaltung. |
| `src/fetch-channel/` | YouTube-Videos und Playlists; zentrale Auswahl zwischen anonymem Abruf und offizieller API. |
| `src/fetch-magazine/` | Zeitschriftenarchive und vorbereitete Logos. |
| `src/fetch-game/` | Lokale Dump-, Titelindex- und Spielemetadaten-Pipeline; kein impliziter Internetabruf. |
| `src/extra-data/` | Transkriptabruf, getrennte LLM-Analyse und Blätterabend-Aufbereitung. |
| `src/data/` | Gepflegte Kataloge, bestätigte Zuordnungen, Referenzen und Freigaberegeln. |
| `src/shared/` | Gemeinsame Cache-, JSON-, HTTP- und weitere technische Hilfen. |
| `tests/` | Spiegelt die Fachverzeichnisse; `source-layout.test.mjs` prüft Struktur und CLI-Verträge. |
| `cache/` | Abgerufene und abgeleitete Daten; erforderliche fertige Caches werden teils versioniert. Nicht pauschal löschen oder ignorieren. |
| `doc/` | Projektdokumentation und ADRs, keine Websiteausgabe. |
| `docs/` | Generierte Veröffentlichung; nicht von Hand bearbeiten oder in neue Commits aufnehmen. |

Direkt unter `src/` bleiben nur die dünnen Hauptstarter `fetch-youtube.mjs`
und `generate-site.mjs`. Andere npm-Aufgaben starten ihre Fachmodule direkt.
Tests und Bibliotheken importieren Implementierungen, nicht die Starter.
CLI-Module müssen ohne Ausführung ihrer CLI importierbar bleiben.

## Welche ADRs sind relevant?

Die Links im [ADR-Index](doc/adr/README.md) führen zu allen Entscheidungen.

- **Abruf, Cache und Quellen:** 0001, 0006, 0008, 0010; offizielle
  YouTube-API und Veröffentlichungspipeline zusätzlich in 0013.
- **Website, Navigation und Komponenten:** 0002–0005, 0007; Prozessseite
  0013, Statistiken 0014, Einzelspiele und re.consider 0015.
- **Offline-App:** 0009; gemeinsame Komponenten 0005 und Prozessdaten 0013.
- **Markdown, Agentenzugang und öffentliche API:** 0011; gemeinsamer Build 0013.
- **Hosting und Auslieferung:** 0012; Discovery-/Edge-Grenzen zusätzlich 0011.

## Grenzen beibehalten

- **Offline-Build:** `generate:site` liest vorhandene lokale Daten. Es startet
  keine Scraper, Transkriptabrufe, Modellanfragen oder Bildkonvertierungen.
  Website, App und Agentenausgaben entstehen im gemeinsamen Staging;
  eine fehlerhafte Generierung darf die letzte erfolgreiche Ausgabe nicht zerstören.
- **Website und App unterscheiden:** Die öffentliche Website liefert Inhalte
  im HTML und bleibt ohne JavaScript benutzbar. JavaScript ergänzt gezielt.
  Die separate App darf JSON-Rendering und Hash-Routing verwenden. Ihr Service
  Worker bleibt auf `app/` begrenzt; normale Websitebesuche laden nicht die App.
- **Komponenten wiederverwenden:** Formatierung in `site-format.mjs`,
  Escaping/HTML-Hilfen in `site-html.mjs`, interne Videoziele in
  `site-video-links.mjs`, Markup in `widget/`, Auswahl und Komposition im
  Renderer. Widgets importieren nicht den Renderer. Browserwiederverwendung
  darf keine Node.js-/Build-Abhängigkeiten in die App ziehen.
- **Belege statt Erfindungen:** Originaltitel und Beschreibungen erhalten.
  Unbekannte Metadaten bleiben unbekannt; Playlistnamen, Modellkonfidenz
  oder ähnliche Titel sind keine automatische redaktionelle Freigabe.
  Spielemetadaten folgen der Dump-Pipeline und den ausdrücklich dokumentierten
  Ausnahmen. `confirmedSingle`, die zeitlich begrenzte Ausnahme für neue
  Reihen und unabhängige re.consider-Seiten nach ADR 0015 berücksichtigen.
- **LLMs sind nicht lokal beschränkt:** Geeignete Modelle über
  OpenAI-kompatible APIs dürfen lokal oder extern eingesetzt werden;
  Ollama und OpenRouter sind keine ausschließlichen Anbieter. Das ist eine
  Architekturfreigabe, kein Nachweis, dass jeder Endpunkt bereits implementiert
  ist. Konkrete Endpunktvalidierung und Konfiguration vor Änderungen prüfen.
  Transkriptquelle, Analyse und Veröffentlichung getrennt halten. Nur die
  manuell freigegebene gesamte Videoanalyse (`status: "reviewed"`) gelangt
  in den regulären Build; Vorschau ist keine Veröffentlichungsfreigabe.
- **Datenschutz und Sicherheit:** Bestehende Player-Freigabe, Autoplay-Grenzen
  und Rücksetzfunktionen erhalten. Externe Inhalte sicher escapen und URLs
  validieren. Keine Schlüssel, Header mit Zugangsdaten oder `.env`-Inhalte
  ausgeben oder versionieren; Variablen ohne Geheimnisse in `.env.example`
  dokumentieren. Kostenpflichtige Modellläufe, Datenübertragungen und
  Änderungen an Live-/Cloudflare-Konfiguration nicht beiläufig ausführen.
- **URLs und Verträge:** Relative interne Links, Canonicals, Sitemap,
  strukturierte Daten, öffentliche API-Versionierung und Build-Budgets
  erhalten. Bei Routen-/Datenformatänderungen alle drei Ausgaben und Tests prüfen.

## Arbeitsweise und Prüfung

- Vor dem Editieren Implementierung, Aufrufer, Tests und vorhandene Änderungen
  prüfen. Kleine auftragsbezogene Änderungen bevorzugen; fremde Arbeit nicht
  überschreiben. Keine unbeauftragten Refactorings oder Daten-Neuabrufe.
- Vorhandenen ES-Modul-Stil und Muster übernehmen. Neue Abhängigkeiten nur
  begründet; Build-Abhängigkeiten bedeuten keine Browser-Abhängigkeiten.
- Verhaltensänderungen mit passenden Tests absichern. Bei Verschiebungen auch
  Imports, npm-Targets, Dokumentationslinks und `applyTo`-Muster aktualisieren.
- Maßgeblich für Befehle sind [package.json](package.json) und
  [GitHub-Workflows](.github/workflows/). Node.js 22 oder neuer verwenden.

| Befehl | Verwendung |
|---|---|
| `npm ci` | Lokale Installation einschließlich Entwicklungsabhängigkeiten. |
| `npm test` | Produktive/CI-Testauswahl; nach Änderungen ausführen. |
| `npm run dev:test` | Vollständige lokale Suite, besonders für Archive, Spielemetadaten, Transkripte und CSS. |
| `npm run generate:site` | Gemeinsame Generierung und Buildvalidierung bei Änderungen an Datenmodell oder Ausgaben. Schreibt `docs/`. |
| `npm run dev:generate:css` | Nach Template-/Browserzustandsänderungen reduzierte Pico-Fassung aktualisieren und mit `dev:test` prüfen. |
| `npm run dev` | Lokale Vorschau aus `docs/`; generiert nicht neu. `npx` kann das Vorschaupaket herunterladen. |

Es gibt kein allgemeines `npm run build`, Typecheck- oder Lint-Target;
keine nicht vorhandenen Checks als ausgeführt melden. In Rusty verfügbare
Kontext-, Risiko- und Prüftools nutzen; diese Regeldatei setzt sie für andere
Agenten nicht voraus. `.rusty/guidelines/` enthält gegebenenfalls zusätzliche
Rusty-Prüfregeln. [`.clinerules`](.clinerules) enthält Cline-/RTK-spezifische
Ausführungsregeln, keine allgemeine Voraussetzung für npm oder andere IDEs.

Nach Änderungen Diff und betroffene Tests prüfen. Ergebnisse mit tatsächlich
ausgeführtem Befehl, Erfolg oder Fehler und verbleibenden Grenzen melden.
Lokale Tests ersetzen weder Live-Headerprüfungen noch echte Gerätetests.
Der bestätigte iPhone-Test aus ADR 0011 darf nicht als Nachweis aller
Prüfpunkte aus ADR 0009 ausgegeben werden.
