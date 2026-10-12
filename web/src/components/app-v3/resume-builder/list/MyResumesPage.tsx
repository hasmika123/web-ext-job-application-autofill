"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  CheckIcon,
  ChoiceGroup,
  ChevronDownIcon,
  Dialog,
  FileTextIcon,
  FilterIcon,
  GridIcon,
  Input,
  ListIcon,
  Menu,
  PlusIcon,
  cn,
  type MenuEntry,
} from "@kiwiply/ui";
import type { Resume } from "@/components/ResumeList";
import ResumeDrawer from "@/components/app-v2/resume/ResumeDrawer";
import { FilterSelect, SearchInput, UnderlineTabs } from "@/components/app-v2/common";
import { track } from "@/lib/analytics";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import { useDateDisplay } from "@/lib/use-date-display";
import NewResumeSheet from "../NewResumeSheet";
import { EMPTY_PROFILE, capNotice, type CapNotice, type ProfileSummary, type ResumeChoice, type SourceId } from "../new-resume/model";
import { usePhone } from "../usePhone";
import { useResumeActions } from "./actions";
import { toCardModels, type ResumeCardModel } from "./adapter";
import { PopularTemplates, QuickTips, popularTemplates } from "./BottomCards";
import {
  DEFAULT_SORT,
  QUICK_TIPS,
  SHARED_TAB,
  SHARED_TAB_LABEL,
  SORTS,
  STATUS_FILTERS,
  TAB_EMPTY,
  TAB_LABELS,
  TAB_ORDER,
  TYPE_FILTERS,
  type SortKey,
  type StatusFilter,
  type TabId,
  type TypeFilter,
} from "./constants";
import { applyQuery, tabCounts } from "./filter";
import { useSoon, useViewMode } from "./hooks";
import ResumeCard from "./ResumeCard";
import ResumesHero from "./ResumesHero";
import SharedWithMeList from "./SharedWithMeList";

export interface MyResumesPageProps {
  resumes: Resume[];
  /** Applications per resume id (the archive guard in the manage panel hinges on it). */
  usage: Record<number, number>;
  baseProfile: Record<string, unknown>;
  isPro: boolean;
  /** The builder settings: the plan, the resume cap, enabled / popular templates, Quick Tips, the score threshold. */
  config: ResumeBuilderConfig;
  /** The "Use my profile" card of the start chooser. */
  profile?: ProfileSummary;
}

const VIEW_BTN =
  "inline-flex h-10 w-10 cursor-pointer items-center justify-center text-ink-soft transition-colors hover:bg-paper-2 sm:h-9 sm:w-9";

/** A control that looks like the toolbar's selects but opens the two-group status menu. */
const MENU_TRIGGER =
  "inline-flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-[#DCE2EE] bg-paper px-3 text-[13px] font-medium text-v2-navy hover:bg-paper-2 sm:h-9";

/**
 * "My Resumes" (`/resume-builder`), laid out to design/resume-builder-v3/user-my-resumes.webp (DESIGN 10.17):
 * hero, tabs with counts + search / status / sort / view toggle, resume cards, then Popular Templates
 * and Quick Tips. "New Resume" opens the start chooser (`NewResumeSheet`, four sources) after a cap check;
 * a card's buttons and ⋮ menu duplicate, view, open the AI tab, rename, set primary, archive and delete.
 * Everything the board shows that the API does not carry directly is decided in `./adapter.ts`; nothing
 * here reads the DTO directly.
 */
export default function MyResumesPage({ resumes, usage, baseProfile, isPro, config, profile = EMPTY_PROFILE }: MyResumesPageProps) {
  const display = useDateDisplay();
  const soon = useSoon();
  const phone = usePhone();
  const [view, setView] = useViewMode();
  const [drawer, setDrawer] = useState(false);
  const [tabId, setTab] = useState<TabId | typeof SHARED_TAB>("all");
  const sharedOpen = tabId === SHARED_TAB;
  const tab: TabId = sharedOpen ? "all" : tabId;
  const [status, setStatus] = useState<StatusFilter>("All Status");
  const [type, setType] = useState<TypeFilter>("All Types");
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState<string | null>(null);
  const [newSource, setNewSource] = useState<SourceId | undefined>(undefined);
  const [limit, setLimit] = useState<CapNotice | null>(null);
  const [renaming, setRenaming] = useState<ResumeCardModel | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<ResumeCardModel | null>(null);
  const [shownCount, setShownCount] = useState<number | null>(null);

  const showLimit = useCallback((notice: CapNotice) => setLimit(notice), []);
  const actions = useResumeActions(showLimit);

  const models = useMemo(() => toCardModels(resumes), [resumes]);
  const counts = useMemo(() => tabCounts(models), [models]);
  const shown = useMemo(() => applyQuery(models, { tab, status, type, sort, query }), [models, tab, status, type, sort, query]);
  const filtering = query.trim() !== "" || status !== "All Status" || type !== "All Types";

  const templates = useMemo(
    () => popularTemplates(config.templates.enabled, config.templates.popular, config.templates.default),
    [config.templates.enabled, config.templates.popular, config.templates.default],
  );
  const tips = config.list.quickTips.length > 0 ? config.list.quickTips : QUICK_TIPS;
  const goodScore = Math.round(config.score.passThreshold * 100); // config-literal-ok: a fraction to a percentage
  const virtualizeAbove = config.list.virtualizeAbove;
  const visible = shown.length > virtualizeAbove ? shown.slice(0, shownCount ?? virtualizeAbove) : shown;

  const choices = useMemo<ResumeChoice[]>(
    () => models.filter((m) => m.status !== "Archived").map((m) => ({ id: m.id, name: m.name, kind: m.kind, updatedAt: m.modifiedAt, score: m.score, templateId: m.templateId })),
    [models],
  );
  const targetSuggestions = useMemo(() => {
    const out: string[] = [];
    for (const t of [profile.headline, ...models.map((m) => m.target)]) if (t && !out.includes(t)) out.push(t);
    return out;
  }, [models, profile.headline]);

  useEffect(() => {
    track("resume_list_viewed", { count: resumes.length, view });
  }, [resumes.length, view]);

  /** "New resume": the plan's cap is checked BEFORE the chooser opens (DESIGN 10.14). */
  const openNew = useCallback(
    (templateId: string | null = null, source?: SourceId) => {
      const notice = capNotice(config.resumes, config.plan);
      if (notice) {
        setLimit(notice);
        track("resume_new_blocked_cap");
        return;
      }
      setLimit(null);
      setNewTemplate(templateId);
      setNewSource(source);
      setNewOpen(true);
    },
    [config.resumes, config.plan],
  );

  const choose = <T,>(set: (v: T) => void, key: "status" | "sort" | "type") => (v: T) => {
    set(v);
    track("resume_list_filter", { tab, status, sort, changed: key });
  };

  const clearFilters = () => {
    setQuery("");
    setStatus("All Status");
    setType("All Types");
  };

  const empty = TAB_EMPTY[models.length === 0 ? "all" : tab];
  const statusLabel = type !== "All Types" && status === "All Status" ? type : status;

  const statusItems: MenuEntry[] = [
    { heading: "Status" },
    ...STATUS_FILTERS.map((s) => ({
      label: <MenuCheck on={status === s}>{s}</MenuCheck>,
      onSelect: () => choose(setStatus, "status")(s),
    })),
    { separator: true },
    { heading: "Type" },
    ...TYPE_FILTERS.map((t) => ({
      label: <MenuCheck on={type === t}>{t}</MenuCheck>,
      onSelect: () => choose(setType, "type")(type === t ? "All Types" : t),
    })),
  ];

  const statusControl = (
    <Menu
      align="start"
      className="block w-full"
      items={statusItems}
      trigger={
        <span className={MENU_TRIGGER}>
          <span className="sr-only">Status filter: </span>
          <span className="truncate">{statusLabel}</span>
          <ChevronDownIcon size={14} aria-hidden />
        </span>
      }
    />
  );
  const sortControl = <FilterSelect label="Sort by" options={[...SORTS]} value={sort} onChange={(v) => choose(setSort, "sort")(v as SortKey)} className="w-full" />;
  const viewToggle = (
    <div role="group" aria-label="Layout" className="flex w-fit overflow-hidden rounded-[10px] border border-v2-line">
      <button type="button" aria-pressed={view === "grid"} aria-label="Grid view" onClick={() => setView("grid")} className={cn(VIEW_BTN, view === "grid" && "bg-v2-blue-soft text-v2-blue")}>
        <GridIcon size={16} />
      </button>
      <button type="button" aria-pressed={view === "list"} aria-label="List view" onClick={() => setView("list")} className={cn(VIEW_BTN, "border-l border-v2-line", view === "list" && "bg-v2-blue-soft text-v2-blue")}>
        <ListIcon size={16} />
      </button>
    </div>
  );
  const activeFilters = (status !== "All Status" ? 1 : 0) + (type !== "All Types" ? 1 : 0) + (sort !== DEFAULT_SORT ? 1 : 0);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <ResumesHero onNew={() => openNew()} busy={false} />

      {limit && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-v2-line bg-paper p-3.5 text-[13.5px] text-ink shadow-v2-soft">
          <p className="min-w-0 flex-1">{limit.message}</p>
          {limit.plan === "FREE" && !isPro ? (
            <Link href="/pricing" className="font-bold text-v2-blue hover:underline">
              See Pro
            </Link>
          ) : (
            <button type="button" onClick={() => setDrawer(true)} className="font-bold text-v2-blue hover:underline">
              Archive a resume
            </button>
          )}
        </div>
      )}

      <section aria-label="Your resumes" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl border border-v2-line/70 bg-paper px-2 shadow-v2-soft sm:px-3">
          <UnderlineTabs
            ariaLabel="Resume status"
            tone="blue"
            padded
            counts="pill"
            value={tabId}
            onChange={(id) => {
              setTab(id as TabId | typeof SHARED_TAB);
              track("resume_list_filter", { tab: id, status, sort });
            }}
            tabs={[...TAB_ORDER.map((id) => ({ id, label: TAB_LABELS[id], count: counts[id] })), { id: SHARED_TAB, label: SHARED_TAB_LABEL }]}
            className="max-w-full min-w-0 border-b-0"
          />
          {!sharedOpen && (
          <div className="flex w-full flex-wrap items-center gap-2 pb-3 sm:pb-0 lg:w-auto">
            <SearchInput
              variant="grey"
              size="sm"
              placeholder="Search resumes..."
              aria-label="Search resumes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              wrapperClassName="w-full sm:w-56"
            />
            {phone ? (
              <Button variant="ghost" size="sm" onClick={() => setFiltersOpen(true)} className="min-h-11 w-full">
                <FilterIcon size={15} aria-hidden /> Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
              </Button>
            ) : (
              <>
                <div className="w-[128px]">{statusControl}</div>
                <div className="w-[150px]">{sortControl}</div>
                {viewToggle}
              </>
            )}
          </div>
          )}
        </div>

        {sharedOpen ? (
          <SharedWithMeList />
        ) : shown.length === 0 ? (
          models.length === 0 ? (
            <StartCard onPick={(source) => openNew(null, source)} />
          ) : (
            <div role="status" className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-v2-line bg-paper px-6 py-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-v2-blue-soft text-v2-blue">
                <FileTextIcon size={22} aria-hidden />
              </span>
              {filtering ? (
                <>
                  <p className="text-[15px] font-bold text-ink">
                    {query.trim() ? `No resumes match “${query.trim()}”` : "No resumes match"}
                  </p>
                  <p className="max-w-sm text-[13.5px] text-ink-soft">Try a different search or status.</p>
                  <button type="button" onClick={clearFilters} className="mt-1 text-[13.5px] font-bold text-v2-blue hover:underline">
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[15px] font-bold text-ink">{empty.title}</p>
                  <p className="max-w-sm text-[13.5px] text-ink-soft">{empty.body}</p>
                </>
              )}
            </div>
          )
        ) : (
          <div className="@container">
            <ul
              data-view={view}
              className={cn("grid gap-4", view === "grid" ? "grid-cols-1 @[640px]:grid-cols-2 @[1100px]:grid-cols-3" : "grid-cols-1 gap-3")}
            >
              {visible.map((m) => (
                <ResumeCard
                  key={m.id}
                  model={m}
                  layout={view}
                  display={display}
                  onManage={() => setDrawer(true)}
                  actions={actions}
                  onRename={(r) => {
                    setRenaming(r);
                    setRenameValue(r.name);
                  }}
                  onDelete={setDeleting}
                  aiAllowed={config.aiAllowed}
                  goodScore={goodScore}
                />
              ))}
            </ul>
            {visible.length < shown.length && (
              <div className="mt-4 flex justify-center">
                <Button variant="ghost" onClick={() => setShownCount((visible.length || 0) + virtualizeAbove)}>
                  Show {shown.length - visible.length} more
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <PopularTemplates
          templates={templates}
          onPick={(id) => {
            track("resume_template_picked", { id });
            openNew(id);
          }}
          onViewAll={soon("The template gallery")}
        />
        <QuickTips tips={tips} />
      </div>

      <NewResumeSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        profile={profile}
        resumes={choices}
        templateId={newTemplate}
        defaultTemplateId={config.templates.default}
        targetSuggestions={targetSuggestions}
        initialSource={newSource}
        onLimit={showLimit}
      />

      <Dialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <Button variant="accent" onClick={() => setFiltersOpen(false)} className="min-h-11">
            Done
          </Button>
        }
        className="mt-auto max-w-none!"
      >
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1.5 text-[12.5px] font-semibold text-v2-navy">Status</p>
            <ChoiceGroup aria-label="Status" options={[...STATUS_FILTERS]} value={status} onChange={(v) => choose(setStatus, "status")(v as StatusFilter)} />
          </div>
          <div>
            <p className="mb-1.5 text-[12.5px] font-semibold text-v2-navy">Type</p>
            <ChoiceGroup aria-label="Type" options={[...TYPE_FILTERS]} value={type === "All Types" ? "" : type} allowClear onChange={(v) => choose(setType, "type")((v || "All Types") as TypeFilter)} />
          </div>
          <div>
            <p className="mb-1.5 text-[12.5px] font-semibold text-v2-navy">Sort by</p>
            <ChoiceGroup aria-label="Sort by" options={[...SORTS]} value={sort} onChange={(v) => choose(setSort, "sort")(v as SortKey)} />
          </div>
          <div>
            <p className="mb-1.5 text-[12.5px] font-semibold text-v2-navy">Layout</p>
            {viewToggle}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename resume"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!renameValue.trim() || renameValue.trim() === renaming?.name}
              onClick={async () => {
                const target = renaming;
                if (!target) return;
                setRenaming(null);
                await actions.rename(target, renameValue.trim());
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-v2-navy">
          Resume name
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={200} // config-literal-ok: the API's resume-name limit, mirrored for the field
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameValue.trim() && renaming && renameValue.trim() !== renaming.name) {
                const target = renaming;
                setRenaming(null);
                void actions.rename(target, renameValue.trim());
              }
            }}
          />
        </label>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting ? `Delete “${deleting.name}”?` : "Delete resume"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const target = deleting;
                if (!target) return;
                setDeleting(null);
                await actions.remove(target);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-v2-ink-soft">This can&apos;t be undone. If you only want it out of the way, archive it instead.</p>
      </Dialog>

      {drawer && <ResumeDrawer onClose={() => setDrawer(false)} baseProfile={baseProfile} resumes={resumes} usage={usage} isPro={isPro} />}
    </div>
  );
}

function MenuCheck({ on, children }: { on: boolean; children: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="grid h-4 w-4 place-items-center">{on && <CheckIcon size={14} aria-hidden />}</span>
      <span className={cn(on && "font-bold")}>{children}</span>
    </span>
  );
}

const START_CARDS: ReadonlyArray<{ id: SourceId; title: string; body: string }> = [
  { id: "profile", title: "Use my profile", body: "Start from what you already saved" },
  { id: "upload", title: "Upload a resume", body: "PDF, DOCX or TXT, then you review" },
  { id: "copy", title: "Copy an existing resume", body: "Start from one you already have" },
  { id: "scratch", title: "Start from scratch", body: "A blank page with your name and contact" },
];

/** The empty state: the same four ways to start, inline (DESIGN 10.17). */
function StartCard({ onPick }: { onPick: (source: SourceId) => void }) {
  return (
    <div role="status" className="rounded-2xl border border-dashed border-v2-line bg-paper p-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-v2-blue-soft text-v2-blue">
          <FileTextIcon size={22} aria-hidden />
        </span>
        <p className="text-[15px] font-bold text-ink">No resumes yet</p>
        <p className="max-w-md text-[13.5px] text-ink-soft">Start from your profile, an uploaded resume, a copy or a blank page.</p>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {START_CARDS.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c.id)}
              className="flex h-full min-h-11 w-full cursor-pointer flex-col items-start gap-1 rounded-xl border border-v2-line bg-paper p-3.5 text-left hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue"
            >
              <span className="flex items-center gap-2 text-[14px] font-bold text-v2-navy">
                {c.id === "scratch" && <PlusIcon size={15} aria-hidden />}
                {c.title}
              </span>
              <span className="text-[12.5px] text-ink-soft">{c.body}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
