"use client";

import Link from "next/link";
import { useState, type ComponentType, type ReactNode } from "react";
import { BarChartIcon, BriefcaseIcon, Button, ChevronRightIcon, ClockIcon, DeltaChip, Dialog, IconButton, Input, LightbulbIcon, PencilIcon, SearchIcon, SparklesIcon, TargetIcon, UsersIcon, chartColor, cn } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { openHelpPanel } from "@/components/ent/shell/ShellContext";
import { deltaFromPct } from "@/lib/ent/dashboard";
import { BANNER, THIS_MONTH_PERIODS, saveGoals, type Action, type Benchmarks, type GoalKey, type Goals } from "@/lib/ent/marketer-ws/performance";
import { CARD, CardSkeleton, Empty, TINTS, type TintName } from "../parts";
import { CardHead, PeriodSelect } from "./bits";

/** The right column of the Performance board: the bee card, Performance Benchmarks, Goals Progress and Recommended Actions. */

export function BeeCard() {
  return (
    <section aria-label="Help" data-perf-card="help" className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper">
      {/* eslint-disable-next-line @next/next/no-img-element -- the approved board art, served as is */}
      <img src={BANNER} alt="" className="block w-full object-cover" />
      <div className="p-3.5">
        <h2 className="text-[17px] font-extrabold leading-tight text-ink">Turn consultant potential into real opportunities</h2>
        <p className="mt-1.5 text-[13px] leading-snug text-muted">Keep tracking submissions, engage your consultants, and focus on high-fit opportunities. I can help you find insights, benchmark your results, or suggest next steps.</p>
        <button type="button" onClick={openHelpPanel} className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-accent-soft px-3 text-left text-[14px] font-semibold text-accent-deep hover:bg-accent-soft/70">
          <SparklesIcon size={17} className="flex-none" />
          <span className="min-w-0 flex-1 truncate">Ask a question</span>
          <ChevronRightIcon size={16} className="flex-none" />
        </button>
      </div>
    </section>
  );
}

export function BenchmarksCard({ data, period, onPeriod, loading }: { data: Benchmarks | null; period: string; onPeriod: (p: string) => void; loading: boolean }) {
  const empty = !data || data.rows.every((r) => r.value === null);
  return (
    <section data-perf-card="benchmarks" className={CARD}>
      <CardHead icon={BarChartIcon} title="Performance Benchmarks" size="sm">
        <PeriodSelect value={period} onChange={onPeriod} options={THIS_MONTH_PERIODS} label="Benchmarks period" width="w-[120px]" />
      </CardHead>
      {loading ? (
        <CardSkeleton />
      ) : empty ? (
        <Empty>Numbers appear after your first week.</Empty>
      ) : (
        <ul className="flex flex-col">
          {data.rows.map((r) => {
            const delta = deltaFromPct(r.deltaPct);
            return (
              <li key={r.key} data-benchmark-row={r.key} className="flex items-center gap-2 border-b border-line py-2.5 text-[13px] last:border-0">
                <span className="w-[5.5rem] flex-none text-ink-soft">{r.label}</span>
                <b className="w-11 flex-none text-[15px] tabular-nums text-ink">{r.value === null ? "-" : `${Math.round(r.value)}%`}</b>
                <span className="w-[4.25rem] flex-none">{delta ? <DeltaChip delta={delta} /> : null}</span>
                <span className="flex-1 text-right text-[12px] text-muted">Industry</span>
                <span className="w-9 flex-none text-right tabular-nums text-ink-soft">{r.industry === null ? "-" : `${Math.round(r.industry)}%`}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const GOAL_COLOR: Record<string, number> = { submissions: 3, interviews: 1, offers: 4, placements: 2 };
const GOAL_FIELDS: { key: GoalKey; label: string }[] = [
  { key: "submissions", label: "Submissions" },
  { key: "interviews", label: "Interviews" },
  { key: "offers", label: "Offers" },
  { key: "placements", label: "Placements" },
];

export function GoalsCard({ orgId, data, period, onPeriod, loading, onChanged }: { orgId: number; data: Goals | null; period: string; onPeriod: (p: string) => void; loading: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<GoalKey, string>>({ submissions: "", interviews: "", offers: "", placements: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edit = () => {
    setError(null);
    setValues(Object.fromEntries(GOAL_FIELDS.map((f) => [f.key, String(data?.rows.find((r) => r.key === f.key)?.target ?? "")])) as Record<GoalKey, string>);
    setOpen(true);
  };
  const close = () => {
    if (!busy) setOpen(false);
  };
  const submit = async () => {
    const targets: Partial<Record<GoalKey, number>> = {};
    for (const f of GOAL_FIELDS) {
      const raw = values[f.key].trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 100000) {
        setError(`${f.label}: enter a whole number from 0 to 100000.`);
        return;
      }
      targets[f.key] = n;
    }
    if (Object.keys(targets).length === 0) {
      setError("Enter at least one target.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await saveGoals(orgId, targets);
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      onChanged();
    } else setError(r.message);
  };

  return (
    <section data-perf-card="goals" className={CARD}>
      <CardHead icon={TargetIcon} title="Goals Progress" size="sm">
        {data?.canEdit ? (
          <IconButton aria-label="Set your monthly targets" data-edit-goals onClick={edit}>
            <PencilIcon size={15} aria-hidden />
          </IconButton>
        ) : null}
        <PeriodSelect value={period} onChange={onPeriod} options={THIS_MONTH_PERIODS} label="Goals period" width="w-[120px]" />
      </CardHead>
      {loading ? (
        <CardSkeleton />
      ) : !data || data.rows.length === 0 ? (
        <Empty>No targets yet.</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.rows.map((r) => {
            const width = r.pct === null ? 0 : Math.min(100, r.pct);
            return (
              <li key={r.key} data-goal-row={r.key} className="flex items-center gap-2 text-[13px]">
                <span className="w-[5.25rem] flex-none text-ink-soft">{r.label}</span>
                <span
                  role="progressbar"
                  aria-label={`${r.label} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={r.pct === null ? undefined : Math.min(100, r.pct)}
                  className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-paper-2"
                >
                  <span className="block h-full rounded-full" style={{ width: `${width}%`, background: chartColor(GOAL_COLOR[r.key] ?? 0) }} />
                </span>
                <span className="w-[4.75rem] flex-none text-right tabular-nums text-ink-soft">{r.target === null ? `${r.actual}` : `${r.actual} / ${r.target}`}</span>
                <b className={cn("w-9 flex-none text-right tabular-nums", r.pct === null ? "text-muted" : "text-v2-green-ink")}>{r.pct === null ? "-" : `${r.pct}%`}</b>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog
        open={open}
        onClose={close}
        title="Your monthly targets"
        description="Targets are numbers you set for yourself. They only change this card; nothing is submitted."
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button variant="accent-soft" size="sm" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={busy}>
              Save targets
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 text-[14px] sm:grid-cols-2">
          {GOAL_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1.5">
              <span className="font-semibold text-ink-soft">{f.label}</span>
              <Input inputMode="numeric" value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} aria-label={`${f.label} target`} placeholder="No target" />
            </label>
          ))}
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-danger-text">
            {error}
          </p>
        ) : null}
      </Dialog>
    </section>
  );
}

const ACTION_ICON: Record<string, { icon: ComponentType<IconProps>; tint: TintName }> = {
  quiet: { icon: ClockIcon, tint: "teal" },
  interviewing: { icon: UsersIcon, tint: "blue" },
  matches: { icon: SearchIcon, tint: "violet" },
  offerRate: { icon: BarChartIcon, tint: "amber" },
};

export function ActionsCard({ actions, hrefs, loading }: { actions: Action[]; hrefs: Record<string, string | null>; loading: boolean }) {
  return (
    <section data-perf-card="actions" className={CARD}>
      <CardHead icon={LightbulbIcon} title="Recommended Actions" tint="amber" size="sm" />
      {loading ? (
        <CardSkeleton />
      ) : actions.length === 0 ? (
        <Empty>You&apos;re all caught up.</Empty>
      ) : (
        <ul className="flex flex-col">
          {actions.map((a) => {
            const { icon: Icon, tint } = ACTION_ICON[a.key] ?? { icon: BriefcaseIcon, tint: "blue" as TintName };
            const href = hrefs[a.page] ?? null;
            const body: ReactNode = (
              <>
                <span aria-hidden className={cn("grid h-7 w-7 flex-none place-items-center rounded-full", TINTS[tint])}>
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink">
                  <span className="block">{a.text}</span>
                  {a.detail ? <span className="block text-ink-soft">{a.detail}</span> : null}
                </span>
                {href ? <ChevronRightIcon size={15} aria-hidden className="flex-none text-muted" /> : null}
              </>
            );
            return (
              <li key={a.key} data-action-row={a.key} className="border-b border-line last:border-0">
                {href ? (
                  <Link href={href} className="flex items-center gap-2.5 py-2 hover:bg-paper-2">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2.5 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
