"use client";

import { useRef } from "react";
import type { ReactNode, RefObject } from "react";
import {
  BottomSheet,
  BriefcaseIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  ErrorState,
  FileTextIcon,
  GearIcon,
  MailIcon,
  MapPinIcon,
  MemberAvatar,
  Meter,
  RestoreIcon,
  Select,
  SideSheet,
  Skeleton,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TrashIcon,
  UserIcon,
  UsersIcon,
  ZapIcon,
  useToast,
} from "@kiwiply/ui";
import {
  AVAILABILITY_OPTIONS,
  AVAILABILITY_LABEL,
  LICENSE_LABEL,
  LICENSE_OPTIONS,
  checklistRows,
  experienceText,
  formatDate,
  locationText,
  type Availability,
  type ConsultantDetail,
  type DetailTab,
  type LicenseStatus,
  type PatchBody,
} from "@/lib/ent/consultants";
import { AvailabilityPill, LicensePill } from "./parts";
import { ActivityTab, ApplicationsTab, AssignmentsTab } from "./Tabs";
import { useConsultantDetail, type SaveResult } from "./useConsultantDetail";

export type SheetMode = "push" | "overlay" | "sheet";
export type FlowKind = "marketer" | "license" | "department" | "application" | "deactivate" | "reactivate";

const UNDO_MS = 9000; // config-literal-ok: how long an Undo stays offered (UI timing)

export interface DetailSheetProps {
  orgId: number | string;
  consultantId: number | null;
  mode: SheetMode;
  onClose: () => void;
  /** A saved detail: the table row is refreshed from it. */
  onSaved: (d: ConsultantDetail) => void;
  /** A flow that needs its own dialog (marketer, license, department, application, deactivate). */
  onFlow: (kind: FlowKind, d: ConsultantDetail) => void;
  /** Bumped by the page when something outside the drawer changed this consultant. */
  reloadToken: number;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
  /** The help card, shown at the foot of the drawer (the board puts it there). */
  footer?: ReactNode;
}

function Card({ icon, title, children, className = "" }: { icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`min-w-0 rounded-xl border border-line bg-paper p-3 ${className}`}>
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-ink">
        <span aria-hidden className="text-accent-deep">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** The drawer's Overview: skills, availability and license (both autosaved selects), profile completeness, quick actions. */
function Overview({ detail, canEdit, save, onSaved, onTab, onFlow }: { detail: ConsultantDetail; canEdit: boolean; save: (b: PatchBody) => Promise<SaveResult>; onSaved: DetailSheetProps["onSaved"]; onTab: DetailSheetProps["onTab"]; onFlow: DetailSheetProps["onFlow"] }) {
  const toast = useToast();
  const c = detail.consultant;

  /** One autosaved change: a toast confirms it and offers Undo (the same PATCH with the old value). */
  async function change(body: PatchBody, undo: PatchBody, what: string) {
    const r = await save(body);
    if (!r.ok) {
      toast({ title: "Couldn't save", description: r.message, variant: "error" });
      return;
    }
    onSaved(r.detail);
    toast({
      title: what,
      variant: "success",
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () =>
          void save(undo).then((u) => {
            if (u.ok) onSaved(u.detail);
            toast(u.ok ? { title: "Undone", variant: "success" } : { title: "Couldn't undo", description: u.message, variant: "error" });
          }),
      },
    });
  }

  const a = detail.actions;
  const quick: { key: string; label: string; icon: ReactNode; run: () => void; danger?: boolean }[] = [
    { key: "applications", label: "View Applications", icon: <FileTextIcon size={16} />, run: () => onTab("applications") },
  ];
  if (a.assignMarketer) quick.push({ key: "marketer", label: "Assign Marketer", icon: <UserIcon size={16} />, run: () => onFlow("marketer", detail) });
  if (a.edit) quick.push({ key: "license", label: "Manage License", icon: <GearIcon size={16} />, run: () => onFlow("license", detail) });
  if (a.edit) quick.push({ key: "department", label: "Add to Department", icon: <UsersIcon size={16} />, run: () => onFlow("department", detail) });
  if (a.createApplication) quick.push({ key: "application", label: "Create Job Application", icon: <BriefcaseIcon size={16} />, run: () => onFlow("application", detail) });
  if (a.deactivate) quick.push({ key: "deactivate", label: "Deactivate Consultant", icon: <TrashIcon size={16} />, run: () => onFlow("deactivate", detail), danger: true });
  if (a.reactivate) quick.push({ key: "reactivate", label: "Reactivate Consultant", icon: <RestoreIcon size={16} />, run: () => onFlow("reactivate", detail) });

  return (
    <div data-tab-panel="overview" className="space-y-3">
      <Card icon={<BriefcaseIcon size={16} />} title="Skills & Experience">
        <p className="mb-2 text-[12.5px] text-ink-soft" data-experience>
          {c.yearsExperience === null ? "Experience not set" : `${c.yearsExperience} ${c.yearsExperience === 1 ? "year" : "years"} of experience`}
        </p>
        {detail.skills.length === 0 ? (
          <p className="text-[12.5px] text-muted">No skills recorded yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
            {detail.skills.map((s) => (
              <li key={s.skill} className={`rounded-md px-2 py-[3px] text-[11.5px] font-semibold leading-none ${s.primary ? "bg-accent-soft text-accent-deep" : "bg-paper-2 text-ink-soft"}`}>
                {s.skill}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card icon={<CalendarIcon size={16} />} title="Availability">
          {canEdit ? (
            <Select
              aria-label="Availability"
              value={c.availability}
              onChange={(v) => {
                if (v !== c.availability) void change({ availabilityStatus: v as Availability }, { availabilityStatus: c.availability }, `Availability set to ${AVAILABILITY_LABEL[v] ?? v}`);
              }}
              options={AVAILABILITY_OPTIONS}
            />
          ) : (
            <AvailabilityPill value={c.availability} />
          )}
          <p className="mt-1.5 text-[12px] text-muted" data-availability-note>
            {c.availability === "NOTICE" && c.availableFrom ? `From ${formatDate(c.availableFrom)}` : detail.availabilitySince ? `Since ${formatDate(detail.availabilitySince)}` : "No date recorded"}
          </p>
          <button type="button" onClick={() => onTab("applications")} className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-on-accent hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            View Interviews
          </button>
        </Card>
        <Card icon={<GearIcon size={16} />} title="License Status">
          {canEdit ? (
            <Select
              aria-label="License status"
              value={c.license}
              onChange={(v) => {
                if (v !== c.license) void change({ licenseStatus: v as LicenseStatus }, { licenseStatus: c.license }, `License set to ${LICENSE_LABEL[v] ?? v}`);
              }}
              options={LICENSE_OPTIONS}
            />
          ) : (
            <LicensePill value={c.license} />
          )}
          <p className="mt-1.5 text-[12px] text-muted" data-license-note>
            {c.licenseValidUntil ? `Valid until ${formatDate(c.licenseValidUntil)}` : "No valid-until date"}
          </p>
          {canEdit ? (
            <button type="button" onClick={() => onFlow("license", detail)} className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-line px-3 text-[12.5px] font-semibold text-ink hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Manage License
            </button>
          ) : null}
        </Card>
      </div>

      <Card icon={<CheckIcon size={16} />} title="Profile Completeness">
        <div className="flex items-center gap-4">
          <Meter variant="ring" value={c.profileCompleteness} max={100} label="Profile completeness" valueText={`${c.profileCompleteness} percent`} size={84} neutral>
            <span className="text-[18px] font-extrabold tabular-nums text-ink">{c.profileCompleteness}%</span>
          </Meter>
          <ul className="min-w-0 flex-1 space-y-1 text-[12.5px]" aria-label="Profile checklist" data-checklist>
            {checklistRows(detail.checklist).map((r) => (
              <li key={r.key} className="flex items-center gap-1.5 text-ink-soft" data-done={r.done}>
                <span aria-hidden className={`grid h-4 w-4 flex-none place-items-center rounded-full ${r.done ? "bg-accent text-on-accent" : "border border-line text-transparent"}`}>
                  <CheckIcon size={10} />
                </span>
                <span className={r.done ? "" : "text-muted"}>{r.label}</span>
                <span className="sr-only">{r.done ? "done" : "to do"}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <section aria-label="Quick actions" data-quick-actions>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-[13.5px] font-bold text-ink">
          <ZapIcon aria-hidden size={15} className="text-accent" /> Quick Actions
        </h3>
        <ul className="divide-y divide-line/60 rounded-xl border border-line bg-paper">
          {quick.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                data-quick-action={r.key}
                onClick={r.run}
                className={`flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-[13.5px] font-medium hover:bg-paper-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${r.danger ? "text-danger-text" : "text-ink"}`}
              >
                <span aria-hidden>{r.icon}</span>
                <span className="flex-1">{r.label}</span>
                <ChevronRightIcon aria-hidden size={14} className="text-muted" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Loading() {
  return (
    <div role="status" aria-label="Loading consultant" className="space-y-3 py-2">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/** The drawer: pushes the table aside on a wide screen, floats over it on a tablet and rises from the bottom on a phone. */
export default function DetailSheet(p: DetailSheetProps) {
  const open = p.consultantId !== null;
  const { state, save, replace, reload } = useConsultantDetail(p.orgId, p.consultantId, p.reloadToken);
  const root = useRef<HTMLDivElement>(null);

  const body = (() => {
    if (state.status === "idle" || state.status === "loading") return <Loading />;
    if (state.status === "gone") return <ErrorState variant="inline" what="this consultant" description="They are no longer in your view. They may have been deactivated or moved out of your reach." />;
    if (state.status === "error") return <ErrorState variant="inline" what="this consultant" description={state.message} onRetry={() => void reload()} />;
    const d = state.detail;
    const c = d.consultant;
    return (
      <div ref={root} data-detail-body data-consultant-id={c.id}>
        <div className="flex items-start gap-3">
          <MemberAvatar name={c.name} size={56} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <AvailabilityPill value={c.availability} />
              {c.status === "INACTIVE" && <span className="rounded-full bg-paper-2 px-2.5 py-[3px] text-[11.5px] font-semibold leading-none text-ink-soft">Inactive</span>}
              {c.jobTitle && <span className="inline-flex max-w-full items-center truncate rounded-full bg-accent-soft px-2.5 py-[3px] text-[11.5px] font-semibold leading-none text-accent-deep">{c.jobTitle}</span>}
            </div>
            <ul className="space-y-0.5 text-[13px] text-ink-soft" data-contact>
              <li className="flex min-w-0 items-center gap-1.5">
                <MailIcon aria-hidden size={14} className="flex-none text-muted" />
                <span className="truncate">{c.email}</span>
              </li>
              {(c.location || c.workMode) && (
                <li className="flex items-center gap-1.5">
                  <MapPinIcon aria-hidden size={14} className="flex-none text-muted" />
                  {locationText(c.location, c.workMode)}
                </li>
              )}
            </ul>
          </div>
        </div>
        <Tabs value={p.tab} onValueChange={(v) => p.onTab(v as DetailTab)} variant="underline" className="mt-4">
          <TabList aria-label="Consultant details">
            <Tab value="overview">Overview</Tab>
            <Tab value="assignments">Assignments</Tab>
            <Tab value="applications">Applications</Tab>
            <Tab value="activity">Activity</Tab>
          </TabList>
          <TabPanel value="overview" className="pt-3">
            <Overview
              detail={d}
              canEdit={d.actions.edit}
              save={async (b) => {
                const r = await save(b);
                return r;
              }}
              onSaved={(x) => {
                replace(x);
                p.onSaved(x);
              }}
              onTab={p.onTab}
              onFlow={p.onFlow}
            />
          </TabPanel>
          <TabPanel value="assignments" className="pt-3">
            <AssignmentsTab orgId={p.orgId} id={c.id} version={d.version} />
          </TabPanel>
          <TabPanel value="applications" className="pt-3">
            <ApplicationsTab orgId={p.orgId} id={c.id} version={d.version} experience={experienceText(c.yearsExperience)} />
          </TabPanel>
          <TabPanel value="activity" className="pt-3">
            <ActivityTab orgId={p.orgId} id={c.id} version={d.version} />
          </TabPanel>
        </Tabs>
        {p.footer && <div className="mt-4">{p.footer}</div>}
      </div>
    );
  })();

  const title = state.status === "ok" ? state.detail.consultant.name : "Consultant";
  const description = state.status === "ok" ? (state.detail.consultant.jobTitle ?? undefined) : undefined;

  if (p.mode === "sheet") {
    return (
      <BottomSheet id="ent-consultant-sheet" open={open} onClose={p.onClose} title={title} description={description} returnFocusTo={p.returnFocusTo} defaultSnap="partial">
        {body}
      </BottomSheet>
    );
  }
  const sheet = (
    <SideSheet id="ent-consultant-sheet" side="right" mode={p.mode} width={p.mode === "push" ? 400 : 480} open={open} onClose={p.onClose} title={title} description={description} returnFocusTo={p.returnFocusTo}>
      {body}
    </SideSheet>
  );
  if (p.mode === "push") {
    return <div className={`sticky top-4 h-[calc(100dvh-7rem)] shrink-0 self-start ${open ? "ml-4" : ""}`}>{sheet}</div>;
  }
  return sheet;
}
