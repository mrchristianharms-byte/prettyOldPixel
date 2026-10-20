import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { attachMagazineLogo, cacheKultmagsLogo, cleanKultmagsLogos, convertKultmagsLogo } from "../src/kultmags-logos.mjs";
import { magazineLogo } from "../src/widget/magazine-logo.mjs";
import { createSiteConfig } from "../src/site-config.mjs";

test("konvertiert Kultmags-Logos und sortiert Original, WebP und GIF nach tatsächlichen Bytes", async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "logo-variants-"));
  try {
    const bytes = await sharp({ create: { width: 80, height: 24, channels: 4, background: "#ff000080" } }).png().toBuffer();
    const logo = await cacheKultmagsLogo("https://www.kultmags.com/title.png", cacheDir, {
      fetchResponse: async () => new Response(bytes),
    });
    assert.deepEqual(logo.variants.map(({ file }) => path.extname(file)), [".webp", ".gif"]);
    assert.ok(logo.variants.every(({ file }) => path.parse(file).name === path.parse(logo.file).name));
    for (const { file } of logo.variants) {
      const metadata = await sharp(await readFile(path.join(cacheDir, "logos", file))).metadata();
      assert.equal(metadata.width, 80);
      assert.equal(metadata.height, 24);
      assert.equal(metadata.hasAlpha, true);
    }
    assert.equal(await convertKultmagsLogo(logo, cacheDir), logo);
    const migrated = await convertKultmagsLogo({ url: logo.url, file: logo.file }, cacheDir);
    assert.deepEqual(migrated, logo);
    const oldVariants = [];
    for (const variant of logo.variants) {
      const contents = await readFile(path.join(cacheDir, "logos", variant.file));
      const file = `${createHash("sha256").update(contents).digest("hex")}${path.extname(variant.file)}`;
      await writeFile(path.join(cacheDir, "logos", file), contents);
      oldVariants.push({ file });
    }
    assert.deepEqual(await convertKultmagsLogo({ ...logo, variants: oldVariants }, cacheDir), logo);
    const model = { magazineLogoAssets: new Map() };
    const magazine = { name: "Testmagazin" };
    const cached = { url: "https://www.kultmags.com/mags.php", logo };
    await attachMagazineLogo(model, magazine, cached, cacheDir, "kultmags.com");
    const candidates = magazine.logo.candidates;
    assert.equal(candidates.length, 3);
    assert.deepEqual(candidates.map(({ size }) => size), candidates.map(({ size }) => size).sort((a, b) => a - b));
    for (const candidate of candidates) assert.equal(candidate.size, model.magazineLogoAssets.get(candidate.asset).length);
    const html = magazineLogo(magazine, createSiteConfig().forPage("zeitschriften/test/"));
    assert.deepEqual([...html.matchAll(/<source type="([^"]+)" srcset="([^"]+)">/gu)].map(([, type, url]) => ({ type, url })),
      candidates.map(({ type, asset }) => ({ type, url: `../../${asset}` })));
    assert.equal(magazine.logo.asset, candidates.find(({ type }) => type !== "image/webp").asset);
    await writeFile(path.join(cacheDir, "logos", logo.variants[0].file), bytes);
    await assert.rejects(attachMagazineLogo(model, magazine, cached, cacheDir, "kultmags.com"), /Logo-Inhalt/u);
    await assert.rejects(convertKultmagsLogo({ file: "../escape.png" }, cacheDir), /Dateiname/u);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test("behält GIF-Animationen in beiden konvertierten Varianten bei", async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "animated-logo-"));
  try {
    const pixels = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]);
    const bytes = await sharp(pixels, { raw: { width: 1, height: 2, channels: 4, pageHeight: 1 } })
      .gif({ delay: [100, 200], loop: 0 }).toBuffer();
    const logo = await cacheKultmagsLogo("https://www.kultmags.com/title.gif", cacheDir, {
      fetchResponse: async () => new Response(bytes),
    });
    assert.equal(logo.variants.find(({ file }) => file.endsWith(".gif")).file, logo.file);
    assert.deepEqual(await readFile(path.join(cacheDir, "logos", logo.file)), bytes);
    for (const { file } of logo.variants) {
      const metadata = await sharp(await readFile(path.join(cacheDir, "logos", file)), { animated: true }).metadata();
      assert.equal(metadata.pages, 2);
      assert.deepEqual(metadata.delay, [100, 200]);
      assert.equal(metadata.loop, 0);
    }
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test("bereinigt nur nicht referenzierte Bilddateien und prüft vorher sämtliche Magazin-Caches", async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "logo-cleanup-"));
  try {
    await mkdir(path.join(cacheDir, "magazines"));
    const logos = [];
    for (const [index, background] of ["red", "blue"].entries()) {
      const bytes = await sharp({ create: { width: 10, height: 10, channels: 4, background } }).png().toBuffer();
      const logo = await cacheKultmagsLogo(`https://www.kultmags.com/${index}.png`, cacheDir, {
        fetchResponse: async () => new Response(bytes),
      });
      logos.push(logo);
      await writeFile(path.join(cacheDir, "magazines", `${index}.json`), JSON.stringify({ logo }));
    }
    const orphan = `${"a".repeat(64)}.png`;
    await writeFile(path.join(cacheDir, "logos", orphan), "obsolete");
    await writeFile(path.join(cacheDir, "logos", "notes.txt"), "unrelated");
    const original = await readFile(path.join(cacheDir, "logos", logos[1].file));
    await writeFile(path.join(cacheDir, "logos", logos[1].file), "damaged");
    await assert.rejects(cleanKultmagsLogos(cacheDir), /Logo-Inhalt/u);
    assert.ok((await readdir(path.join(cacheDir, "logos"))).includes(orphan));
    await writeFile(path.join(cacheDir, "logos", logos[1].file), original);
    assert.deepEqual(await cleanKultmagsLogos(cacheDir), [orphan]);
    const files = await readdir(path.join(cacheDir, "logos"));
    assert.equal(files.length, 7);
    assert.ok(files.includes("notes.txt"));
    for (const logo of logos) {
      for (const { file } of [logo, ...logo.variants]) assert.ok(files.includes(file));
    }
    assert.deepEqual(await cleanKultmagsLogos(cacheDir), []);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});
