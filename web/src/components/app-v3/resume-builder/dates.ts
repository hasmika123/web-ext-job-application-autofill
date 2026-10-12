/**
 * Dates on the canvas (DESIGN 10.5): the document stores `YYYY` or `YYYY-MM` (the validator's rule);
 * the canvas shows and accepts month-year as people write it ("Mar 2022").
 */

/** Same rule as the server validator: `YYYY` or `YYYY-MM`. */
export const DATE_OK = /^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$/;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** `MM/YYYY`, `M/YYYY` and `YYYY/MM` become `YYYY-MM`; anything else is returned trimmed. */
export function normalizeDate(raw: string): string {
  const s = raw.trim();
  const mdy = /^(\d{1,2})[/.](\d{4})$/.exec(s);
  if (mdy) return `${mdy[2]}-${mdy[1].padStart(2, "0")}`;
  const ymd = /^(\d{4})[/.](\d{1,2})$/.exec(s);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}`;
  return s;
}

/** "Mar 2022", "March 2022" and "Sept 2022" become `2022-03`; `normalizeDate`'s forms too. Anything else is returned trimmed. */
export function parseDateInput(raw: string): string {
  const s = normalizeDate(raw);
  const m = /^([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(s);
  if (m) {
    const key = m[1].slice(0, 3).toLowerCase();
    const i = MONTHS.findIndex((x) => x.toLowerCase() === key);
    if (i >= 0) return `${m[2]}-${String(i + 1).padStart(2, "0")}`;
  }
  return s;
}

/** `2022-03` is shown as "Mar 2022", `2022` as "2022"; anything else as stored. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return value;
  const i = Number(m[2]) - 1;
  return i >= 0 && i < MONTHS.length ? `${MONTHS[i]} ${m[1]}` : value;
}
