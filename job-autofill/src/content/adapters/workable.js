/* workable.js — Workable hosted applications (apply.workable.com/<co>/j/<id>/apply)
 *
 * Selectors below were captured from REAL Workable apply forms (ENFOS, TP-Link)
 * — not guessed. Workable uses stable light-DOM input names: firstname, lastname,
 * email, phone (type=tel), headline, address, city, postcode, country, plus
 * `summary` / `cover_letter` textareas. Resume upload is an <input type=file>
 * whose `accept` lists document types (a separate avatar input accepts images),
 * so fileInput() picks the document one by its accept list. Custom screening
 * questions render as QA_<id> controls and are left to the generic scanner.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  JAF.adapters = JAF.adapters || [];
  const B = JAF.adapterBase;
  const F = () => JAF.schema.FIELDS;

  // input/textarea[type=file accepts a resume document, not an avatar image]
  const RESUME_ACCEPT = /pdf|msword|wordprocessing|officedocument|opendocument|\.(pdf|docx?|rtf|odt)\b/i;

  const workable = {
    id: "workable",
    label: "Workable",
    matches() {
      if (/(^|\.)workable\.com$/i.test(location.hostname)) return true;
      // Workable widgets can be embedded on a careers iframe under another host.
      return !!document.querySelector(
        'form[action*="workable.com"], input[id^="input_files_input_"]'
      ) || !!(document.querySelector('input[name="firstname"]') &&
              document.querySelector('input[name="lastname"]'));
    },
    plan(values) {
      const f = F();
      // Workable input name -> canonical field. headline / cover_letter have no
      // canonical value in the bag, so they simply no-op (value undefined).
      const byName = {
        firstname: f.firstName, lastname: f.lastName, email: f.email, phone: f.phone,
        address: f.addressLine1, city: f.city, postcode: f.postalCode, country: f.country,
        summary: f.summary, cover_letter: f.coverLetter,
      };
      const items = [];
      Object.entries(byName).forEach(([name, field]) => {
        const el = document.querySelector(
          'input[name="' + name + '"], textarea[name="' + name + '"]'
        );
        if (el && B.isFillable(el) && values[field] !== undefined && values[field] !== "")
          items.push({ el, field, value: values[field], label: name, kind: B.elKind(el) });
      });
      return items;
    },
    fileInput() {
      const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
      // Prefer the input that explicitly accepts resume document types.
      return inputs.find((f) => RESUME_ACCEPT.test(f.accept || "")) ||
        // else the first non-image upload, else any file input.
        inputs.find((f) => !/image\//i.test(f.accept || "")) ||
        inputs[0] || null;
    },
  };

  JAF.adapters.push(workable);
})();
