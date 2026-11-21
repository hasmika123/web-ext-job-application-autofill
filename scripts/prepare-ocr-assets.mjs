import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetName = process.argv[2];

const targets = {
  web: path.join(repoRoot, "web", "public", "ocr"),
  extension: path.join(repoRoot, "job-autofill", "public", "vendor", "ocr"),
};

if (!(targetName in targets)) {
  throw new Error("Usage: node scripts/prepare-ocr-assets.mjs <web|extension>");
}

const packageRoot = (name) => path.dirname(require.resolve(`${name}/package.json`));
const tesseractRoot = packageRoot("tesseract.js");
const coreRoot = packageRoot("tesseract.js-core");
const languageRoot = packageRoot("@tesseract.js-data/eng");
const targetRoot = targets[targetName];

const files = [
  [path.join(tesseractRoot, "dist", "worker.min.js"), "worker.min.js"],
  [path.join(coreRoot, "tesseract-core-lstm.wasm.js"), "tesseract-core-lstm.wasm.js"],
  [path.join(coreRoot, "tesseract-core-lstm.wasm"), "tesseract-core-lstm.wasm"],
  [path.join(languageRoot, "4.0.0_best_int", "eng.traineddata.gz"), "eng.traineddata.gz"],
];

await mkdir(targetRoot, { recursive: true });
await Promise.all(files.map(([source, name]) => copyFile(source, path.join(targetRoot, name))));

console.log(`Prepared ${files.length} local OCR assets in ${path.relative(repoRoot, targetRoot)}`);
