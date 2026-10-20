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
  KeyIcon,
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
  XIcon,
  ZapIcon,
} from "@kiwiply/ui";
import ReasonSheet from "@/components/admin-v3/common/ReasonSheet";
import type { ReasonSpec } from "@/components/admin-v3/common/ReasonSheet";
import TempPasswordDialog from "@/components/ent/shared/TempPasswordDialog";
import { accountsApi } from "@/lib/ent/invitations";
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
    <div className="grid grid-cols-[1.5rem_5rem_1fr] items-center gap-x-2.5 py-[7px] text-[14px]">
      <span aria-hidden className="text-ink-soft">{icon}</span>
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
        className="!h-7 !border-transparent !bg-transparent !px-0 !text-[14px] !shadow-none hover:!bg-paper-2 focus:!bg-paper focus:!px-2"
      />
      <p className="text-[12px] empty:hidden" aria-live="polite" data-title-status={status}>
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
const GHOST = "!min-h-0 !h-7 !border-transparent !bg-transparent !pl-0 !pr-6 !text-[14px] !shadow-none hover:!bg-paper-2 hover:!pl-2";
const TAB_CLS = "!text-[14px] !font-medium aria-selected:!text-accent aria-selected:!border-accent";

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
      <dl>
        <Field icon={<BuildingIcon size={18} />} label="Department">
          {canEdit ? (
            <Select className={GHOST} aria-label="Department" value={detail.department ? String(detail.department.id) : NONE} onChange={(v) => void patch({ departmentGroupId: v === NONE ? null : Number(v) })} options={[{ value: NONE, label: "No department" }, ...depts.map((g) => ({ value: String(g.id), label: g.name }))]} />
          ) : (
            detail.department?.name ?? <span className="text-muted">None</span>
          )}
        </Field>
        <Field icon={<UsersIcon size={18} />} label="Team">
          {canEdit ? (
            <Select className={GHOST} aria-label="Team" value={detail.team ? String(detail.team.id) : NONE} onChange={(v) => void patch({ teamGroupId: v === NONE ? null : Number(v) })} options={[{ value: NONE, label: "No team" }, ...teams.map((g) => ({ value: String(g.id), label: g.name }))]} />
          ) : (
            detail.team?.name ?? <span className="text-muted">None</span>
          )}
        </Field>
        <Field icon={<UserIcon size={18} />} label="Manager">
          {canEdit ? (
            <Select className={GHOST} aria-label="Manager" value={detail.manager ? String(detail.manager.memberId) : NONE} onChange={(v) => void patch({ managerMemberId: v === NONE ? null : Number(v) })} options={mgrOptions} />
          ) : detail.manager ? (
            <span className="flex items-center gap-2.5 font-semibold">
              <MemberAvatar name={detail.manager.name} size={30} src={detail.manager.avatarUrl} />
              {detail.manager.name}
            </span>
          ) : (
            <span className="text-muted">{detail.summaryOnly ? "Not shared" : "None"}</span>
          )}
        </Field>
        <Field icon={<CalendarIcon size={18} />} label="Joined">
          <span className="text-[13px]">{joinedText(detail.joinedAt) || <span className="text-muted">Not yet</span>}</span>
        </Field>
        <Field icon={<PencilIcon size={18} />} label="Job title">
          <TitleField detail={detail} canEdit={canEdit} save={save} inputRef={titleRef} />
        </Field>
        {detail.lastActiveAt && (
          <Field icon={<ClockIcon size={18} />} label="Last active">
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

function QuickActions({ detail, selfId, onEdit, onRoles, onFlow, onReset }: { detail: MemberDetail; selfId: number; onEdit: () => void; onRoles: () => void; onFlow: DetailSheetProps["onFlow"]; onReset: (d: MemberDetail) => void }) {
  const a = detail.actions;
  const left = detail.status === "LEFT" || detail.status === "REMOVED" || detail.status === "ERASED";
  const rows: { key: string; label: string; icon: ReactNode; run?: () => void; danger?: boolean; soon?: boolean }[] = [];
  if (a.edit && !left) rows.push({ key: "edit", label: "Edit employee", icon: <PencilIcon size={18} />, run: onEdit });
  if (a.manageRoles && !left) rows.push({ key: "roles", label: "Manage roles & permissions", icon: <ShieldIcon size={18} />, run: onRoles });
  // A new temporary password, only for a person who has not chosen their own yet (the API answers 409 otherwise) and never for yourself.
  if (a.edit && !left && detail.status === "ACTIVE" && detail.id !== selfId) rows.push({ key: "reset", label: "Reset password", icon: <KeyIcon size={18} />, run: () => onReset(detail) });
  if (a.suspend && detail.status === "ACTIVE") rows.push({ key: "suspend", label: "Suspend employee", icon: <MinusCircleIcon size={18} />, run: () => onFlow("suspend", detail), danger: true });
  if (a.reinstate && detail.status === "SUSPENDED") rows.push({ key: "reinstate", label: "Reinstate employee", icon: <RestoreIcon size={18} />, run: () => onFlow("reinstate", detail) });
  if (a.offboard && (detail.status === "ACTIVE" || detail.status === "SUSPENDED")) rows.push({ key: "offboard", label: "Delete employee", icon: <TrashIcon size={18} />, run: () => onFlow("offboard", detail), danger: true });
  if (rows.length === 0) return null;
  return (
    <section aria-label="Actions" className="mt-4 border-t border-line/60 pt-3.5" data-quick-actions>
      <h3 className="mb-2.5 flex items-center gap-2 text-[14.5px] font-bold text-ink">
        <ZapIcon aria-hidden size={17} className="text-accent" /> Actions
      </h3>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              data-quick-action={r.key}
              disabled={r.soon}
              title={r.soon ? "On the way: employees reset their own password from the sign-in page for now." : undefined}
              onClick={r.run}
              className={`flex h-10 w-full items-center gap-3 rounded-[10px] border px-3 text-left text-[14px] font-medium focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${r.danger ? "border-v2-coral/25 bg-v2-coral-soft/40 text-v2-coral-ink hover:bg-v2-coral-soft" : "border-line bg-paper text-ink-soft hover:bg-paper-2"}`}
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
  const docked = p.mode === "push";
  const open = p.memberId !== null;
  const { state, save, replace, reload } = useMemberDetail(p.orgId, p.memberId, p.reloadToken);
  const titleRef = useRef<HTMLInputElement>(null);
  const [focusTitle, setFocusTitle] = useState(0);

  useEffect(() => {
    if (focusTitle > 0 && p.tab === "overview") titleRef.current?.focus();
  }, [focusTitle, p.tab]);

  const [resetSpec, setResetSpec] = useState<ReasonSpec | null>(null);
  const [creds, setCreds] = useState<{ who: string; password: string; expiresAt: string } | null>(null);
  function askReset(d: MemberDetail) {
    setResetSpec({
      title: `Reset ${d.name}'s password?`,
      body: "Issues a new temporary password, shown once. The old one stops working and they must choose their own at the next sign-in. Only possible while they have not chosen their own yet.",
      confirmLabel: "Reset password",
      tone: "primary",
      placeholder: "e.g. They never received the first password",
      run: async (reason) => {
        const r = await accountsApi.reset(p.orgId, d.id, reason);
        if (!r.ok) {
          const error = r.code === "PASSWORD_ALREADY_SET" ? "They have already chosen their own password. They can use Forgot password on the sign-in page." : r.message;
          return { ok: false, status: r.status, code: r.code ?? null, error, extra: {} };
        }
        setCreds({ who: r.data.email, password: r.data.tempPassword, expiresAt: r.data.tempPasswordExpiresAt });
        return { ok: true };
      },
    });
  }

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
        <div className="flex items-start gap-3.5">
          <MemberAvatar name={d.name} size={docked ? 64 : 56} src={d.avatarUrl} />
          <div className="min-w-0 flex-1 space-y-2">
            {docked && (
              <div className="flex items-center gap-2 pr-7">
                <h2 className="min-w-0 truncate text-[19px] font-extrabold leading-tight text-ink" data-detail-name>{d.name}</h2>
                <MemberStatusPill status={d.status} className="flex-none" />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              {!docked && <MemberStatusPill status={d.status} />}
              <RoleChips roles={d.roles} max={3} />
            </div>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5 text-[13.5px] text-ink-soft" data-contact>
          {d.workEmail && (
            <li className="flex min-w-0 items-center gap-3">
              <MailIcon aria-hidden size={16} className="flex-none text-ink-soft" />
              <span className="truncate">{d.workEmail}</span>
            </li>
          )}
          {d.phone && (
            <li className="flex items-center gap-3">
              <PhoneIcon aria-hidden size={16} className="flex-none text-ink-soft" />
              {d.phone}
            </li>
          )}
          {d.location && (
            <li className="flex items-center gap-3">
              <MapPinIcon aria-hidden size={16} className="flex-none text-ink-soft" />
              {d.location}
            </li>
          )}
          {d.timezone && (
            <li className="flex items-center gap-3">
              <ClockIcon aria-hidden size={16} className="flex-none text-ink-soft" />
              {d.timezone}
            </li>
          )}
        </ul>
        <Tabs value={p.tab} onValueChange={(v) => p.onTab(v as DetailTab)} variant="underline" className="mt-4">
          <TabList aria-label="Employee details" className="justify-between">
            <Tab value="overview" className={TAB_CLS}>Overview</Tab>
            <Tab value="access" className={TAB_CLS}>Access &amp; Roles</Tab>
            <Tab value="activity" className={TAB_CLS}>Activity</Tab>
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
          selfId={p.selfId}
          onReset={askReset}
          onEdit={() => {
            p.onTab("overview");
            setFocusTitle((n) => n + 1);
          }}
          onRoles={() => p.onTab("access")}
          onFlow={p.onFlow}
        />
        {p.footer}
        <ReasonSheet spec={resetSpec} onClose={() => setResetSpec(null)} />
        <TempPasswordDialog open={creds !== null} title="New temporary password" who={creds?.who ?? ""} password={creds?.password ?? null} expiresAt={creds?.expiresAt} onClose={() => setCreds(null)} />
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
  if (p.mode === "push") {
    return (
      <aside
        id="ent-employee-sheet"
        role="region"
        aria-label={title}
        data-mode="push"
        data-state={open ? "open" : "closed"}
        aria-hidden={open ? undefined : true}
        hidden={!open}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !e.defaultPrevented) {
            e.stopPropagation();
            p.onClose();
          }
        }}
        className="sticky top-4 ml-4 max-h-[calc(100dvh-2rem)] w-[316px] shrink-0 self-start overflow-y-auto rounded-2xl border border-line bg-paper p-4 shadow-[0_1px_3px_rgba(16,24,64,.06)]"
      >
        <button
          type="button"
          data-sheet-close
          onClick={() => p.onClose()}
          aria-label={`Close ${title}`}
          className="absolute right-3.5 top-3.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <XIcon size={18} />
        </button>
        {body}
      </aside>
    );
  }
  return (
    <SideSheet id="ent-employee-sheet" side="right" mode={p.mode} width={480} open={open} onClose={p.onClose} title={title} description={description} returnFocusTo={p.returnFocusTo}>
      {body}
    </SideSheet>
  );
}
