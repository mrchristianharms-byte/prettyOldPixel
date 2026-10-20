import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const directory = fileURLToPath(new URL("./", import.meta.url));

export async function generateCss({
  outputFile = path.join(directory, "vendor/pico-2.1.1.site.min.css"),
  logger = console,
} = {}) {
  const { PurgeCSS } = await import("purgecss");
  const original = await readFile(path.join(directory, "vendor/pico-2.1.1.min.css"), "utf8");
  const custom = await readFile(path.join(directory, "site.css"), "utf8");
  const [result] = await new PurgeCSS().purge({
    content: [path.join(directory, "**/*.mjs"), path.join(directory, "*.js")],
    css: [{ raw: original }],
    variables: true,
    safelist: {
      standard: [":root", ":host", "html", "body", "data-theme", "light", "dark", /^h[1-6]$/u],
      // Preserve compound pseudo-only rules such as Pico's heading spacing.
      greedy: [/^:is$/u],
      variables: [...custom.matchAll(/var\((--[\w-]+)/gu)].map((match) => match[1]),
    },
  });
  if (!result?.css || !result.css.includes("Pico CSS")) {
    throw new Error("CSS-Optimierung hat kein gültiges Pico-Stylesheet erzeugt.");
  }
  await writeFile(outputFile, `${result.css}\n`);
  logger.log(`Pico CSS: ${Buffer.byteLength(original)} → ${Buffer.byteLength(result.css)} Bytes; gzip: ${gzipSync(original).length} → ${gzipSync(result.css).length} Bytes.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error("Aufruf: npm run dev:generate:css");
    await generateCss();
  } catch (error) {
    console.error(`CSS-Optimierung fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
  }
}
