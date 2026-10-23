# Blätterabend: Spielebesprechungen aus Transkripten

Blätterabend-Videos können Sprungmarken zu einzelnen Spielebesprechungen
zeigen („Spielebesprechungen im Video“ im Videobereich der Ausgabenseite).
Diese Datei beschreibt den gesamten lokalen Ablauf vom YouTube-Transkript über
die Erkennung bis zur manuellen Freigabe der Spieltitel.
Alle Schritte bis zur Freigabe laufen lokal; GitHub Actions baut nur aus den
eingecheckten Dateien und ruft weder YouTube-Untertitel noch ein Modell ab.

- [Werkzeuge vorbereiten](#werkzeuge-vorbereiten)
- [Befehle](#befehle)
- [Ablauf](#ablauf)
- [Weiterführend](#weiterführend)

## Werkzeuge vorbereiten

### Transkript-Downloader `yt-dlp`

`yt-dlp` ist eine **System-/CLI-Abhängigkeit**, kein npm-Paket. Zum Beispiel
unter macOS mit bereits installiertem Homebrew:

```sh
brew install yt-dlp
yt-dlp --version
npm run dev:fetch:transcripts
```

Andere Plattformen und die je nach Installationsart benötigte Laufzeit
beschreibt die [yt-dlp-Installationsanleitung](https://github.com/yt-dlp/yt-dlp#installation).
Auch zusätzliche YouTube-Anforderungen, etwa an eine unterstützte
JavaScript-Laufzeit, richten sich nach der verwendeten yt-dlp-Version;
das Projekt installiert oder konfiguriert diese nicht selbst.

### Ollama und Modell

[Ollama](https://ollama.com/) separat installieren, starten und das konfigurierte
Modell einmalig herunterladen. Beispiel für die bisher verwendete Konfiguration:

```sh
ollama serve
# In einem zweiten Terminal:
ollama pull qwen3:14b
```

```dotenv
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
OPENAI_MODEL=qwen3:14b
```

Optional vergrößert `OLLAMA_NUM_CTX=32768` das Ollama-Kontextfenster über
die native lokale API; bei abgeschnittenen Antworten erhöht das Skript
für den nächsten Versuch Kontext- und Ausgabelimit.
[Konfiguration und Grenzen](doc/README.md#optional-größeres-ollama-kontextfenster).

### Titelindex aus dem MobyGames-Dump

Der Titelindex ist optional, verbessert aber die Erkennung. Er entsteht aus
dem lokalen, nicht eingecheckten `gdb.sql` und wird auch für die
Spielemetadaten genutzt
([Spielemetadaten aus dem lokalen Dump](README.md#spielemetadaten-aus-dem-lokalen-dump)):

```sh
npm run dev:build:game-title-index -- --input gdb.sql
```

## Befehle

| npm-Target | Programme / Dienste zusätzlich zu Node.js und npm | Netzwerk und lokale Daten |
|---|---|---|
| `dev:fetch:transcripts` | Aktuelles `yt-dlp` als ausführbares Programm im `PATH` | Lokale Katalogdaten zur Videoauswahl; YouTube-Metadaten über `yt-dlp`, Untertitel anschließend per Node-HTTP-Abruf. Kein Audio-/Videodownload. |
| `dev:build:game-title-index -- --input gdb.sql` | Keine | Derselbe Titelindex wie bei den Spielemetadaten; liefert Katalogkandidaten und Jahresprüfung. Offline. |
| `dev:generate:games-from-transcript -- <video-id>` | Laufender lokaler OpenAI-kompatibler Modellserver, derzeit Ollama mit `qwen3:14b` | Bereits gecachtes Transkript und lokale Modellgewichte; Analyse ausschließlich über einen Loopback-Endpunkt. Internet nur für die vorherige Installation bzw. den Modelldownload nötig. |
| `dev:evaluate:game-discussions -- <video-id> <ergebnis>` | Keine | Optional: vergleicht eine Analyse oder CSV offline mit einer manuell markierten Referenz. |

## Ablauf

```sh
# 1. Untertitel laden (alle Blätterabend-/Zeitschriftenvideos, einmalig je Video)
npm run dev:fetch:transcripts

# 2. Optional: Titelindex aus dem lokalen MobyGames-Dump bauen
npm run dev:build:game-title-index -- --input gdb.sql

# 3. Spielebesprechungen eines Videos erkennen (Ollama muss laufen)
npm run dev:generate:games-from-transcript -- <video-id>

# 4. Lokale Vorschau mit ungeprüften Vorschlägen
SHOW_UNREVIEWED_GAME_DISCUSSIONS=1 npm run generate:site
npm run dev                     # http://127.0.0.1:8000

# 5. Vorschläge in cache/game-discussions/<video-id>.json prüfen und freigeben

# 6. Kontrolle wie in GitHub Actions: nur freigegebene Abschnitte
npm run generate:site
npm run dev
```

1. **Transkript:** `dev:fetch:transcripts` benötigt `yt-dlp` und speichert
   öffentliche YouTube-Untertitel mit Zeitmarken unter
   `cache/youtube-transcripts/<video-id>.json`. Kein Audio-/Videodownload.
   Auch „keine Untertitel“ wird dauerhaft gespeichert; geprüfte Videos werden
   nie erneut angefragt.
   [Details und Cacheformat](doc/README.md#youtube-transkripte-einmalig-cachen).
2. **Titelindex (optional):** Mit `cache/game-title-index.json.gz` erhält das
   Modell je Abschnitt bis zu zehn Spieltitel aus dem Heftzeitraum als
   Namenshilfe (etwa „Felken“ → Falcon), und Spiele, die erst nach dem Heft
   erschienen sind, werden verworfen. Der Index enthält nur Spiele bis
   Erstjahr 2005; neuere Titel werden weder vorgeschlagen noch verworfen.
   Ohne Index läuft die Erkennung mit
   Warnung weiter.
   [Kandidaten und Jahresprüfung](doc/README.md#katalogkandidaten-und-jahresprüfung).
3. **Erkennung:** Das Script teilt das Transkript in Fenster von etwa drei
   Minuten. Je Fenster schlägt das lokale Modell Besprechungen vor, ein
   zweiter Aufruf prüft sie (Quiz, Listen, eigene Spielberichte fallen weg).
   Ein Video mit gut zweieinhalb Stunden braucht mit `qwen3:14b` etwa
   1,5–2 Stunden. Nach einem Abbruch setzt derselbe Befehl beim
   fehlgeschlagenen Fenster fort. Ergebnis ist
   `cache/game-discussions/<video-id>.json` mit `status: "needs-review"`.
   Eine vorhandene Analyse wird nie
   überschrieben; für einen Neulauf die Datei vorher woanders ablegen.
   [Analyse und Grenzen](doc/README.md#spielebesprechungen-aus-transkripten).
4. **Vorschau:** Nur mit `SHOW_UNREVIEWED_GAME_DISCUSSIONS=1` zeigt der Build
   auch ungeprüfte Abschnitte, mit dem Hinweis „Spielnamen und Zeitmarken
   können ungenau sein“. Am Ende listet der Build alle Seiten, auf denen
   ungeprüfte Sprungmarken stehen, mit lokaler Vorschau-URL, Video-ID,
   Anzahl und Videotitel:

   ```text
   SHOW_UNREVIEWED_GAME_DISCUSSIONS=1: 21 ungeprüfte Sprungmarken auf 1 Seite (Vorschau mit npm run dev):
     http://127.0.0.1:8000/zeitschriften/power-play/power-play-4-5-1988/
       63foHISC8ms: 21 ungeprüft · Blätterabendaufzeichnung PowerPlay - 4-5/1988 Teil 1
   ```

   Die Sprungmarken
   springen im aktivierten Player direkt zur Stelle, sonst öffnen sie YouTube
   mit Zeitmarke. So lässt sich jeder Vorschlag am Video prüfen.
5. **Freigabe:** Die Liste wird als Ganzes geprüft und freigegeben. In der
   Analyse-JSON Titel und Grenzen aller Abschnitte prüfen, falsche Abschnitte
   löschen, Titel korrigieren, die angezeigten Metadaten in Klammern
   (`firstYear`, `developers`, `publishers` aus dem Titelindex) mitprüfen und
   anschließend `"status": "needs-review"` auf
   `"status": "reviewed"` setzen. Ein Feld `reviewed` je Abschnitt gibt es
   nicht. Grenzen nur gemeinsam mit den Segment-IDs ändern, sonst bricht der
   Build ab.
   [Regeln für manuelle Änderungen](doc/README.md#vorschläge-prüfen-und-freigeben).
6. **Kontrolle und Commit:** Ohne Schalter erscheinen nur Analysen mit
   `"status": "reviewed"` – genau wie im Pages-Build. Die Liste ungeprüfter Seiten
   entfällt dann. `docs/` ist Git-ignoriert, eine
   Vorschau kann also nicht versehentlich veröffentlicht werden. Committen:
   `cache/youtube-transcripts/<video-id>.json` und
   `cache/game-discussions/<video-id>.json`; beide werden für den Build
   gebraucht. Fensterzwischenstände, Sperren und der Titelindex bleiben lokal.

## Weiterführend

Optional misst `dev:evaluate:game-discussions` eine Analyse gegen eine
manuell markierte Referenz (Präzision, Abdeckung, Grenzgenauigkeit).
[Referenzformat und Bewertung](doc/README.md#erkennung-gegen-eine-referenz-bewerten) ·
[ADR 0008: Entscheidung und Messergebnisse](doc/adr/0008-transkripte-und-spieleabschnitte-in-blaetterabenden.md).
