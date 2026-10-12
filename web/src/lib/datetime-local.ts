/**
 * `<input type="datetime-local">` / `<input type="date">` helpers: the browser's value strings are wall-clock time
 * with no zone ("2026-10-10T14:00"), the API wants an instant (ISO-8601 UTC). These convert in the viewer's zone.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** An instant as the `datetime-local` value for the viewer's zone, or "" when there is none. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A `datetime-local` value (viewer's wall clock) as an ISO instant, or null for "" / garbage. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The `date` value (yyyy-MM-dd) of an instant in the viewer's zone, or "". */
export function toLocalDate(iso: string | null | undefined): string {
  return toLocalInput(iso).slice(0, 10);
}

/** A `date` value as the instant of that day at `hour`:00 local (a next-step "by Friday" lands in the morning). */
export function fromLocalDate(value: string, hour = 9): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return fromLocalInput(`${value}T${pad(hour)}:00`);
}

/** "Tomorrow at 10:00" as an instant: the default start of a new interview, on the next hour boundary tomorrow. */
export function tomorrowAt(hour: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
