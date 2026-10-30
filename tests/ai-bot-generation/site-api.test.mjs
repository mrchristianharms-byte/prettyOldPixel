import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { generateAiBot } from "../../src/ai-bot-generation/generate-ai-bot.mjs";
import { loadContentData, normalizeSources } from "../../src/content-data/content-data.mjs";
import { createSiteConfig } from "../../src/site-generation/site-config.mjs";
import { generateApi } from "../../src/ai-bot-generation/site-api.mjs";

function validate(value, schema, schemas) {
  if (schema.$ref) return validate(value, schemas[schema.$ref.split("/").at(-1)], schemas);
  const type = value === null ? "null" : Array.isArray(value) ? "array"
    : Number.isInteger(value) ? "integer" : typeof value;
  assert.ok([schema.type].flat().includes(type), `${type} passt nicht zu ${schema.type}`);
  if (schema.const !== undefined) assert.equal(value, schema.const);
  if (schema.minimum !== undefined && value !== null) assert.ok(value >= schema.minimum);
  if (schema.format === "uri") assert.ok(["https:", "http:"].includes(new URL(value).protocol));
  if (schema.format === "date-time" && value !== null) assert.ok(Number.isFinite(Date.parse(value)));
  if (type === "array") for (const item of value) validate(item, schema.items, schemas);
  if (type === "object") {
    assert.deepEqual(Object.keys(value).sort(), [...schema.required].sort());
    for (const [key, item] of Object.entries(value)) validate(item, schema.properties[key], schemas);
  }
}

test("Cloudflare-Discovery-Regel ergänzt nur die Homepage und verweist auf reale Build-Ausgaben", async () => {
  const rule = JSON.parse(await readFile(new URL("../../src/ai-bot-generation/cloudflare-discovery-rule.json", import.meta.url), "utf8"));
  assert.equal(rule.expression, '(http.host eq "prettyoldpixel.com" and http.request.uri.path eq "/")');
  assert.equal(rule.action, "rewrite");
  assert.equal(rule.enabled, true);
  assert.deepEqual(Object.keys(rule.action_parameters.headers), ["link"]);
  const header = rule.action_parameters.headers.link;
  assert.equal(header.operation, "add");
  assert.doesNotMatch(header.value, /[\r\n]/u);
  const model = await loadContentData(new URL("../../cache/", import.meta.url).pathname);
  const files = generateAiBot(model, createSiteConfig(), new Map());
  const links = header.value.split(/,\s*(?=<)/u);
  assert.equal(links.length, 4);
  const relations = new Map(links.map((link) => {
    const match = /^<([^>]+)>; rel="([^"]+)"; type="([^"]+)"(?:; anchor="([^"]+)")?$/u.exec(link);
    assert.ok(match, link);
    const [, target, relation, type, anchor] = match;
    assert.ok(files.has(target.slice(1)), target);
    if (anchor) assert.ok(files.has(anchor.slice(1)), anchor);
    return [relation, { target, type, anchor }];
  }));
  assert.deepEqual([...relations.keys()], ["api-catalog", "service-desc", "service-doc", "describedby"]);
  assert.equal(relations.get("api-catalog").type, "application/linkset+json");
  assert.equal(relations.get("describedby").target, "/llms.txt");
  for (const relation of ["service-desc", "service-doc"]) {
    assert.equal(relations.get(relation).anchor, "/api/v1/content.json");
  }
});

test("erzeugt RFC-9727-Linkset mit auflösbaren OpenAPI- und Dokumentationslinks", async () => {
  const model = await loadContentData(new URL("../../cache/", import.meta.url).pathname);
  for (const base of ["https://prettyoldpixel.com/", "https://example.org/vorschau/"]) {
    const config = createSiteConfig(base);
    const files = generateApi(model, config);
    const catalog = JSON.parse(files.get(".well-known/api-catalog"));
    assert.equal(catalog.linkset.length, 1);
    const [entry] = catalog.linkset;
    assert.equal(entry.anchor, `${base}api/v1/content.json`);
    for (const relation of ["service-desc", "service-doc"]) {
      assert.equal(entry[relation].length, 1);
      assert.ok(files.has(entry[relation][0].href.slice(base.length)));
    }
    assert.equal(entry["service-desc"][0].type, "application/json");
    assert.equal(entry["service-doc"][0].type, "text/markdown");
    assert.ok(!("status" in entry));
    const spec = JSON.parse(files.get("api/v1/openapi.json"));
    assert.equal(spec.openapi, "3.1.0");
    assert.equal(new URL("content.json", spec.servers[0].url).href, entry.anchor);
    assert.deepEqual(Object.keys(spec.paths), ["/content.json"]);
    assert.deepEqual(Object.keys(spec.paths["/content.json"]), ["get"]);
    const data = JSON.parse(files.get("api/v1/content.json"));
    validate(data, spec.components.schemas.Content, spec.components.schemas);
    assert.equal(data.videos.length, model.videos.length);
    assert.equal(data.games.length, model.games.length);
    assert.equal(data.magazines.length, model.magazines.length);
    const videoIds = new Set(data.videos.map((video) => video.id));
    const gameIds = new Set(data.games.map((game) => game.id));
    for (const video of data.videos) {
      for (const id of video.gameIds) assert.ok(gameIds.has(id));
    }
    for (const item of [...data.games, ...data.magazines]) {
      for (const id of item.videoIds) assert.ok(videoIds.has(id));
      assert.ok(item.pageUrl.startsWith(base));
    }
    assert.ok(files.get("api/v1/readme.md").includes(entry.anchor));
    assert.ok(!files.get("api/v1/readme.md").includes("undefined"));
    assert.deepEqual([...files], [...generateApi(model, config)]);
  }
});

test("erhält unbekannte Angaben und leere Katalogbereiche ohne erfundene Daten", () => {
  const channel = { id: "UC-test", title: "Test" };
  const model = normalizeSources({
    videos: { channel, complete: true, videos: [
      { id: "b0000000000", title: "Ohne Metadaten", description: "" },
    ] },
    playlists: { channel, complete: true, playlists: [] },
    magazines: { channel, videos: [] },
  });
  const files = generateApi(model, createSiteConfig());
  const data = JSON.parse(files.get("api/v1/content.json"));
  const spec = JSON.parse(files.get("api/v1/openapi.json"));
  validate(data, spec.components.schemas.Content, spec.components.schemas);
  assert.equal(data.videos[0].publishedAt, null);
  assert.equal(data.videos[0].durationSeconds, null);
  assert.deepEqual(data.games, []);
  assert.deepEqual(data.magazines, []);
});
