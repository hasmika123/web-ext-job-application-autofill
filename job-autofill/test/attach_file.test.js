/* attach_file.test.js — file inputs and drop-zone widgets must report verified attachment. */
const { makeWindow, loadCore } = require("./harness");

let pass = 0, fail = 0;
const fails = [];
const tag = "[attach_file]";
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

function fileInput(w, html) {
  const input = w.document.querySelector('input[type="file"]');
  Object.defineProperty(input, "files", { configurable: true, writable: true, value: [] });
  if (html) input.parentElement.insertAdjacentHTML("beforeend", html);
  return input;
}

function blob(w, text) {
  return new w.Blob([text || "resume"], { type: "application/pdf" });
}

(async function nativeInput() {
  const w = makeWindow('<body><input id="resume" type="file"></body>');
  installDataTransfer(w);
  loadCore(w);
  const input = fileInput(w);
  const result = await w.JAF.adapterBase.attachFileDetailed(input, blob(w, "pdf"), "tailored.pdf");
  ok("native input: verified success", result.ok === true, JSON.stringify(result));
  ok("native input: intended file remains selected", input.files.length === 1 && input.files[0].name === "tailored.pdf");
  ok("native input: no drop needed", result.method === "input", JSON.stringify(result));
})();

(async function workdayDropZone() {
  const w = makeWindow(`<body>
    <div data-automation-id="formField-resumeAttachments" data-wd-file="true">
      <div data-automation-id="file-upload-drop-zone" style="border:1px dashed">
        <button type="button" data-automation-id="select-files">Select file</button>
        <input data-automation-id="file-upload-input-ref" type="file" accept=".pdf,.doc,.docx" style="display:none">
      </div>
      <div class="wd-files" data-automation-id="file-upload-successful"></div>
    </div>
  </body>`);
  installDataTransfer(w);
  loadCore(w);
  const input = fileInput(w);
  const zone = w.document.querySelector('[data-automation-id="file-upload-drop-zone"]');
  const files = w.document.querySelector('[data-automation-id="file-upload-successful"]');
  Object.defineProperty(input, "files", { configurable: true, writable: true, value: [] });
  let drops = 0;
  zone.addEventListener("drop", (event) => {
    drops++;
    input.files = event.dataTransfer.files;
  });
  input.addEventListener("change", () => {
    const selected = input.files[0];
    if (selected) files.textContent = selected.name;
  });
  const adapter = w.JAF.adapters.find((a) => a.id === "workday");
  ok("Workday: hidden resume input is selected", adapter.fileInput() === input);
  const result = await w.JAF.adapterBase.attachFileDetailed(input, blob(w, "workday"), "workday-tailored.pdf");
  ok("Workday: drop event was delivered", drops === 1);
  ok("Workday: widget accepted the file", result.ok === true && result.method === "drop", JSON.stringify(result));
  ok("Workday: fixture shows the accepted filename", files.textContent === "workday-tailored.pdf");
})();

(async function rejectionIsNotSuccess() {
  const w = makeWindow(`<body><div data-testid="resume-dropzone"><input type="file" style="display:none"></div></body>`);
  installDataTransfer(w);
  loadCore(w);
  const input = fileInput(w);
  Object.defineProperty(input, "files", { configurable: true, get() { return []; }, set() {} });
  const result = await w.JAF.adapterBase.attachFileDetailed(input, blob(w, "rejected"), "rejected.pdf");
  ok("rejection: assignment without acceptance is failure", result.ok === false, JSON.stringify(result));
  ok("rejection: failure has a stable reason", ["widget-rejected-file", "file-assignment-failed"].includes(result.reason), JSON.stringify(result));
  ok("boolean compatibility: failed detail becomes false", (await w.JAF.adapterBase.attachFile(input, blob(w, "rejected"), "rejected.pdf")) === false);
})();

function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
}

Promise.resolve().then(() => setTimeout(report, 20));
