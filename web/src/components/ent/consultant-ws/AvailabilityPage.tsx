"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import {
  BriefcaseIcon,
  CalendarCheckIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  Dialog,
  DollarIcon,
  ErrorState,
  FileTextIcon,
  MapPinIcon,
  Menu,
  MinusCircleIcon,
  MonitorIcon,
  MoreVerticalIcon,
  PencilIcon,
  SendIcon,
  ShareNodesIcon,
  Button,
  Skeleton,
  Sparkline,
  TrashIcon,
  ZapIcon,
  chartColor,
  cn,
  useToast,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { CARD, TONES, type IconTone } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { BASE, BeeCard, Card, Empty, Pill, SampleMark, TABLE, TD, useWorkspaceData } from "./parts";
import { AvailabilitySheet, BlockSheet, PreferencesSheet, failureText, type BlockSheetState } from "./AvailabilitySheets";
import { deltaText, firstName } from "@/lib/ent/consultant-ws/home";
import {
  AUTH_LABEL,
  STATUS_LABEL,
  WORK_MODE_LABEL,
  blockStatusInfo,
  changeBlock,
  createBlock,
  dayText,
  employmentText,
  fetchAvailability,
  fromNowText,
  historyStatusInfo,
  historyWhen,
  kindInfo,
  monthGrid,
  monthTitle,
  noticeText,
  paintDay,
  rangeLabel,
  rateText,
  removeBlock,
  savePreferences,
  saveStatus,
  shiftMonth,
  travelText,
  upcomingUnavailable,
  workModeHint,
  type AvailabilityView,
  type Block,
  type BlockDraft,
  type BlockKind,
  type PrefDraft,
  type WriteResult,
} from "@/lib/ent/consultant-ws/availability";

/**
 * Consultant Availability (design/enterprise-consultant/availability.webp): one call to `GET /api/orgs/{orgId}/me-workspace/availability`
 * draws the page for the signed-in consultant's OWN availability. The calendar is built here without a calendar library; days are
 * buttons with a roving focus (arrow keys move, Page Up / Down change month). Clicking a day opens a side sheet to add or edit an entry.
 * Preferred locations, employment types and work authorization are read from My Career Profile and edited there. Vacation approval is the
 * marketer's step (not connected yet), so a seeded status carries a Sample mark; nothing is sent to a marketer from this page.
 */

/* ── tiles ──────────────────────────────────────────────────────────────────────────── */

function Tile({ title, icon: Icon, tone, value, sub, spark, index, loading }: { title: string; icon: ComponentType<IconProps>; tone: IconTone; value: ReactNode; sub: ReactNode; spark?: number[]; index: number; loading: boolean }) {
  return (
    <section aria-label={title} data-stat-tile={title} data-tone={tone} data-state={loading ? "loading" : "ok"} className="flex min-h-[112px] min-w-0 gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5">
      <span aria-hidden className={cn("grid h-14 w-14 flex-none place-items-center rounded-[14px]", TONES[tone])}>
        <Icon size={26} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13.5px] font-bold leading-tight text-ink">{title}</h3>
        {loading ? (
          <>
            <Skeleton className="mt-2 h-8 w-20" />
            <Skeleton className="mt-2 h-4 w-24" />
          </>
        ) : (
          <>
            <div className="mt-1 flex items-end justify-between gap-2">
              <p data-tile-value className="min-w-0 truncate text-[24px] font-extrabold leading-none tabular-nums text-ink 2xl:text-[26px]">
                {value}
              </p>
              {spark && spark.length > 1 ? (
                <div className="mb-0.5 hidden w-[36%] max-w-[72px] flex-none 2xl:block">
                  <Sparkline values={spark} color={chartColor(index)} />
                </div>
              ) : null}
            </div>
            <p className="mt-2 flex min-h-5 flex-wrap items-center gap-x-1.5 text-[12px] text-muted">{sub}</p>
          </>
        )}
      </div>
    </section>
  );
}

function Tiles({ view }: { view: AvailabilityView | null }) {
  const t = view?.tiles;
  const d = t ? deltaText(t.openOpportunities.deltaPct) : null;
  const af = t?.availableFrom;
  const dateValue = !af ? "" : af.date ? dayText(af.date) : af.status === "AVAILABLE" ? "Now" : "Not set";
  return (
    <section aria-label="Key numbers" data-availability-tiles className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
      <Tile
        index={0}
        loading={!view}
        title="Available From"
        icon={CalendarCheckIcon}
        tone="green"
        value={dateValue}
        sub={
          af ? (
            <>
              <span aria-hidden className={cn("h-2 w-2 rounded-full", af.date || af.status === "AVAILABLE" ? "bg-v2-green-ink" : "bg-muted")} />
              <span>{fromNowText(af)}</span>
            </>
          ) : null
        }
      />
      <Tile
        index={1}
        loading={!view}
        title="Open Opportunities"
        icon={BriefcaseIcon}
        tone="violet"
        value={t?.openOpportunities.value ?? 0}
        spark={t?.openOpportunities.sparkline}
        sub={
          d ? (
            <>
              <span className={cn("font-bold", d.dir === "up" ? "text-v2-green-ink" : d.dir === "down" ? "text-v2-coral-ink" : "text-muted")}>
                {d.dir === "up" ? "↑" : d.dir === "down" ? "↓" : "→"} {d.text}
              </span>
              <span>vs last month</span>
            </>
          ) : (
            <span>Matches you can still act on</span>
          )
        }
      />
      <Tile
        index={2}
        loading={!view}
        title="Preferred Work Mode"
        icon={MapPinIcon}
        tone="amber"
        value={t?.workMode ? WORK_MODE_LABEL[t.workMode] : "Not set"}
        sub={<span>{workModeHint(t?.workMode ?? null) ?? "Set it in Work Preferences"}</span>}
      />
      <Tile
        index={3}
        loading={!view}
        title="Notice Period"
        icon={ClockIcon}
        tone="accent"
        value={noticeText(t?.notice.weeks ?? null)}
        sub={<span>{t?.notice.availableOn ? `Available ${dayText(t.notice.availableOn)}` : view ? STATUS_LABEL[view.availability.status] : ""}</span>}
      />
      <Tile
        index={4}
        loading={!view}
        title={t ? `Vacation Days (${t.vacation.year})` : "Vacation Days"}
        icon={SendIcon}
        tone="coral"
        value={t?.vacation.approvedDays ?? 0}
        sub={
          t ? (
            <span>
              {t.vacation.scheduledDays} {t.vacation.scheduledDays === 1 ? "day" : "days"} scheduled
              {t.vacation.pendingDays > 0 ? `, ${t.vacation.pendingDays} pending` : ""}
            </span>
          ) : null
        }
      />
    </section>
  );
}

/* ── the calendar ───────────────────────────────────────────────────────────────────── */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BAR: Record<BlockKind, string> = {
  VACATION: "bg-v2-coral-soft text-v2-coral-ink",
  PERSONAL: "bg-accent-soft text-accent-deep",
  HOLIDAY: "bg-v2-violet-soft text-v2-violet-ink",
  AVAILABLE: "bg-v2-green-soft text-v2-green-ink",
};

function cellLabel(iso: string, today: string, view: AvailabilityView): string {
  const p = paintDay(view, iso);
  const parts = [dayText(iso)];
  if (iso === today) parts.push("today");
  const off = p.blocks.find((b) => b.kind !== "AVAILABLE");
  if (off) parts.push(`${kindInfo(off.kind).label}, ${blockStatusInfo(off.status).label}${off.reason ? `, ${off.reason}` : ""}`);
  else if (p.available) parts.push("Available");
  return parts.join(", ");
}

function CalendarCard({ view, onPick }: { view: AvailabilityView; onPick: (iso: string) => void }) {
  const today = view.today;
  const [ym, setYm] = useState<{ y: number; m: number } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const y = ym?.y ?? Number(today.slice(0, 4));
  const m = ym?.m ?? Number(today.slice(5, 7)) - 1;
  const weeks = useMemo(() => monthGrid(y, m), [y, m]);
  const inMonth = (iso: string) => iso.startsWith(`${y}-${String(m + 1).padStart(2, "0")}`);
  const focusIso = focus && inMonth(focus) ? focus : inMonth(today) ? today : weeks[0].find((c) => c.inMonth)!.iso;

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`)?.focus();
  }, [focusIso, y, m]);

  const go = (by: number) => {
    const n = shiftMonth(y, m, by);
    setYm({ y: n.year, m: n.month0 });
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) {
      e.preventDefault();
      const next = new Date(`${focusIso}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + step[e.key]);
      const iso = next.toISOString().slice(0, 10);
      moved.current = true;
      setFocus(iso);
      setYm({ y: next.getUTCFullYear(), m: next.getUTCMonth() });
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      const by = e.key === "PageDown" ? 1 : -1;
      const n = shiftMonth(y, m, by);
      const dim = new Date(Date.UTC(n.year, n.month0 + 1, 0)).getUTCDate();
      const day = Math.min(Number(focusIso.slice(8, 10)), dim);
      moved.current = true;
      setFocus(`${n.year}-${String(n.month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
      setYm({ y: n.year, m: n.month0 });
    }
  };

  return (
    <section aria-labelledby="avail-calendar" data-home-card="avail-calendar" className={cn(CARD, "flex min-w-0 flex-col p-4 sm:p-5")}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-[10px]", TONES.accent)}>
          <CalendarIcon size={19} />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <h2 id="avail-calendar" className="text-[17px] font-extrabold leading-tight text-ink">
            Availability Calendar
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">View and manage your available and unavailable dates. Click on a date to add or edit an entry.</p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <button type="button" aria-label="Previous month" onClick={() => go(-1)} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-paper text-ink hover:bg-paper-2">
            <ChevronLeftIcon size={16} />
          </button>
          <span data-month-title aria-live="polite" className="min-w-[116px] text-center text-[13.5px] font-semibold text-ink">
            {monthTitle(y, m)}
          </span>
          <button type="button" aria-label="Next month" onClick={() => go(1)} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-paper text-ink hover:bg-paper-2">
            <ChevronRightIcon size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              setYm(null);
              setFocus(today);
            }}
            className="inline-flex min-h-9 items-center rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft"
          >
            Today
          </button>
        </div>
      </header>

      <div ref={gridRef} role="grid" aria-label={`${monthTitle(y, m)} availability`} onKeyDown={onKey} data-calendar className="mt-4 overflow-hidden rounded-xl border border-line">
        <div role="row" className="grid grid-cols-7 bg-paper-2/60">
          {WEEKDAYS.map((d) => (
            <div key={d} role="columnheader" className="px-1 py-2 text-center text-[12px] font-semibold text-ink-soft">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((row) => (
          <div key={row[0].iso} role="row" className="grid grid-cols-7 border-t border-line">
            {row.map((cell, ci) => {
              const p = paintDay(view, cell.iso);
              const off = p.blocks.find((b) => b.kind !== "AVAILABLE");
              const bar: { kind: BlockKind; key: string } | null = off ? { kind: off.kind, key: `b${off.id}` } : p.available ? { kind: "AVAILABLE", key: p.blocks.find((b) => b.kind === "AVAILABLE") ? `a${p.blocks.find((b) => b.kind === "AVAILABLE")!.id}` : "date" } : null;
              const prev = ci > 0 ? row[ci - 1] : null;
              const prevPaint = prev ? paintDay(view, prev.iso) : null;
              const prevOff = prevPaint?.blocks.find((b) => b.kind !== "AVAILABLE");
              const prevKey = prevOff ? `b${prevOff.id}` : prevPaint?.available ? (prevPaint.blocks.find((b) => b.kind === "AVAILABLE") ? `a${prevPaint.blocks.find((b) => b.kind === "AVAILABLE")!.id}` : "date") : null;
              const showLabel = bar !== null && (ci === 0 || prevKey !== bar.key || !prev?.inMonth);
              const isToday = cell.iso === today;
              return (
                <div key={cell.iso} role="gridcell" aria-selected={isToday || undefined} className={cn("min-w-0 border-l border-line first:border-l-0", !cell.inMonth && "bg-paper-2/40")}>
                  <button
                    type="button"
                    data-iso={cell.iso}
                    data-today={isToday || undefined}
                    data-paint={bar?.kind ?? "none"}
                    tabIndex={cell.iso === focusIso ? 0 : -1}
                    aria-label={cellLabel(cell.iso, today, view)}
                    onClick={() => {
                      setFocus(cell.iso);
                      onPick(cell.iso);
                    }}
                    onFocus={() => setFocus(cell.iso)}
                    className="flex min-h-[52px] w-full flex-col items-stretch gap-1 px-1 py-1.5 text-left hover:bg-accent-soft/40 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:min-h-[66px] sm:px-2"
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span className={cn("text-[12.5px] font-semibold tabular-nums", cell.inMonth ? "text-ink" : "text-muted/70")}>{cell.day}</span>
                      {isToday ? <span className="hidden rounded-md bg-accent px-1.5 py-0.5 text-[10.5px] font-bold text-paper sm:inline">Today</span> : null}
                    </span>
                    {bar ? (
                      <span aria-hidden className={cn("flex h-5 min-w-0 items-center overflow-hidden px-1.5 text-[11px] font-semibold", BAR[bar.kind], "rounded-md")}>
                        <span className={cn("hidden truncate sm:inline", !showLabel && "sm:invisible")}>{kindInfo(bar.kind).label}</span>
                      </span>
                    ) : null}
                    {isToday ? <span aria-hidden className="mx-auto h-1.5 w-1.5 rounded-full bg-accent sm:hidden" /> : null}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <ul aria-label="Legend" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        {(["AVAILABLE", "VACATION", "PERSONAL", "HOLIDAY"] as BlockKind[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("h-3 w-3 rounded", BAR[k])} />
            {kindInfo(k).label}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── work preferences ───────────────────────────────────────────────────────────────── */

interface PrefRowSpec {
  key: string;
  label: string;
  icon: ComponentType<IconProps>;
  tone: IconTone;
  title: ReactNode;
  detail: string | null;
  /** A link to the Profile page, or opens the preferences sheet. */
  href?: string;
}

function PrefRow({ spec, onEdit }: { spec: PrefRowSpec; onEdit: () => void }) {
  const Icon = spec.icon;
  const inner = (
    <>
      <span aria-hidden className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl", TONES[spec.tone])}>
        <Icon size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[12px] font-semibold text-muted">{spec.label}</span>
        <span className="block break-words text-[13.5px] font-bold leading-tight text-ink">{spec.title}</span>
        {spec.detail ? <span className="block break-words text-[12px] leading-snug text-muted">{spec.detail}</span> : null}
      </span>
      <ChevronRightIcon size={16} className="flex-none text-muted" />
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-xl px-1.5 py-2.5 text-left hover:bg-paper-2/60";
  return (
    <li data-pref={spec.key} className="min-w-0 border-b border-line last:border-b-0">
      {spec.href ? (
        <Link href={spec.href} aria-label={`${spec.label}: edit on My Career Profile`} className={cls}>
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={onEdit} aria-label={`Edit ${spec.label}`} className={cls}>
          {inner}
        </button>
      )}
    </li>
  );
}

function PreferencesCard({ view, onEdit }: { view: AvailabilityView; onEdit: () => void }) {
  const p = view.preferences;
  const auth = p.workAuthorization ? AUTH_LABEL[p.workAuthorization] : null;
  const emp = employmentText(p.employmentTypes);
  const travel = travelText(p);
  const rows: PrefRowSpec[] = [
    {
      key: "locations",
      label: "Preferred Locations",
      icon: MapPinIcon,
      tone: "accent",
      title: p.locations.length ? (
        <>
          {p.locations[0]} <span className="text-v2-green-ink">(Primary)</span>
        </>
      ) : (
        "Not set"
      ),
      detail: p.locations.length > 1 ? `Open to ${p.locations.slice(1).join(", ")}` : p.locations.length ? null : "Add where you want to work",
      href: `${BASE}/profile`,
    },
    { key: "authorization", label: "Work Authorization", icon: FileTextIcon, tone: "accent", title: auth?.title ?? "Not set", detail: auth?.detail ?? "Choose it on your profile", href: `${BASE}/profile` },
    { key: "mode", label: "Preferred Work Mode", icon: MonitorIcon, tone: "accent", title: p.workMode ? WORK_MODE_LABEL[p.workMode] : "Not set", detail: workModeHint(p.workMode) },
    { key: "employment", label: "Employment Type", icon: BriefcaseIcon, tone: "amber", title: emp.title, detail: emp.detail, href: `${BASE}/profile` },
    { key: "rate", label: "Preferred Rate", icon: DollarIcon, tone: "green", title: rateText(p), detail: p.rateNote },
    { key: "travel", label: "Travel Willingness", icon: SendIcon, tone: "teal", title: travel.title, detail: travel.detail },
  ];
  return (
    <Card
      id="avail-prefs"
      title="Work Preferences"
      icon={MinusCircleIcon}
      extra={
        <button type="button" onClick={onEdit} className="flex-none rounded-md px-1.5 text-[13px] font-semibold text-accent-deep hover:underline">
          Edit
        </button>
      }
    >
      <ul>
        {rows.map((r) => (
          <PrefRow key={r.key} spec={r} onEdit={onEdit} />
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-muted">Rates are only recorded for your marketer. Nothing is charged or paid here.</p>
    </Card>
  );
}

/* ── tables ─────────────────────────────────────────────────────────────────────────── */

const BTN_LINE = "inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft";
const SHOWN = 4;

function ViewAllToggle({ total, all, set, label }: { total: number; all: boolean; set: (v: boolean) => void; label: string }) {
  if (total <= SHOWN) return null;
  return (
    <button type="button" aria-expanded={all} aria-label={all ? `Show fewer ${label}` : `View all ${total} ${label}`} onClick={() => set(!all)} className="flex-none text-[13px] font-semibold text-accent-deep hover:underline">
      {all ? "Show Less" : "View All"}
    </button>
  );
}

function UpcomingCard({ view, onEdit, onDelete }: { view: AvailabilityView; onEdit: (b: Block) => void; onDelete: (b: Block) => void }) {
  const [all, setAll] = useState(false);
  const rows = useMemo(() => upcomingUnavailable(view.blocks, view.today), [view.blocks, view.today]);
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <Card id="avail-upcoming" title="Upcoming Unavailable Dates" icon={MinusCircleIcon} tone="coral" extra={<ViewAllToggle total={rows.length} all={all} set={setAll} label="unavailable dates" />}>
      <p className="-mt-1 mb-3 text-[12.5px] text-muted">View and manage your scheduled time off, holidays and unavailable dates.</p>
      {rows.length === 0 ? (
        <Empty>No time off scheduled. Use Add Blocked Dates to mark vacation or other commitments.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={cn(TABLE, "min-w-[560px]")}>
            <thead>
              <tr className="text-left text-[12px] font-semibold text-muted">
                {["Date Range", "Type", "Reason", "Status", "Actions"].map((c) => (
                  <th key={c} scope="col" className="whitespace-nowrap bg-paper-2/60 px-2.5 py-2 font-semibold first:rounded-l-lg last:rounded-r-lg">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((b) => {
                const k = kindInfo(b.kind);
                const s = blockStatusInfo(b.status);
                return (
                  <tr key={b.id} data-block={b.id}>
                    <td className={cn(TD, "whitespace-nowrap font-semibold")}>{rangeLabel(b.startDate, b.endDate)}</td>
                    <td className={TD}>
                      <Pill tone={k.tone}>{k.label}</Pill>
                    </td>
                    <td className={cn(TD, "max-w-[160px] break-words")}>{b.reason ?? "-"}</td>
                    <td className={TD}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Pill tone={s.tone}>{s.label}</Pill>
                        {b.sample ? <SampleMark /> : null}
                      </span>
                    </td>
                    <td className={TD}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <button type="button" onClick={() => onEdit(b)} aria-label={`Edit ${k.label} ${rangeLabel(b.startDate, b.endDate)}`} className={BTN_LINE}>
                          Edit
                        </button>
                        <Menu
                          trigger={
                            <button type="button" aria-label={`More actions for ${rangeLabel(b.startDate, b.endDate)}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
                              <MoreVerticalIcon size={16} />
                            </button>
                          }
                          items={[
                            { label: "Edit", icon: <PencilIcon size={15} />, onSelect: () => onEdit(b) },
                            { label: "Delete", icon: <TrashIcon size={15} />, danger: true, onSelect: () => onDelete(b) },
                          ]}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.some((b) => b.sample) ? (
        <p data-sample-note className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <SampleMark />
          Entries marked Sample were seeded for the demo. Approval of time off is your marketer&apos;s step and has no screen on their side yet.
        </p>
      ) : null}
    </Card>
  );
}

function HistoryCard({ view }: { view: AvailabilityView }) {
  const [all, setAll] = useState(false);
  const rows = all ? view.history : view.history.slice(0, SHOWN);
  return (
    <Card id="avail-history" title="Availability History" icon={ClockIcon} extra={<ViewAllToggle total={view.history.length} all={all} set={setAll} label="history rows" />}>
      {view.history.length === 0 ? (
        <Empty>No changes yet. Each time you update your availability here, it is recorded.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={cn(TABLE, "min-w-[300px]")}>
            <thead>
              <tr className="text-left text-[12px] font-semibold text-muted">
                {["Effective Date", "Availability", "Work Mode", "Status"].map((c) => (
                  <th key={c} scope="col" className={cn("whitespace-nowrap bg-paper-2/60 px-2 py-2 font-semibold first:rounded-l-lg last:rounded-r-lg", c === "Status" && "hidden sm:table-cell xl:hidden 2xl:table-cell")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((h) => {
                const s = historyStatusInfo(h.status);
                const when = historyWhen(h);
                return (
                  <tr key={h.id} data-history={h.id}>
                    <td className={cn(TD, "whitespace-nowrap")}>{dayText(h.effectiveDate)}</td>
                    <td className={TD}>
                      <Pill tone={when === "Immediately" ? "green" : "amber"}>{when}</Pill>
                      <span className="mt-0.5 block text-[11.5px] text-muted">{STATUS_LABEL[h.availabilityStatus]}</span>
                    </td>
                    <td className={TD}>{h.workMode ? <Pill tone={h.workMode === "HYBRID" ? "amber" : h.workMode === "REMOTE" ? "blue" : "violet"}>{WORK_MODE_LABEL[h.workMode]}</Pill> : "-"}</td>
                    <td className={cn(TD, "hidden sm:table-cell xl:hidden 2xl:table-cell")}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Pill tone={s.tone}>{s.label}</Pill>
                        {h.sample ? <SampleMark /> : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ── the right rail ─────────────────────────────────────────────────────────────────── */

function QuickActions({ onUpdate, onShare, onBlocked, shared }: { onUpdate: () => void; onShare: () => void; onBlocked: () => void; shared: boolean }) {
  const items: { key: string; label: string; hint: string; icon: ComponentType<IconProps>; tone: IconTone; run?: () => void; href?: string }[] = [
    { key: "update", label: "Update Availability", hint: "Set your available dates", icon: CalendarCheckIcon, tone: "accent", run: onUpdate },
    { key: "share", label: "Share with Marketer", hint: "Let your marketer know you're open", icon: ShareNodesIcon, tone: "accent", run: onShare },
    { key: "locations", label: "Set Preferred Locations", hint: "Manage where you want to work", icon: MapPinIcon, tone: "accent", href: `${BASE}/profile` },
    { key: "blocked", label: "Add Blocked Dates", hint: "Mark time off, vacation, or other commitments", icon: MinusCircleIcon, tone: "coral", run: onBlocked },
  ];
  const cls = "flex h-full min-h-[64px] w-full items-center gap-2.5 rounded-xl border border-line bg-paper p-2.5 text-left hover:bg-paper-2/60";
  return (
    <Card id="avail-quick" title="Quick Actions" icon={ZapIcon}>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-1">
        {items.map((q) => {
          const Icon = q.icon;
          const body = (
            <>
              <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-lg", TONES[q.tone])}>
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold leading-tight text-ink">{q.label}</span>
                <span className="block text-[11.5px] leading-snug text-muted">{q.hint}</span>
              </span>
            </>
          );
          return (
            <li key={q.key} className="min-w-0">
              {q.href ? (
                <Link href={q.href} data-quick={q.key} className={cls}>
                  {body}
                </Link>
              ) : (
                <button type="button" data-quick={q.key} onClick={q.run} className={cls}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {shared ? (
        <p role="status" data-share-note className="mt-3 rounded-lg bg-accent-soft p-2.5 text-[12.5px] leading-snug text-accent-deep">
          Your marketer is not notified from here. Nothing was sent.
        </p>
      ) : null}
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface AvailabilityPageProps {
  orgId: number;
  firstName: string;
}

export default function ConsultantAvailabilityPage({ orgId, firstName: first }: AvailabilityPageProps) {
  const toast = useToast();
  const { view, status, reload, setView } = useWorkspaceData(useCallback(() => fetchAvailability(orgId), [orgId]));
  const [block, setBlock] = useState<BlockSheetState | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [deleting, setDeleting] = useState<Block | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(false);

  /** Applies a write's answer: the fresh page replaces the old one; a refusal is handed back to the form. */
  const apply = (r: WriteResult, done: string, close: () => void): WriteResult => {
    if (r.kind === "OK") {
      setView(r.view);
      close();
      toast({ title: done, variant: "success" });
    } else if (r.kind === "DENIED") void reload();
    return r;
  };

  const openBlock = (iso: string) => {
    const covering = view?.blocks.filter((b) => b.startDate <= iso && iso <= b.endDate) ?? [];
    const hit = covering.find((b) => b.kind !== "AVAILABLE") ?? covering[0] ?? null;
    setBlock({ block: hit, startDate: iso, endDate: iso, kind: "VACATION" });
  };

  const confirmDelete = async () => {
    const b = deleting;
    if (!b) return;
    setBusy(true);
    setDeleteError(null);
    const r = await removeBlock(orgId, b.id);
    setBusy(false);
    if (r.kind === "OK") {
      setView(r.view);
      setDeleting(null);
      setBlock(null);
      toast({ title: "Entry removed", variant: "success" });
    } else if (r.kind === "DENIED") {
      setDeleting(null);
      void reload();
    } else setDeleteError(failureText(r));
  };

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  return (
    <div data-consultant-availability data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Availability" subtitle="Manage your availability, work preferences, and let your team know when you're ready for new opportunities." />
      <ClaimsMascot />
      <ClaimsHelpCard />

      {status === "failed" ? (
        <ErrorState what="your availability" description="Your availability didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <>
          <Tiles view={view} />
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.44fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.52fr)_minmax(0,0.4fr)]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
              {view ? (
                <>
                  <CalendarCard view={view} onPick={openBlock} />
                  <UpcomingCard
                    view={view}
                    onEdit={(b) => setBlock({ block: b, startDate: b.startDate, endDate: b.endDate, kind: b.kind })}
                    onDelete={(b) => {
                      setDeleteError(null);
                      setDeleting(b);
                    }}
                  />
                </>
              ) : (
                <div className="grid gap-4" aria-busy="true">
                  <Skeleton className="h-96 w-full" />
                  <Skeleton className="h-48 w-full" />
                </div>
              )}
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)] 2xl:contents">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
                {view ? (
                  <>
                    <PreferencesCard view={view} onEdit={() => setPrefsOpen(true)} />
                    <HistoryCard view={view} />
                  </>
                ) : (
                  <Skeleton className="h-96 w-full" />
                )}
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
                <BeeCard
                  name={firstName(first)}
                  title="Keep your availability up to date!"
                  body="Let your marketer know when you're available and your preferences so we can match you with the best opportunities. Update your calendar, set your preferences, and add any upcoming time off."
                />
                <QuickActions
                  shared={shared}
                  onUpdate={() => setStatusOpen(true)}
                  onShare={() => setShared(true)}
                  onBlocked={() => view && setBlock({ block: null, startDate: view.today, endDate: view.today, kind: "VACATION" })}
                />
              </div>
            </div>
          </div>
        </>
      )}

      <BlockSheet
        state={block}
        today={view?.today ?? ""}
        onClose={() => setBlock(null)}
        onSave={async (id, d: BlockDraft) => apply(id === null ? await createBlock(orgId, d) : await changeBlock(orgId, id, d), id === null ? "Entry added" : "Entry updated", () => setBlock(null))}
        onDelete={(b) => {
          setDeleteError(null);
          setDeleting(b);
        }}
      />
      <AvailabilitySheet open={statusOpen} view={view} onClose={() => setStatusOpen(false)} onSave={async (s, from) => apply(await saveStatus(orgId, s, from), "Availability updated", () => setStatusOpen(false))} />
      <PreferencesSheet open={prefsOpen} view={view} onClose={() => setPrefsOpen(false)} onSave={async (d: PrefDraft) => apply(await savePreferences(orgId, d), "Preferences saved", () => setPrefsOpen(false))} />

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this entry?"
        description={deleting ? `${kindInfo(deleting.kind).label}, ${rangeLabel(deleting.startDate, deleting.endDate)}` : undefined}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeleting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void confirmDelete()} disabled={busy}>
              Delete entry
            </Button>
          </div>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-ink-soft">It is removed from your calendar. Nothing is sent to anyone.</p>
        <p role="alert" className="mt-2 text-[12.5px] font-medium text-v2-coral-ink">
          {deleteError ?? ""}
        </p>
      </Dialog>
    </div>
  );
}
