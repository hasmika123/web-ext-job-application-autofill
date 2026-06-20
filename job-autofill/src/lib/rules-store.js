/* rules-store.js — manages the ACTIVE field-mapping ruleset.
 *
 *  Starts from the bundled JAF.defaultRules, then:
 *   - init():      if a newer validated ruleset is cached in storage, adopt it.
 *   - checkForUpdates(url): fetch a hosted ruleset, validate, adopt if newer,
 *                  and cache it. This is how Workday/Greenhouse markup changes
 *                  get fixed WITHOUT shipping a new extension build.
 *   - reset():     drop the cached override and fall back to bundled.
 *
 *  match(chain, rule) is the shared predicate every adapter uses to test an
 *  element's automation-id chain / label against a rule object.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  const KEY = "jaf_rules_override";
  let active = JAF.defaultRules || { version: 0, generic: [], sites: {} };

  function valid(r) {
    return !!(r && typeof r.version === "number" && Array.isArray(r.generic) && r.sites && typeof r.sites === "object");
  }

  // Does an element's (lowercased) automation-id chain / label satisfy a rule?
  function match(chain, rule) {
    if (!rule || !chain) return false;
    if (rule.all && !rule.all.every((s) => chain.includes(s))) return false;
    if (rule.any && !rule.any.some((s) => chain.includes(s))) return false;
    if (rule.not && rule.not.some((s) => chain.includes(s))) return false;
    if (rule.regex) { try { if (!new RegExp(rule.regex, "i").test(chain)) return false; } catch (e) {} }
    return !!(rule.all || rule.any || rule.regex);
  }

  async function init() {
    try {
      const got = await sGet(KEY);
      if (valid(got) && got.version > (JAF.defaultRules ? JAF.defaultRules.version : 0)) active = got;
    } catch (e) {}
    return active;
  }

  function getActive() { return active; }
  function site(id) { return (active.sites && active.sites[id]) || {}; }
  function info() {
    return {
      version: active.version,
      source: active === JAF.defaultRules ? "bundled" : "updated",
      updatedAt: active.updatedAt || "",
      bundledVersion: JAF.defaultRules ? JAF.defaultRules.version : 0,
    };
  }

  async function checkForUpdates(url) {
    if (!url) return { ok: false, error: "No rules URL is set." };
    let data;
    try {
      const res = await fetch(url, { cache: "no-store", credentials: "omit" });
      if (!res.ok) return { ok: false, error: "HTTP " + res.status };
      data = await res.json();
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
    if (!valid(data)) return { ok: false, error: "That file isn't a valid ruleset." };
    if (data.version <= active.version) return { ok: true, updated: false, version: active.version };
    try { await sSet(KEY, data); } catch (e) { return { ok: false, error: "Couldn't save the ruleset." }; }
    active = data;
    return { ok: true, updated: true, version: data.version };
  }

  async function reset() {
    try { await sRemove(KEY); } catch (e) {}
    active = JAF.defaultRules;
    return info();
  }

  function sGet(k) { return new Promise((res, rej) => { try { chrome.storage.local.get(k, (o) => res(o && o[k])); } catch (e) { rej(e); } }); }
  function sSet(k, v) { return new Promise((res, rej) => { try { chrome.storage.local.set({ [k]: v }, () => res(true)); } catch (e) { rej(e); } }); }
  function sRemove(k) { return new Promise((res, rej) => { try { chrome.storage.local.remove(k, () => res(true)); } catch (e) { rej(e); } }); }

  JAF.rules = { init, getActive, site, info, checkForUpdates, reset, match };
})();
