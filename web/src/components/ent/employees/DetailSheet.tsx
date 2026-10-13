"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  BottomSheet,
  BuildingIcon,
  Button,
  CalendarIcon,
  ClockIcon,
  ErrorState,
  Input,
  MailIcon,
  MapPinIcon,
  MemberAvatar,
  MinusCircleIcon,
  PencilIcon,
  PhoneIcon,
  RestoreIcon,
  Select,
  ShieldIcon,
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
} from "@kiwiply/ui";
import { formatDate, joinedText, relativeTime, type GroupOption, type MemberDetail, type PatchBody, type PersonRef, type RoleOption } from "@/lib/ent/members";
import AccessRolesTab from "./AccessRolesTab";
import ActivityTab from "./ActivityTab";
import { MemberStatusPill, RoleChips } from "./parts";
import { useMemberDetail, type SaveResult } from "./useMemberDetail";

export type SheetMode = "push" | "overlay" | "sheet";
export type FlowKind = "suspend" | "reinstate" | "offboard";
export type DetailTab = "overview" | "access" | "activity";

export const TITLE_AUTOSAVE_MS = 800; // config-literal-ok: how long typing rests before the title is saved (UI timing)

export interface DetailSheetProps {
  orgId: number | string;
  memberId: number | null;
  selfId: number;
  mode: SheetMode;
  roles: RoleOption[];
  groups: GroupOption[];
  loadManagers: () => Promise<PersonRef[]>;
  onClose: () => void;
  /** A saved detail: the table row is refreshed from it. */
  onSaved: (d: MemberDetail) => void;
  /** Roles or a placement changed: lists and tiles reload. */
  onChanged: () => void;
  onFlow: (kind: FlowKind, d: MemberDetail) => void;
  onCancelScheduled: (id: number, name: string) => void;
  /** Bumped by the page when something outside the sheet changed this person. */
  reloadToken: number;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
  /** The help card, shown at the foot of a docked sheet. */
  footer?: ReactNode;
}

function Field({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.25rem_5.5rem_1fr] items-center gap-x-2 py-1.5 text-[13.5px]">
      <span aria-hidden className="text-muted">{icon}</span>
      <dt className="text-ink-soft">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

/** The job title, saved as you type (800 ms after the last key, at once on blur). No Save button. */
export function TitleField({ detail, canEdit, save, inputRef }: { detail: MemberDetail; canEdit: boolean; save: (b: PatchBody) => Promise<SaveResult>; inputRef: RefObject<HTMLInputElement | null> }) {
  const server = detail.title ?? "";
  const [value, setValue] = useState(server);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const last = useRef(server);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  // someone else's change arrives while this field is untouched: show it
  useEffect(() => {
    if (valueRef.current.trim() === last.current.trim()) {
      last.current = server;
      setValue(server);
    }
  }, [server]);

  async function commit() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = valueRef.current.trim();
    if (next === last.current.trim()) {
      setStatus("idle");
      return;
    }
    setStatus("saving");
    setErr(null);
    const r = await save({ title: next === "" ? null : next });
    if (r.ok) {
      last.current = r.detail.title ?? "";
      setStatus("saved");
    } else {
      setErr(r.message);
      setStatus("error");
    }
  }

  function onChange(v: string) {
    setValue(v);
    valueRef.current = v;
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void commit(), TITLE_AUTOSAVE_MS);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!canEdit) return <span>{server || <span className="text-muted">Not set</span>}</span>;
  return (
    <div>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
        }}
        maxLength={120}
        placeholder="Add a job title"
        aria-label="Job title"
        aria-invalid={status === "error" ? true : undefined}
        className="h-9"
      />
      <p className="mt-0.5 min-h-4 text-[12px]" aria-live="polite" data-title-status={status}>
        {status === "saving" && <span className="text-muted">Saving{"…"}</span>}
        {status === "saved" && <span className="text-accent-deep">Saved {"✓"}</span>}
        {status === "error" && (
          <span role="alert" className="text-danger-text">
            {err}
          </span>
        )}
      </p>
    </div>
  );
}

const NONE = "__none";

function Overview({ detail, save, onSaved, groups, loadManagers, onCancelScheduled, titleRef }: { detail: MemberDetail; save: (b: PatchBody) => Promise<SaveResult>; onSaved: (d: MemberDetail) => void; groups: GroupOption[]; loadManagers: () => Promise<PersonRef[]>; onCancelScheduled: DetailSheetProps["onCancelScheduled"]; titleRef: RefObject<HTMLInputElement | null> }) {
  const canEdit = detail.actions.edit;
  const [managers, setManagers] = useState<PersonRef[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (canEdit) void loadManagers().then((m) => live && setManagers(m));
    return () => {
      live = false;
    };
  }, [canEdit, loadManagers]);

  async function patch(body: PatchBody) {
    setErr(null);
    const r = await save(body);
    if (r.ok) onSaved(r.detail);
    else setErr(r.message);
  }

  const depts = groups.filter((g) => g.kind === "DEPARTMENT");
  const teams = groups.filter((g) => g.kind === "TEAM");
  const mgrOptions = [{ value: NONE, label: "No manager" }, ...managers.filter((m) => m.memberId !== detail.id).map((m) => ({ value: String(m.memberId), label: m.name }))];
  if (detail.manager && !managers.some((m) => m.memberId === detail.manager!.memberId)) mgrOptions.push({ value: String(detail.manager.memberId), label: detail.manager.name });

  return (
    <div data-tab-panel="overview">
      <dl className="divide-y divide-line/50">
        <Field icon={<PencilIcon size={15} />} label="Job title">
          <TitleField detail={detail} canEdit={canEdit} save={save} inputRef={titleRef} />
        </Field>
        <Field icon={<BuildingIcon size={15} />} label="Department">
          {canEdit ? (
            <Select aria-label="Department" value={detail.department ? String(detail.department.id) : NONE} onChange={(v) => void patch({ departmentGroupId: v === NONE ? null : Number(v) })} options={[{ value: NONE, label: "No department" }, ...depts.map((g) => ({ value: String(g.id), label: g.name }))]} />
          ) : (
            detail.department?.name ?? <span className="text-muted">None</span>
          )}
        </Field>
        <Field icon={<UsersIcon size={15} />} label="Team">
          {canEdit ? (
            <Select aria-label="Team" value={detail.team ? String(detail.team.id) : NONE} onChange={(v) => void patch({ teamGroupId: v === NONE ? null : Number(v) })} options={[{ value: NONE, label: "No team" }, ...teams.map((g) => ({ value: String(g.id), label: g.name }))]} />
          ) : (
            detail.team?.name ?? <span className="text-muted">None</span>
          )}
        </Field>
        <Field icon={<UserIcon size={15} />} label="Manager">
          {canEdit ? (
            <Select aria-label="Manager" value={detail.manager ? String(detail.manager.memberId) : NONE} onChange={(v) => void patch({ managerMemberId: v === NONE ? null : Number(v) })} options={mgrOptions} />
          ) : detail.manager ? (
            <span className="flex items-center gap-2">
              <MemberAvatar name={detail.manager.name} size={22} src={detail.manager.avatarUrl} />
              {detail.manager.name}
            </span>
          ) : (
            <span className="text-muted">{detail.summaryOnly ? "Not shared" : "None"}</span>
          )}
        </Field>
        <Field icon={<CalendarIcon size={15} />} label="Joined">
          {joinedText(detail.joinedAt) || <span className="text-muted">Not yet</span>}
        </Field>
        {detail.lastActiveAt && (
          <Field icon={<ClockIcon size={15} />} label="Last active">
            {relativeTime(detail.lastActiveAt)}
          </Field>
        )}
      </dl>
      {err && (
        <p role="alert" data-patch-error className="mt-2 text-[12.5px] leading-snug text-danger-text">
          {err}
        </p>
      )}
      {detail.invite && (
        <p className="mt-3 rounded-lg bg-paper-2 p-3 text-[13px] text-ink-soft">
          {detail.invite.expired ? "The invitation has expired." : detail.invite.expiresAt ? `The invitation is waiting. It expires ${relativeTime(detail.invite.expiresAt)}.` : "The invitation is waiting."}
        </p>
      )}
      {detail.scheduledOffboarding && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brown/40 bg-brown-soft p-3 text-[13px] text-brown-deep" data-scheduled-offboarding>
          <span>Last day: {formatDate(detail.scheduledOffboarding.effectiveAt)}</span>
          {detail.actions.offboard && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onCancelScheduled(detail.scheduledOffboarding!.id, detail.name)}>
              Cancel last day
            </Button>
          )}
        </div>
      )}
      {detail.directReports.length > 0 && (
        <section aria-label="Direct reports" className="mt-4">
          <h3 className="mb-1.5 text-[12.5px] font-semibold uppercase tracking-[.04em] text-muted">Direct reports ({detail.directReports.length})</h3>
          <ul className="flex flex-wrap gap-1.5">
            {detail.directReports.map((p) => (
              <li key={p.memberId} className="flex items-center gap-1.5 rounded-full bg-paper-2 py-0.5 pl-0.5 pr-2.5 text-[12.5px] text-ink">
                <MemberAvatar name={p.name} size={20} src={p.avatarUrl} />
                {p.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function QuickActions({ detail, onEdit, onRoles, onFlow }: { detail: MemberDetail; onEdit: () => void; onRoles: () => void; onFlow: DetailSheetProps["onFlow"] }) {
  const a = detail.actions;
  const left = detail.status === "LEFT" || detail.status === "REMOVED" || detail.status === "ERASED";
  const rows: { key: string; label: string; icon: ReactNode; run: () => void; danger?: boolean }[] = [];
  if (a.edit && !left) rows.push({ key: "edit", label: "Edit Employee", icon: <PencilIcon size={16} />, run: onEdit });
  if (a.manageRoles && !left) rows.push({ key: "roles", label: "Manage Roles & Permissions", icon: <ShieldIcon size={16} />, run: onRoles });
  if (a.suspend && detail.status === "ACTIVE") rows.push({ key: "suspend", label: "Suspend Employee", icon: <MinusCircleIcon size={16} />, run: () => onFlow("suspend", detail), danger: true });
  if (a.reinstate && detail.status === "SUSPENDED") rows.push({ key: "reinstate", label: "Reinstate Employee", icon: <RestoreIcon size={16} />, run: () => onFlow("reinstate", detail) });
  if (a.offboard && (detail.status === "ACTIVE" || detail.status === "SUSPENDED")) rows.push({ key: "offboard", label: "Delete Employee", icon: <TrashIcon size={16} />, run: () => onFlow("offboard", detail), danger: true });
  if (rows.length === 0) return null;
  return (
    <section aria-label="Quick actions" className="mt-5" data-quick-actions>
      <h3 className="mb-2 flex items-center gap-1.5 text-[13.5px] font-bold text-ink">
        <ZapIcon aria-hidden size={15} className="text-accent" /> Quick Actions
      </h3>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              data-quick-action={r.key}
              onClick={r.run}
              className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-line px-3 text-left text-[13.5px] font-medium hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-accent ${r.danger ? "text-danger-text" : "text-ink"}`}
            >
              <span aria-hidden>{r.icon}</span>
              {r.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Loading() {
  return (
    <div role="status" aria-label="Loading employee" className="space-y-3 py-2">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/** The sheet itself: pushes the table aside on a wide screen, floats over it on a tablet and rises from the bottom on a phone. */
export default function DetailSheet(p: DetailSheetProps) {
  const open = p.memberId !== null;
  const { state, save, replace, reload } = useMemberDetail(p.orgId, p.memberId, p.reloadToken);
  const titleRef = useRef<HTMLInputElement>(null);
  const [focusTitle, setFocusTitle] = useState(0);

  useEffect(() => {
    if (focusTitle > 0 && p.tab === "overview") titleRef.current?.focus();
  }, [focusTitle, p.tab]);

  const saveAndNote = async (b: PatchBody) => {
    const r = await save(b);
    if (r.ok) p.onSaved(r.detail);
    return r;
  };

  const body = (() => {
    if (state.status === "idle" || state.status === "loading") return <Loading />;
    if (state.status === "gone") return <ErrorState variant="inline" what="this person" description="They are no longer in your view. They may have left or moved out of your scope." />;
    if (state.status === "error") return <ErrorState variant="inline" what="this person" description={state.message} onRetry={() => void reload()} />;
    const d = state.detail;
    return (
      <div data-detail-body data-member-id={d.id}>
        <div className="flex items-start gap-3">
          <MemberAvatar name={d.name} size={56} src={d.avatarUrl} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <MemberStatusPill status={d.status} />
              <RoleChips roles={d.roles} max={3} />
            </div>
            <ul className="space-y-0.5 text-[13px] text-ink-soft" data-contact>
              {d.workEmail && (
                <li className="flex min-w-0 items-center gap-1.5">
                  <MailIcon aria-hidden size={14} className="flex-none text-muted" />
                  <span className="truncate">{d.workEmail}</span>
                </li>
              )}
              {d.phone && (
                <li className="flex items-center gap-1.5">
                  <PhoneIcon aria-hidden size={14} className="flex-none text-muted" />
                  {d.phone}
                </li>
              )}
              {d.location && (
                <li className="flex items-center gap-1.5">
                  <MapPinIcon aria-hidden size={14} className="flex-none text-muted" />
                  {d.location}
                </li>
              )}
              {d.timezone && (
                <li className="flex items-center gap-1.5">
                  <ClockIcon aria-hidden size={14} className="flex-none text-muted" />
                  {d.timezone}
                </li>
              )}
            </ul>
          </div>
        </div>
        <Tabs value={p.tab} onValueChange={(v) => p.onTab(v as DetailTab)} variant="underline" className="mt-4">
          <TabList aria-label="Employee details">
            <Tab value="overview">Overview</Tab>
            <Tab value="access">Access &amp; Roles</Tab>
            <Tab value="activity">Activity</Tab>
          </TabList>
          <TabPanel value="overview" className="pt-3">
            <Overview detail={d} save={saveAndNote} onSaved={replace} groups={p.groups} loadManagers={p.loadManagers} onCancelScheduled={p.onCancelScheduled} titleRef={titleRef} />
          </TabPanel>
          <TabPanel value="access" className="pt-3">
            <AccessRolesTab
              orgId={p.orgId}
              detail={d}
              roles={p.roles}
              selfId={p.selfId}
              onChanged={async () => {
                const fresh = await reload();
                if (fresh) p.onSaved(fresh);
                p.onChanged();
              }}
            />
          </TabPanel>
          <TabPanel value="activity" className="pt-3">
            <ActivityTab orgId={p.orgId} detail={d} />
          </TabPanel>
        </Tabs>
        <QuickActions
          detail={d}
          onEdit={() => {
            p.onTab("overview");
            setFocusTitle((n) => n + 1);
          }}
          onRoles={() => p.onTab("access")}
          onFlow={p.onFlow}
        />
        {p.footer}
      </div>
    );
  })();

  const description = state.status === "ok" ? (state.detail.title ?? undefined) : undefined;
  const title = state.status === "ok" ? state.detail.name : "Employee";

  if (p.mode === "sheet") {
    return (
      <BottomSheet id="ent-employee-sheet" open={open} onClose={p.onClose} title={title} description={description} returnFocusTo={p.returnFocusTo} defaultSnap="partial">
        {body}
      </BottomSheet>
    );
  }
  const sheet = (
    <SideSheet id="ent-employee-sheet" side="right" mode={p.mode} width={p.mode === "push" ? 400 : 480} open={open} onClose={p.onClose} title={title} description={description} returnFocusTo={p.returnFocusTo}>
      {body}
    </SideSheet>
  );
  if (p.mode === "push") {
    return <div className={`sticky top-4 h-[calc(100dvh-7rem)] shrink-0 self-start ${open ? "ml-4" : ""}`}>{sheet}</div>;
  }
  return sheet;
}
