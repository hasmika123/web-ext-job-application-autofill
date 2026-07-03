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
      for (const c of found) {
        if (values[c.field] === undefined) continue;
        items.push({ el: c.el, field: c.field, value: values[c.field], label: c.label || c.field, kind: c.kind, confidence: c.confidence });
      }
      return items;
    },
    fileInput() {
      // deepQueryAll pierces open shadow roots (BUG-5: web-component ATS).
      const inputs = B.deepQueryAll(document, 'input[type="file"]').filter(B.isFillable);
      return inputs.find((i) => /resume|cv|attach/i.test(B.labelText(i))) || inputs[0] || null;
    },
  };

  JAF.genericAdapter = generic; // exported so filler can use it as fallback
  JAF.adapters.push(generic);
})();
