"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BottomSheet, Button, ChoiceGroup, ClockIcon, DollarIcon, ErrorState, Field, Input, MoneyText, Select, Skeleton, Stepper, Switch, Textarea, UsersIcon, CalendarIcon, cn } from "@kiwiply/ui";
import { AdminHero, AdminPanel, AdminStatTiles, HBarList, useNarrow } from "../common";
import { adminFetch } from "@/lib/admin-client";
import { INTERVAL_LABEL } from "@/lib/admin-plans";
import {
  CHANNEL_LABEL,
  MODE_HINT,
  MODE_LABEL,
  OUTCOME_HINT,
  OUTCOME_LABEL,
  addDaysIso,
  effectiveDateProblem,
  parseNoticeDays,
  priceCheckText,
  startProblem,
  type CoverageResult,
  type NoticeChannel,
  type NoticePreview,
  type RetireMode,
  type RetireOutcome,
  type RetirementDetail,
  type StartRetirementBody,
} from "@/lib/admin-retirements";

export interface WizardPlan {
  planKey: string;
  name: string;
  status: string;
}

export interface SuccessorOption {
  planKey: string;
  name: string;
}

const STEPS = [
  { key: "scope", label: "Scope" },
  { key: "impact", label: "Impact" },
  { key: "successors", label: "Successors" },
  { key: "notices", label: "Notices and default" },
  { key: "review", label: "Review and start" },
];

const TARGET = "min-h-11 sm:min-h-0";
const n = (x: number) => x.toLocaleString("en-US");
const dateText = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "—");

/**
 * The retirement wizard of the plan builder (K10.9; docs/subscriptions/11-plan-retirement.md section 11): five steps on the admin kit. The mode is
 * pre-selected "retire at each subscriber's renewal" with the outcome Free + read-only lock (decisions S-20 and S-19); keeping a plan indefinitely is
 * an explicit option. Every number on the screen (subscribers, MRR, covered, would-pay-more) comes from `GET /api/admin/retirements/coverage`; the web
 * adds nothing. Starting is HIGH: the plan key typed again, a reason of at least the server's minimum, then `POST /api/admin/retirements`.
 */
export default function RetirementWizard({ plan, candidates }: { plan: WizardPlan; candidates: SuccessorOption[] }) {
  const router = useRouter();
  const narrow = useNarrow();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<RetireMode>("RETIRE_AT_RENEWAL");
  const [outcome, setOutcome] = useState<RetireOutcome>("FREE");
  const [successors, setSuccessors] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [daysText, setDaysText] = useState<string | null>(null);
  const [channels, setChannels] = useState<NoticeChannel[] | null>(null);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [cov, setCov] = useState<CoverageResult | null>(null);
  const [covError, setCovError] = useState<string | null>(null);
  const [preview, setPreview] = useState<NoticePreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const successorKey = successors.join(",");
  const loadCoverage = useCallback(async () => {
    const q = new URLSearchParams({ planKey: plan.planKey });
    if (successorKey) q.set("successors", successorKey);
    const res = await adminFetch<CoverageResult>("GET", `/retirements/coverage?${q.toString()}`);
    if (res.ok) {
      setCov(res.data);
      setCovError(null);
    } else setCovError(res.error);
  }, [plan.planKey, successorKey]);
  useEffect(() => {
    void loadCoverage();
  }, [loadCoverage]);

  const defaults = cov?.defaults ?? null;
  const days = daysText ?? (defaults ? defaults.noticeScheduleDays.join(", ") : "");
  const activeChannels = channels ?? defaults?.channels ?? [];
  const noticeDays = defaults ? parseNoticeDays(days, defaults.noticeDayMin, defaults.noticeDayMax) : null;
  const dateProblem = defaults ? effectiveDateProblem(date, defaults.minNoticeDays) : null;
  const first = cov?.successors[0];
  const check = priceCheckText(outcome, first);
  const allowed = defaults?.allowedOutcomes ?? ["FREE"];
  const retiring = plan.status !== "PUBLISHED";

  // the first notice, rendered by the server from the copy register; re-read whenever what it depends on changes
  useEffect(() => {
    if (step < 3) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const q = new URLSearchParams({ planKey: plan.planKey, outcome });
      if (successors[0]) q.set("successor", successors[0]);
      if (message.trim()) q.set("message", message.trim());
      const res = await adminFetch<NoticePreview>("GET", `/retirements/notices/preview?${q.toString()}`);
      if (!cancelled && res.ok) setPreview(res.data);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [step, plan.planKey, outcome, successors, message]);

  const blocker = defaults
    ? startProblem({ outcome, firstSuccessor: first, successorCount: successors.length, noticeDays, channels: activeChannels, dateProblem, reason, reasonMin: defaults.reasonMin, typed, planKey: plan.planKey })
    : "Loading.";

  const options = useMemo(() => candidates.filter((c) => c.planKey !== plan.planKey && !successors.includes(c.planKey)), [candidates, plan.planKey, successors]);

  async function start() {
    if (blocker || !noticeDays) return;
    setBusy(true);
    setError(null);
    const body: StartRetirementBody = {
      planKey: plan.planKey,
      planVersion: cov?.planVersion ?? null,
      mode,
      defaultOutcome: outcome,
      effectiveNotBefore: date || null,
      successors: successors.map((planKey, i) => ({ planKey, rank: i + 1 })),
      noticeScheduleDays: noticeDays,
      channels: activeChannels,
      messageMd: message.trim() || null,
      reason: reason.trim(),
      confirmPlanKey: typed.trim(),
    };
    const res = await adminFetch<RetirementDetail>("POST", "/retirements", body);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/admin/pricing/retirements/${res.data.id}`);
  }

  if (retiring) {
    return (
      <div className="mx-auto max-w-[900px] space-y-3">
        <ErrorState what="this retirement" title="This plan is not on sale" description={`${plan.name} is ${plan.status.toLowerCase()}, so it cannot be retired again. Open its retirement to follow the progress.`} />
        <Link href={`/admin/pricing/plans/${plan.planKey}/retirements`} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-v2-blue-ink hover:underline">
          Open the retirement
        </Link>
      </div>
    );
  }

  const impact = cov?.impact;
  const currency = impact?.currency ?? "USD";
  const lastStep = step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 pb-24">
      <AdminHero
        eyebrow="PRICING"
        title={`Retire ${plan.name}`}
        subtitle="Nobody loses paid time or data. Subscribers are told, choose a replacement, and anyone who does nothing moves on their own renewal date."
        actions={
          <Link href="/admin/pricing/plans" className="inline-flex min-h-11 items-center rounded-full border border-line bg-paper px-4 text-[13px] font-semibold text-ink hover:bg-paper-2 sm:min-h-0 sm:py-2">
            Back to plans
          </Link>
        }
      />

      <Stepper label="Retirement steps" steps={STEPS} current={step} />

      {covError && <ErrorState what="the retirement figures" description={covError} />}

      {step === 0 && (
        <AdminPanel title="Scope" description={`Retiring ${plan.name} (${plan.planKey}). New buyers stop at once; existing subscribers keep everything until their own date.`} fit>
          <div className="space-y-5">
            <Field label="Mode" hint={MODE_HINT[mode]}>
              <ChoiceGroup
                aria-label="Mode"
                value={mode}
                onChange={(v) => setMode(v as RetireMode)}
                options={(Object.keys(MODE_LABEL) as RetireMode[]).map((m) => ({ value: m, label: MODE_LABEL[m] }))}
              />
            </Field>
            {mode === "RETIRE_AT_RENEWAL" && (
              <Field
                label="Earliest effective date (optional)"
                hint={defaults ? `Leave empty and each subscriber gets their own date, never sooner than ${defaults.minNoticeDays} days from today and never before the period they paid for ends.` : "Loading."}
                error={dateProblem ?? undefined}
              >
                <Input type="date" value={date} min={defaults ? addDaysIso(new Date(), defaults.minNoticeDays) : undefined} onChange={(e) => setDate(e.target.value)} aria-label="Earliest effective date" />
              </Field>
            )}
          </div>
        </AdminPanel>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {!impact ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <AdminStatTiles
                stats={[
                  { label: "Subscribers", value: n(impact.subscribers), icon: <UsersIcon size={26} />, tone: "blue", caption: `${n(impact.withAddons)} with add-ons` },
                  { label: "MRR touched", value: <MoneyText minor={impact.mrrMinor} currency={currency} />, icon: <DollarIcon size={26} />, tone: "green", caption: "recurring, per month" },
                  { label: "Earliest effective", value: dateText(impact.earliestEffectiveAt), icon: <CalendarIcon size={26} />, tone: "amber" },
                  { label: "Latest effective", value: dateText(impact.latestEffectiveAt), icon: <ClockIcon size={26} />, tone: "violet" },
                ]}
              />
              <AdminPanel title="By billing period" description="Where the subscribers are today." fit>
                {impact.subscribers === 0 ? (
                  <p className="text-[13px] text-v2-muted">No subscribers on this plan. Starting the retirement closes it at once, with no notices.</p>
                ) : (
                  <HBarList
                    items={Object.entries(impact.byInterval).map(([interval, count]) => ({
                      label: INTERVAL_LABEL[interval] ?? interval,
                      value: count,
                      tone: interval === "MONTH" ? "blue" : interval === "QUARTER" ? "violet" : "teal",
                      display: n(count),
                    }))}
                  />
                )}
              </AdminPanel>
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <AdminPanel title="Successors" description="The closest matches subscribers are offered, in your order. The first is the suggestion for people it fully covers." fit>
          <div className="space-y-4">
            <ol className="space-y-2" aria-label="Successors in order">
              {cov?.successors.map((s, i) => (
                <li key={s.planKey} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-paper p-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink">
                      {i + 1}. {s.name} <span className="text-[12px] font-normal text-v2-muted">{s.planKey}</span>
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-ink-soft">
                      {n(s.fullyCovered)} fully covered · {n(s.withGaps)} with gaps · {n(s.wouldPayMore)} would pay more
                    </p>
                    {s.gapFeatures.length > 0 && (
                      <p className="mt-0.5 text-[12px] text-v2-muted">
                        Gaps: {s.gapFeatures.map((g) => `${g.name} (${n(g.subscribers)})`).join(", ")}
                      </p>
                    )}
                    {!s.sellable && <p className="mt-0.5 text-[12px] text-danger-text">Not on sale right now, so it cannot be offered.</p>}
                  </div>
                  <Button type="button" variant="ghost" className={TARGET} onClick={() => setSuccessors((l) => l.filter((k) => k !== s.planKey))} aria-label={`Remove ${s.name}`}>
                    Remove
                  </Button>
                </li>
              ))}
            </ol>
            {successors.length === 0 && <p className="text-[13px] text-v2-muted">No successor yet. With the Free outcome one is optional but recommended.</p>}
            {options.length > 0 && (
              <Field label="Add a successor">
                <Select
                  value=""
                  onChange={(v) => v && setSuccessors((l) => [...l, v])}
                  options={[{ value: "", label: "Choose a plan" }, ...options.map((o) => ({ value: o.planKey, label: `${o.name} (${o.planKey})` }))]}
                  aria-label="Add a successor"
                />
              </Field>
            )}
            <p role="status" className={cn("rounded-xl border px-3 py-2 text-[13px]", check.ok ? "border-line bg-paper-2 text-ink-soft" : "border-danger/40 text-danger-text")} data-testid="price-check">
              {check.text}
            </p>
          </div>
        </AdminPanel>
      )}

      {step === 3 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <AdminPanel title="Notices and the default" fit>
            <div className="space-y-5">
              <Field label="If a subscriber does nothing" hint={OUTCOME_HINT[outcome]}>
                <ChoiceGroup
                  aria-label="Default outcome"
                  value={outcome}
                  onChange={(v) => setOutcome(v as RetireOutcome)}
                  options={allowed.map((o) => ({ value: o, label: OUTCOME_LABEL[o] }))}
                />
              </Field>
              {!check.ok && outcome !== "FREE" && (
                <p role="alert" className="text-[13px] text-danger-text" data-testid="outcome-refusal">
                  {check.text}
                </p>
              )}
              <Field
                label="Notice days before each subscriber's date"
                hint={defaults ? `Whole days from ${defaults.noticeDayMin} to ${defaults.noticeDayMax}, separated by commas. The reminders stop the moment someone chooses.` : "Loading."}
                error={defaults && !noticeDays ? "Use whole days within the bounds, for example 60, 30, 7, 1." : undefined}
              >
                <Input value={days} onChange={(e) => setDaysText(e.target.value)} inputMode="numeric" aria-label="Notice days" />
              </Field>
              <fieldset className="space-y-2">
                <legend className="text-[13px] font-semibold text-ink">Channels</legend>
                {(defaults?.availableChannels ?? []).map((c) => (
                  <Switch
                    key={c}
                    label={CHANNEL_LABEL[c]}
                    checked={activeChannels.includes(c)}
                    onCheckedChange={(on) => setChannels(on ? [...activeChannels, c] : activeChannels.filter((x) => x !== c))}
                  />
                ))}
              </fieldset>
              <Field label="Message to subscribers (optional)" hint={`Added to the notice. Markdown, up to ${defaults ? n(defaults.messageMax) : "2,000"} characters.`}>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, defaults?.messageMax ?? 2000))} rows={4} aria-label="Message" />
              </Field>
              {narrow && (
                <Button type="button" variant="ghost" className={TARGET} onClick={() => setPreviewOpen(true)}>
                  Preview the notice
                </Button>
              )}
            </div>
          </AdminPanel>
          {!narrow && (
            <AdminPanel title="Notice preview" description="What the first email says, for a sample subscriber." fit>
              <NoticeBody preview={preview} />
            </AdminPanel>
          )}
          <BottomSheet open={narrow && previewOpen} onClose={() => setPreviewOpen(false)} title="Notice preview" id="retire-notice-preview">
            <NoticeBody preview={preview} />
          </BottomSheet>
        </div>
      )}

      {step === 4 && (
        <AdminPanel title="Review and start" description="This starts the notices today. Nothing changes for anyone before their own date." fit>
          <div className="space-y-5">
            <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[170px_1fr]" data-testid="review">
              <Row k="Plan" v={`${plan.name} (${plan.planKey})`} />
              <Row k="Mode" v={MODE_LABEL[mode]} />
              <Row k="Subscribers" v={impact ? n(impact.subscribers) : "—"} />
              <Row k="First date" v={date ? dateText(`${date}T00:00:00Z`) : impact?.earliestEffectiveAt ? `${dateText(impact.earliestEffectiveAt)} (each subscriber's own date)` : "—"} />
              <Row k="Successors" v={cov && cov.successors.length > 0 ? cov.successors.map((s, i) => `${i + 1}. ${s.name}`).join(", ") : "None"} />
              <Row k="If no response" v={OUTCOME_LABEL[outcome]} />
              <Row k="Notices" v={`${noticeDays ? noticeDays.join(", ") : "—"} days before · ${activeChannels.map((c) => CHANNEL_LABEL[c]).join(", ") || "no channel"}`} />
            </dl>
            <Field label="Reason" hint={`Recorded in the audit log. At least ${defaults?.reasonMin ?? 20} characters.`}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} aria-label="Reason" placeholder="Why this plan is being retired" />
            </Field>
            <Field label={`Type ${plan.planKey} to confirm`}>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label="Plan key to confirm" placeholder={plan.planKey} />
            </Field>
            {error && (
              <p role="alert" className="text-[13px] text-danger-text" data-testid="start-error">
                {error}
              </p>
            )}
          </div>
        </AdminPanel>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:sticky md:bottom-3 md:rounded-2xl md:border md:shadow-v2-soft" data-testid="wizard-footer">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3">
          <Button type="button" variant="ghost" className={TARGET} disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {lastStep ? (
            <div className="flex flex-col items-end gap-1">
              <Button type="button" variant="primary" className={TARGET} disabled={!!blocker || busy} onClick={() => void start()}>
                Start retirement
              </Button>
              {blocker && <span className="text-[12px] text-v2-muted">{blocker}</span>}
            </div>
          ) : (
            <Button type="button" variant="primary" className={TARGET} disabled={!cov || (step === 0 && !!dateProblem)} onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="font-semibold text-ink-soft">{k}</dt>
      <dd className="text-ink">{v}</dd>
    </>
  );
}

function NoticeBody({ preview }: { preview: NoticePreview | null }) {
  if (!preview) return <Skeleton className="h-32" />;
  return (
    <div className="space-y-2" data-testid="notice-preview">
      <p className="text-[14px] font-semibold text-ink">{preview.subject}</p>
      <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">{preview.body}</p>
    </div>
  );
}
