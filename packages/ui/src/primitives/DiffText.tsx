import { cn } from "./cn";

/**
 * DiffText — a word-level diff, rendered. The caller computes the parts (the Resume Builder's
 * `web/src/lib/diff.ts`); this draws them: removed words struck through on a red tint (`<del>`), added
 * words on a green tint (`<ins>`), unchanged words plain. Colour is never the only signal (strike-through
 * and underline carry it too), and each change is bracketed for screen readers ("[added: ...]" /
 * "[removed: ...]", visually hidden) under one labelled group that says how much changed.
 *
 *   <DiffText parts={[{ type: "same", text: "Led " }, { type: "del", text: "a" }, { type: "ins", text: "the" }]} />
 */
export type DiffPartType = "same" | "ins" | "del";

export interface DiffPart {
  type: DiffPartType;
  text: string;
}

export interface DiffTextProps {
  parts: readonly DiffPart[];
  /** Overrides the group's accessible name (default: "Changes: N words added, N words removed"). */
  "aria-label"?: string;
  className?: string;
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

export default function DiffText({ parts, "aria-label": ariaLabel, className }: DiffTextProps) {
  const added = parts.reduce((n, p) => (p.type === "ins" ? n + words(p.text) : n), 0);
  const removed = parts.reduce((n, p) => (p.type === "del" ? n + words(p.text) : n), 0);
  const label =
    ariaLabel ??
    (added === 0 && removed === 0
      ? "No changes"
      : `Changes: ${added} ${added === 1 ? "word" : "words"} added, ${removed} ${removed === 1 ? "word" : "words"} removed`);
  return (
    <div role="group" aria-label={label} className={cn("whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink", className)}>
      {parts.map((p, i) => {
        if (p.type === "ins")
          return (
            <ins key={i} className="rounded-sm bg-[color-mix(in_srgb,var(--color-ok)_18%,transparent)] text-ink underline decoration-ok/60 underline-offset-2">
              <span className="sr-only">[added: </span>
              {p.text}
              <span className="sr-only">]</span>
            </ins>
          );
        if (p.type === "del")
          return (
            <del key={i} className="rounded-sm bg-[color-mix(in_srgb,var(--color-danger)_16%,transparent)] text-ink-soft line-through decoration-danger/70">
              <span className="sr-only">[removed: </span>
              {p.text}
              <span className="sr-only">]</span>
            </del>
          );
        return <span key={i}>{p.text}</span>;
      })}
    </div>
  );
}
