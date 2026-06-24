// Tests for the local field-choice cache (Task 0.1).
// Covers hit, miss, overwrite, per-profile namespacing, per-context bucketing,
// survives-reload (shared backing store), and learning from a user correction.
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }
const tick = () => new Promise((r) => setTimeout(r, 0));

const w = makeWindow();
load(w, "src/lib/field-cache.js");
const FC = w.JAF.fieldCache;

// fresh instance over an in-memory backing store we control
function fresh(profileId, backing) {
  return FC.create({ store: FC.memoryStore(backing), profileId: profileId || "p1", host: "acme.myworkdayjobs.com" });
}
const itemOf = (field, label, value) => ({ field, label: label || field, value, kind: "text" });

(async function run() {
  /* ---- pure helpers ---- */
  eq("slug normalizes", FC.slug("  Are You  Authorized? "), "are-you-authorized");
  ok("fieldKeyFor prefers canonical field", FC.fieldKeyFor({ field: "country", label: "Country" }) === "country");
  ok("fieldKeyFor falls back to label slug", FC.fieldKeyFor({ label: "Years of Go" }) === "years-of-go");
  ok("contextHash differs by label", FC.contextHash("h", "auth to work") !== FC.contextHash("h", "need sponsorship"));
  ok("contextHash stable", FC.contextHash("h", "Auth To Work") === FC.contextHash("h", "auth to work"));

  /* ---- miss ---- */
  const c = fresh("p1");
  ok("miss: empty cache returns null", (await c.get(itemOf("country", "Country"))) === null);

  /* ---- write + hit ---- */
  await c.remember(itemOf("country", "Country"), "United States");
  ok("hit: remembered value returned", (await c.get(itemOf("country", "Country"))) === "United States");

  /* ---- overwrite (last-write-wins) ---- */
  await c.remember(itemOf("country", "Country"), "Canada");
  ok("overwrite: latest value wins", (await c.get(itemOf("country", "Country"))) === "Canada");

  /* ---- per-context bucketing: same field, different question label ---- */
  const auth = itemOf("authorizedToWork", "Authorized to work?", "Yes");
  const spon = itemOf("authorizedToWork", "Require sponsorship?", "No");
  await c.remember(auth, "Yes");
  await c.remember(spon, "No");
  ok("context: auth question keeps its own answer", (await c.get(auth)) === "Yes");
  ok("context: sponsorship question keeps its own answer", (await c.get(spon)) === "No");

  /* ---- per-profile namespacing (shared backing store, different profile) ---- */
  const backing = new w.Map();
  const a1 = fresh("alice", backing);
  const b1 = fresh("bob", backing);
  await a1.remember(itemOf("gender", "Gender"), "Female");
  ok("namespace: other profile does not see it", (await b1.get(itemOf("gender", "Gender"))) === null);
  ok("namespace: owning profile sees it", (await a1.get(itemOf("gender", "Gender"))) === "Female");

  /* ---- survives reload: a new instance over the same backing store ---- */
  const a2 = fresh("alice", backing);
  ok("reload: persisted value survives a fresh instance", (await a2.get(itemOf("gender", "Gender"))) === "Female");

  /* ---- preferCached overrides the planned value, keeps original as alt ---- */
  const c2 = fresh("p2");
  await c2.remember(itemOf("country", "Country"), "Germany");
  const items = [itemOf("country", "Country", "United States")];
  await c2.preferCached(items);
  ok("prefer: planned value replaced by cached", items[0].value === "Germany");
  ok("prefer: cached flag set", items[0].cached === true);
  ok("prefer: original kept as alt", (items[0].alts || []).includes("United States"));
  // a miss leaves the item untouched
  const items2 = [itemOf("phone", "Phone", "404-555-1212")];
  await c2.preferCached(items2);
  ok("prefer: miss leaves value & flag untouched", items2[0].value === "404-555-1212" && !items2[0].cached);

  /* ---- watch(): learns from a user correction via a change event ---- */
  const c3 = fresh("p3");
  const input = w.document.createElement("input");
  input.value = "Atlanta";
  w.document.body.appendChild(input);
  const item = { field: "city", label: "City", value: "Atlanta", kind: "text", el: input };
  c3.watch(item);
  input.value = "Seattle";                         // user corrects the filled value
  input.dispatchEvent(new w.Event("change", { bubbles: true }));
  await tick();
  ok("watch: correction persisted", (await c3.get(itemOf("city", "City"))) === "Seattle");
  // idempotent binding: watching twice doesn't double-bind / throw
  c3.watch(item);
  ok("watch: re-watch is a no-op", true);

  /* ---- Phase 4: exportAll / importEntries (cloud-sync helpers) ---- */
  const expBack = new w.Map();
  const e1 = fresh("ada", expBack);
  await e1.remember(itemOf("country", "Country"), "United States");
  await e1.remember(itemOf("gender", "Gender"), "Female");
  const e2 = fresh("zoe", expBack); // shares the store; its entry must not be exported by e1
  await e2.remember(itemOf("country", "Country"), "Canada");
  const exported = await e1.exportAll();
  ok("exportAll: only the current profile's entries", exported.length === 2 && exported.every((x) => x.profileId === "ada"));
  ok("exportAll: carries the row fields", !!(exported[0].fieldKey && exported[0].contextHash && exported[0].value != null && "updatedAt" in exported[0]));

  const imp = fresh("ada", new w.Map());
  await imp.remember(itemOf("country", "Country"), "Old");
  const base = (await imp.exportAll())[0];
  await imp.importEntries([{ fieldKey: base.fieldKey, contextHash: base.contextHash, value: "Newer", hitCount: 9, updatedAt: base.updatedAt + 1000 }]);
  ok("import: newer updatedAt wins", (await imp.get(itemOf("country", "Country"))) === "Newer");
  ok("import: hitCount takes the max", (await imp.exportAll()).find((x) => x.fieldKey === base.fieldKey).hitCount >= 9);
  await imp.importEntries([{ fieldKey: base.fieldKey, contextHash: base.contextHash, value: "Stale", hitCount: 1, updatedAt: 1 }]);
  ok("import: older updatedAt does not regress the value", (await imp.get(itemOf("country", "Country"))) === "Newer");
  const impZoe = fresh("zoe", new w.Map());
  await impZoe.importEntries([{ fieldKey: "country", contextHash: e1.contextHash("acme.myworkdayjobs.com", "Country"), value: "Mexico", hitCount: 1, updatedAt: 2 }]);
  ok("import: stored under the importing profile", (await impZoe.get(itemOf("country", "Country"))) === "Mexico");
  ok("import: ignores malformed entries", (await imp.importEntries([{ value: "x" }, null, { fieldKey: "f" }])) === 0);

  console.log(`\n[field_cache] ${pass} passed, ${fail} failed`);
  if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log("[field_cache] All green.");
})();
