"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@kiwiply/ui";
import { adminFetch } from "@/lib/admin-client";
import type { LabelCheck } from "@/lib/admin-orgs";

/** How long typing rests before the label is checked. */
export const LABEL_CHECK_DEBOUNCE_MS = 250; // config-literal-ok: UI timing

export type LabelState = { kind: "idle" } | { kind: "checking" } | { kind: "ok"; host: string | null } | { kind: "bad"; message: string; suggestion: string | null };

/** The live reserved / taken / malformed check of a subdomain label, debounced; `orgId` null = a label for an organization not created yet. */
export function useLabelCheck(label: string, orgId: number | null): LabelState {
  // The verdict is stored with the question it answers; a verdict for another label (or none yet) reads as "checking".
  const value = label.trim().toLowerCase();
  const key = `${orgId ?? "new"}:${value}`;
  const [answer, setAnswer] = useState<{ key: string; state: LabelState } | null>(null);
  const setState = (state: LabelState) => setAnswer({ key, state });
  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const qs = new URLSearchParams({ label: value });
      if (orgId != null) qs.set("orgId", String(orgId));
      const res = await adminFetch<LabelCheck>("GET", `/orgs/label-check?${qs}`);
      if (cancelled) return;
      if (!res.ok) return setState({ kind: "bad", message: res.error, suggestion: null });
      const c = res.data;
      if (c.valid) return setState({ kind: "ok", host: c.host });
      if (c.reserved) return setState({ kind: "bad", message: `"${c.label}" is reserved for Kiwiply and cannot be used.`, suggestion: c.suggestion });
      if (c.taken) return setState({ kind: "bad", message: `"${c.label}" is already taken by another organization.`, suggestion: c.suggestion });
      setState({ kind: "bad", message: "Use 3 to 63 letters, digits or single hyphens, starting and ending with a letter or digit.", suggestion: null });
    }, LABEL_CHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setState only wraps setAnswer with the key of this run
  }, [key]);
  if (!value) return { kind: "idle" };
  return answer && answer.key === key ? answer.state : { kind: "checking" };
}

/** The label input with its live verdict underneath ("acme.kiwiply.com is free" / reserved / taken + "Use acme-2"). */
export default function LabelField({ label, onChange, state, baseDomain, name = "Address" }: { label: string; onChange: (v: string) => void; state: LabelState; baseDomain: string; name?: string }) {
  const uid = useId();
  return (
    <div>
      <label htmlFor={`${uid}-label`} className="mb-1 block text-[12.5px] font-semibold text-ink">
        {name}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={`${uid}-label`}
          value={label}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          placeholder="acme"
          aria-invalid={state.kind === "bad" ? true : undefined}
          aria-describedby={`${uid}-verdict`}
          className="min-w-0 flex-1"
        />
        <span className="flex-none text-[14px] text-ink-soft">.{baseDomain}</span>
      </div>
      <p id={`${uid}-verdict`} role="status" aria-live="polite" data-label-state={state.kind} className="mt-1 min-h-[18px] text-[12.5px] leading-snug">
        {state.kind === "checking" && <span className="text-v2-muted">Checking…</span>}
        {state.kind === "ok" && <span className="font-medium text-v2-green-ink">{state.host ?? label} is available.</span>}
        {state.kind === "bad" && (
          <span className="text-danger-text">
            {state.message}
            {state.suggestion && (
              <>
                {" "}
                <button type="button" onClick={() => onChange(state.suggestion ?? "")} className="font-semibold underline">
                  Use {state.suggestion}
                </button>
              </>
            )}
          </span>
        )}
      </p>
    </div>
  );
}
