---
description: "Regeln fuer kompakte UI-Komponenten: Kacheln, Metadaten, Datumsangaben, Laufzeiten und Mengenangaben."
applyTo: "src/site-generation/**/*.mjs,src/site-generation/site.css,src/generate-site.mjs,tests/site-*.test.mjs,tests/generate-site.test.mjs"
---

# Kompakte UI-Komponenten

- Wiederverwendbare HTML-Widgets unter `src/site-generation/widget/` als ES-Module definieren
  und im Seitengenerator importieren, nicht dort erneut implementieren.
  `video.mjs`, `episode-list.mjs`, `catalog-grid.mjs`, `metadata.mjs`, `video-entry.mjs`,
  `pagination.mjs`, `archive-links.mjs`, `video-panel.mjs`, `navigation.mjs`
  `game-discussions.mjs` und `magazine-logo.mjs`
  sind die gemeinsamen Komponenten. Escaping/Links aus `src/site-generation/site-html.mjs`
  und Datums-/Laufzeitformatierung aus `src/site-generation/site-format.mjs` wiederverwenden.
  Interne Video- und Themenlinks aus `src/site-generation/site-video-links.mjs` wiederverwenden.
  Widgets duerfen nicht den Renderer importieren; keine zyklischen Abhaengigkeiten.
  News, Hardware, Retrospektiven, Interviews, Sonstiges sowie Zeitschriften-
  und Jahrgangslisten setzen pro Beitrag
  `videoListEntry` ein. Seitenspezifische Auswahl, Reihenfolge und Gruppierung
  bleiben im Renderer; Eintragsmarkup nicht je Seitentyp duplizieren.
  In Zeitschriftenlisten Ausgabenkontext und Teilnummer an das Widget
  uebergeben; Titel und Thumbnail muessen zur jeweiligen Ausgabe fuehren.
  Im Eintrags-Widget den Titel ueber die volle Breite darstellen. Darunter
  eine kleine verlinkte 16:9-Vorschau links und Datum, Kategorie und Beschreibung
  rechts daneben mit linksbuendiger Textausrichtung darstellen.
  Thumbnail und Titel haben dasselbe Ziel. Bildmasse
  reservieren, Lazy Loading verwenden und externe Bildabrufe in den
  Datenschutzhinweisen beschreiben.
- Mengen sprachlich korrekt anzeigen: `1 Video`, `0 Videos`, `2 Videos`;
  `1 Jahrgang`, `0 Jahrgänge`, `2 Jahrgänge`. Gemeinsame Formatierungshelfer
  verwenden; die Regel gilt auch fuer Listen, Detailseiten und Metadaten.
- Auf allen Seiten Datumsangaben ohne sichtbare Zeitzone darstellen:
  keine Zusaetze wie `Europe/Berlin`, `UTC`, `MEZ`, `MESZ`, `GMT`,
  `Z` oder numerische UTC-Offsets an Datumsanzeigen anhaengen.
  Das betrifft Startseite, Uebersichten, Kacheln, Listen und Detailseiten.
- Video-Veröffentlichungen als `23.11.2016, 18:42` in `Europe/Berlin`
  berechnen; die zugrunde liegende Zeitzone nicht aendern.
  `Uhr` nicht sichtbar anhaengen.
  In der schmalen Folgenliste reicht `23.11.2016`.
  ISO-Zeitstempel in `time[datetime]` und strukturierten Daten beibehalten.
- Einzelvideo-Laufzeiten sekundengenau als `15:29` bzw. `1:15:29` anzeigen.
  Datum und Laufzeit durch ` · ` trennen.
- Gesamtlaufzeiten erst summieren, dann auf volle Minuten runden
  (ab 30 Sekunden aufwaerts). Format: `2:13 h`, `0:45 h`, `26:01 h`.
  Minuten immer zweistellig; Stunden nicht auf 24 begrenzen.
- Fehlende Metadaten nicht erfinden. Unbekannte Laufzeiten und bekannte
  Teilsummen weiterhin eindeutig kennzeichnen.
- In Spiele- und Zeitschriftenkacheln jeden Fakt in einer eigenen kompakten
  Zeile darstellen; keine mit Mittelpunkten verbundenen Faktenketten.
  Die Jahrgangsanzahl nur bei mindestens einem bekannten Heftjahr anzeigen.
  `0 Jahrgänge` weglassen: Fehlende Heftjahre bedeuten nicht, dass keine
  Jahrgänge existieren. Video- und Aufnahmedaten nicht als Heftjahr verwenden.
- Kleine gemeinsame Ueberschriften beibehalten; Spielkacheltitel duerfen noch
  kleiner sein. Raster responsiv mit einer bis fuenf Spalten, ohne horizontalen
  Ueberlauf und mit mindestens 16 Pixeln seitlichem Seitenabstand.
- Formatierung zentral im Renderer halten. Tests fuer Einzahl, Mehrzahl,
  Nullwerte, Minutenuebertraege und Berliner Sommer-/Winterzeit pflegen.
- Player-Einstellungen (Aktivierung zuruecksetzen und automatische Folge)
  in einer gemeinsamen Zeile unter dem Player anordnen. Auf schmalen
  Bildschirmen umbrechen lassen, statt horizontalen Ueberlauf zu erzeugen.
  Alle eingebetteten Videos verwenden dasselbe `videoWidget` aus `src/site-generation/widget/video.mjs`,
  genau einmal pro Spiel- bzw. Heftausgabenseite. Keine abweichenden
  Steuerelemente oder Spiel-spezifischen Varianten; Uebersichten ohne Player
  erhalten kein Widget. Automatische Fortsetzung nur innerhalb desselben
  Spiels bzw. derselben Heftausgabe, niemals seitenuebergreifend.
  Den direkten YouTube-Link dort neben der Folgenoption anzeigen
  und bei jedem Folgenwechsel aktualisieren. Keinen zusaetzlichen
  Aktivierungslink vor der Videobeschreibung anzeigen.
  Die Folgenoption als eigene Browser-Einstellung merken (ohne Auswahl aus).
  Wiederherstellung darf weder Player-Freigabe umgehen noch beim Seitenaufruf
  Wiedergabe starten. Sicherheitsstopps nicht als neue Nutzerauswahl speichern;
  Speicherfehler sichtbar melden und Datenschutzhinweise aktuell halten.
  Den Vorschaubild-/Aktivierungshinweis nur vor Player-Aktivierung anzeigen;
  nach Zuruecksetzen wieder einblenden. Fehlermeldungen nicht mit ausblenden.
- Detailseiten: Metadaten mit einem optischen Trenner vom weiteren Inhalt
  absetzen. Keine redundanten Startlinks oder Hinweise zur bereits sichtbaren
  Folgenreihenfolge. YouTube-Einbindung nur im Datenschutzlink im Seitenfuss
  erlaeutern, nicht als wiederholten Abschnitt im Detailinhalt.
  Alle Metadatenlisten unter dem Player, auch Spieltitel, Plattform,
  Erscheinungsjahr und Videoanzahl sowie die Metadaten einzelner Folgen, in einer
  gemeinsamen Zeile mit gleich breiten Spalten darstellen. Beschriftung
  oberhalb des Werts; lange Inhalte innerhalb ihrer Spalte umbrechen lassen.
  Keine zusaetzliche Uebersicht „Abschnitte und Reihen“ anzeigen; die
  Videoliste und die Metadaten der einzelnen Folge reichen zur Orientierung.
- Archivlinks auf Zeitschriften- und Jahrgangsseiten in Klammern neben dem
  Zeitschriften-/Ausgabentitel anzeigen, einmal pro Ausgabe, nicht an jedem
  Videolink. Zugängliche Beschriftungen und externe Linkkennzeichnung erhalten.
- Jahrgangsgruppen neutral als `Jahrgang 1996 – Ausgaben` beschriften;
  Sonderhefte separat als `Jahrgang 1996 – Sonderhefte`.
  Keine pauschale Bezeichnung als ungeklaerte Ausgaben. Eintraege ohne
  bekanntes Heftjahr bleiben unter `Jahrgang unbekannt` am Ende einsortiert.
