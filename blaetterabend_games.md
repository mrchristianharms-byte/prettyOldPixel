# Blätterabend: Spielebesprechungen aus Transkripten

Blätterabend-Videos können Sprungmarken zu einzelnen Spielebesprechungen
zeigen („Spielebesprechungen im Video“ im Videobereich der Ausgabenseite).
Diese Datei beschreibt den gesamten lokalen Ablauf vom YouTube-Transkript über
die Erkennung bis zur manuellen Freigabe der Spieltitel.
Die Verarbeitung läuft lokal, Modellanfragen gehen jedoch an den in `.env`
konfigurierten Anbieter. GitHub Actions baut nur aus den eingecheckten Dateien
und ruft weder YouTube-Untertitel noch ein Modell ab.

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

### Modellanbieter

Standardmäßig verwendet die Transkriptanalyse OpenRouters Auto Router. Er wählt
für jede Anfrage dynamisch ein Modell aus; die verwendete Modell-ID kann sich
zwischen Anfragen ändern.

1. Bei [OpenRouter](https://openrouter.ai/) anmelden und unter
   [Keys](https://openrouter.ai/settings/keys) einen API-Key erstellen.
2. Im Projektstamm die lokale `.env` öffnen oder neu anlegen. Diese Datei ist
   Git-ignoriert. Eine vorhandene `.env` ergänzen, nicht durch
   `.env.example` ersetzen.
3. Folgende Werte eintragen und `dein-openrouter-api-key` durch den eigenen
   Schlüssel ersetzen:

```dotenv
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=openrouter/auto
OPENAI_API_KEY=dein-openrouter-api-key
```

Die Variablennamen `OPENAI_*` werden vom OpenAI-kompatiblen API-Client des
Projekts verwendet; für OpenRouter müssen `OPENAI_BASE_URL` und
`OPENAI_MODEL` genau wie oben gesetzt sein. Der Schlüssel wird als Bearer-Key
gesendet. Keine Anführungszeichen um die Werte setzen und den Schlüssel weder
committen noch in Logs oder Chats kopieren. Kommentarzeilen, die mit `#`
beginnen, sind in `.env` erlaubt und werden ignoriert.

Das Analysescript lädt `.env` selbst; bereits in der Shell gesetzte
Umgebungsvariablen haben Vorrang. OpenRouter erhält die zur Analyse verwendeten
Transkriptinhalte. Router-Auswahl und verfügbare Modelle können wechseln,
Anfragen können anbieterabhängige Kosten verursachen.

`MODEL_REASONING_EFFORT` und `MODEL_MAX_OUTPUT_TOKENS` steuern das Modell
unabhängig vom API-Endpunkt. OpenRouter-Anfragen senden den Reasoning-Wert als
`reasoning.effort` und beginnen mit dem konfigurierten Ausgabelimit. Bei
abgeschnittenen Antworten versucht das Script es mit bis zu zwei verdoppelten
Limits erneut. Reasoning-Tokens zählen zum Ausgabelimit.

Der OpenRouter Auto Router akzeptiert diese normalen Chat-Completion-Parameter.
`reasoning.effort=low` ist jedoch nur wirksam, wenn das dynamisch gewählte
Modell Reasoning-Steuerung unterstützt; Auto kann auch ein Modell auswählen,
bei dem diese Einstellung nicht verfügbar ist. Das Kontextfenster kann bei
`openrouter/auto` nicht festgesetzt werden und hängt vom gewählten Modell ab.
Details und lokale Alternativen:
[Sprachmodell-Konfiguration](doc/README.md#sprachmodell-konfiguration).

Nach dem Speichern kann die Analyse eines Videos mit bereits gecachtem
Transkript gestartet werden:

```sh
npm run dev:generate:games-from-transcript -- <video-id>
```

Alternativ kann weiterhin ein lokales Ollama-Modell verwendet werden. Ollama
separat installieren, starten und das gewünschte Modell herunterladen:

```sh
ollama serve
# In einem zweiten Terminal:
ollama pull qwen3:14b
```

```dotenv
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
OPENAI_MODEL=qwen3:14b
OPENAI_API_KEY=
```

Für das lokale Modellprofil gelten dieselben modellbezogenen Variablen. Bei
Ollama wird `MODEL_REASONING_EFFORT=none` für qwen3 als `think: false`
übertragen; `MODEL_CONTEXT_TOKENS=32768` setzt das echte Kontextfenster über
die native lokale API. `MODEL_MAX_OUTPUT_TOKENS=4096` steuert das anfängliche
Ausgabelimit. Bei abgeschnittenen Antworten erhöht das Skript für den nächsten
Versuch Kontext- und Ausgabelimit.
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
| `dev:generate:games-from-transcript -- <video-id>` | Standardmäßig OpenRouter-API-Key in `.env`; alternativ laufendes lokales Ollama | Bereits gecachtes Transkript. OpenRouter erhält Transkriptinhalte und kann Kosten verursachen; mit Ollama bleibt die Analyse lokal. |
| `dev:evaluate:game-discussions -- <video-id> <ergebnis>` | Keine | Optional: vergleicht eine Analyse oder CSV offline mit einer manuell markierten Referenz. |

## Ablauf

```sh
# 1. Untertitel laden (alle Blätterabend-/Zeitschriftenvideos, einmalig je Video)
npm run dev:fetch:transcripts

# 2. Optional: Titelindex aus dem lokalen MobyGames-Dump bauen
npm run dev:build:game-title-index -- --input gdb.sql

# 3. Spielebesprechungen eines Videos erkennen (OpenRouter Auto oder lokales Ollama)
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
   Minuten. Je Fenster schlägt das konfigurierte Modell Besprechungen vor, ein
   zweiter Aufruf prüft sie (Quiz, Listen, eigene Spielberichte fallen weg).
   Ein Video mit gut zweieinhalb Stunden braucht mit lokalem `qwen3:14b` etwa
   1,5–2 Stunden; bei OpenRouter hängen Laufzeit und verfügbare Modelle vom
   Router und Anbieter ab. Nach einem Abbruch setzt derselbe Befehl beim
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
