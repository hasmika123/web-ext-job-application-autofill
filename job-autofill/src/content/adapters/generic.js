/* generic.js — fallback adapter; matches any page by reading field labels.
 * Also used to fill leftover fields after a dedicated adapter runs.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  JAF.adapters = JAF.adapters || [];
  const B = JAF.adapterBase;

  const generic = {
    id: "generic",
    label: "Generic (label matching)",
    matches() { return true; }, // always eligible; lowest priority
    plan(values) {
      const found = B.scanGeneric(document);
      const items = [];
      const PHONE_CODE_RE = /(?:\bcountry\s*[-_/ ]?\s*code\b|\bphone\s*(?:country\s*)?(?:dial|calling|country)?\s*code\b|\b(?:dial|calling)\s*code\b|\b(?:country|phone|dial|calling)code\b)/i;
      const isSmartRecruitersPage = () => {
        try { return /(^|\.)smartrecruiters\.com$/i.test(String(location.hostname || "")); } catch (e) { return false; }
      };
      const controlText = (el) => {
        const attrs = ["aria-label", "title", "name", "id", "data-testid", "data-automation-id"]
          .map((name) => { try { return el.getAttribute(name) || ""; } catch (e) { return ""; } });
        return [B.labelText(el)].concat(attrs).join(" ").replace(/\s+/g, " ").trim();
      };
      const findPhoneCountryControl = (phoneEl) => {
        if (!phoneEl) return null;
        const selector = 'input,select,button,[role="combobox"],[aria-haspopup="listbox"],spl-select';
        let node = phoneEl;
        const composedParent = (el) => {
          try {
            if (el && el.parentElement) return el.parentElement;
            const root = el && el.getRootNode && el.getRootNode();
            return root && root.host || null;
          } catch (e) { return null; }
        };
        const composedAncestors = (el) => {
          const ancestors = [];
          let current = el;
          for (let hops = 0; current && hops < 8; hops++) {
            ancestors.push(current);
            current = composedParent(current);
          }
          return ancestors;
        };
        const sharesPhoneContainer = (candidate) => {
          const phoneAncestors = composedAncestors(phoneEl);
          const candidateAncestors = composedAncestors(candidate);
          const phoneIndex = (node) => phoneAncestors.indexOf(node);
          const common = candidateAncestors.find((node) => phoneIndex(node) >= 0);
          return !!common && candidateAncestors.indexOf(common) <= 2 && phoneIndex(common) <= 4;
        };
        // SmartRecruiters keeps the code selector beside the phone input in a
        // small wrapper. Climb only nearby containers and require the custom
        // selector to share that phone container; an unrelated <spl-select>
        // elsewhere on the page must not become the dial code.
        for (let hops = 0; node && hops < 8; hops++) {
          let controls = [];
          try { controls = B.deepQueryAll(node, selector); } catch (e) {}
          for (const candidate of controls) {
            if (candidate === phoneEl || candidate.disabled || candidate.readOnly) continue;
            if (String(candidate.tagName || "").toLowerCase() === "spl-select") {
              if (isSmartRecruitersPage() && sharesPhoneContainer(candidate)) return candidate;
              continue;
            }
            if (PHONE_CODE_RE.test(controlText(candidate))) return candidate;
          }
          // The actual phone input can live inside SPL-PHONE-FIELD's shadow
          // root while SPL-SELECT is a sibling of that host. parentElement
          // stops at the shadow root, so continue through its host.
          node = composedParent(node);
        }
        return null;
      };
      const dropdownAlts = (field, value) => {
        if (!JAF.schema || value == null || value === "") return [];
        try {
          const candidates = field === "country" && JAF.schema.countryCandidates
            ? JAF.schema.countryCandidates(value)
            : field === "state" && JAF.schema.stateCandidates
              ? JAF.schema.stateCandidates(value)
              : [];
          return candidates.filter((candidate) => String(candidate) !== String(value));
        } catch (e) { return []; }
      };
      for (const c of found) {
        if (values[c.field] === undefined) continue;
        const item = {
          el: c.el,
          field: c.field,
          value: values[c.field],
          label: c.label || c.field,
          kind: c.kind,
          confidence: c.confidence,
          alts: dropdownAlts(c.field, values[c.field]),
        };
        if (c.field === "phone" && values.country) {
          const phoneCountryControl = findPhoneCountryControl(c.el);
          if (phoneCountryControl) {
            item.phoneCountryControl = phoneCountryControl;
            item.phoneCountry = values.country;
            item.phoneCountryAlts = dropdownAlts("country", values.country);
          }
        }
        items.push(item);
      }
      return items;
    },
    fileInput() {
      // deepQueryAll pierces open shadow roots (BUG-5: web-component ATS).
      // Do not use isFillable here: ATS uploaders commonly hide the real input behind a
      // visible drop zone. Disabled/read-only controls are still excluded.
      const inputs = B.deepQueryAll(document, 'input[type="file"]').filter((i) => !i.disabled && !i.readOnly);
      return inputs.find((i) => /resume|cv|attach/i.test(B.labelText(i))) || inputs[0] || null;
    },
  };

  JAF.genericAdapter = generic; // exported so filler can use it as fallback
  JAF.adapters.push(generic);
})();
