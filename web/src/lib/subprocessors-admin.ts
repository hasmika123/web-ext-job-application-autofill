/** The admin side of the subprocessor register (T1.5): all twelve slots, used or empty, with the DPA status the admin tracks. */

export interface SubprocessorEntry {
  name: string;
  purpose: string;
  data: string;
  location: string;
  link: string;
  dpaStatus: string;
}

export interface SubprocessorSlot {
  slot: number;
  /** An unused slot (`{}` on the API). */
  empty: boolean;
  entry: SubprocessorEntry;
}

export const EMPTY_ENTRY: SubprocessorEntry = { name: "", purpose: "", data: "", location: "", link: "", dpaStatus: "" };

/** The shape the API stores: only non-empty fields, or `{}` for an unused slot. */
export function toValue(e: SubprocessorEntry): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(e)) if (v.trim()) out[k] = v.trim();
  return out;
}

export function normalizeAdminSubprocessors(raw: unknown): SubprocessorSlot[] | null {
  const items = raw && typeof raw === "object" ? (raw as { items?: unknown }).items : null;
  if (!Array.isArray(items)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const out: SubprocessorSlot[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const slot = typeof o.slot === "number" ? o.slot : NaN;
    if (!Number.isInteger(slot) || slot < 1 || slot > 12) continue;
    const entry: SubprocessorEntry = { name: str(o.name), purpose: str(o.purpose), data: str(o.data), location: str(o.location), link: str(o.link), dpaStatus: str(o.dpaStatus) };
    out.push({ slot, empty: o.empty === true || !entry.name, entry });
  }
  return out.sort((a, b) => a.slot - b.slot);
}

export function slotId(slot: number): string {
  return String(slot).padStart(2, "0");
}
