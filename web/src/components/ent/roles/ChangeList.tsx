"use client";

import type { ReactNode } from "react";
import { AlertIcon, cn } from "@kiwiply/ui";
import { scopeLabel, type ChangeSummary } from "@/lib/ent/roles";

/**
 * What a save (or a restore) would do, in words: keys added, removed, and moved to another scope. Used by the confirm step of the
 * permission editor and by "Restore to template" (which shows the same list before anything is written).
 */
function Section({ title, tone, children }: { title: string; tone: "add" | "remove" | "change"; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-line bg-paper-2/40 p-3">
      <h3 className={cn("text-[12px] font-bold uppercase tracking-[.05em]", tone === "add" ? "text-accent-deep" : tone === "remove" ? "text-danger" : "text-ink-soft")}>{title}</h3>
      <ul className="mt-1.5 flex flex-col gap-1 text-[13.5px] text-ink">{children}</ul>
    </section>
  );
}

export default function ChangeList({ summary, labelOf }: { summary: ChangeSummary; labelOf: (key: string) => string }) {
  return (
    <div data-change-list className="flex flex-col gap-2.5">
      {summary.added.length > 0 && (
        <Section title={`Added (${summary.added.length})`} tone="add">
          {summary.added.map((a) => (
            <li key={a.key} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span>
                <span aria-hidden>+ </span>
                {labelOf(a.key)}
              </span>
              <span className="text-[12.5px] text-muted">{scopeLabel(a.scope)}</span>
            </li>
          ))}
        </Section>
      )}
      {summary.removed.length > 0 && (
        <Section title={`Removed (${summary.removed.length})`} tone="remove">
          {summary.removed.map((r) => (
            <li key={r.key} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span>
                <span aria-hidden>− </span>
                {labelOf(r.key)}
              </span>
              <span className="text-[12.5px] text-muted">was {scopeLabel(r.scope).toLowerCase()}</span>
            </li>
          ))}
        </Section>
      )}
      {summary.changed.length > 0 && (
        <Section title={`Scope changed (${summary.changed.length})`} tone="change">
          {summary.changed.map((c) => (
            <li key={c.key} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span>{labelOf(c.key)}</span>
              <span className="text-[12.5px] text-muted">
                {scopeLabel(c.from)} → <span className="font-semibold text-ink">{scopeLabel(c.to)}</span>
              </span>
            </li>
          ))}
        </Section>
      )}
      {summary.dangerous.length > 0 && (
        <p role="note" data-change-sensitive className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-[13px] text-ink">
          <AlertIcon size={16} className="mt-0.5 flex-none text-warn" aria-hidden />
          <span>
            This gives sensitive access: <strong>{summary.dangerous.map(labelOf).join(", ")}</strong>. The change is recorded in the audit trail as high risk.
          </span>
        </p>
      )}
    </div>
  );
}
