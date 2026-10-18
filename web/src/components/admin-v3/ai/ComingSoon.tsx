"use client";

import type { ReactNode } from "react";
import { cn, useToast } from "@kiwiply/ui";

const BASE =
  "inline-flex items-center gap-1.5 rounded-xl border border-v2-line bg-paper px-3 py-1.5 text-[13px] font-semibold text-v2-blue-ink shadow-v2-soft hover:bg-paper-2";

/** A board control with no backend yet: clicking says so instead of pretending to work. */
export function ComingSoonButton({ children, what, className }: { children: ReactNode; what: string; className?: string }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast({ title: `${what}: coming soon.` })} className={cn(BASE, className)}>
      {children}
    </button>
  );
}
