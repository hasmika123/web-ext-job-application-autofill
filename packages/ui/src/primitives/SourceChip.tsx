import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * SourceChip - where a profile value came from (DESIGN v1 section 2.5). Takes the API's provenance
 * (`PARSED` / `USER` / `LEARNED` / `AI`, also the lower-case form `bio.meta_json.provenance` uses) and
 * shows the plain-language label: "From your resume", "You added", "Learned while applying",
 * "AI suggested". An unknown or missing value renders nothing.
 */
export type SourceKind = "PARSED" | "USER" | "LEARNED" | "AI";

export const SOURCE_LABELS: Record<SourceKind, string> = {
  PARSED: "From your resume",
  USER: "You added",
  LEARNED: "Learned while applying",
  AI: "AI suggested",
};

const TONES: Record<SourceKind, string> = {
  PARSED: "bg-paper-2 text-ink-soft",
  USER: "bg-accent-soft text-accent-deep",
  LEARNED: "bg-brown-soft text-brown-deep",
  AI: "bg-brown-soft text-brown-deep",
};

export interface SourceChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  provenance: string | null | undefined;
}

export function sourceKind(provenance: string | null | undefined): SourceKind | null {
  const k = provenance?.toUpperCase();
  return k === "PARSED" || k === "USER" || k === "LEARNED" || k === "AI" ? k : null;
}

export default function SourceChip({ provenance, className, ...props }: SourceChipProps) {
  const kind = sourceKind(provenance);
  if (!kind) return null;
  return (
    <span
      className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-[2px] text-[11px] font-semibold", TONES[kind], className)}
      {...props}
    >
      {SOURCE_LABELS[kind]}
    </span>
  );
}
