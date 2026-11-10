"use client";

import { cn } from "./cn";
import Input from "./Input";
import Select from "./Select";

/**
 * MonthPicker - a month and a year for resume dates, as two controls (a month dropdown and a numeric
 * year box). A native `<input type="month">` is missing in desktop Safari and Firefox, and a date
 * typed free-hand is where "Sept '21" and "09/2021" come from; two controls need no format knowledge.
 *
 * Controlled with a string value that is exactly what the profile stores: `YYYY-MM`, or `YYYY` when
 * only the year is known, or "" when nothing is chosen. While it is being filled the value may be
 * partial (`2021-` is not produced; a month with no year is `-09`, a short year is `20`), so the
 * caller validates with {@link isMonthValue} before it trusts the value and can say "enter a 4-digit
 * year" instead of silently losing what was typed.
 *
 *   <MonthPicker aria-label="Start date" value={start} onChange={setStart} />
 */
export interface MonthPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Names the pair of controls (use one of these two). */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const MONTH_OPTIONS = [{ value: "", label: "Month" }, ...MONTHS.map((label, i) => ({ value: String(i + 1).padStart(2, "0"), label }))];

/** A complete value: `YYYY` or `YYYY-MM` with a real month (the empty string is "no date", not a value). */
export function isMonthValue(value: string): boolean {
  return /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(value);
}

function split(value: string): { year: string; month: string } {
  const i = value.indexOf("-");
  return i < 0 ? { year: value, month: "" } : { year: value.slice(0, i), month: value.slice(i + 1) };
}

function join(year: string, month: string): string {
  if (!year && !month) return "";
  return month ? `${year}-${month}` : year;
}

export default function MonthPicker({ value, onChange, invalid, disabled, className, id, ...aria }: MonthPickerProps) {
  const { year, month } = split(value);
  return (
    <div id={id} role="group" {...aria} className={cn("flex gap-2", className)}>
      <div className="min-w-0 flex-1">
        <Select value={month} onChange={(m) => onChange(join(year, m))} options={MONTH_OPTIONS} placeholder="Month" disabled={disabled} aria-label="Month" />
      </div>
      <div className="w-28 flex-none">
        <Input
          value={year}
          onChange={(e) => onChange(join(e.target.value.replace(/\D/g, ""), month))}
          inputMode="numeric"
          maxLength={4}
          placeholder="Year"
          autoComplete="off"
          disabled={disabled}
          aria-label="Year"
          aria-invalid={invalid || undefined}
        />
      </div>
    </div>
  );
}
