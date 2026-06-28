/* indeed.js — Indeed Apply (the "Easily apply" flow on smartapply.indeed.com)
 *
 * Indeed Apply is a multi-step, URL-routed flow on a SEPARATE host
 * (smartapply.indeed.com): contact-info → location → resume → screening questions →
 * review. It fills ONE visible step at a time (the user clicks "Continue" between
 * steps), exactly like our other multi-step ATS. FILL-ONLY: we never advance to or
 * click the final submit, and never touch the reCAPTCHA on the last step — the user
 * solves it and submits.
 *
 * Selectors were captured from a REAL Indeed Apply session (not guessed):
 *   - Location step: stable semantic ids #location-fields-{postal-code,locality,address}-input.
 *   - Resume step:   file input data-testid="resume-selection-file-resume-radio-card-file-input".
 *   - Contact step:  Indeed annotates fields with the standard W3C `autocomplete`
 *     tokens (verified present on the location step), so we map those — a web standard,
 *     not tenant markup. The "Continue" button's data-testid is randomized per render,
 *     so the shared filler matches it by text, never by id.
 * Screening questions (which vary per posting) are left to the generic scanner +
 * field-cache, same as every other ATS adapter.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  JAF.adapters = JAF.adapters || [];
  const B = JAF.adapterBase;
  const F = () => JAF.schema.FIELDS;

  // Standard W3C autocomplete token -> our canonical field (verified on the live form).
  const AC_TO_FIELD = {
    "given-name": "firstName",
    "family-name": "lastName",
    name: "fullName",
    email: "email",
    tel: "phone",
    "tel-national": "phone",
    "street-address": "addressLine1",
    "address-line1": "addressLine1",
    "address-level2": "city",
    "address-level1": "state",
    "postal-code": "postalCode",
    "country-name": "country",
  };
  // Exact ids captured from the location step (semantic + stable).
  const ID_TO_FIELD = {
    "location-fields-postal-code-input": "postalCode",
    "location-fields-locality-input": "city",
    "location-fields-address-input": "addressLine1",
  };
  const RESUME_ACCEPT = /pdf|msword|wordprocessing|officedocument|opendocument|\.(pdf|docx?|rtf|odt)\b/i;

  const indeed = {
    id: "indeed",
    label: "Indeed Apply",
    matches() {
      return /(^|\.)smartapply\.indeed\.com$/i.test(location.hostname);
    },
    plan(values) {
      const f = F();
      const items = [];
      const seen = new Set();
      const add = (el, fieldKey) => {
        if (!el || seen.has(el) || !B.isFillable(el)) return;
        const field = f[fieldKey];
        if (!field) return;
        const v = values[field];
        if (v === undefined || v === "") return;
        seen.add(el);
        items.push({ el, field, value: v, label: fieldKey, kind: B.elKind(el) });
      };
      // 1) Exact captured ids (location step).
      Object.keys(ID_TO_FIELD).forEach((id) => add(document.getElementById(id), ID_TO_FIELD[id]));
      // 2) Standard autocomplete tokens (contact step + anything else Indeed annotates).
      Array.from(document.querySelectorAll("input[autocomplete], textarea[autocomplete]")).forEach((el) => {
        const tok = (el.getAttribute("autocomplete") || "").toLowerCase();
        if (AC_TO_FIELD[tok]) add(el, AC_TO_FIELD[tok]);
      });
      return items;
    },
    fileInput() {
      const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
      return (
        inputs.find((el) => /resume/i.test(el.getAttribute("data-testid") || "")) ||
        inputs.find((el) => RESUME_ACCEPT.test(el.accept || "")) ||
        inputs.find((el) => !/image\//i.test(el.accept || "")) ||
        inputs[0] ||
        null
      );
    },
    // The apply URL carries the applyable job id; tag the source for the tracker.
    captureJob({ loc } = {}) {
      let id = null;
      try {
        id = new URL((loc && loc.href) || location.href).searchParams.get("indeedApplyableJobId");
      } catch (e) {
        id = null;
      }
      return { atsPlatform: "indeed", externalJobId: id || null };
    },
  };

  JAF.adapters.push(indeed);
})();
