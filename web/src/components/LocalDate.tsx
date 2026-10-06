"use client";

import { formatDate } from "@/lib/dates";
import { useDateDisplay } from "@/lib/use-date-display";

type Props = {
  iso: string;
  /** Defaults to "October 21, 2026". */
  options?: Intl.DateTimeFormatOptions;
};

const LONG: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };

/**
 * A date in the VIEWER's time zone and locale, for Server Components — which can't know either.
 * Renders a deterministic form on the server and during hydration, then corrects itself in the
 * browser. See `@/lib/dates` for why both halves are needed.
 */
export default function LocalDate({ iso, options = LONG }: Props) {
  const display = useDateDisplay();
  return <time dateTime={iso}>{formatDate(iso, options, display)}</time>;
}
