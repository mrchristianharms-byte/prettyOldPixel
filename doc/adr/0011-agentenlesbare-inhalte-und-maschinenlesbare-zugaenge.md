# ADR 0011: Agentenlesbare Inhalte und maschinenlesbare Zugänge

- Status: statische Maßnahmen lokal umgesetzt und geprüft; Veröffentlichung
  und Edge-Content-Negotiation ausstehend.
- Datum: 2026-10-30.
- Aktuelle Grundlage: [Is-Agentic-Scan für prettyoldpixel.com](https://is-agentic.com/scan/prettyoldpixel.com),
  gescannt am 30.10.2026 um 16:52:01.725 UTC (17:52 Uhr MEZ).
- Historischer Vergleich: [erster Scan](../is-agentic.md) der github.io-Projektadresse.
- Ergänzt [ADR 0002](0002-statische-seiten-seo-und-performance.md) und
  berücksichtigt [ADR 0012](0012-eigene-domain-mit-cloudflare-und-github-pages.md).
- Umfang: Bewertung, statische Umsetzung und Abnahmeplan;
  keine Aktivierung kostenpflichtiger Cloudflare-Funktionen oder Content Signals.

## Kontext und Neubewertung

Die kanonische Produktionsadresse ist nun <https://prettyoldpixel.com/>.
GitHub Actions baut und veröffentlicht die statische Website auf GitHub Pages;
Cloudflare übernimmt DNS und laut Betreiberangabe inzwischen Proxy/CDN.
Die Website repräsentiert den YouTube-Kanal Pretty Old Pixel mit Quellenlinks.
Sie ist kein belegtes Unternehmen, keine Produkt-API und kein MCP-Dienst.

Der neue Scan bewertet die richtige Domain mit **71/100 Punkten**:

| Bereich | Aktueller Scan |
|---|---|
| Essential | 60/80; 4 von 6 Prüfungen bestanden |
| Recommended | 9,4/20; 4 von 9 Prüfungen bestanden |
| Bonus | +1,5 aus 7 positiven Signalen |
| Gesamtbewertung | „Ready with a few material gaps“ |
| Aufgeführte offene Befunde | 4 fehlgeschlagen, 3 teilweise erfüllt |

Der erste Scan erreichte 14/100, konnte die Homepage mehrfach nicht abrufen
und verwendete bei einzelnen Prüfungen die Domain-Wurzel von github.io statt
des Repositorypfads. Die Verbesserung um 57 Punkte spricht vor allem für eine
jetzt passende Messbasis und Erreichbarkeit; sie belegt nicht, dass seitdem
57 Punkte durch neue Inhalte umgesetzt wurden. Die Zahl der Essential-Prüfungen
hat sich ebenfalls geändert. Einzelwerte sind daher nicht direkt vergleichbar.

Die öffentlich lesbare neue Berichtsfassung nennt die sieben offenen Befunde
und die bestandenen Prüfungen nur als Summen. Sie dokumentiert nicht jeden
positiven Check oder dessen Rohantwort. Aus den Summen werden deshalb keine
zusätzlichen Einzelabnahmen abgeleitet.

Ziel bleibt die tatsächliche Nutzbarkeit: Inhalte ohne JavaScript finden,
verstehen, zitieren und zu ihren Quellen zurückverfolgen. Der Scanner ist
ein Diagnosewerkzeug, kein verbindlicher Qualitäts- oder Rechtsstandard.

## Bewertung der sieben aktuellen Befunde

| Befund | Ergebnis und Evidenz im neuen Scan | Bewertung und Konsequenz |
|---|---|---|
| Agentenfreundliche 404 | Teilweise: nicht vorhandener Pfad liefert korrekt HTTP 404, aber keinen Markdown-Fehlertext. | Reale technische Restlücke. Status erhalten; Markdown mit Fehlererklärung und Einstiegslink ergänzen. |
| Markdown-Content-Negotiation | Fehlgeschlagen: Homepage antwortet auf `Accept: text/markdown` mit `text/html; charset=utf-8`; `Vary` enthält nur `accept-encoding`. | Höchste technische Priorität. Dieselbe Seiten-URL muss tatsächlich Markdown liefern, nicht nur einen zusätzlichen Header oder eine separate Datei. |
| Markenauffindbarkeit | Fehlgeschlagen: Domain nicht in Top 10 für „Hardware“; kein Hauptproduktthema qualifiziert. | „Hardware“ ist keine sinnvolle alleinige Markenabfrage für Pretty Old Pixel. Identität verständlicher formulieren, aber weder generisches Keyword-Ranking noch Top-10-Platzierung versprechen. |
| Agentenhinweise | Fehlgeschlagen: keine Anleitung mit „when-to-use“ gefunden. | Kleine, sinnvolle Inhaltslücke: `llms.txt` mit konkreten Rechercheaufgaben, Einstiegslinks und Grenzen. |
| Organization-Vollständigkeit | Fehlgeschlagen: kein `Organization`-Typ im JSON-LD. | Für die private Kanalrepräsentation nicht pauschal anwendbar. Kein Unternehmen, keine Anschrift und keinen Kontaktpunkt erfinden. Bewusst nicht allein für den Score erfüllen. |
| Vertrauensseiten | Fehlgeschlagen: keine ausreichend erkannten About-/Contact-/Privacy-Seiten. | Eigene Projekt- und Kontaktseiten fehlen; Datenschutz existiert bereits ausführlich unter `datenschutz/`. Erkennungsproblem und echte Inhaltslücke getrennt behandeln. Keine drei neuen englischen Duplikate anlegen. |
| JSON-LD-Identität | Teilweise: ein JSON-LD-Block vorhanden, aber keiner der vom Scanner genannten Identitätstypen. | Websiteidentität und Quellbeziehungen verbessern. Ein fachlich passendes `WebSite` kann trotzdem außerhalb der Scanner-Typenliste liegen; kein falscher Typ für volle Punktzahl. |

Die bisherigen Meldungen zu fehlender Sitemap, Metadaten und nicht
abrufbarem HTML werden nicht länger als bestätigte offene Scan-Befunde geführt.
Ebenso entfällt die frühere vermeintliche GitHub-MCP-Zuordnung als Planungsgrundlage:
Sie gehörte nicht zum Projekt und erscheint nicht mehr in den aktuellen Befunden.

## Bestandsaufnahme und Grenzen

Am 30.10.2026 wurden der aktuelle öffentliche Bericht, die öffentliche
Startseite und `datenschutz/` gelesen sowie die lokale Implementierung geprüft.
Die Startseite liefert Themen, Statistik und Links als Text; die öffentliche
Datenschutzseite enthält ausführliche Hinweise. Das sind ergänzende
Beobachtungen, keine vollständigen Protokoll-, Bot- oder Cache-Tests.

Im lokalen Generator existieren bereits:

- statisches HTML mit H1, Einleitungen, Listen, Quellen und Beschreibungen;
- Canonicals, Sprache, Open Graph und JSON-LD mit `WebPage`/Brotkrümeln;
- Sitemap mit absoluten Produktions-URLs und Änderungsdaten sowie `robots.txt`;
- HTML-404 mit Navigation und `noindex`;
- eine ausführliche Datenschutzseite; zusätzliche Cloudflare-Hinweise für
  Website und Offline-App wurden separat lokal ergänzt. Diese Ergänzung
  war beim öffentlichen Seitenabruf noch nicht sichtbar.

Es fehlen noch `llms.txt`, eigene Projekt-/Kontaktseiten und eine
zusammenhängende `WebSite`-Identität. Cloudflare-Proxy allein erzeugt keine
Markdown-Content-Negotiation.

Maßgebliche Umsetzungspunkte:
[`site-render.mjs`](../../src/site-generation/site-render.mjs),
[`generate-site.mjs`](../../src/site-generation/generate-site.mjs),
[`site-config.mjs`](../../src/site-generation/site-config.mjs),
[App-Hinweise](../../src/app-generation/app-views.mjs) und
[Pages-Workflow](../../.github/workflows/pages.yml).
Cloudflare-Einstellungen liegen außerhalb des Repositorys.

### Live-Nachprüfung am 30.10.2026, ca. 17:59 Uhr MEZ

Die folgenden Ergebnisse stammen aus GET-Abrufen, nicht nur HEAD-Antworten:

| Prüfpunkt | Tatsächlicher Stand | Restaufgabe |
|---|---|---|
| Erreichbarkeit | Homepage, Spieleseite von Ultima Underworld II, Heftausgabe ACE 49, Datenschutz und Sitemap liefern 200; unbekannter Pfad liefert 404. Antworten laufen über Cloudflare. | Kein belegter Zugriffsblocker in dieser Stichprobe. |
| Agent-User-Agents | Browserkennung, GPTBot/1.2, ClaudeBot/1.0 und PerplexityBot/1.0 liefern bei allen sechs Zielen gleiche Statuscodes und Bodylängen, ohne `cf-mitigated`-Challenge-Header. | Das sind simulierte Kennungen vom selben Prüfstand, kein Nachweis für echte Bot-IP-Netze oder jede WAF-Regel. |
| Roh-HTML der Homepage | Hauptinhalt nach Entfernung von Navigation/Tags und Normalisierung der Leerzeichen: 1.858 Zeichen, eine H1, aufeinanderfolgende Ebenen H1/H2/H3. | 500-Zeichen-Schwelle und Überschriftenfolge in der Stichprobe erfüllt; Identitätstext noch präzisieren, nicht aufblähen. |
| Homepage-Metadaten | Canonical `https://prettyoldpixel.com/`, Sprache `de`, `og:image` und `og:type` vorhanden. | Kein aktueller Startseiten-Metadatenblocker. |
| Markdown | Homepage liefert auch bei `Accept: text/markdown` HTML, `Vary: Accept-Encoding`; kein `Content-Signal`-Header in der Antwort. | Konvertierung und Nutzungspräferenzen entscheiden; der fehlende Header beweist keine kontoweite Einstellung. |
| Markdown-404 | Unbekannter Pfad liefert bei beiden Accept-Varianten 404 und HTML. | Status ist richtig; Markdown-Fehlerbody fehlt. |
| Agenteneinstieg | `/llms.txt` liefert 404; keine lokale Erzeugung gefunden. | Implementieren. |
| Projekt/Kontakt | `/ueber/` und `/kontakt/` liefern 404; keine lokalen Seitenrouten gefunden. | Quellengestützte Seiten ergänzen, bei fehlendem Inhalt nachfragen. |
| Strukturierte Identität | Startseite enthält `WebPage` und `BreadcrumbList`, kein `WebSite`. | Websiteidentität und Verknüpfungen ergänzen. |
| Datenschutz | `/datenschutz/` liefert ausführliches HTML mit 200; der lokale Cloudflare-Abschnitt ist öffentlich noch nicht enthalten. | Vorhandene lokale Datenschutzergänzung veröffentlichen; keine neue Privacy-Duplikatseite erforderlich. |

Tarifverfügbarkeit, Kosten und Aktivierung von „Markdown for Agents“ sowie
die Content-Signal-Entscheidung sind weiterhin nicht über externe Abrufe
bestätigt. Eine Prüfung der Cache-Isolation zwischen zwei erfolgreichen
Repräsentationen ist erst nach funktionierender Markdown-Ausgabe sinnvoll.
Es wurden bei dieser Nachprüfung keine Cloudflare-Einstellungen geändert.

## Entscheidungsvorschlag

### Umsetzungsstand nach Freigabe am 30.10.2026

Der Auftraggeber hat ausschließlich kostenlose Optionen freigegeben und
die Content-Signal-Entscheidung ausdrücklich auf später vertagt. Anschließend
wurde die zusätzliche statische Markdown-Erzeugung im Site-Generator
gewünscht. Deshalb ist nun der Build-Export die gewählte Lösung, nicht eine
kostenpflichtige HTML-Konvertierung am Edge.

Lokal umgesetzt:

- Startseitentext mit Kanalbezug sowie verknüpftes `WebSite`-/`WebPage`-JSON-LD.
- `ueber/` und `kontakt/` mit gemeinsamen, quellengestützten Inhalten in Website
  und Offline-App; jede Seite hat mehr als 500 Zeichen Haupttext.
  Keine erfundene Betreiberidentität oder direkte Kontaktadresse.
- Footer-Links, AboutPage-/ContactPage-Daten und Aufnahme in die Sitemap.
- `llms.txt` mit Anwendungsfällen, Grenzen, Quellen- und Markdown-Einstiegen.
- Für jede HTML-Seite eine Markdown-Datei aus genau deren gerendertem
  Hauptinhalt: `index.md`, `<route>/index.md` beziehungsweise `404.md`.
  Alternativlink im HTML, absolute Quellen-, Kapitel- und Bildlinks,
  Tabellen als Markdown; Brotkrümel, Folgenverzeichnisse, Hauptnavigation und
  Fußlinks bleiben zur Orientierung erhalten. Player-Steuerung entfällt.
  Ausschließlich in Markdown erklärt ein Ersatztext den Hauptzweck der
  YouTube-Videos und die Grenzen von Metadaten ohne audiovisuelle Inhalte.
  Spielseiten beantworten „Wie wird das Spiel … gespielt?“ generisch anhand
  von bis zu drei verlinkten Videotiteln als Beispielen; keine unbelegten
  Spielmechaniken, Steuerung oder Lösungswege. Die vollständige Folgenliste
  bleibt erhalten. Diese Ergänzungen ändern weder HTML noch Offline-App.
  `turndown` und `turndown-plugin-gfm` sind reine Build-Abhängigkeiten,
  kein zusätzliches Browser-JavaScript.
- Die bereits separat ergänzten Cloudflare-Datenschutzhinweise bleiben
  Bestandteil der lokalen Ausgabe.

Validierung: 244 Website-/Generator-/App-Tests erfolgreich. Der isolierte
Commit-Stand ohne unabhängige lokale UI-/Metadatenänderungen besteht zudem
alle 324 Tests der produktiven Testsuite und den vollständigen Build
mit 613 HTML-Seiten und 613 Markdown-Fassungen.
CSS 9.897, eigenes Website-JavaScript 4.269, größtes HTML 25.839 Bytes gzip.
Veröffentlichung, erneuter Live-Scan und nachfolgende Edge-Abnahme stehen aus.
Der optionale lokale Open-Graph-Bildfallback ist noch nicht umgesetzt.
Die bestehenden Cache-Einstellungen bleiben gemäß ADR 0012 unverändert;
eine spätere Repräsentationsauswahl darf HTML und Markdown nicht im
gleichen Cache-Eintrag vermischen.

### 1. Vorhandenes HTML erhalten, Identität präzisieren

Die statische Website bleibt der primäre, ohne JavaScript nutzbare Zugang.
Auf der Startseite wird kurz und sichtbar erklärt, dass dies eine
Webseitenrepräsentation des YouTube-Kanals Pretty Old Pixel ist und welche
Inhalte hier auffindbar sind: Retrospiele, Computerzeitschriften, Hardware,
Retrospektiven und Gespräche mit Quellen- und Kapitelverweisen.

Vorhandene Texte werden nicht pauschal verlängert. Mindestens 500 Zeichen
sinnvoller Startseiten-Hauptinhalt werden gemessen; Navigation, Footer,
Skripte und Styles zählen nicht mit. Genau eine H1 und eine lückenlose
Überschriftenhierarchie bleiben überprüfbar. Die kompakte Darstellung und
Budgets aus ADR 0002 gelten weiter.

### 2. Statisches Markdown erzeugen, Edge-Auswahl separat behandeln

Die offizielle Funktion
[Markdown for Agents](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/)
setzt laut geprüfter Dokumentation Pro oder Business voraus. Es wird kein
Tarifwechsel ausgelöst. Stattdessen erzeugt der vorhandene Site-Generator
statische Markdown-Dateien; diese können direkt und ohne Edge-Konvertierung
abgerufen werden. Der Build benötigt keine neuen Inhaltsquellen oder
Netzabrufe. Die Konvertierung arbeitet auf dem bereits gerenderten Hauptinhalt,
damit Website und Markdown nicht redaktionell auseinanderlaufen.

Eine kostenlose Edge-Auswahl dieser Dateien kann später separat entworfen
und nach Content-Signal-Entscheidung freigegeben werden. Ein Worker ist
hierfür noch nicht implementiert oder aktiviert. Die folgenden
Protokollanforderungen bleiben deshalb offen.

Cloudflares kostenpflichtige Funktion konvertiert alternativ HTML am Edge.
Laut Dokumentation setzt sie `Content-Type: text/markdown; charset=utf-8`,
ergänzt `Vary: Accept` und entfernt nicht mehr passende Body-Validatoren
wie ETag und Last-Modified aus der konvertierten Antwort.

Vor Aktivierung sind Verfügbarkeit im konkreten Tarif, Kosten, Umfang,
Cache-Verhalten und Inhaltsqualität zu prüfen. Der Proxy ist bereits im
Einsatz; diese zusätzliche Funktion ist dadurch noch nicht freigegeben.
Ein Test soll zunächst gezielt Website-HTML abdecken, nicht App-JSON,
Service Worker, Assets, Sitemap oder andere Nicht-HTML-Antworten verändern.

**Besonderer Freigabepunkt:** Laut Dokumentation ergänzt die Funktion ohne
vorgegebenen Origin-Header standardmäßig
`Content-Signal: ai-train=yes, search=yes, ai-input=yes`.
Die Nutzungspräferenzen müssen vorab bewusst festgelegt und technisch
überprüft werden. Es darf keine unbeabsichtigte Trainingsfreigabe suggeriert
werden, insbesondere nicht für fremde Videobeschreibungen. Ein Content-Signal
ersetzt keine Rechteklärung und garantiert keine Beachtung durch Dritte.

Eine Aktivierung ist nur ausreichend, wenn die Abnahme erfolgreich ist:

- Dieselbe Homepage und reguläre Inhalts-URLs liefern nicht leeres,
  inhaltlich brauchbares Markdown bei `Accept: text/markdown`.
- HTML bleibt bei `Accept: text/html` unverändert nutzbar.
- Gemischte Accept-Header, Qualitätswerte einschließlich `q=0`, Wildcards
  und fehlender Accept-Header werden nach dokumentiertem Verhalten geprüft.
  Keine nicht nachgewiesene RFC-konforme Auswahl unterstellen.
- Markdown erhält wesentliche Texte, Tabelleninformationen, Quellen,
  Kapitel und funktionierende Links. Keine Inhalte erfinden oder
  ausschließlich im Player vorhandene Daten voraussetzen.
- Cache-Trennung funktioniert tatsächlich; `Vary` allein beweist sie nicht.
  Vorhandene Sicherheitsheader bleiben erhalten, HTML-Validatoren werden
  nicht auf veränderte Bodies angewendet.

Die statischen Ausgaben liegen nun vor. Ein zweiter redaktioneller
Datenbestand, neuer Hoster oder eigener Server wird nicht eingeführt.
`.md`-Dateien allein erfüllen den Negotiation-Check weiterhin nicht;
auch ihr MIME-Typ ist nach dem Deployment gesondert zu prüfen.

### 3. Markdown-404 ausdrücklich separat abnehmen

Die vorhandene korrekte HTTP-404-Antwort darf nicht zu einem Soft-404 mit
Status 200 werden. Bei `Accept: text/markdown` benötigt sie mindestens
20 Zeichen Fehlererklärung und einen Link zur Startseite, Sitemap oder
`llms.txt`.

Die Cloudflare-Dokumentation zur normalen Konvertierung ist kein Nachweis,
dass Fehlerantworten ebenso behandelt werden. Deshalb einen unbekannten
Pfad gesondert testen. Falls die Funktion 404-HTML nicht konvertiert,
gezielt eine Edge-Fehlerbehandlung vorsehen, statt alle Anfragen umzuleiten.
HTML-Fehlerseite, Markdown-Fehlerseite und beide Statuscodes müssen stimmen.
Keine JavaScript-Weiterleitung und kein Rewrite beliebiger Pfade auf die Homepage.

### 4. Kleinen Agenteneinstieg erzeugen

Der Build soll `https://prettyoldpixel.com/llms.txt` erzeugen mit:

- Name, deutscher Sprache und kurzer Beschreibung des Kanalkatalogs;
- Abschnitt „Wann diese Website verwenden“ für das Finden von Spielreihen,
  besprochenen Heftausgaben, Hardware-/Gesprächsvideos und Kapitel-Sprungmarken;
- absoluten Links zu den vorhandenen Themen, Sitemap, Projekt, Kontakt und
  Datenschutz; tatsächliche Markdown-Nutzung erst nach erfolgreicher Abnahme;
- Grenzen: keine vollständige Spieleenzyklopädie, keine garantierten
  Transkripte oder vollständigen Metadaten, kein Videodownload-/Tooldienst;
- Quellen- und Zitierhinweisen mit kanonischen Seiten- und Originalvideo-URLs.

Die Datei wird aus vorhandener Konfiguration und freigegebenen Texten
erzeugt, ohne Netzabrufe beim Build. Sie ist eine Orientierungshilfe,
keine Zugriffskontrolle oder Garantie für Agentenunterstützung.
Keine pauschalen Lizenz- oder Trainingsfreigaben für fremde Inhalte.

### 5. Projekt und Kontakt ergänzen, Datenschutz wiederverwenden

Freigegebene Quellen und Aussagen bleiben:

- [YouTube-Kanal Pretty Old Pixel](https://www.youtube.com/@PrettyOldPixel)
  als Inhaltsquelle; die Website repräsentiert den Kanal mit Quellenlinks.
- <https://prettyoldpixel.de/> als Kontaktverweis.

Geplant sind `ueber/` und `kontakt/`, verlinkt im Footer und Agenteneinstieg.
`datenschutz/` bleibt die Datenschutzadresse. Titel, Navigation und geeignete
`AboutPage`-/`ContactPage`-Auszeichnung erleichtern die Erkennung; zusätzliche
englische Duplikate nur für den Scanner sind nicht vorgesehen.

Die Projektseite beschreibt Zweck, Themen und Grenzen. Die Kontaktseite
nennt transparent den externen Kontaktverweis, nicht einen erfundenen
eigenen Supportkanal. Beim früheren Abruf von prettyoldpixel.de führte
„Email“ nur auf `#`; ein direkter E-Mail-Kontakt ist nicht belegt.
Kanalidentität und Verantwortlichkeit für diese Website sind nicht automatisch
gleichzusetzen. Keine unbelegte `sameAs`- oder `contactPoint`-Beziehung.

Die Scannerforderung nach 500 Zeichen pro Vertrauensseite rechtfertigt
keine Fülltexte. Reichen die Quellen für sinnvollen Inhalt nicht aus,
vor Veröffentlichung gezielt nach freigegebenem Projekttext beziehungsweise
einer offiziellen Kontaktquelle fragen. Das bleibt ein offener
redaktioneller Punkt, keine Aufgabe für Spieleindex oder Videoabruf.
Erforderliche Betreiber-/Datenschutzangaben sind separat rechtlich zu prüfen.

### 6. Fachlich passende strukturierte Daten statt Unternehmensattrappe

Die Startseite erhält `WebSite` mit stabiler Identität, Name, Beschreibung,
Sprache und kanonischer URL, verknüpft mit ihrer `WebPage`.
Bestehende Video-, Spiele-, Zeitschriften- und Breadcrumb-Daten bleiben erhalten.
Quellen sind als Quellen zu kennzeichnen; Identitätsgleichheit wird nicht
allein aus einem Link abgeleitet.

Der Scan nennt SoftwareApplication, Product, Organization, Person und Article,
nicht WebSite, als akzeptierte Identitätstypen. Eine fachlich korrekte
WebSite-Auszeichnung kann daher weiterhin nur teilweise gewertet werden.
Keine falsche Person, Organisation, Anschrift, Angebote oder Telefonangaben
ergänzen. Echte veröffentlichbare Betreiberangaben können später einen
passenden zusätzlichen Typ begründen.

### 7. Bereits funktionierende Signale absichern

Canonicals, Sprache, Open Graph, Sitemap, `lastmod`, Robots-Verweis und
relative interne Links werden erhalten, nicht neu erfunden.
Ein lokales Projektbild als Open-Graph-Fallback ist eine nachrangige
Robustheitsverbesserung für Seiten ohne Videobild, kein aktuell bestätigter
Startseitenfehler. Alt-Text und Abmessungen müssen zur Datei passen.

Neue indexierbare HTML-Seiten kommen in die vorhandene Sitemap. Fehlerseiten
und etwaige Markdown-Duplikate nicht als weitere HTML-Ziele aufnehmen.
Durch die eigene Domain liegt `robots.txt` nun an der richtigen Host-Wurzel;
die alte Einschränkung des Repository-Unterpfads ist kein aktueller Blocker.

Markenprüfung mit „Pretty Old Pixel“ und passenden Themen getrennt von
generischen Suchen beobachten. Indexierung einer neuen Domain braucht Zeit;
Ranking ist keine Build-Abnahme. Kein MCP-Server allein für den Score.

## Reihenfolge und Abnahme

| Schritt | Ergebnis | Nachweis |
|---|---|---|
| 1. Ausgangslage sichern | Richtige Domain, konsistente HTTPS-/Proxy-Auslieferung, keine unbelegten Bot-Sperren | GET-Protokolle für Homepage, Spiel, Heftausgabe, Datenschutz, Sitemap und unbekannten Pfad; normalen und ausgewählte Agent-User-Agents vergleichen |
| 2. Statische Ergänzungen | `llms.txt`, verständliche Projektidentität, Projekt-/Kontaktseiten und passendes JSON-LD | Inhalt/Quellen, Links, H1/Hierarchie und sinnvolle Haupttextlängen prüfen; offene Quellenfragen vorher klären |
| 3. Cloudflare-Funktion entscheiden | Tarif, Kosten, Content Signals und Konvertierungsumfang freigegeben | Konfiguration dokumentieren; keine pauschale Funktionsaktivierung |
| 4. Negotiation und 404 testen | Echte HTML-/Markdown-Varianten einschließlich Fehlerfällen | Status, Content-Type, Vary, Body, Inhaltsparität und Cache-Isolation messen; erst bei nachgewiesener Lücke eigene Edge-Logik |
| 5. Regression und Nachscan | Bestehende Website/App weiterhin nutzbar, neue Ergebnisse nachvollziehbar | Gezielte Tests, Build und Budgets; neue Scan-URL/Zeit und Restbefunde dokumentieren, keine Zielpunktzahl versprechen |

Für lokale Änderungen die vorhandenen Generator-/Website-Tests erweitern.
Alternative Basis-URLs und Unterpfade bleiben unterstützt. App-Daten,
Service Worker und Offline-Updates müssen von der Konvertierung unberührt
bleiben. Ein erfolgreicher lokaler Build ersetzt keine Live-Edge-Prüfung.

Beispiel für die Live-Abnahme (GET, jeweils finale Header **und** Body prüfen):

```sh
curl -sS -L -i -H 'Accept: text/html' https://prettyoldpixel.com/
curl -sS -L -i -H 'Accept: text/markdown' https://prettyoldpixel.com/
curl -sS -L -i -H 'Accept: text/markdown' https://prettyoldpixel.com/__agentic-missing-page
```

Zusätzlich HTML und Markdown abwechselnd warm/kalt anfordern und auf
Repräsentationsvermischung prüfen. Authentifizierung oder Challenge-Seiten
dürfen nicht als erfolgreicher Inhaltsabruf gewertet werden.

## Offene Entscheidungen und bewusste Grenzen

- Kostenpflichtige Cloudflare-Markdown-Konvertierung wird nicht aktiviert;
  statischer Export ist umgesetzt. Eine kostenlose Edge-Auswahl,
  Content Signals sowie tatsächliches 404-/Cache-Verhalten bleiben offen.
- Freigegebene Zusatztexte/Kontaktquelle, falls die vorhandenen Quellen für
  Projekt-/Kontaktseiten nicht reichen; echte Website-Verantwortlichkeit.
- Suchranking, Unternehmensschema und ein nicht benötigter MCP-Server sind
  keine Voraussetzungen für den Abschluss der technischen Maßnahmen.
- Die neue Messung bestätigt eine deutlich bessere Ausgangslage, nicht
  die inzwischen lokal umgesetzten Ergänzungen. Die sieben Restbefunde werden einzeln
  behoben, begründet akzeptiert oder mit Nachweis als Scannergrenze eingeordnet.

## Quellen

- [Aktueller Is-Agentic-Bericht, 71/100](https://is-agentic.com/scan/prettyoldpixel.com)
- [Historischer Bericht, 14/100](../is-agentic.md)
- [Cloudflare: Markdown for Agents](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/)

Abgerufen am 30.10.2026. Cloudflare-Dokumentationsstand laut Seite: 09.10.2026.
