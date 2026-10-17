import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = path.join(projectRoot, "public");

const html = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Eine kleine Website, gebaut aus statischen Dateien.">
    <title>Pretty Old Pixel</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <main>
      <p class="eyebrow">Eine neue Website</p>
      <h1>Pretty Old Pixel</h1>
      <p class="intro">Die Seite ist bereit für den nächsten Schritt.</p>
      <p class="note">Diese statischen Dateien werden mit einem Script aus <code>src/</code> erstellt.</p>
    </main>
  </body>
</html>
`;

const css = `:root {
  color-scheme: light;
  font-family: system-ui, sans-serif;
  color: #242424;
  background: #f4f1eb;
}

* {
  box-sizing: border-box;
}

body {
  display: grid;
  min-height: 100vh;
  margin: 0;
  place-items: center;
  padding: 2rem;
}

main {
  width: min(100%, 42rem);
  padding: clamp(2rem, 8vw, 5rem);
  border: 1px solid #ded8cd;
  border-radius: 1.5rem;
  background: #fffdf9;
  box-shadow: 0 1.5rem 4rem rgb(42 35 24 / 8%);
}

.eyebrow {
  color: #8a5733;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1 {
  margin: 0.5rem 0 1rem;
  font-size: clamp(2.5rem, 9vw, 5rem);
  line-height: 1;
}

.intro {
  font-size: 1.25rem;
}

.note {
  margin-top: 3rem;
  color: #666;
  font-size: 0.9rem;
}

code {
  padding: 0.15em 0.35em;
  border-radius: 0.25em;
  background: #f0ece5;
}
`;

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, "index.html"), html),
  writeFile(path.join(outputDirectory, "styles.css"), css),
  writeFile(path.join(outputDirectory, ".nojekyll"), ""),
]);

console.log(`Statische Website erstellt: ${outputDirectory}`);
