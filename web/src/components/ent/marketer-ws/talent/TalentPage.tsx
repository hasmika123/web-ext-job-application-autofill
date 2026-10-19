"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeftIcon, ChevronRightIcon, ErrorState, FunnelIcon, MapPinIcon, MemberAvatar, Menu, MoreVerticalIcon,
  PlusIcon, SearchIcon, Select, UsersIcon, buttonVariants, cn,
} from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  AVAILABILITY_OPTIONS, EXPERIENCE_OPTIONS, NO_FILTERS, deleteTalentView, fetchTalent, hasFilters, saveTalentView, yearsText,
  type SavedView, type StatusFilter, type TalentFilters, type TalentRow, type TalentView,
} from "@/lib/ent/marketer-ws/talent";
import { CARD, CardSkeleton, Empty, Head, type MktPageProps } from "../parts";
import { AvailabilityChip, ResumeChip } from "./chips";
import ProfileDrawer from "./ProfileDrawer";
import SavedViewsMenu from "./SavedViewsMenu";

/**
 * My Talent. One call draws the board; the card has its own empty state, never a made-up row. E1: the buttons open the page where the marketer PREPARES or RECORDS (matches, resumes, interviews, follow-ups); nothing
 * here submits anything for a consultant.
 */

const STATUS_CHIPS: { value: StatusFilter; label: string; count: keyof TalentView["counts"]; dot: string }[] = [
  { value: "", label: "All", count: "all", dot: "bg-accent" },
  { value: "AVAILABLE_NOW", label: "Available now", count: "availableNow", dot: "bg-green-500" },
  { value: "IN_INTERVIEW", label: "In interview", count: "inInterview", dot: "bg-violet-500" },
  { value: "NEEDS_UPDATE", label: "Needs update", count: "needsUpdate", dot: "bg-red-500" },
  { value: "PENDING_APPROVAL", label: "Pending approval", count: "pendingApproval", dot: "bg-amber-400" },
];
const TH = "px-2 py-2.5 text-[12.5px] font-semibold text-ink-soft";
const OUTLINE_BTN = "inline-flex h-8 flex-none items-center rounded-lg border border-line bg-paper px-3 text-[12.5px] font-semibold text-accent-deep hover:bg-accent-soft";
const DEBOUNCE_MS = 300; // config-literal-ok: how long typing rests before the list is asked (UI timing)
const ADD_CONSULTANT_HREF = "/w/admin/consultants";

export default function TalentPage({ orgId, hrefs }: MktPageProps) {
  const [view, setView] = useState<TalentView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [filters, setFilters] = useState<TalentFilters>(NO_FILTERS);
  const [typed, setTyped] = useState("");
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [profile, setProfile] = useState<{ id: number; name: string } | null>(null);
  const [reload, setReload] = useState(0);
  const router = useRouter();

  // The search box types immediately; the list is asked once typing rests.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === typed ? f : { ...f, q: typed }));
      setPage(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [typed]);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      const r = await fetchTalent(orgId, { ...filters, page }, ctl.signal);
      if (ctl.signal.aborted) return;
      if (r.kind === "OK") {
        setView(r.view);
        setStatus("ready");
      } else setStatus(r.kind === "DENIED" ? "denied" : (s) => (s === "ready" ? s : "failed"));
    }, 0);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [orgId, filters, page, reload]);

  const change = useCallback((patch: Partial<TalentFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  }, []);
  const apply = useCallback((f: TalentFilters) => {
    setFilters(f);
    setTyped(f.q);
    setPage(0);
  }, []);

  const saveView = useCallback(
    async (name: string): Promise<string | null> => {
      const r = await saveTalentView(orgId, name, filters);
      if (!r.ok) return r.error;
      setView((v) => (v ? { ...v, views: [...v.views.filter((x) => x.id !== r.view.id), r.view].sort((a, b) => a.name.localeCompare(b.name)) } : v));
      return null;
    },
    [orgId, filters],
  );
  const removeView = useCallback(
    async (v: SavedView) => {
      if (await deleteTalentView(orgId, v.id)) setView((cur) => (cur ? { ...cur, views: cur.views.filter((x) => x.id !== v.id) } : cur));
    },
    [orgId],
  );

  const header = (
    <>
      <PageHeader title="My Talent" subtitle="The consultants you market, and what each needs next." />
    </>
  );
  if (status === "denied") return <ErrorState what="My Talent" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  if (status === "failed")
    return (
      <div data-marketing-talent data-status="failed">
        {header}
        <ErrorState what="My Talent" description="Your assigned talent didn't load. Nothing has changed." onRetry={() => setReload((n) => n + 1)} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );

  const loading = status === "loading";
  const v = view;
  const counts = v?.counts;
  const from = v && v.total > 0 ? v.page * v.size + 1 : 0;
  const to = v ? Math.min(v.total, v.page * v.size + v.items.length) : 0;
  const allOnPage = !!v && v.items.length > 0 && v.items.every((r) => selected.has(r.id));
  const skillOptions = [{ value: "", label: "Skill" }, ...(v?.facets.skills ?? []).map((s) => ({ value: s, label: s }))];
  const locationOptions = [{ value: "", label: "Location" }, ...(v?.facets.locations ?? []).map((s) => ({ value: s, label: s }))];
  const experienceOptions = [{ value: "", label: "Experience" }, ...EXPERIENCE_OPTIONS];
  const availabilityOptions = [{ value: "", label: "Availability" }, ...AVAILABILITY_OPTIONS];
  const withId = (key: string, id: number): string | null => (hrefs[key] ? `${hrefs[key]}?consultant=${id}` : null);

  const addConsultant = v?.canAddConsultant ? (
    <Link href={hrefs.consultants ?? ADD_CONSULTANT_HREF} className={buttonVariants("accent", "sm", "h-9 gap-1.5 whitespace-nowrap")}>
      <PlusIcon size={15} aria-hidden /> Add consultant
    </Link>
  ) : null;

  const rowMenu = (r: TalentRow) => {
    const items = [
      { label: "View profile", onSelect: () => setProfile({ id: r.id, name: r.name }) },
      ...(withId("matches", r.id) ? [{ label: "Find job matches", onSelect: () => router.push(withId("matches", r.id)!) }] : []),
      ...(withId("resumes", r.id) ? [{ label: "Update resume", onSelect: () => router.push(withId("resumes", r.id)!) }] : []),
    ];
    return (
      <Menu
        items={items}
        trigger={
          <button type="button" aria-label={`More for ${r.name}`} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-paper-2 hover:text-ink">
            <MoreVerticalIcon size={16} aria-hidden />
          </button>
        }
      />
    );
  };

  return (
    <div data-marketing-talent data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <section data-talent-card="table" aria-label="My consultants" className={CARD}>
        <Head icon={UsersIcon} title="My consultants" tint="blue" count={loading ? "..." : (counts?.all ?? 0)}>
          <label className="relative w-full sm:w-64">
            <span className="sr-only">Search consultants</span>
            <SearchIcon size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Search by name, skill, or location..."
              className="h-9 w-full rounded-lg border border-line bg-paper pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-muted focus:border-accent"
            />
          </label>
          <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)} className={cn(OUTLINE_BTN, "h-9 gap-1.5 text-ink-soft")}>
            <FunnelIcon size={14} aria-hidden /> Filters
          </button>
          <SavedViewsMenu views={v?.views ?? []} current={filters} onApply={(sv) => apply(sv.filters)} onSave={saveView} onDelete={(sv) => void removeView(sv)} />
          {addConsultant}
        </Head>

        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Status">
          {STATUS_CHIPS.map((c) => {
            const active = filters.status === c.value;
            return (
              <button
                key={c.label}
                type="button"
                aria-pressed={active}
                data-status-chip={c.value || "ALL"}
                onClick={() => change({ status: c.value })}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold",
                  active ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink-soft hover:border-accent",
                )}
              >
                <span aria-hidden className={cn("h-2 w-2 rounded-full", c.dot)} />
                {c.label} ({counts ? counts[c.count] : 0})
              </button>
            );
          })}
          {showFilters ? (
            <>
              <Select variant="pill" aria-label="Skill" value={filters.skill} onChange={(x) => change({ skill: x })} options={skillOptions} />
              <Select variant="pill" aria-label="Location" value={filters.location} onChange={(x) => change({ location: x })} options={locationOptions} />
              <Select variant="pill" aria-label="Experience" value={filters.experience} onChange={(x) => change({ experience: x })} options={experienceOptions} />
              <Select variant="pill" aria-label="Availability" value={filters.availability} onChange={(x) => change({ availability: x })} options={availabilityOptions} />
            </>
          ) : null}
          {hasFilters(filters) ? (
            <button type="button" onClick={() => apply(NO_FILTERS)} className="text-[12.5px] font-semibold text-accent-deep underline-offset-2 hover:underline">
              Clear filters
            </button>
          ) : null}
        </div>

        {loading ? (
          <CardSkeleton rows={5} />
        ) : !v || v.items.length === 0 ? (
          <Empty>{hasFilters(filters) ? "No consultants match these filters." : "No consultants are assigned to you yet."}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line bg-paper-2">
                  <th className={cn(TH, "w-8 rounded-l-lg")}>
                    <input
                      type="checkbox"
                      aria-label="Select all consultants on this page"
                      checked={allOnPage}
                      onChange={(e) => setSelected(new Set(e.target.checked ? v.items.map((r) => r.id) : []))}
                      className="h-4 w-4 rounded border-line"
                    />
                  </th>
                  <th className={TH}>Consultant</th>
                  <th className={TH}>Primary skill</th>
                  <th className={TH}>Experience</th>
                  <th className={TH}>Location</th>
                  <th className={TH}>Availability</th>
                  <th className={TH}>Resume status</th>
                  <th className={cn(TH, "text-center")}>Assigned jobs</th>
                  <th className={cn(TH, "rounded-r-lg")} colSpan={2}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {v.items.map((r) => (
                  <tr key={r.id} data-talent-row={r.id} className="border-b border-line last:border-0">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.name}`}
                        checked={selected.has(r.id)}
                        onChange={(e) =>
                          setSelected((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(r.id);
                            else n.delete(r.id);
                            return n;
                          })
                        }
                        className="h-4 w-4 rounded border-line"
                      />
                    </td>
                    <td className="px-2">
                      <span className="flex items-center gap-2.5">
                        <MemberAvatar name={r.name} src={r.avatarUrl} size={40} />
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-ink">{r.name}</span>
                          <span className="block truncate text-[12px] text-muted">{r.title}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-2 text-ink-soft">{r.primarySkill}</td>
                    <td className="whitespace-nowrap px-2 text-ink-soft">{yearsText(r.yearsExperience)}</td>
                    <td className="px-2 text-ink-soft"><span className="inline-flex items-center gap-1.5 whitespace-nowrap"><MapPinIcon size={14} aria-hidden className="text-muted" />{r.location}</span></td>
                    <td className="px-2"><AvailabilityChip availability={r.availability} /></td>
                    <td className="px-2"><ResumeChip resume={r.resume} /></td>
                    <td className="px-2 text-center text-ink-soft">{r.assignedJobs}</td>
                    <td className="px-2"><button type="button" onClick={() => setProfile({ id: r.id, name: r.name })} className={OUTLINE_BTN}>View profile</button></td>
                    <td className="px-1">{rowMenu(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {v && v.total > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
            <span data-talent-range>
              Showing {from}-{to} of {v.total}
              {selected.size > 0 ? ` - ${selected.size} selected` : ""}
            </span>
            <span className="flex items-center gap-1.5">
              <button type="button" aria-label="Previous page" disabled={v.page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className={cn(OUTLINE_BTN, "w-8 justify-center px-0 disabled:opacity-50")}>
                <ChevronLeftIcon size={15} aria-hidden />
              </button>
              <button type="button" aria-label="Next page" disabled={to >= v.total} onClick={() => setPage((p) => p + 1)} className={cn(OUTLINE_BTN, "w-8 justify-center px-0 disabled:opacity-50")}>
                <ChevronRightIcon size={15} aria-hidden />
              </button>
            </span>
          </div>
        ) : null}
      </section>

      <ProfileDrawer orgId={orgId} consultantId={profile?.id ?? null} name={profile?.name ?? ""} hrefs={hrefs} onClose={() => setProfile(null)} />
    </div>
  );
}
