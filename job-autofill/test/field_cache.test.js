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
  ok("contextHash ignores generated question ids", FC.contextHash("h", "How did you hear about us? question_12345") === FC.contextHash("h", "How did you hear about us? question_99881"));
  ok("stable free-form key ignores generated question ids", FC.fieldKeyFor({ label: "How did you hear about us? question_12345" }) === FC.fieldKeyFor({ label: "How did you hear about us? question_99881" }));

  /* ---- miss ---- */
  const c = fresh("p1");
  ok("miss: empty cache returns null", (await c.get(itemOf("country", "Country"))) === null);

  const dynamicQuestion = fresh("dynamic");
  const firstPosting = itemOf("", "How did you hear about us? question_12345");
  const nextPosting = itemOf("", "How did you hear about us? question_99881");
  await dynamicQuestion.remember(firstPosting, "Employee referral");
  ok("dynamic question ids do not fragment learned answers", (await dynamicQuestion.get(nextPosting)) === "Employee referral");

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

  /* ---- watch(): a radio correction fires on the option the user selected ---- */
  const c4 = fresh("p4");
  const radioYes = w.document.createElement("input");
  radioYes.type = "radio"; radioYes.name = "sponsor"; radioYes.value = "Yes"; radioYes.id = "sponsor-yes"; radioYes.checked = true;
  const yesLabel = w.document.createElement("label"); yesLabel.htmlFor = radioYes.id; yesLabel.textContent = "Yes";
  const radioNo = w.document.createElement("input");
  radioNo.type = "radio"; radioNo.name = "sponsor"; radioNo.value = "No"; radioNo.id = "sponsor-no";
  const noLabel = w.document.createElement("label"); noLabel.htmlFor = radioNo.id; noLabel.textContent = "No";
  w.document.body.append(yesLabel, radioYes, noLabel, radioNo);
  const radioItem = { field: "requireSponsorship", label: "Require sponsorship?", value: "Yes", kind: "boolean", el: radioYes };
  c4.watch(radioItem, { baseline: "Yes" });
  radioNo.checked = true;
  radioYes.checked = false;
  radioNo.dispatchEvent(new w.Event("change", { bubbles: true }));
  await tick();
  ok("watch: changing another radio option persists the selected label", (await c4.get(itemOf("requireSponsorship", "Require sponsorship?"))) === "No");

  /* ---- watch(): native select and custom choice controls use visible committed text ---- */
  const c5 = fresh("p5");
  const select = w.document.createElement("select");
  select.innerHTML = '<option value="">Select one</option><option value="referral">Employee referral</option><option value="search">Search</option>';
  w.document.body.appendChild(select);
  const selectItem = { field: "referralSource", label: "How did you hear about us?", value: "Employee referral", kind: "select", el: select };
  c5.watch(selectItem);
  select.value = "search";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  await tick();
  ok("watch: native select persists the visible option", (await c5.get(itemOf("referralSource", "How did you hear about us?"))) === "Search");
  const combo = w.document.createElement("div");
  combo.setAttribute("role", "combobox");
  const comboInput = w.document.createElement("input");
  const selected = w.document.createElement("span");
  selected.className = "single-value";
  selected.textContent = "Employee referral";
  combo.append(comboInput, selected);
  w.document.body.appendChild(combo);
  const comboItem = { field: "referralSource", label: "How did you hear about us?", value: "Employee referral", kind: "combo", el: comboInput };
  c5.watch(comboItem);
  selected.textContent = "Company website";
  comboInput.dispatchEvent(new w.Event("blur", { bubbles: true }));
  await tick();
  ok("watch: custom choice persists the visible selected text", (await c5.get(itemOf("referralSource", "How did you hear about us?"))) === "Company website");

  /* ---- Phase 4: exportAll / importEntries (cloud-sync helpers) ---- */
  const expBack = new w.Map();
  const e1 = fresh("ada", expBack);
  await e1.remember(itemOf("country", "Country"), "United States");
  await e1.remember(itemOf("gender", "Gender"), "Female");
  const e2 = fresh("zoe", expBack); // shares the store; its entry must not be exported by e1
  await e2.remember(itemOf("country", "Country"), "Canada");
  const exported = await e1.exportAll();
  // 2 answers x (host-scoped row + host-agnostic twin) = 4.
  ok("exportAll: only the current profile's entries", exported.length === 4 && exported.every((x) => x.profileId === "ada"));
  ok("exportAll: each answer exports its site row and its cross-site twin",
    exported.filter((x) => x.fieldKey === "country").length === 2 &&
    exported.some((x) => x.contextHash === FC.contextHash("acme.myworkdayjobs.com", "Country")) &&
    exported.some((x) => x.contextHash === FC.globalContextHash("Country")));
  ok("exportAll: carries the row fields", !!(exported[0].fieldKey && exported[0].contextHash && exported[0].value != null && "updatedAt" in exported[0]));

  const imp = fresh("ada", new w.Map());
  await imp.remember(itemOf("country", "Country"), "Old");
  // Pin to the HOST-scoped row: it's the one a read prefers, so it's the one these
  // last-write-wins assertions are about.
  const base = (await imp.exportAll()).find((x) => x.contextHash === FC.contextHash("acme.myworkdayjobs.com", "Country"));
  await imp.importEntries([{ fieldKey: base.fieldKey, contextHash: base.contextHash, value: "Newer", hitCount: 9, updatedAt: base.updatedAt + 1000 }]);
  ok("import: newer updatedAt wins", (await imp.get(itemOf("country", "Country"))) === "Newer");
  ok("import: hitCount takes the max", (await imp.exportAll()).find((x) => x.contextHash === base.contextHash).hitCount >= 9);
  await imp.importEntries([{ fieldKey: base.fieldKey, contextHash: base.contextHash, value: "Stale", hitCount: 1, updatedAt: 1 }]);
  ok("import: older updatedAt does not regress the value", (await imp.get(itemOf("country", "Country"))) === "Newer");
  const impZoe = fresh("zoe", new w.Map());
  await impZoe.importEntries([{ fieldKey: "country", contextHash: e1.contextHash("acme.myworkdayjobs.com", "Country"), value: "Mexico", hitCount: 1, updatedAt: 2 }]);
  ok("import: stored under the importing profile", (await impZoe.get(itemOf("country", "Country"))) === "Mexico");
  ok("import: ignores malformed entries", (await imp.importEntries([{ value: "x" }, null, { fieldKey: "f" }])) === 0);

  /* ---- chrome.storage backend: one store shared by every context ---- */
  // A content script's IndexedDB is the PAGE's; chrome.storage is the extension's.
  // These two instances stand in for "the filler on greenhouse.io" and "the drawer".
  const area = w.chrome.storage.local;
  const onPage = FC.create({ store: FC.chromeStore(area), profileId: "ada", host: "boards.greenhouse.io" });
  const inDrawer = FC.create({ store: FC.chromeStore(area), profileId: "ada", host: "boards.greenhouse.io" });
  await onPage.remember(itemOf("country", "Country"), "United States");
  ok("chromeStore: the drawer reads what the content script wrote",
    (await inDrawer.get(itemOf("country", "Country"))) === "United States");
  ok("chromeStore: exportAll sees it too", (await inDrawer.exportAll()).some((e) => e.value === "United States"));
  ok("chromeStore: persists under one key", !!(await new Promise((r) => area.get("fieldCache", (o) => r(o.fieldCache)))));

  // Concurrent writes compose instead of clobbering (whole-map read-modify-write).
  const racy = FC.create({ store: FC.chromeStore(area), profileId: "race", host: "h" });
  await Promise.all([
    racy.remember(itemOf("a", "A"), "1"),
    racy.remember(itemOf("b", "B"), "2"),
    racy.remember(itemOf("c", "C"), "3"),
  ]);
  ok("chromeStore: concurrent puts don't clobber each other", (await racy.exportAll()).length === 6); // 3 answers x (site + cross-site)

  // A profile the shared store has never seen stays a clean miss.
  const other = FC.create({ store: FC.chromeStore(area), profileId: "zoe", host: "boards.greenhouse.io" });
  ok("chromeStore: still namespaced per profile", (await other.get(itemOf("country", "Country"))) === null);

  /* ---- one-time drain of the legacy per-origin IndexedDB ---- */
  const legacyBack = new w.Map();
  const legacy = FC.memoryStore(legacyBack);
  const old = FC.create({ store: legacy, profileId: "ada", host: "jobs.lever.co" });
  await old.remember(itemOf("phone", "Phone"), "555-0100");
  const targetBack = new w.Map();
  const target = FC.memoryStore(targetBack);
  ok("migrate: drains legacy rows into the shared store", (await FC.migrateLegacy(target, legacy)) === 2); // site row + twin
  const drained = FC.create({ store: target, profileId: "ada", host: "jobs.lever.co" });
  ok("migrate: the drained answer is readable", (await drained.get(itemOf("phone", "Phone"))) === "555-0100");
  ok("migrate: second run is a no-op (flag lives in the legacy store)", (await FC.migrateLegacy(target, legacy)) === 0);
  // A newer answer already in the shared store (learned on another host) outranks the old row.
  const legacy2 = FC.memoryStore(new w.Map());
  const old2 = FC.create({ store: legacy2, profileId: "ada", host: "jobs.lever.co" });
  await old2.remember(itemOf("phone", "Phone"), "555-STALE");
  (await old2.exportAll())[0].updatedAt = 1; // pretend it was learned long ago
  await FC.migrateLegacy(target, legacy2);
  ok("migrate: does not regress a newer shared answer", (await drained.get(itemOf("phone", "Phone"))) === "555-0100");

  /* ---- cross-site reuse: the same question on a different ATS ---- */
  // One shared store (chrome.storage is extension-wide), two hosts.
  const xBack = new w.Map();
  const onWorkday = FC.create({ store: FC.memoryStore(xBack), profileId: "ada", host: "acme.myworkdayjobs.com" });
  const onLever = FC.create({ store: FC.memoryStore(xBack), profileId: "ada", host: "jobs.lever.co" });
  const authQ = (v) => itemOf("authorizedToWork", "Are you legally authorized to work in the United States?", v);

  await onWorkday.remember(authQ(), "Yes");
  ok("cross-site: an answer learned on one ATS is found on another", (await onLever.get(authQ())) === "Yes");
  eq("cross-site: the hit is flagged as carried over", await onLever.lookup(authQ()), { value: "Yes", scope: "global" });
  eq("cross-site: on the host that learned it, the hit is site-scoped", await onWorkday.lookup(authQ()), { value: "Yes", scope: "site" });

  // A deliberate site-specific answer must not be overridden by the general one.
  await onLever.remember(authQ(), "No");
  ok("cross-site: the host-scoped answer wins on that host", (await onLever.get(authQ())) === "No");
  ok("cross-site: the other host keeps its own answer", (await onWorkday.get(authQ())) === "Yes");
  // ...but the twin followed the newer write, so a THIRD site sees the latest answer.
  const onAshby = FC.create({ store: FC.memoryStore(xBack), profileId: "ada", host: "jobs.ashbyhq.com" });
  ok("cross-site: a third ATS gets the most recent answer", (await onAshby.get(authQ())) === "No");

  // Still scoped by profile and by question text.
  const otherUser = FC.create({ store: FC.memoryStore(xBack), profileId: "zoe", host: "jobs.lever.co" });
  ok("cross-site: does not cross profiles", (await otherUser.get(authQ())) === null);
  ok("cross-site: a different question is still a miss",
    (await onAshby.get(itemOf("authorizedToWork", "Will you now or in the future require sponsorship?"))) === null);

  // preferCached marks the carried-over row so the overlay can label it.
  const xsItems = [authQ("")];
  await onAshby.preferCached(xsItems);
  ok("preferCached: cross-site hit sets cachedCrossSite", xsItems[0].cached === true && xsItems[0].cachedCrossSite === true);
  const ownItems = [authQ("")];
  await onLever.preferCached(ownItems);
  ok("preferCached: a same-site hit is not flagged cross-site",
    ownItems[0].cached === true && !ownItems[0].cachedCrossSite);

  console.log(`\n[field_cache] ${pass} passed, ${fail} failed`);
  if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log("[field_cache] All green.");
})();
