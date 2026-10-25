# ADR 0008: Transkripte und Spieleabschnitte in Blätterabenden

**Status:** Vorgeschlagen; Bestandsaufnahme und Zielarchitektur
**Datum:** 2026-10-22
**Entscheider:** Christian Harms
**Kontext:** Verlässliche Sprungmarken zu zusammenhängenden Spielebesprechungen.
**Grundlagen:** [ADR 0001: YouTube-Metadaten](0001-youtube-metadaten-ohne-offizielle-api.md),
[ADR 0003: Inhaltszuordnung](0003-seitenstruktur-und-inhaltszuordnung.md) und
[ADR 0004: Detailseiten und Videonavigation](0004-detailseiten-und-videonavigation.md)

## Kontext und Ziel

Blätterabend-Videos sind lange Gespräche beim Lesen einer Zeitschrift.
Videobeschreibungen enthalten häufig nur grobe Kapitel wie Intro, Vorgespräch
und Blätterabend. Besucher sollen zusätzlich gezielt zu den Abschnitten
springen können, die sich eindeutig und zusammenhängend auf ein konkretes
Spiel beziehen.

Gesucht werden **Spielebesprechungen, nicht sämtliche Spielnamen-Erwähnungen**.
Eine Quizantwort, eine Rangliste, ein Vergleich oder eine Begrüßung darf keine
Sprungmarke für ein vermeintliches Hauptspiel erzeugen. Derselbe Titel kann
nach einem Themenwechsel erneut besprochen werden; das sind getrennte Abschnitte.
Ein besprochenes Spiel muss nicht bereits im re.play-Spielekatalog existieren.

Die bisherige Erkennung ist nach praktischer Beobachtung noch unzuverlässig.
Es liegt für diese ADR keine quantitativ ausgewertete Referenzsammlung vor.
Vorhandene Tests prüfen vor allem Verarbeitung, Validierung und nachgebildete
Modellantworten; sie belegen keine ausreichende Erkennungsqualität eines
realen Modells auf dem gesamten Videobestand.

## Bestandsaufnahme der ersten Scripts

### 1. Öffentliche YouTube-Untertitel herunterladen

[`fetch-youtube-transcripts.mjs`](../../src/extra-data/fetch-youtube-transcripts.mjs)
wählt Blätterabend-/Zeitschriftenvideos aus dem normalisierten Katalog.
`yt-dlp` ermittelt die Untertitelspuren, anschließend wird die gewählte
JSON3-Spur direkt von YouTube geladen. Ein Audio- oder Videodownload findet
hierbei nicht statt.

Bevorzugt werden deutsche, danach englische Spuren; innerhalb dieser Gruppen
manuelle vor automatischen Untertiteln. Andere Sprachen sind als nachrangige
Auswahl möglich. Sprache und automatische Erzeugung werden gespeichert.
Das Script bewahrt Segmenttext, Startzeit und vorhandene Dauer in
`cache/youtube-transcripts/<video-id>.json`.

Vorhandene Cachedateien werden weiterverwendet. Fehlende öffentliche
Untertitel sind ein eigener Status, kein erfundenes leeres Transkript.
Abruf und Website-Build sind getrennt; YouTube-Sperren und Rate-Limits bleiben
ein Betriebsrisiko.

### 2. Hauptbesprechungen mit einem Sprachmodell erkennen

[`generate-games-from-transcript.mjs`](../../src/extra-data/generate-games-from-transcript.mjs)
analysiert ein bereits gespeichertes Transkript pro Aufruf:

- Segment-IDs entsprechen den Positionen im Originaltranskript.
- Kernfenster umfassen höchstens drei Minuten und können durch das
  Zeichenbudget kleiner werden. Bis zu 30 Sekunden Nachbarkontext je Seite
  werden innerhalb des Textbudgets ergänzt.
- Ein Modellaufruf schlägt Abschnitte vor. Ein zweiter prüft die Vorschläge
  auf Besprechung, Quiz, persönliche Rückblicke, Vergleiche oder Unsicherheit
  und kann Titel sowie Grenzen korrigieren.
- Das Modell liefert Segmentverweise statt selbst erfundener Zeitangaben.
  JSON-Struktur, Verweise und Fortsetzungskennzeichen werden validiert.
- Fensterübergreifende Vorschläge werden zusammengeführt. Ein späterer
  Wiedereinstieg in dasselbe Spiel bleibt nach Möglichkeit separat.
- Die bisherige Mindestdauer beträgt 30 Sekunden nach dem Zusammenführen.
  Konflikte und fehlende Grenzen werden gekennzeichnet.
- Katalogzuordnung erfolgt nur bei eindeutig normalisiertem Titel-/Aliasmatch.
  Ohne eindeutige Zuordnung bleibt `gameId` leer.
- Transkript-/Kataloghash, Analyseversion und Modellkonfiguration kennzeichnen
  Ergebnisse und wiederaufnehmbare Zwischenstände. Manuelle Änderungen
  werden nicht automatisch überschrieben.

**API-Abgrenzung:** Modellbezogene Einstellungen (`MODEL_REASONING_EFFORT`,
`MODEL_MAX_OUTPUT_TOKENS` und optional `MODEL_CONTEXT_TOKENS`) werden unabhängig
vom Endpunkt konfiguriert und in API-spezifische Parameter übersetzt. Der
Standardendpunkt ist OpenRouters Auto Router. Da Auto je Anfrage ein anderes
Modell auswählen kann, ist Reasoning-Unterstützung nicht garantiert; ein
festes Kontextfenster lässt sich dort nicht vorgeben. Bei einem lokalen
`/v1`-Endpunkt mit gesetztem `MODEL_CONTEXT_TOKENS` verwendet das Skript
Ollamas native `/api/chat`-API für `think`, `num_ctx` und `num_predict`.

### 3. Ergebnisse beim statischen Build einbinden

[`site-game-discussions.mjs`](../../src/content-data/site-game-discussions.mjs)
liest abgeschlossene Analysedateien aus
`cache/game-discussions/<video-id>.json`, prüft Transkriptbindung und
Zeit-/Segmentverweise und ergänzt das Videomodell.

Das [Besprechungs-Widget](../../src/site-generation/widget/game-discussions.mjs)
zeigt Spieltitel und Zeitbereich, dahinter Erscheinungsjahr, Entwickler
und Publisher aus dem Titelindex in Klammern, im jeweiligen Videopanel auf der
Ausgaben-/Videodetailseite. Startlinks verwenden die bestehende
Kapitelsteuerung; ohne aktivierte Player-Steuerung führen sie zu YouTube
mit Zeitparameter. Eine Endzeit ist derzeit Anzeige, keine automatische
Wiedergabegrenze.

**Qualitätslücke (inzwischen geschlossen, siehe Freigaberegel):** Ursprünglich
wurden sowohl `needs-review` als auch `reviewed` eingelesen und auch
ungeprüfte Abschnitte mit einem allgemeinen Warnhinweis angezeigt. Ein
vorhandener Status oder eine hohe Modell-Konfidenz war somit noch keine
inhaltliche Freigabe.

## Bewertung der dreistufigen Pipeline

**Die Trennung Abruf → Analyse → Generierung ist die richtige Grundlage.**
Sie hält Netzwerkzugriffe und variable Modelllaufzeiten aus dem Build heraus,
vermeidet wiederholte Downloads und erlaubt Modellvergleiche auf identischen
Quellen. Ergebnisse können geprüft werden, bevor sie veröffentlicht werden.

Nicht ausreichend ist dagegen die Annahme, dass Chunking, ein zweiter
Modellaufruf und gültiges JSON automatisch korrekte Abschnitte ergeben:

- Automatische Untertitel verwechseln Spieltitel, Sprecher und Plattformen.
- In kurzen Fenstern kann die Einführung eines Spiels fehlen. Grenzen an
  Fensterrändern sind nicht notwendigerweise Gesprächsgrenzen.
- Lange Prompts mit vielen Sonderfällen ersetzen keine belegte Evaluation.
- Zwei Aufrufe desselben Modells können dieselbe Fehlinterpretation bestätigen.
  Die zweite Prüfung sieht nur Vorschläge und kann vollständig übersehene
  Besprechungen nicht zuverlässig nachliefern.
- Exakte Titelnormalisierung vermeidet riskantes Fuzzy-Matching, kann aber
  Schreibvarianten desselben Spiels beim Zusammenführen verpassen.
- Lange Zeitspannen zwischen Untertiteln beweisen keine zusammenhängende
  inhaltliche Besprechung. Eine Mindestdauer allein genügt nicht.
- Englischsprachige oder andere Untertitel passen nicht ohne Weiteres zum
  derzeit deutsch ausgerichteten Analyseprompt.

## Vorgeschlagene Entscheidung

### Pipeline erhalten, Veröffentlichung um eine Freigabe ergänzen

Die drei technischen Schritte bleiben getrennt. Zwischen Analyse und
Veröffentlichung wird eine verbindliche Qualitätsprüfung vorgesehen:

```text
Öffentliche Untertitel → unveränderter Quellcache
    → Modellvorschläge + deterministische Validierung
    → Zusammenführen + Prüfung/Korrektur + Freigabe
    → freigegebener Ergebnisbestand → statischer Build → Sprungmarken
```

1. **Quellen bewahren:** Originalzeiten und Segmentbezüge bleiben maßgeblich.
   Bereinigungen dürfen die Rückverfolgbarkeit nicht zerstören. Sprache,
   Untertitelquelle und fehlende Daten bleiben explizit.
2. **Erkennung als Vorschlag behandeln:** Zuerst zusammenhängendes Hauptthema
   und Grenzen bestimmen, dann den belegten Spieltitel zuordnen. ASR-Korrekturen
   benötigen Kontextbelege. Ein Katalogtreffer ist eine Hilfe, kein Beweis.
3. **Grenzfälle gezielt erweitern:** Nur bei offenen Grenzen oder Konflikten
   zusätzlichen Nachbarkontext prüfen, statt pauschal jedes gesamte Video in
   einen immer längeren Modellprompt zu geben. Nicht zusammenhängende
   Wiederaufnahmen dürfen nicht verschmolzen werden.
4. **Freigabe pro Abschnitt:** Titel, Beginn, Ende und Quellenbeleg prüfen.
   Unklare Ergebnisse zurückstellen oder verwerfen. Fehlende Endzeiten nicht
   erfinden; für eine freigegebene Besprechung ist eine belegte Grenze nötig.
5. **Veröffentlichung strikt trennen:** Standardmäßig nur freigegebene
   Abschnitte anzeigen. Ungeprüfte Vorschläge höchstens in einer ausdrücklich
   aktivierten lokalen Vorschau darstellen, nicht als reguläre Sprungmarken.
   Der Build bleibt offline und führt keine Modellanfragen aus.

Diese Freigaberegel ist ein **Ziel**, noch nicht das aktuelle Verhalten.
Ein Review-Werkzeug und die Trennung von Vorschlags- und Veröffentlichungsdaten
sind als Folgeimplementierung erforderlich.

### Qualität vor flächendeckender Verarbeitung messen

Eine manuell annotierte Referenzsammlung soll unterschiedliche Magazine,
Gäste, Untertitelqualität, lange Besprechungen, Listen, Quiz, persönliche
Rückblicke und Fenstergrenzen enthalten. Zusätzlich bleiben einige Videos
als unabhängiger Prüfsatz von Promptanpassungen ausgeschlossen.

Zu messen sind:

- Präzision: Wie viele vorgeschlagene Abschnitte sind tatsächlich korrekt?
- Abdeckung: Wie viele echte Besprechungen werden gefunden?
- Spielidentität: Wie oft stimmt der konkrete Titel einschließlich Fortsetzung?
- Grenzen: Abweichung von Start und Ende in Sekunden; getrennt von der
  bloßen Frage, ob der Abschnitt zeitlich überlappt.
- Aufwand: Modelllaufzeit und menschliche Korrekturzeit je Videostunde.

Als erste, noch zu bestätigende Abnahmeziele gelten mindestens 95 Prozent
korrekte Spielidentitäten und Hauptthemen unter den Veröffentlichungskandidaten,
mindestens 80 Prozent Abdeckung sowie bei mindestens 90 Prozent der korrekt
erkannten Abschnitte Start-/Endabweichungen von jeweils höchstens 15 Sekunden.
Unklare Grenzen zählen nicht als Erfolg. Die bestehende 30-Sekunden-Regel
bleibt zunächst eine Produktauswahl und muss bei der Referenzannotation
mitberücksichtigt werden. Sie ist kein Qualitätsnachweis.

Bis diese Ziele auf dem unabhängigen Prüfsatz belegt sind, bleibt die
Veröffentlichung manuell freigegeben. Modell-Konfidenzen sind keine
kalibrierten Wahrscheinlichkeiten.

### Manuelles Copilot-Beispiel

Für das Transkript `cache/youtube-transcripts/63foHISC8ms.json` liegt ein
vom Nutzer bereitgestelltes [Copilot-Ergebnis als CSV](../examples/63foHISC8ms-copilot.csv)
mit 13 Spieleabschnitten vor. Die Angaben wurden unverändert übernommen:
`startMs` und `durationMs` sind Millisekunden, `spieletitel` ist der erkannte
Titel. Der verwendete Prompt ist unten unverändert dokumentiert. Das konkrete
Modell und die Vollständigkeit des tatsächlich verarbeiteten Kontexts sind
nicht dokumentiert. Der Prompt verlangt `gameTitle` als Spaltennamen; das
bereitgestellte CSV-Beispiel verwendet abweichend `spieletitel`.

#### Verwendeter Copilot-Prompt

```text
Du erhältst ein JSON-Transkript einer Audioaufnahme.

Die Datei enthält viele Segmente mit:
- startMs
- durationMs
- text

Aufgabe:

1. Rekonstruiere zunächst den vollständigen Gesprächsverlauf in zeitlicher Reihenfolge aus allen segments.text.

2. Analysiere anschließend den Gesprächsinhalt thematisch.

3. Identifiziere zusammenhängende Gesprächsabschnitte, in denen ausschließlich ein einzelnes Computerspiel besprochen wird.

Dabei gelten folgende Regeln:

- Ein Abschnitt darf aus beliebig vielen aufeinanderfolgenden Segmenten bestehen.
- Ein Spieltitel kann nur einmal erwähnt werden und danach implizit referenziert werden.
- OCR- oder Transkriptionsfehler bei Spieltiteln sollen, wenn eindeutig möglich, korrigiert werden.
- Reine Aufzählungen von Spielen zählen nicht.
- Kurze Erwähnungen eines Spiels zählen nicht.
- Wenn mehrere Spiele gleichzeitig verglichen oder diskutiert werden, ist der Abschnitt nicht gültig.
- Der Abschnitt endet beim Wechsel zu einem anderen Spiel oder einem anderen Hauptthema.

4. Berechne für jeden gültigen Spielabschnitt:
- startMs des ersten zugehörigen Segments
- durationMs vom ersten bis zum letzten Segment
- erkannten Spieltitel

5. Gib nur Abschnitte aus, die mindestens 30000 ms (30 Sekunden) dauern.

6. Ausgabe ausschließlich als CSV:

startMs,durationMs,gameTitle

Verwende keine zusätzlichen Erläuterungen.
```

Das Beispiel ist ein ungeprüftes Vergleichsergebnis, keine manuell bestätigte
Referenzannotation und keine Freigabe zur Veröffentlichung. Titel,
Gesprächsart, Zeitgrenzen und übersehene Besprechungen müssen noch am
Quelltranskript beziehungsweise Video geprüft werden. Die CSV wird nicht
automatisch in den Ergebnisbestand für den Website-Build importiert.

### Lokaler Vergleichslauf mit qwen3:14b

Für dasselbe Transkript wurde am 2026-10-22 die bestehende Fensteranalyse
(`analysisVersion` 3) lokal mit `qwen3:14b` über Ollamas OpenAI-kompatible
Schnittstelle ausgeführt. Quelle: automatische deutsche Untertitel,
3.775 Segmente, letzter Segmentstart bei etwa 2:32:10. Die Analyse umfasste
61 Fenster mit jeweils Erkennung und Kontextprüfung, etwa 1–3 Minuten je
Fenster. Das [lokale Ergebnis als CSV](../examples/63foHISC8ms-qwen3-14b.csv)
enthält 25 Vorschläge mit Status `needs-review`; eine leere Dauer bedeutet
`endMs: null`.

**Betriebserkenntnisse aus dem Lauf:**

- Ollama 0.40 ignorierte den Promptschalter `/no_think`. Der unsichtbare
  Denktext von qwen3 verbrauchte in einem Fenster das gesamte Ausgabelimit
  von 4.096 Tokens, die eigentliche Antwort blieb leer. Seitdem schaltet das
  Script den Denkmodus explizit im Request ab (`reasoning_effort: "none"`,
  native API `think: false`); ein Fenster benötigte danach etwa eine Minute.
- Die folgenden Wiederholungen scheiterten mit `fetch failed`. Wahrscheinliche
  Ursache ist das 300-Sekunden-Limit für Antwortheader in Nodes `fetch` bei
  nicht gestreamten Antworten. Die Fehlerdiagnose protokolliert die
  Netzwerkursache nun gesondert.
- Ein hart beendeter Lauf hinterließ eine verwaiste Sperrdatei, die vor dem
  Fortsetzen manuell entfernt werden musste. Die gespeicherten Fenster-
  Zwischenstände wurden korrekt weiterverwendet.
- Mehrere Fenster lieferten zunächst ungültige oder überlappende
  Segmentverweise bzw. unvollständige Prüfentscheidungen; die strikte
  Validierung erzwang erfolgreiche Wiederholungen.

**Vergleich nach zeitlicher Überlappung (beide Ergebnisse ungeprüft):**

| Kategorie | Anzahl | Titel |
|---|---:|---|
| Von beiden gefunden | 10 | Power at Sea (lokal „Seekriegssimulator“), Xenon, Morpheus (lokal „Morphous“), Hunter's Moon, Ball Raider, Tour de Force, Return to Atlantis, Ports of Call, Police Quest, Shadowgate |
| Nur Copilot | 3 | Thunder Cross, Black Lamp, Mandroid |
| Nur lokal | 15 | Populus, Labyrinth, Tetris, Carrier Command, Wasteland 3, The Train, Slagon, Starcreet, Jack the Ripper, Felken (2×), Stells Mission, Gunchip (2×), Doors Paradox |

Beobachtungen:

- Copilots Abschnitte liegen ausschließlich zwischen etwa 0:57:46 und 2:04:20.
  Für die erste Stunde und die letzten knapp 30 Minuten lieferte Copilot keine
  Abschnitte, das lokale Modell dagegen zehn. Das spricht dafür, das Video
  in diesen Bereichen gezielt zu prüfen und bei Ganztextanfragen die
  tatsächlich berücksichtigte Kontextlänge nicht vorauszusetzen.
- Bei gemeinsamen Treffern weichen die Startzeiten teils um mehr als
  15 Sekunden ab (z. B. Ball Raider etwa 15 s, Ports of Call etwa 44 s);
  drei lokale Abschnitte haben keine belegte Endzeit.
- Lokale Titel übernehmen häufiger ASR-Fehler oder Umschreibungen
  („Seekriegssimulator“, „Morphous“, „Starcreet“, „Stells Mission“,
  „Doors Paradox“). „Wasteland 3“ ist für ein Heft dieser Zeit
  unplausibel. Zweimal „Felken“ und zweimal „Gunchip“ direkt
  hintereinander deuten auf nicht zusammengeführte Fortsetzungen hin.
- Nur drei Vorschläge erhielten eine Katalogzuordnung (`gameId`).
- Die Modell-Konfidenz unterscheidet die Fälle kaum: 21 von 25 Vorschlägen
  sind `high`, darunter offensichtlich fragwürdige Titel.

Der Vergleich bestätigt keine der beiden Ausgaben als korrekt. Er zeigt
aber, dass sich Ganztext- und Fensteransatz in Abdeckung, Titelqualität und
Grenzen deutlich unterscheiden und eine manuell erstellte Referenz für dieses
Video der nächste notwendige Schritt ist.

### Referenzentwurf und erste Bewertung

Aus dem Transkript wurde ein Referenzentwurf
[`63foHISC8ms.json`](../../src/data/game-discussion-references/63foHISC8ms.json)
erstellt (Status `draft`, noch nicht am Video geprüft). Titel wurden anhand
des Kontexts korrigiert: „Felken“ = Falcon, „Stells Mission“ = Stealth
Mission, „Gunchip“ = Gunship, „Seekriegssimulator“/„Power C“ = Power at Sea
(Accolade). Populus und Labyrinth (Hinweise auf eigene Kanalfolgen)
sowie Wasteland 3 und „Doors Paradox“ (Plauderei über aktuelle Spiele) sind
verworfen. Thunder Cross (im Text eher „OPS“), Black Lamp, Mandroid und
„Starcreet“ sind als unklar markiert und werden nicht gewertet.

Vorläufiges Ergebnis von `npm run dev:evaluate:game-discussions`:

| Lauf | Präzision | Abdeckung | Grenzen ±15 s |
|---|---:|---:|---:|
| Copilot (Ganztext) | 100 % (10/10) | 56 % (10/18) | 50 % |
| qwen3:14b (Fenster) | 71 % (17/24) | 94 % (17/18) | 71 % |

Die Grenzen der Referenz stammen überwiegend aus dem lokalen Lauf; Abdeckung
und Grenzgenauigkeit des lokalen Laufs sind daher zu günstig. Abschnitte, die
beide Verfahren übersehen haben, fehlen im Entwurf möglicherweise. Die
Tendenz ist trotzdem klar: Der Ganztextaufruf ist präzise, lässt aber große
Teile aus; der Fensteransatz findet fast alles, übernimmt aber ASR-Titel,
Abschweifungen und Kanalhinweise.

### Neulauf mit Katalogkandidaten (Analyseversion 4)

Ergebnis: [`63foHISC8ms-qwen3-14b-v4.csv`](../examples/63foHISC8ms-qwen3-14b-v4.csv),
gleicher Referenzentwurf:

| Lauf | Präzision | Abdeckung | Grenzen ±15 s |
|---|---:|---:|---:|
| Copilot (Ganztext) | 100 % (10/10) | 56 % (10/18) | 50 % |
| qwen3:14b v3 (Fenster) | 71 % (17/24) | 94 % (17/18) | 71 % |
| qwen3:14b v4 (Fenster + Katalog) | 60 % (12/20) | 67 % (12/18) | 50 % |

Was besser wurde:

- Titel: ASR-Schreibweisen sind fast verschwunden: Falcon und Gunship statt
  „Felken“ und „Gunchip“; einzig „Slagon“ blieb (in der Bewertung als
  Slaygon gezählt).
- Doppelte Fehltreffer („Felken“/„Gunchip“ neben dem korrekten Titel) und
  Populus entfallen. Doors Paradox (2021) wurde durch die Jahresprüfung
  verworfen.

Was schlechter wurde:

- Tetris, Power at Sea, Jack the Ripper fehlen. Morpheus und Shadowgate
  wurden mit späterem Beginn erkannt und zählen deshalb als Fehl- und
  Falschtreffer zugleich. Tour de Force wurde als „Mandroid“ benannt.
- Wasteland 3 wurde zu „Wasteland“ (1988) normalisiert und besteht damit
  die Jahresprüfung. Die Katalogschreibweise kann einen Fehler also auch
  plausibel machen.
- Labyrinth (Kanalhinweis) bleibt ein Fehltreffer.

Einordnung: Ein einzelner Lauf eines 14B-Modells streut stark. Der v3-Lauf
hat zudem die Referenzgrenzen geprägt und ist deshalb begünstigt. Die
Katalogkandidaten lösen das Namensproblem, nicht das Abdeckungsproblem.
Der Rückgang der Abdeckung ist erst nach bestätigter Referenz und einem
Wiederholungslauf belastbar zu bewerten.

Robustheit: Der Lauf brach mehrfach an Modellantworten ab, die das Modell
trotz Rückmeldung nicht korrigierte: fehlende Entscheidung, verschachtelter
Nebentreffer, teilweise Überschneidung und ein Belegsegment direkt neben dem
Abschnitt (Off-by-one). Daraufhin werden:

- Vorschläge mit `candidateIndex` als `proposals` übergeben;
- vollständig verschachtelte Nebentreffer verworfen (protokolliert);
- bei teilweiser Überschneidung der frühere Abschnitt vor dem späteren
  beendet (`next-game`);
- Abschnitte um ein direkt angrenzendes Belegsegment erweitert (protokolliert).

## Umsetzungsstand

Umgesetzt:

- **Freigaberegel:** Der Build veröffentlicht nur Analysen mit
  `status: "reviewed"`; die manuelle Prüfung umfasst immer die ganze Liste
  eines Videos, daher gibt es kein Prüffeld je Abschnitt mehr. Ungeprüfte
  Vorschläge erscheinen nur in einer lokalen Vorschau mit
  `SHOW_UNREVIEWED_GAME_DISCUSSIONS=1`.
- **Streaming und Denkmodus:** Modellantworten werden gestreamt, der
  Denkmodus von qwen3 ist abgeschaltet. Fehlerdiagnosen nennen Denktext-Länge
  und Fehlerursache.
- **Zusammenführung:** Angrenzende Abschnitte desselben Spiels (gleiche
  Katalog-ID oder normalisierter Titel) werden vereinigt. Für die vorhandene
  Analyse von 63foHISC8ms greift das erst nach einem Neulauf.
- **Bewertung:** `src/extra-data/evaluate-game-discussions.mjs` vergleicht
  Analyse-JSONs und CSVs mit einer Referenz.

- **Titelindex:** `npm run dev:build:game-title-index -- --input gdb.sql`
  erzeugt aus dem MobyGames-Dump `cache/game-title-index.json.gz` (gzip,
  rund 61.000 Spiele mit Erstjahr bis 2005 oder unbekannt; MobyGames-ID,
  Alternativtitel, Genres, erstes Erscheinungsjahr und Releases; Plattformen
  und Firmen werden aus den Releases abgeleitet) und
  `cache/game-platform-index.json` (Plattformnamen zu den Nummern). Derselbe
  Index ist seit Version 3 auch die einzige Quelle des Spielemetadaten-Imports
  (ADR 0006); `gdb.sql` wird nur noch beim Indexbau gelesen. Seit Version 4
  fehlen neuere Spiele: Das spart rund 95 % Platz (88 MB → 4 MB), dafür
  kann die Jahresprüfung im Video erwähnte Spiele nach 2005 nicht mehr
  verwerfen. Katalogspiele nach 2005 bekommen ihre Dump-Daten aus
  `src/data/data-game-dump-manual.json` (ADR 0006).
- **Heftzeitraum:** Kandidaten stammen nur aus drei Jahren vor bis einem Jahr
  nach dem Heftjahr (63foHISC8ms, Power Play 1988: 1985–1989, rund 8.200
  Spiele). Eine Plattformeingrenzung entfällt vorerst, weil viele Hefte
  mehrere Systeme abdecken.
- **Kandidatensuche ohne Sprachmodell:** exakte n-Gramme plus Kölner
  Phonetik („Felken“ = Falcon, „Gunchip“ ≈ Gunship, „Slagon“ = Slaygon),
  gestützt durch Herstellernennungen in der Nähe. Lautvergleich nur bei
  großgeschriebenen, über alle Transkripte seltenen Wörtern. Reine
  Dokumenthäufigkeit trennt ASR-Fehlschreibungen nicht von Alltagswörtern
  („felken“ steht in 10 von 38 Transkripten).
- **Kandidaten im Prompt:** Jedes Fenster erhält die zehn besten Kandidaten
  als Namenshilfe. Das Modell darf auch andere Titel nennen, aber keinen
  Kandidaten nur wegen des Klangs wählen. Gemessen am Referenzentwurf stehen
  16 von 18 Spielen unter den Top 10 ihres Startfensters. Es fehlen Power at
  Sea (Transkript „Power C das“) und Return to Atlantis (erste Nennung erst
  im Folgefenster).
- **Jahresprüfung:** Abschnitte, deren Titel im Index nur nach Heftjahr + 1
  erschienen ist, landen in `discarded`. Titel ohne Indexeintrag erhalten das
  Issue `not-in-title-index`.
- **Analyseversion 4:** Die Kandidatenquelle (Index-Hash und Jahresfenster)
  gehört zur Identität der Zwischenstände.

Bewusst nicht umgesetzt: **ankerbasierte Fenster** um Kandidaten. Die
festen Fenster bleiben, weil sie lückenlose Abdeckung garantieren (Power at
Sea hat keinen erkennbaren Titelanker) und Läufe fortsetzbar halten. Die
Anker gehen stattdessen als `segmentIds` der Kandidaten an das Modell.

Offen:

1. Referenz von 63foHISC8ms am Video bestätigen (`status: "confirmed"`).
2. v3- und v4-Lauf gegen die bestätigte Referenz neu bewerten, v4 einmal
   wiederholen, um die Streuung abzuschätzen.
3. Kanalhinweise (Labyrinth, Populus) und Normalisierungen auf einen
   älteren Vorgänger (Wasteland 3 → Wasteland) gezielt im Prompt bzw. per
   Abgleich mit dem gehörten Text (Ziffern) abfangen.
4. Erst danach auf weitere Videos ausweiten.

## Alternativen

| Alternative | Vorteil | Grenze / Entscheidung |
|---|---|---|
| Vorhandene Kapitel oder manuell gepflegte Zeitmarken | Geringster Aufwand bei bereits belegten Spielkapiteln; präzise korrigierbar | Zuerst nutzen, wenn vorhanden; grobe Kapitel ersetzen die Spielsegmentierung nicht. Unterschiedliche Herkunft kenntlich machen. |
| Titel-/Aliaslisten, reguläre Ausdrücke oder Fuzzy-Suche | Lokal, günstig und nachvollziehbar | Geeignet für Kandidaten und Namenshilfen; erkennt weder Hauptthema noch Gesprächsgrenzen. Nicht auf den re.play-Katalog beschränken. |
| Hybrid: einfache Kandidatensuche plus kontextuelle Modellprüfung | Weniger Modellarbeit, gute Namenshilfen möglich | Kandidatensuche kann ASR-Fehler übersehen; muss auf Abdeckung geprüft werden und darf keine ausschließlich harte Titelvorauswahl sein. |
| Gesamtes Transkript in einem Long-Context-Aufruf | Weniger künstliche Grenzen, globaler Kontext | Kontextkosten, Auslassungen und ungenaue Segmentgrenzen bleiben; gegen Fensteransatz messen, nicht pauschal als besser annehmen. |
| Themenwechsel über Embeddings / Textsegmentierung | Modellunabhängige Hinweise auf Themenblöcke | Gleiche Domäne und Abschweifungen erschweren Grenzen; Spielidentität und Besprechungsart bleiben zusätzliche Aufgaben. Als Hilfssignal erproben. |
| Lokale Spracherkennung aus Audio | Alternative bei fehlenden oder unbrauchbaren Untertiteln | Zusätzlicher Download, Rechenaufwand und ASR-Fehler; nur bei zulässigem Medienzugriff und als gesonderter, nachvollziehbarer Quellpfad. Kein automatisches Umgehen von Zugriffsbeschränkungen. |
| OCR / visuelle Erkennung der gezeigten Heftseiten | Kann Spieltitel und Seitenwechsel stützen | Videodownload und Bildverarbeitung aufwendig; sichtbare Seite ist nicht zwingend Gesprächsthema. Spätere Ergänzung, nicht Voraussetzung. |
| Externer Modellanbieter | Möglicherweise andere Modellqualität und weniger lokale Hardware | Keine garantierte Verbesserung; Datenübertragung, Berechtigung und Kosten gesondert entscheiden. Aktuell technisch gesperrt und nicht nötig. |
| Vollständig manuelle Kapitelpflege | Hohe kontrollierbare Qualität für wenige Videos | Hoher Arbeitsaufwand; sinnvoll als Referenz und Rückfalloption. |

Empfohlen ist zunächst **bestehende Untertitel + lokale Fensteranalyse +
gezielte Grenzprüfung + menschliche Freigabe**. Kandidatensuche und größere
Kontextfenster sind vergleichbare Optimierungen, keine neue Gesamtarchitektur.
Eigene ASR und visuelle Analyse sind erst nach Messung der verbleibenden
Fehlerursachen gerechtfertigt.

## Folgen und nächste Schritte

- Keine Modell- oder Transkriptanfragen beim Seitenaufruf oder Website-Build.
- Keine Übermittlung von Transkripten an externe Modellanbieter.
- Wiederverwendbare Quellcaches und versionierte Ergebnisse bleiben erhalten.
- Ein technisch gültiger Datensatz wird nicht mit einem inhaltlich geprüften
  gleichgesetzt; Präzision hat vor möglichst vielen Sprungmarken Vorrang.
- Zuerst Referenzsammlung und Review-Ablauf etablieren, danach Kandidaten,
  Kontextlänge und Modelle vergleichen. Erst dann breiter verarbeiten.
- Ungeprüfte Anzeigen sind durch die Freigaberegel aus der regulären
  Ausgabe genommen.
- Bestehende Analysedateien und Videozuordnungen bleiben unverändert. Neue Spiel–Zeitschriften-Kataloglinks sind nicht
  Voraussetzung für die hier beschriebenen Sprungmarken.

## Referenzen zur Umsetzung

- [Transkript-Downloadtests](../../tests/fetch-youtube-transcripts.test.mjs)
- [Analyse- und Zusammenführungstests](../../tests/generate-games-from-transcript.test.mjs)
- [Einbindung und Sprungmarkentests](../../tests/site-game-discussions.test.mjs)
- [Bewertungstests](../../tests/evaluate-game-discussions.test.mjs)
- [Titelindex- und Kandidatentests](../../tests/transcript-game-candidates.test.mjs)
- [Katalogkandidaten und Jahresprüfung](../README.md#katalogkandidaten-und-jahresprüfung)
- [Transkript-Abruf und Quellformat](../README.md#youtube-transkripte-einmalig-cachen)
- [Analysebefehl und Ergebnisformat](../README.md#spielebesprechungen-aus-transkripten)
