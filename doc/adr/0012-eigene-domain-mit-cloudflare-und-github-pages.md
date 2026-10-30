# ADR 0012: Eigene Domain mit Cloudflare und GitHub Pages

- Status: umgesetzt; eigene Domain, Cloudflare-Proxy und HTTPS live bestätigt.
  Separate Betreiber- und Offline-App-Prüfungen bleiben offen.
- Datum: 2026-10-30.
- Ergänzt [ADR 0002](0002-statische-seiten-seo-und-performance.md) und
  [ADR 0011](0011-agentenlesbare-inhalte-und-maschinenlesbare-zugaenge.md).

## Kontext

Pretty Old Pixel soll unter `https://prettyoldpixel.com/` erreichbar sein.
Die Domain wird bei Cloudflare registriert und per DNS mit GitHub Pages
verbunden. Hosting und Veröffentlichung bleiben beim vorhandenen
GitHub-Actions-Workflow; Cloudflare Pages wird nicht eingeführt.

Bisherige Produktionsadresse war
`https://mrchristianharms-byte.github.io/prettyOldPixel/`.
Eine eigene Domain veröffentlicht diese Projektwebsite an der Domain-Wurzel:
Der Repositoryname ist kein Bestandteil der neuen Seitenadressen.
Nur DNS und Pages-Einstellungen umzustellen genügt deshalb nicht:
Auch generierte absolute Referenzen müssen die neue Basis verwenden.

## Entscheidung

### 1. Domain und DNS

Die kanonische Domain ist `prettyoldpixel.com`, ohne `www`.
Bei Cloudflare wird nach der GitHub-Domainverifizierung und dem Eintragen
der Custom Domain im Repository folgender DNS-Eintrag eingerichtet:

| Typ | Name | Ziel | Proxy |
|---|---|---|---|
| CNAME | `@` | `mrchristianharms-byte.github.io` | DNS only |

Das Ziel ist ein Hostname, **ohne** `https://`, Schrägstrich oder
`prettyOldPixel`. Cloudflare unterstützt den CNAME an der Domain-Wurzel
durch Apex-CNAME-Flattening und beantwortet DNS-Abfragen mit den aufgelösten
Adressen. Ein gewöhnlicher ungeflatteter Apex-CNAME wäre kein Ersatz dafür.
Widersprechende bisherige A-, AAAA- oder CNAME-Einträge am selben Namen
müssen beim Einrichten geprüft und bereinigt werden; andere Dienste und
Verifizierungseinträge bleiben erhalten.

Cloudflare übernimmt zunächst Registrierung und DNS, nicht den HTTP-Proxy.
Damit können GitHub-DNS-Prüfung und Zertifikatsausstellung ohne eine weitere
HTTP-Schicht erfolgen. Proxy, Workers, zusätzliche Redirect-Regeln oder
Markdown-Content-Negotiation sind keine automatische Folge der Registrierung
und benötigen eine eigene Freigabe gemäß ADR 0011.

Optional kann später `www` als DNS-only-CNAME auf
`mrchristianharms-byte.github.io` ergänzt werden. Dann ist auch die
Weiterleitung von `www.prettyoldpixel.com` auf die kanonische Apex-Domain
einschließlich HTTPS zu prüfen; bis dahin wird `www` nicht als erreichbar
beworben. Keine Wildcard-Einträge einrichten.

Nach erfolgreicher Zertifikatsausstellung wurde der Proxy durch den
Auftraggeber aktiviert; Apex und `www` werden inzwischen über Cloudflare
ausgeliefert. DNS only beschreibt oben die Einrichtungsphase, nicht mehr
den aktuellen Betrieb. Die Verbindung zum GitHub-Origin soll mit
**Full (strict)** abgesichert werden; diese Dashboard-Einstellung ist
noch nicht separat bestätigt.

### 2. Externe GitHub-Einstellungen

Diese Schritte sind nicht durch einen Commit im Projekt erledigt:

1. Domain registrieren und Cloudflare als zuständigen DNS-Anbieter aktivieren.
2. Unter den persönlichen GitHub-Einstellungen **Pages** die Domain
   `prettyoldpixel.com` verifizieren. Den von GitHub vorgegebenen
   TXT-Eintrag bei Cloudflare setzen, prüfen lassen und dauerhaft erhalten.
   Den konkreten Token nicht erfinden oder in Quellcode aufnehmen.
3. Im Repository unter **Settings → Pages** weiterhin **GitHub Actions**
   als Quelle verwenden und unter **Custom domain** `prettyoldpixel.com`
   ohne Protokoll und Pfad speichern.
4. Erst danach den obigen CNAME bei Cloudflare setzen. Domainzuordnung
   nicht ungeschützt vorab auf GitHub zeigen lassen.
5. DNS-Prüfung und GitHub-Zertifikatsbereitstellung abwarten. Sobald
   verfügbar **Enforce HTTPS** aktivieren. GitHub nennt bis zu 24 Stunden
   bis zur Verfügbarkeit dieser Option.
6. Den neuen Projektstand veröffentlichen und die Live-Abnahme durchführen.

Bei Veröffentlichung über einen eigenen Actions-Workflow erstellt GitHub
keine `CNAME`-Datei; eine vorhandene Datei wird hierfür ignoriert und ist
nicht erforderlich. Deshalb wird weder eine Datei im Repositorywurzelverzeichnis
noch ein zusätzlicher Generator für `docs/CNAME` eingeführt.
Die Pages-Einstellung ist die maßgebliche Domainzuordnung.

### 3. Einstellungen im Projekt

[`productionUrl`](../../src/site-generation/site-config.mjs) lautet
`https://prettyoldpixel.com/`. Der bestehende Aufruf
`npm run generate:site` verwendet diese Basis ohne weiteres Argument.
Ein abweichender Host oder Unterpfad bleibt über `--base-url` testbar,
beispielsweise für lokale Vorschauen.

Die gemeinsame Konfiguration steuert damit:

- absolute selbstreferenzierende Canonicals und `og:url`;
- absolute Sitemap-Einträge und den Sitemap-Verweis in `robots.txt`;
- die Basis-URL im Datenexport der Offline-App;
- künftige absolute Website-Referenzen aus ADR 0011.

Interne Navigation, Assets, Paginierung und interne JSON-LD-Verweise bleiben
wie bisher seitenrelativ und werden dadurch gegen die neue Domain aufgelöst.
App-Start und Service-Worker-Scope bleiben auf `app/` beschränkt:
neu `https://prettyoldpixel.com/app/`, nicht `/prettyOldPixel/app/`.

Der [Pages-Workflow](../../.github/workflows/pages.yml) benötigt keine
fest eingetragene zweite Domainkonstante. Er baut mit der zentralen
Produktionsadresse. Seine Deployment-Environment-URL kommt bereits aus
`steps.deployment.outputs.page_url`; nach korrekter Custom-Domain-Einstellung
muss diese Ausgabe `https://prettyoldpixel.com/` sein. GitHub-interne
Repository-/Actions-URLs werden nicht durch die eigene Domain ersetzt.

Aktuelle Benutzer- und Entwicklungsdokumentation verweist auf die neue
Produktionsadresse. Historische Scan-Berichte und frühere Messwerte behalten
ihre damaligen URLs; alternative Unterpfade bleiben als Testfälle erhalten.
Generierte Dateien unter `docs/` werden weiterhin nicht committed.

### 4. Umstellung, Grenzen und Rückweg

Die Konfigurationsänderung und die externe Freischaltung werden zeitlich
koordiniert. Bis DNS und Pages-Einstellung aktiv sind, ist die neue Domain
eine Zieladresse, keine bereits bestätigte Veröffentlichung.
Ein Build mit der neuen Basis darf nicht dauerhaft unter der alten Adresse
ohne funktionierende Domainzuordnung betrieben werden.

GitHub Pages unterstützt die Weiterleitung der Standardadresse zur
eingerichteten Custom Domain. Die tatsächliche Weiterleitung der alten
Projekt- und Detailadressen auf die pfadgleichen neuen Ziele wird bei der
Abnahme geprüft, nicht durch clientseitige Redirects nachgebaut.
Unbekannte Ziele müssen echte 404-Antworten bleiben.

Browserdaten sind an die Origin gebunden. Player-Freigaben, Darstellung,
Offline-Caches und installierte Web-Apps von der github.io-Adresse werden
nicht automatisch auf die neue Domain übertragen. Die Offline-App muss
unter der neuen Adresse neu geöffnet beziehungsweise installiert werden.
Eine alte Installation wird nicht durch dieses Deployment umgezogen.

Bei einem Rückzug müssen Produktionsbasis und Pages-Domain gemeinsam
zurückgestellt und die Website neu gebaut werden. Vor dem Entfernen der
GitHub-Domainzuordnung darf kein ungeschützter DNS-Verweis auf GitHub
zurückbleiben. Die Domainverifizierung nicht vorschnell entfernen.

## Abnahme

### Historischer Einrichtungsstand am 30.10.2026

- Die GitHub-Pages-API bestätigt `build_type: workflow` und
  `cname: prettyoldpixel.com`.
- Die Domain verwendet die Cloudflare-Nameserver
  `deborah.ns.cloudflare.com` und `anderson.ns.cloudflare.com`.
- Nach Korrektur der DNS-Einträge liefert die direkte Abfrage bei
  `deborah.ns.cloudflare.com` um ca. 17:16 Uhr die vier GitHub-Pages-Adressen
  `185.199.108.153` bis `185.199.111.153`. Der CNAME für `www` zeigt auf
  `mrchristianharms-byte.github.io`. Der Cloudflare-Screenshot bestätigt
  beide Einträge als DNS only. Einzelne rekursive DNS-Caches waren zu
  diesem Zeitpunkt noch nicht aktualisiert.
- GitHub meldet die Zertifikatsbereitstellung mit Status `new` und
  `https_enforced: false`. Die Live-Abnahme einschließlich HTTPS bleibt offen.
- Registrierung und DNS-Einträge wurden durch den Auftraggeber eingerichtet,
  nicht durch den Assistenten geändert. Die persönliche GitHub-TXT-
  Domainverifizierung ist noch nicht separat bestätigt.

### Lokale Abnahme am 30.10.2026

- Alle 237 Website-, Generator- und Offline-App-Tests erfolgreich:
  damaliger Aufruf `node --test "tests/site-*.test.mjs" tests/generate-site.test.mjs`.
  Die Testpfade sind inzwischen nach [Fachverzeichnissen](../source-structure.md#teststruktur) gegliedert.
- `npm run generate:site` erfolgreich; 609 HTML-Seiten und insgesamt
  756 Dateien lokal unter `docs/` erzeugt.
- Canonicals und `og:url` sämtlicher 609 Seiten auf die neue Domain
  geprüft; keine alte github.io-Produktionsadresse im erzeugten HTML.
  Sitemap-Einträge und Robots-Verweis verwenden die neue Domain ohne
  Repository-Unterpfad.
- Der aktuelle Offline-App-Datenexport verwendet die neue Domain.
  Manifest-Start-URL und Scope werden zu `https://prettyoldpixel.com/app/`
  aufgelöst.
- Produktionscode enthält keine alte GitHub-Produktionsdomain und keinen
  fest eingebauten `/prettyOldPixel/`-Pfad. Alternative Hosts und
  Unterpfade bleiben in den Tests abgedeckt.
- Der Workflow baut mit der zentralen Konfiguration und übernimmt die
  Deployment-URL aus `steps.deployment.outputs.page_url`.
  Keine zusätzliche `CNAME`-Datei erforderlich.
- Performancebudgets eingehalten: CSS 9.992, eigenes JavaScript 4.269,
  größtes HTML 28.748 Bytes gzip.
- Bestehende Build-Hinweise zu unbekannten Heftausgaben und nicht bestätigten
  Playlist-/Spielzuordnungen bleiben sichtbar; kein Domainfehler.
- `git diff --check` ohne Fehler. Generierte Dateien werden nicht committed.
  Zum Zeitpunkt dieser lokalen Erstabnahme standen Veröffentlichung und
  Live-Abnahme noch aus; der nachfolgende Stand ersetzt diese Einschränkung.

### Live- und Betriebsstand am 30.10.2026

- Eigene Domain über Cloudflare-Proxy erreichbar; GitHub bleibt der
  Hosting- und Actions-Deployment-Anbieter.
- GitHub-Pages-API erneut um ca. 18:11 Uhr geprüft:
  `build_type: workflow`, `cname: prettyoldpixel.com`,
  `html_url: https://prettyoldpixel.com/`, `https_enforced: true`.
  Zertifikat `approved`, gültig für Apex und `www` bis 28.01.2027.
- HTTPS-Aufrufe für Startseite, Spiel, Heftausgabe, Datenschutz und Sitemap
  erfolgreich; unbekannte Pfade liefern 404. HTTP wird auf HTTPS,
  `www` auf Apex und alte github.io-Projekt-/Detailadressen auf passende
  neue Ziele weitergeleitet.
- Der neue Is-Agentic-Scan verwendet die eigene Domain und erreicht 71/100;
  die verbliebenen Inhalts-/Markdown-Punkte behandelt ADR 0011.
- Cloudflare-Auslieferung und Datenverarbeitung sind jetzt in den lokalen
  Datenschutzseiten der Website und Offline-App beschrieben.
- Persönliche GitHub-TXT-Domainverifizierung, Full-(strict)-Einstellung
  und ein echter Offline-/Installationsversuch der App unter der neuen
  Origin sind weiterhin separat durch den Betreiber zu bestätigen.
  Die neuen Informationsseiten und Markdown-Ausgaben werden erst mit
  dem nächsten Deployment veröffentlicht.

### Cache-Entscheidung am 30.10.2026

Die bestehenden Cache-Einstellungen bleiben auf Wunsch des Auftraggebers
unverändert. Live-GETs um ca. 18:09 Uhr zeigen:

| Inhalt | Beobachtetes Verhalten |
|---|---|
| Startseite und Spieleübersicht | `Cache-Control: max-age=600`; Cloudflare `DYNAMIC`, also kein Edge-HTML-Cache |
| HTML-Validatoren | `Last-Modified` vorhanden; `If-Modified-Since` liefert 304. ETag in dieser 304-Antwort vorhanden, nicht in den geprüften HTML-200-Antworten |
| Favicon | Cloudflare `HIT`, `Cache-Control: max-age=14400`, ETag vorhanden |

`Last-Modified` und ETag sind Änderungsvalidatoren, keine Cache-Dauern.
Für die statische Website reicht dieses Verhalten derzeit aus; keine
zusätzliche Cache-Rule und kein Ein-Stunden-Override werden eingerichtet.
Die beobachteten Header beweisen nicht die vollständige Dashboard-Konfiguration.
Cloudflares expliziter Edge-TTL-Override hat im Free-Tarif laut Dokumentation
mindestens zwei Stunden; eine Stunde Browser-TTL wäre davon unabhängig.
Bei späterer HTML-/Markdown-Negotiation muss die Cache-Trennung gesondert
geprüft werden. Ein Edge-Purge leert keine Browser-Caches.

### Abnahmekriterien

- Gezielte Tests sichern die Produktionsbasis ohne Repositorypfad sowie
  Canonicals, Open Graph, Sitemap und Robots-Verweis. Alternative Hosts
  und Unterpfade funktionieren weiterhin.
- Ein echter Build erzeugt ausschließlich die neue Domain für absolute
  Produktionsreferenzen; interne Links und Performancebudgets bleiben gültig.
- Cloudflare-DNS-Auflösung und GitHub-Domainprüfung sind erfolgreich.
  Bei Apex-Flattening muss eine CNAME-Abfrage nicht den CNAME selbst
  zurückgeben; zusätzlich A-/AAAA-Auflösung prüfen.
- `https://prettyoldpixel.com/`, eine Spielseite, eine Ausgabenseite,
  `sitemap.xml`, `robots.txt` und `app/` liefern die erwarteten Inhalte
  mit gültigem TLS-Zertifikat. HTTP wird auf HTTPS weitergeleitet.
- Canonicals und `og:url` sowie Sitemap und App-Daten verweisen auf
  `prettyoldpixel.com`, ohne `/prettyOldPixel/`. Die Deployment-Anzeige
  in GitHub zeigt ebenfalls die eigene Domain.
- Alte Projekt- und Detailadressen werden ohne Schleifen auf die richtigen
  neuen Adressen weitergeleitet. Ein nicht vorhandener Pfad liefert 404.
- Die Offline-App wird unter der neuen Origin geprüft; ein erneuter
  Is-Agentic-Scan verwendet die eigene Domain. DNS-only behebt weder
  Markdown-Negotiation noch Markdown-404 aus ADR 0011.

Domain, Proxy und HTTPS sind live abgenommen. Die oben genannten
Betreiberbestätigungen und die praktische Offline-App-Abnahme bleiben offen.

## Referenzen

- [GitHub: Managing a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [GitHub: Verifying your custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)
- [Cloudflare: CNAME flattening](https://developers.cloudflare.com/dns/cname-flattening/)
- [Cloudflare: Edge und Browser Cache TTL](https://developers.cloudflare.com/cache/how-to/edge-browser-cache-ttl/)

Dokumentationsstand geprüft am 30.10.2026.
