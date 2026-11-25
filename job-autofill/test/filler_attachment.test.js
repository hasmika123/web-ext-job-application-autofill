/* filler_attachment.test.js — the real overlay reports the verified file result. */
const { makeWindow, load, loadCore } = require("./harness");

let pass = 0, fail = 0;
const fails = [];
const tag = "[filler_attachment]";
function ok(name, condition, extra) {
  if (condition) pass++;
  else { fail++; fails.push(name + (extra ? "  ->  " + extra : "")); }
}

function installDataTransfer(w) {
  class TestDataTransfer {
    constructor() {
      this._files = [];
      this.items = { add: (file) => { this._files.push(file); } };
    }
    get files() {
      const files = this._files.slice();
      files.item = (i) => files[i] || null;
      return files;
    }
  }
  w.DataTransfer = TestDataTransfer;
}

async function run(accepted) {
  const w = makeWindow(`<body>
    <div data-automation-id="formField-resumeAttachments" data-wd-file="true">
      <div data-automation-id="file-upload-drop-zone">
        <button type="button" data-automation-id="select-files">Select file</button>
        <input data-automation-id="file-upload-input-ref" type="file" accept=".pdf" style="display:none">
      </div>
      <div data-automation-id="file-upload-successful"></div>
    </div>
  </body>`, { url: "https://acme.myworkdayjobs.com/en-US/careers" });
  installDataTransfer(w);
  const input = w.document.querySelector('input[type="file"]');
  Object.defineProperty(input, "files", { configurable: true, writable: true, value: [] });
  if (accepted) {
    w.document.querySelector('[data-automation-id="file-upload-drop-zone"]').addEventListener("drop", (event) => {
      input.files = event.dataTransfer.files;
    });
  } else {
    Object.defineProperty(input, "files", { configurable: true, get() { return []; }, set() {} });
  }
  const messages = [];
  loadCore(w);
  ["src/content/adapters/generic.js", "src/lib/fill-telemetry.js", "src/content/required-audit.js", "src/content/filler.js"].forEach((p) => load(w, p));
  w.chrome.runtime.sendMessage = (message) => { messages.push(message); };

  await w.JAF.filler.start({}, { base64: "cGRm", type: "application/pdf", name: "tailored.pdf" }, {
    assist: false,
    mapFields: false,
    batch: true,
    autoFill: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 2600));
  return { w, input, messages, review: w.JAF.filler.batchReviewSnapshot() };
}

(async function main() {
  const success = await run(true);
  const successStats = success.messages.find((m) => m.type === "JAF_FILL_STATS");
  ok("accepted file: input retains the tailored resume", success.input.files.length === 1 && success.input.files[0].name === "tailored.pdf");
  ok("accepted file: review reports attached", success.review.fileStatus === "ok", JSON.stringify(success.review));
  ok("accepted file: telemetry reports zero attachment failures", successStats && successStats.stats.attachmentsFailed === 0, JSON.stringify(successStats));
  ok("accepted file: telemetry has no filename", JSON.stringify(success.messages).indexOf("tailored.pdf") === -1);

  const rejected = await run(false);
  const rejectedStats = rejected.messages.find((m) => m.type === "JAF_FILL_STATS");
  ok("rejected file: review asks the user to attach", rejected.review.fileStatus === "failed", JSON.stringify(rejected.review));
  ok("rejected file: telemetry counts one failure", rejectedStats && rejectedStats.stats.attachmentsFailed === 1, JSON.stringify(rejectedStats));
  ok("rejected file: failure telemetry has no filename", JSON.stringify(rejected.messages).indexOf("tailored.pdf") === -1);
})().then(report, (error) => { fail++; fails.push("test threw -> " + (error && error.stack || error)); report(); });

function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
}
