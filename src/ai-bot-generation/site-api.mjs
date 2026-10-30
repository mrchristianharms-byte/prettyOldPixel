import { videoHref } from "../site-generation/site-video-links.mjs";

export function generateApi(model, config) {
  const endpoint = config.absolute("api/v1/content.json");
  const specification = config.absolute("api/v1/openapi.json");
  const documentation = config.absolute("api/v1/readme.md");
  const data = {
    schemaVersion: 1,
    websiteUrl: config.baseUrl,
    videos: model.videos.map((video) => ({
      id: video.id, title: video.title, description: video.description,
      youtubeUrl: video.url,
      pageUrl: new URL(videoHref(video, config), config.baseUrl).href,
      publishedAt: video.publishedAt, durationSeconds: video.durationSeconds,
      gameIds: video.games.map((game) => game.id),
    })),
    games: model.games.map((game) => ({
      id: game.id, name: game.name, pageUrl: config.absolute(game.route),
      videoIds: game.videos, platforms: game.platforms, releaseYear: game.releaseYear,
    })),
    magazines: model.magazines.map((magazine) => ({
      name: magazine.name, pageUrl: config.absolute(magazine.route), videoIds: magazine.videos,
    })),
  };
  const text = { type: "string" };
  const uri = { type: "string", format: "uri" };
  const strings = { type: "array", items: text };
  const record = (properties) => ({
    type: "object", required: Object.keys(properties), additionalProperties: false, properties,
  });
  const array = (name) => ({ type: "array", items: { $ref: `#/components/schemas/${name}` } });
  const openapi = {
    openapi: "3.1.0",
    info: {
      title: "Pretty Old Pixel Content API", version: "1.0.0",
      description: "Öffentlicher statischer Inhalts-Snapshot. Nur lesend, ohne Authentifizierung; keine Transkripte oder Videodateien.",
    },
    servers: [{ url: config.absolute("api/v1/") }],
    paths: {
      "/content.json": {
        get: {
          operationId: "getContent", summary: "Öffentlichen Inhalts-Snapshot abrufen",
          description: "Vollständiger Snapshot pro Website-Build. Keine serverseitigen Filter oder Paginierung. Unbekannte Angaben sind null oder leere Listen.",
          responses: {
            "200": {
              description: "Öffentliche Videos, Spiele und Zeitschriften",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Content" } } },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Content: record({
          schemaVersion: { type: "integer", const: 1 }, websiteUrl: uri,
          videos: array("Video"), games: array("Game"), magazines: array("Magazine"),
        }),
        Video: record({
          id: text, title: text, description: text, youtubeUrl: uri, pageUrl: uri,
          publishedAt: { type: ["string", "null"], format: "date-time" },
          durationSeconds: { type: ["integer", "null"], minimum: 0 }, gameIds: strings,
        }),
        Game: record({
          id: text, name: text, pageUrl: uri, videoIds: strings, platforms: strings,
          releaseYear: { type: ["integer", "null"] },
        }),
        Magazine: record({ name: text, pageUrl: uri, videoIds: strings }),
      },
    },
  };
  const catalog = {
    linkset: [{
      anchor: endpoint,
      "service-desc": [{ href: specification, type: "application/json" }],
      "service-doc": [{ href: documentation, type: "text/markdown" }],
    }],
  };
  const docs = `# Pretty Old Pixel Content API v1

Öffentliche, statische Read-only-API für die Inhalte von Pretty Old Pixel.

- [Inhalts-Snapshot](${endpoint})
- [OpenAPI 3.1](${specification})
- [API-Katalog nach RFC 9727](${config.absolute(".well-known/api-catalog")})
- [Website](${config.baseUrl})

## Verwendung

\`GET ${endpoint}\` liefert JSON ohne API-Schlüssel oder Authentifizierung.
Der vollständige Snapshot wird bei jedem Website-Build aus den lokalen
öffentlichen Quellen erzeugt. Er ist keine Echtzeitabfrage von YouTube.
Die API unterstützt nur GET und HEAD für statische Dateien. Sie bietet keine
Schreiboperationen, Suche, serverseitigen Filter oder Paginierung. Filtere die Daten lokal.

## Datenvertrag

\`schemaVersion: 1\` bezeichnet das Format. \`videos\` enthält ID, Titel,
Originalbeschreibung, YouTube- und Website-Link, Veröffentlichungszeit,
Laufzeit in Sekunden und Spiel-IDs. \`games\` enthält ID, Namen, Website-Link,
Video-IDs, belegte Plattformen und Erscheinungsjahr. \`magazines\` enthält
Namen, Website-Link und Video-IDs. Video-IDs verweisen auf \`videos[].id\`,
Spiel-IDs auf \`games[].id\`. Listen behalten die Katalogreihenfolge.
Unbekannte Zeitpunkte, Laufzeiten und Erscheinungsjahre sind \`null\`;
leere Plattformlisten bedeuten fehlende Angaben, nicht fehlende Plattformen.
Einzelne Einträge können sich ändern oder entfallen. Inkompatible
Schemaänderungen benötigen eine neue API-Hauptversion.

## Grenzen und Quellen

Die API enthält keine Videodateien, Player, vollständigen Transkripte oder vollständige
Spieledatenbank. Videotitel und Beschreibungen stammen aus öffentlichen
YouTube-Angaben; sie belegen keine vollständige Spielanleitung. Zitiere
die Inhaltsseite der Website und das Originalvideo. Es werden keine zusätzlichen Nutzungsrechte
an fremden Inhalten eingeräumt. Verfügbarkeit und Aktualisierungsfrequenz sind nicht garantiert.
Es gibt keinen separaten Health-Endpunkt.

## HTTP und Caching

HTTP 200 mit \`application/json\` ist für den Snapshot vorgesehen.
Das Hosting erfolgt über GitHub Pages, die Auslieferung über Cloudflare. Bestehende
Cache-Header bleiben erhalten. Verwende Cache-Validatoren nur, wenn sie tatsächlich
mitgeliefert werden. Rufe nicht für jede Frage erneut den gesamten Snapshot ab.
Die internen Offline-App-Dateien gehören nicht zum öffentlichen API-Vertrag.
`;
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  return new Map([
    [".well-known/api-catalog", json(catalog)],
    ["api/v1/content.json", json(data)],
    ["api/v1/openapi.json", json(openapi)],
    ["api/v1/readme.md", docs],
  ]);
}
