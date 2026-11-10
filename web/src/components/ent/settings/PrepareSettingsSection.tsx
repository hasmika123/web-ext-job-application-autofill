"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, ErrorState, Field, Input, Skeleton, Switch, useToast } from "@kiwiply/ui";
import { CARD } from "@/components/ent/dashboard/parts";
import {
  PREPARE_EXPLAINER,
  PREPARE_UNAVAILABLE,
  fetchPrepareSettings,
  savePrepareSettings,
  type PrepareChange,
  type PrepareField,
  type PrepareLimit,
  type PrepareResult,
  type PrepareSettings,
} from "@/lib/ent/prepare-settings";

/**
 * "Autopilot" (prepare selected openings) on the Autopilot tab of Settings (decision 2026-10-18: the Org Admin controls it). The organization opts in with one switch (off by
 * default) and may lower the daily, monthly and per-batch limits; Kiwiply's own values are the maximum and are shown beside each field. It autosaves like the
 * rest of the page: the switch moves at once, a quiet check shows when the API has it, and an Undo toast gives the old value back; a limit saves when the field
 * is left. While Kiwiply's master switch is off the whole section is shown disabled. The API is the gate (permission, bounds, audit); this section draws what
 * it answers. Kiwiply never submits an application: the consultant always reviews and submits.
 */

const FIELDS: { key: PrepareField; label: string; noun: string }[] = [
  { key: "dailyCap", label: "Openings per day", noun: "daily limit" },
  { key: "monthlyCap", label: "Openings per month", noun: "monthly limit" },
  { key: "maxBatch", label: "Openings per batch", noun: "batch size" },
];

const draftsOf = (s: PrepareSettings): Record<PrepareField, string> => ({ dailyCap: String(s.dailyCap.value), monthlyCap: String(s.monthlyCap.value), maxBatch: String(s.maxBatch.value) });

export default function PrepareSettingsSection({ orgId }: { orgId: number }) {
  const toast = useToast();
  const [data, setData] = useState<PrepareSettings | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [drafts, setDrafts] = useState<Record<PrepareField, string>>({ dailyCap: "", monthlyCap: "", maxBatch: "" });
  const [errors, setErrors] = useState<Partial<Record<PrepareField, string>>>({});
  const [saved, setSaved] = useState(false);
  const dataRef = useRef<PrepareSettings | null>(null);
  const tick = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(
    () => () => {
      if (tick.current) clearTimeout(tick.current);
    },
    [],
  );

  const adopt = useCallback((s: PrepareSettings) => {
    setData(s);
    setDrafts(draftsOf(s));
    setErrors({});
  }, []);

  const load = useCallback(async () => {
    setStatus("loading");
    const r = await fetchPrepareSettings(orgId);
    if (r.kind === "OK") {
      adopt(r.settings);
      setStatus("ready");
    } else setStatus(r.kind === "DENIED" ? "denied" : "failed");
  }, [orgId, adopt]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const flashTick = () => {
    setSaved(true);
    if (tick.current) clearTimeout(tick.current);
    tick.current = setTimeout(() => setSaved(false), 2000);
  };

  /** One autosave. `undo` is the change that puts things back (absent for the write an Undo itself makes: no Undo of an Undo). */
  const apply = async (change: PrepareChange, title: string, undo?: PrepareChange, field?: PrepareField): Promise<boolean> => {
    const before = dataRef.current;
    if (!before) return false;
    setSaved(false);
    const r: PrepareResult = await savePrepareSettings(orgId, change);
    if (r.kind === "OK") {
      adopt(r.settings);
      flashTick();
      toast({ title, variant: "success", action: undo ? { label: "Undo", onClick: () => void apply(undo, "Change undone") } : undefined });
      return true;
    }
    adopt(before); // the switch or the field goes back to what the API last said
    if (r.kind === "DEMO") return false; // the shell's one demo notice already says it
    if (r.kind === "DENIED") void load();
    if (r.kind === "PLATFORM_OFF") void load();
    if (r.kind === "INVALID" && field) setErrors({ [field]: r.message });
    toast({ title: "Not saved", description: r.kind === "INVALID" ? r.message : "That change wasn't saved. Nothing changed.", variant: "error" });
    return false;
  };

  const toggle = (value: boolean) => {
    const before = dataRef.current;
    if (!before) return;
    setData({ ...before, enabled: value }); // moves at once; the API's answer replaces it
    void apply({ enabled: value }, value ? "Consultants can now prepare selected openings" : "Consultants can no longer prepare selected openings", { enabled: !value });
  };

  /** A limit saves when the field is left (or Enter): a whole number from the minimum to Kiwiply's maximum; above the maximum it is shown at the maximum. */
  const commit = (key: PrepareField) => {
    const before = dataRef.current;
    if (!before) return;
    const limit: PrepareLimit = before[key];
    const text = drafts[key].trim();
    if (text === String(limit.value)) return setErrors({});
    if (!/^\d{1,9}$/.test(text) || Number(text) < limit.min) {
      setErrors({ [key]: `Use a whole number from ${limit.min} to ${limit.platformMax}.` });
      return;
    }
    const n = Math.min(Number(text), limit.platformMax);
    setErrors({});
    const label = FIELDS.find((f) => f.key === key)?.noun ?? "limit";
    void apply({ [key]: n }, `Your ${label} is now ${n}`, { [key]: limit.custom ? limit.value : null }, key);
  };

  if (status === "loading") return <Skeleton className="h-56 w-full rounded-2xl" />;
  if (status === "denied") return null; // the page's own section already says it
  if (status === "failed" || !data) return <ErrorState what="the Autopilot settings" description="Please refresh in a moment." onRetry={() => void load()} />;

  const off = !data.platformEnabled;
  const { consultants: licensed, total, featureName } = data.licensed;
  const person = (n: number) => (n === 1 ? "consultant" : "consultants");

  return (
    <section aria-labelledby="org-set-prepare" className={`${CARD} p-5`} data-org-prepare>
      <h2 id="org-set-prepare" className="text-[16px] font-bold text-ink">
        Autopilot
      </h2>
      <p className="mt-2 text-[13px] leading-snug text-ink-soft" data-prepare-explainer>
        {PREPARE_EXPLAINER}
      </p>
      {off ? (
        <p role="status" data-prepare-unavailable className="mt-3 rounded-lg bg-paper-2 px-3 py-2 text-[13px] text-ink-soft">
          {PREPARE_UNAVAILABLE}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Switch
            label="Let consultants prepare selected openings"
            description="Only consultants whose license includes the add-on."
            checked={data.enabled && !off}
            disabled={off}
            onCheckedChange={toggle}
          />
        </div>
        <span aria-live="polite" title={saved ? "Saved" : undefined} data-saved-tick={saved ? "" : undefined} className="inline-flex h-5 w-5 flex-none items-center justify-center text-green-600">
          {saved ? (
            <>
              <CheckIcon size={16} />
              <span className="sr-only">Saved</span>
            </>
          ) : null}
        </span>
      </div>

      <div className="mt-4 grid gap-x-4 sm:grid-cols-3" data-prepare-limits>
        {FIELDS.map((f) => {
          const limit = data[f.key];
          return (
            <Field key={f.key} label={f.label} hint={`Per consultant. Up to ${limit.platformMax}.`} error={errors[f.key]}>
              <Input
                type="number"
                inputMode="numeric"
                min={limit.min}
                max={limit.platformMax}
                value={drafts[f.key]}
                disabled={off}
                data-prepare-limit={f.key}
                onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
                onBlur={() => commit(f.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit(f.key);
                }}
              />
            </Field>
          );
        })}
      </div>

      <p className="mt-1 text-[13px] text-ink-soft" data-prepare-licensed>
        {total === 0
          ? "You have no active consultants yet."
          : licensed === 0
            ? `No consultant's license includes ${featureName} yet, so no one can use this until you add it.`
            : `${licensed} of ${total} active ${person(total)} ${total === 1 ? "has" : "have"} ${featureName} on their license.`}{" "}
        <Link href="/w/admin/consultants" className="font-semibold text-accent underline-offset-2 hover:underline" data-prepare-consultants-link>
          Consultants
        </Link>
      </p>
    </section>
  );
}
