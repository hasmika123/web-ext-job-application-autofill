// Regression for an image-only PDF reaching the extension parser with no text layer.
const path = require("path");
const { pathToFileURL } = require("url");
const { makeWindow, load } = require("./harness");

async function run() {
  const w = makeWindow();
  const fixtureRoot = path.join(__dirname, "fixtures");
  w.chrome.runtime.getURL = (p) => pathToFileURL(path.join(fixtureRoot, p)).href;
  load(w, "src/lib/parser-core.js");
  // The OCR adapter is a browser/WASM boundary. This test drives the parser through
  // that public adapter contract while the web test covers the Tesseract call shape.
  w.JAF.resumeOcr = {
    ocrPdfDocument: async () => "Grace Hopper\ngrace@example.test\n+1 (415) 555-0123\nCompiler engineer",
  };
  load(w, "src/lib/parser.js");

  const bytes = new TextEncoder().encode("synthetic image-only PDF");
  const file = new w.File([bytes], "scanned-resume.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
  const parsed = await w.JAF.parser.parse(file, {});
  const text = parsed.__rawText || "";
  const bio = w.JAF.parser.parseBio(text);

  const checks = [
    ["extension: OCR text reaches raw text", text.includes("Grace Hopper")],
    ["extension: OCR email reaches bio", bio.email === "grace@example.test"],
    ["extension: OCR phone reaches bio", bio.phone === "+1 (415) 555-0123"],
  ];
  const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
  console.log(`\n[parser-ocr] ${checks.length - failures.length} passed, ${failures.length} failed`);
  if (failures.length) {
    failures.forEach((name) => console.log(`  x ${name}`));
    process.exit(1);
  }
  console.log("[parser-ocr] All green.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
