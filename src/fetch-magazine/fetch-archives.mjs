import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractBlaetterabendVideos } from "../extra-data/generate-blaetterabend.mjs";
import { findKultmagsIssue, loadKultmagsCatalog } from "./fetch-kultmags.mjs";
import { loadReetrozCatalog } from "./fetch-reetroz.mjs";
import { loadPcgamesdatabaseCatalog } from "./fetch-pcgamesdatabase.mjs";
import { loadAmrCatalog } from "./fetch-amr.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function fetchArchives({
  sourceFile = path.join(projectRoot, "cache", "youtube-videos.json"),
  refresh = false,
  kultmags = {},
  reetroz = {},
  pcgamesdatabase = {},
  amr = {},
  log = console.log,
} = {}) {
  const source = JSON.parse(await readFile(sourceFile, "utf8"));
  if (!Array.isArray(source.videos)) throw new Error("Video-Cache: Videoliste fehlt.");
  const videos = extractBlaetterabendVideos(source.videos);
  const magazineNames = videos.flatMap((video) => video.magazines.map((magazine) => magazine.name));
  if (amr && magazineNames.includes("Amiga Action")) {
    await loadAmrCatalog({ ...amr, log, refresh, cachedOnly: false });
  }
  if (pcgamesdatabase && magazineNames.includes("GameStar")) {
    await loadPcgamesdatabaseCatalog({ ...pcgamesdatabase, log, refresh, cachedOnly: false });
  }
  const catalog = await loadKultmagsCatalog({ ...kultmags, log, refresh, magazineNames, cachedOnly: false });
  const missingNames = videos.flatMap((video) => video.magazines
    .filter((magazine) => findKultmagsIssue(catalog, magazine.name, magazine.issue, video.title) === null)
    .map((magazine) => magazine.name));
  await loadReetrozCatalog({ ...reetroz, log, refresh, magazineNames: missingNames, cachedOnly: false });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--refresh")) {
    console.error("Aufruf: node src/fetch-magazine/fetch-archives.mjs [--refresh]");
    process.exitCode = 1;
  } else {
    await fetchArchives({ refresh: args.includes("--refresh") }).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
