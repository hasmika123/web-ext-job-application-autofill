/* rules-store.js — access to the ACTIVE field-mapping ruleset.
 *
 *  The active ruleset is the bundled JAF.defaultRules (src/config/rules.js).
 *
 *   - getActive(): the whole ruleset.
 *   - site(id):    one ATS's slice of it.
 *   - match(chain, rule): the shared predicate every adapter uses to test an
 *                  element's automation-id chain / label against a rule object.
 *
 *  HISTORY (W6.0): this module also used to fetch a hosted ruleset at runtime
 *  (`checkForUpdates(url)`), cache it in storage and adopt it if newer, so ATS markup
 *  changes could be fixed without shipping a build. Nothing ever called it: no UI exposed
 *  `settings.rulesUrl` and no code path invoked the fetch, so the raw/gist.githubusercontent
 *  host permissions it needed were dead weight in the manifest — and a claim in PRIVACY.md
 *  that wasn't true. Both the code and the permissions are gone. Reviving it means bringing
 *  back three things together: the fetch + validate + adopt logic, a host permission for
 *  wherever the ruleset is hosted, and an honest line in PRIVACY.md's permission table.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  const active = JAF.defaultRules || { version: 0, generic: [], sites: {} };

  // Does an element's (lowercased) automation-id chain / label satisfy a rule?
  function match(chain, rule) {
    if (!rule || !chain) return false;
    if (rule.all && !rule.all.every((s) => chain.includes(s))) return false;
    if (rule.any && !rule.any.some((s) => chain.includes(s))) return false;
    if (rule.not && rule.not.some((s) => chain.includes(s))) return false;
    if (rule.regex) { try { if (!new RegExp(rule.regex, "i").test(chain)) return false; } catch (e) {} }
    return !!(rule.all || rule.any || rule.regex);
  }

  function getActive() { return active; }
  function site(id) { return (active.sites && active.sites[id]) || {}; }

  JAF.rules = { getActive, site, match };
})();
