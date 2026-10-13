"use client";

import { AlertIcon, BarChartIcon, ChevronRightIcon, ClockIcon, FUNNEL_COLORS, FunnelChart, MemberAvatar, Select, SparklesIcon, cn } from "@kiwiply/ui";
import { openHelpPanel } from "@/components/ent/shell/ShellContext";
import { relativeTime } from "@/lib/ent/dashboard";
import { BANNER, daysText, PERIODS, type ApplicationsView, type DotTone, type Period } from "@/lib/ent/marketer-ws/applications";
import { CardSkeleton, CARD, Empty, Head } from "../parts";

/** The bottom row of the Applications board: Application Funnel, Overdue Actions, Recent Updates and the bee card. */

const DOT: Record<DotTone, string> = { blue: "bg-blue-500", violet: "bg-violet-500", amber: "bg-amber-400", green: "bg-green-500", red: "bg-red-500" };

export function FunnelCard({ view, period, onPeriod, loading }: { view: ApplicationsView | null; period: Period; onPeriod: (p: Period) => void; loading: boolean }) {
  const f = view?.funnel;
  return (
    <section data-app-card="funnel" className={CARD}>
      <Head icon={BarChartIcon} title="Application Funnel">
        <Select value={period} onChange={(v) => onPeriod(v as Period)} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} aria-label="Funnel period" className="h-9 w-[150px]" />
      </Head>
      {loading ? (
        <CardSkeleton />
      ) : !f || f.total === 0 ? (
        <Empty>No applications in this period.</Empty>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
          <FunnelChart label="Application funnel" stages={f.stages.map((s) => ({ key: s.key, label: s.label, count: s.count }))} />
          <ul className="flex flex-col gap-2.5 text-[13px]">
            {f.stages.map((s, i) => (
              <li key={s.key} data-funnel-row={s.key} className="flex items-center gap-2">
                <span aria-hidden className="h-2 w-2 flex-none rounded-full" style={{ background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} />
                <span className="min-w-0 flex-1 truncate text-ink-soft">{s.label}</span>
                <b className="text-ink">{s.count}</b>
                <span className="w-10 text-right text-muted">{s.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function OverdueCard({ view, loading, viewAll, canMark, onDone }: { view: ApplicationsView | null; loading: boolean; viewAll: string | null; canMark: boolean; onDone: (id: number) => void }) {
  return (
    <section data-app-card="overdue" className={CARD}>
      <Head icon={AlertIcon} title="Overdue Actions" tint="pink" viewAll={viewAll} />
      {loading ? (
        <CardSkeleton />
      ) : !view || view.overdue.length === 0 ? (
        <Empty>Nothing overdue. Nice.</Empty>
      ) : (
        <ul className="flex flex-col">
          {view.overdue.map((o) => (
            <li key={o.id} data-overdue-row={o.id} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
              <input type="checkbox" checked={false} disabled={!canMark} onChange={() => onDone(o.id)} aria-label={`Mark done: ${o.title}`} className="h-4 w-4 flex-none rounded border-line" />
              <MemberAvatar name={o.consultant.name} src={o.consultant.avatarUrl} size={30} />
              <span className="w-[22%] min-w-0 flex-none truncate text-[13px] font-bold text-ink">{o.consultant.name}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">{o.title}</span>
                <span className="block truncate text-[12px] text-muted">{o.sub}</span>
              </span>
              <span className="flex-none text-[12.5px] font-semibold text-danger-text">{daysText(o.daysOverdue)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function UpdatesCard({ view, loading, viewAll, now }: { view: ApplicationsView | null; loading: boolean; viewAll: string | null; now: number }) {
  return (
    <section data-app-card="updates" className={CARD}>
      <Head icon={ClockIcon} title="Recent Updates" viewAll={viewAll} />
      {loading ? (
        <CardSkeleton />
      ) : !view || view.updates.length === 0 ? (
        <Empty>Nothing has happened yet.</Empty>
      ) : (
        <ul className="relative flex flex-col">
          <span aria-hidden className="absolute bottom-3 left-[5px] top-3 w-px bg-line" />
          {view.updates.map((u) => (
            <li key={u.id} data-update-row={u.id} data-tone={u.tone} className="relative flex items-start gap-3 py-2">
              <span aria-hidden className={cn("relative z-[1] mt-1.5 h-[11px] w-[11px] flex-none rounded-full ring-2 ring-paper", DOT[u.tone])} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">
                  <b>{u.consultant.name}</b> {u.text}
                </span>
                {u.detail ? <span className="block truncate text-[12px] text-muted">{u.detail}</span> : null}
              </span>
              <span className="flex-none whitespace-nowrap text-[12px] text-muted">{relativeTime(u.at, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The bee card ("Keep applications moving!"), its photo cropped from this board. */
export function BeeCard() {
  return (
    <section aria-label="Help" data-app-card="help" className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper">
      {/* eslint-disable-next-line @next/next/no-img-element -- the approved board art, served as is */}
      <img src={BANNER} alt="" className="block w-full object-cover" />
      <div className="p-3.5">
        <h2 className="text-[17px] font-extrabold leading-tight text-ink">Keep applications moving!</h2>
        <p className="mt-1.5 text-[13px] leading-snug text-muted">Follow up on pending applications and schedule interviews to help your consultants get placed.</p>
        <button type="button" onClick={openHelpPanel} className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-accent-soft px-3 text-left text-[14px] font-semibold text-accent-deep hover:bg-accent-soft/70">
          <SparklesIcon size={17} className="flex-none" />
          <span className="min-w-0 flex-1 truncate">Ask a question</span>
          <ChevronRightIcon size={16} className="flex-none" />
        </button>
      </div>
    </section>
  );
}
