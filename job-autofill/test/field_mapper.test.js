/* field_mapper.test.js — the AI field-mapper fallback: pure prompt/parse core
 * (lib/field-map.js) + the DOM half (content/field-mapper.js) with a stubbed SW.
 * Run:  node test/field_mapper.test.js   (from job-autofill/)
 */
const { makeWindow, loadCore, load } = require("./harness");

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? "  ->  " + extra : "")); }
}
const tag = "[field_mapper]";
const GH_URL = "https://job-boards.greenhouse.io/acme/jobs/123";

function makeMapperWindow(html) {
  const w = makeWindow(html, { url: GH_URL });
  loadCore(w);
  ["src/lib/field-cache.js", "src/lib/field-map.js", "src/content/field-mapper.js"].forEach((p) => load(w, p));
  return w;
}

/* ------------------------------------------------ pure core: prompt build */
(function promptBuild() {
  const w = makeMapperWindow("<body></body>");
  const F = w.JAF.fieldMap;
  const p = F.buildMapPrompt(["Handle on GitHub", "T-shirt size"]);
  ok("prompt: numbers the labels", p.includes("1. Handle on GitHub") && p.includes("2. T-shirt size"));
  ok("prompt: carries the vocabulary", p.includes("firstName") && p.includes("coverLetter"));
  ok("prompt: never offers sensitive keys", !/gender|race|ethnicity|veteran|disability/i.test(p));
  ok("prompt: demands JSON-only output", /ONLY a JSON object/.test(p));
})();

/* ------------------------------------------------ pure core: parse ------- */
(function parse() {
  const w = makeMapperWindow("<body></body>");
  const P = w.JAF.fieldMap.parseMapResponse;
  ok("parse: clean JSON", JSON.stringify(P('{"1":"github","2":"unknown"}', 2)) === '{"1":"github","2":""}');
  ok("parse: JSON inside a markdown fence", JSON.stringify(P('```json\n{"1":"email"}\n```', 1)) === '{"1":"email"}');
  ok("parse: JSON wrapped in prose (server drafting path)",
     JSON.stringify(P('Sure! Here is the mapping: {"1":"phone"} Hope that helps.', 1)) === '{"1":"phone"}');
  ok("parse: invalid vocab value dropped", JSON.stringify(P('{"1":"favoriteColor"}', 1)) === "{}");
  ok("parse: sensitive key is NOT mappable", JSON.stringify(P('{"1":"gender"}', 1)) === "{}");
  ok("parse: out-of-range index dropped", JSON.stringify(P('{"7":"email"}', 2)) === "{}");
  ok("parse: garbage → null", P("I could not find any fields to map.", 2) === null);
  ok("parse: broken JSON → null", P('{"1": email}', 1) === null);
})();

/* ------------------------------------- collectUnmatched: what gets sent -- */
(function collect() {
  const w = makeMapperWindow(`<body><form>
      <label for="a">Email</label><input id="a" />
      <label for="b">Your handle on GitHub</label><input id="b" />
      <label for="c">Upload</label><input id="c" type="file" />
      <input id="d" />
      <label for="e">Secret</label><input id="e" type="password" />
    </form></body>`);
  const planned = [{ el: w.document.getElementById("a"), field: "email" }];
  const cands = w.JAF.fieldMapper.collectUnmatched(planned);
  ok("collect: planned element excluded", !cands.some((c) => c.el.id === "a"));
  ok("collect: unmatched labeled input included", cands.some((c) => c.el.id === "b"));
  ok("collect: file input excluded", !cands.some((c) => c.el.id === "c"));
  ok("collect: unlabeled input excluded", !cands.some((c) => c.el.id === "d"));
  ok("collect: password input excluded", !cands.some((c) => c.el.id === "e"));
})();

/* --------------------------- run(): novel labels → SW → items + cache ---- */
(async function runNovel() {
  const w = makeMapperWindow(`<body><form>
      <label for="b">Your handle on GitHub</label><input id="b" />
      <label for="x">Favorite color</label><input id="x" />
    </form></body>`);
  let calls = 0, sent = null;
  w.chrome.runtime.sendMessage = (msg, cb) => {
    calls++; sent = msg;
    cb({ mappings: { 1: "github", 2: "" } });
  };
  const values = { github: "https://github.com/ada", email: "ada@example.com" };

  const items = await w.JAF.fieldMapper.run([], values);
  ok("run: one batched SW call", calls === 1);
  ok("run: message carries only labels", sent && sent.type === "JAF_MAP_FIELDS" && Array.isArray(sent.labels) && sent.labels.length === 2);
  ok("run: no user values in the message", !JSON.stringify(sent.labels).includes("github.com/ada"));
  ok("run: mapped field becomes an item", items.length === 1 && items[0].field === "github" && items[0].el.id === "b");
  ok("run: item carries the bio value + AI flag", items[0].value === "https://github.com/ada" && items[0].aiMapped === true);

  // Second run on the same host: everything resolves from cache — no SW call.
  const again = await w.JAF.fieldMapper.run([], values);
  ok("run: second pass is cache-only (no new SW call)", calls === 1);
  ok("run: cached mapping still yields the item", again.length === 1 && again[0].field === "github");
  ok("run: known-unknown stays silent", !again.some((i) => i.el && i.el.id === "x"));

  /* ------------------------- run(): disabled AI → silent no-op, no cache -- */
  const w2 = makeMapperWindow(`<body><form>
      <label for="b">Your handle on GitHub</label><input id="b" /></form></body>`);
  let calls2 = 0;
  w2.chrome.runtime.sendMessage = (msg, cb) => { calls2++; cb({ disabled: true }); };
  const r2 = await w2.JAF.fieldMapper.run([], values);
  ok("run: disabled → no items", r2.length === 0);
  const r2b = await w2.JAF.fieldMapper.run([], values);
  ok("run: disabled → nothing cached (asks again next time)", calls2 === 2);

  /* ---------------- run(): mapping without a user value → no item, cached - */
  const w3 = makeMapperWindow(`<body><form>
      <label for="b">Personal website</label><input id="b" /></form></body>`);
  w3.chrome.runtime.sendMessage = (msg, cb) => cb({ mappings: { 1: "website" } });
  const r3 = await w3.JAF.fieldMapper.run([], { email: "a@b.c" }); // no website value
  ok("run: mapping without a value yields no item", r3.length === 0);

  report();
})().catch((e) => { fail++; fails.push("async run threw -> " + (e && e.message)); report(); });

/* --------------------------------------------------------------- report */
function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
}
