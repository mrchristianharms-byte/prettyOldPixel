import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./fetch-channel/fetch-youtube.mjs";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
