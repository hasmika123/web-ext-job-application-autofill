"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, SideSheet, Spinner, cn } from "@kiwiply/ui";
import type { ResumeDocDTO } from "@/lib/resume-doc";
import { applySyncMaster, syncMaster, type SyncChange } from "@/lib/resume-meta";

// config-literal-ok: side-sheet width is layout geometry (DESIGN 10.16), not a tunable
const SHEET_WIDTH = 560;

const KIND: Record<SyncChange["kind"], { label: string; cls: string }> = {
  added: { label: "Added on master", cls: "bg-[color-mix(in_srgb,var(--color-ok)_16%,transparent)] text-accent-deep" },
  changed: { label: "Changed on master", cls: "bg-[color-mix(in_srgb,var(--color-warn)_18%,transparent)] text-ink" },
  removed: { label: "Removed on master", cls: "bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)] text-danger" },
};

/** A change's value as the lines a person reads: a string as it is, an item as its title and bullets. */
export function describeChangeValue(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(describeChangeValue);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const head = ["title", "org", "school", "degree", "name", "group", "text"].map((k) => o[k]).filter((x): x is string => typeof x === "string" && x.trim() !== "");
    const bullets = Array.isArray(o.bullets) ? o.bullets.map((b) => (b && typeof b === "object" ? (b as { text?: unknown }).text : b)).filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => `• ${t}`) : [];
    const skills = Array.isArray(o.skills) ? [o.skills.filter((s): s is string => typeof s === "string").join(", ")] : [];
    return [head.join(" · "), ...bullets, ...skills].filter((l) => l !== "");
  }
  return [];
}

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; changes: SyncChange[] };

/**
 * "Pull changes from master" (DESIGN 9.10 / 10.16): what moved on the master since this tailored resume was copied, change
 * by change, each with a checkbox (all ticked to start). Apply merges the ticked ones into this resume and moves its
 * "copied from" marker, and hands the merged document back to the editor. The same sheet serves the profile sync (R3.2),
 * which has the same change shape.
 */
export default function SyncDiffSheet({
  open,
  resumeId,
  masterName,
  phone,
  ensureSaved,
  onApplied,
  onClose,
}: {
  open: boolean;
  resumeId: number;
  masterName: string;
  phone: boolean;
  /** Saves pending edits first (the merge is made on the saved document). Must be stable (memoised). */
  ensureSaved: () => Promise<boolean>;
  onApplied: (dto: ResumeDocDTO, applied: number) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Loading is this effect's whole job: the state resets each time the sheet opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });
    setError(null);
    void (async () => {
      if (!(await ensureSaved())) {
        if (!cancelled) setState({ status: "error", message: "Your latest changes aren't saved yet. Try again in a moment." });
        return;
      }
      const res = await syncMaster(resumeId);
      if (cancelled) return;
      if (res.kind === "error") return setState({ status: "error", message: res.message });
      setState({ status: "ready", changes: res.value.changes });
      setPicked(new Set(res.value.changes.map((c) => c.id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, resumeId, ensureSaved]);

  const changes = useMemo(() => (state.status === "ready" ? state.changes : []), [state]);
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = async () => {
    if (busy || picked.size === 0) return;
    setBusy(true);
    setError(null);
    const res = await applySyncMaster(resumeId, changes.filter((c) => picked.has(c.id)).map((c) => c.id));
    setBusy(false);
    if (res.kind === "error") return setError(res.message);
    onApplied(res.value, picked.size);
  };

  return (
    <SideSheet
      id="rb-sync-sheet"
      side="right"
      mode={phone ? "fullscreen" : "overlay"}
      open={open}
      width={SHEET_WIDTH}
      title="Pull changes from master"
      description={`What changed in ${masterName} since this copy`}
      onClose={onClose}
      footer={
        <>
          <Button variant="accent" size="sm" disabled={busy || picked.size === 0} onClick={() => void apply()}>
            {busy ? "Applying…" : `Apply ${picked.size} ${picked.size === 1 ? "change" : "changes"}`}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {state.status === "ready" && changes.length > 0 && (
            <button
              type="button"
              onClick={() => setPicked(picked.size === changes.length ? new Set() : new Set(changes.map((c) => c.id)))}
              className="ml-auto text-[12.5px] font-semibold text-v2-blue hover:underline"
            >
              {picked.size === changes.length ? "Select none" : "Select all"}
            </button>
          )}
        </>
      }
    >
      {state.status === "loading" && (
        <p role="status" className="flex items-center gap-2 py-6 text-[13.5px] text-ink-soft">
          <Spinner role="presentation" aria-hidden className="h-4 w-4" />
          Comparing with the master…
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="py-6 text-[13.5px] text-danger">
          {state.message}
        </p>
      )}
      {state.status === "ready" && changes.length === 0 && <p className="rounded-xl border border-line bg-paper-2 p-4 text-[13.5px] text-ink-soft">This resume already has everything from the master.</p>}
      {error && (
        <p role="alert" className="mb-3 text-[13px] text-danger">
          {error}
        </p>
      )}
      {changes.length > 0 && (
        <ul className="space-y-3">
          {changes.map((c) => {
            const before = describeChangeValue(c.before);
            const after = describeChangeValue(c.after);
            return (
              <li key={c.id} className="rounded-xl border border-line p-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="mt-1 h-4 w-4 flex-none accent-[var(--color-accent-deep)]" aria-label={`Apply: ${KIND[c.kind].label}, ${c.section}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", KIND[c.kind].cls)}>{KIND[c.kind].label}</span>
                      <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">{c.section}</span>
                    </span>
                    {before.length > 0 && (
                      <span className="mt-2 block rounded-lg bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] p-2 text-[13px] text-ink-soft line-through decoration-danger/60">
                        {before.map((l, i) => (
                          <span key={i} className="block">
                            {l}
                          </span>
                        ))}
                      </span>
                    )}
                    {after.length > 0 && (
                      <span className="mt-2 block rounded-lg bg-[color-mix(in_srgb,var(--color-ok)_10%,transparent)] p-2 text-[13px] text-ink">
                        {after.map((l, i) => (
                          <span key={i} className="block">
                            {l}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </SideSheet>
  );
}
