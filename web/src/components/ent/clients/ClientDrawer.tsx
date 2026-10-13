"use client";

import { useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  BottomSheet,
  BriefcaseIcon,
  BuildingIcon,
  Button,
  CalendarIcon,
  ChevronDownIcon,
  ErrorState,
  ExternalLinkIcon,
  FileTextIcon,
  MailIcon,
  MapPinIcon,
  MemberAvatar,
  Menu,
  PencilIcon,
  SideSheet,
  Skeleton,
  Tab,
  TabList,
  Tabs,
  Textarea,
  UsersIcon,
  XIcon,
  useToast,
} from "@kiwiply/ui";
import {
  clientsApi,
  dayText,
  errorSentence,
  relativeTime,
  REQUIREMENT_STATUS_LABEL,
  REQUIREMENT_TONE,
  ROLE_LABEL,
  siteHref,
  siteText,
  sinceText,
  sizeLabel,
  STAGE_PILL,
  STAGE_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  type ClientDetail,
  type Contact,
  type DrawerTab,
  type PatchBody,
  type Person,
} from "@/lib/ent/clients";
import { Kebab } from "@/components/ent/jobs/parts";
import EditForm from "./EditForm";
import { CompanyTile, LinkButton, Pill, SectionHead } from "./parts";
import { useClientDetail } from "./useClientDetail";

export type SheetMode = "push" | "overlay" | "sheet";
export const UNDO_MS = 9000; // config-literal-ok: how long an Undo stays offered (UI timing)

export interface ClientDrawerHrefs {
  /** The Jobs page (requirements are its rows), the Applications page and the Placements page; null when the member's menu lists none. */
  jobs: string | null;
  applications: string | null;
  placements: string | null;
}

export interface ClientDrawerProps {
  orgId: number | string;
  clientId: number | null;
  mode: SheetMode;
  managers: Person[];
  tab: DrawerTab;
  onTab: (t: DrawerTab) => void;
  onClose: () => void;
  /** A saved or reloaded client: the list row and the tiles refresh from it. */
  onChanged: () => void;
  /** Bumped by the page when something outside the drawer changed this client. */
  reloadToken: number;
  hrefs: ClientDrawerHrefs;
  onAddContact: (d: ClientDetail) => void;
  onCreateRequirement: (d: ClientDetail) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

const hrefWith = (base: string | null, query: string) => (base ? `${base.split("?")[0]}?${query}` : null);

function Loading() {
  return (
    <div role="status" aria-label="Loading client" className="space-y-3 py-2">
      <Skeleton className="h-14 w-2/3" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 text-[12.5px] leading-tight text-ink-soft">
      <span aria-hidden className="flex-none text-[var(--ent-nav-text)]">
        {icon}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </li>
  );
}

type Save = ReturnType<typeof useClientDetail>["save"];

/** One contact: avatar, name, title, the mail button and the row menu (copy the address, mark as left with Undo). */
function ContactRowView({ c, canManage, onLeft }: { c: Contact; canManage: boolean; onLeft: (c: Contact) => void }) {
  const toast = useToast();
  const items = [
    ...(c.email
      ? [
          {
            label: "Copy e-mail",
            onSelect: () => {
              void navigator.clipboard?.writeText(c.email!).then(
                () => toast({ title: "Copied", description: c.email!, variant: "success" }),
                () => toast({ title: "Couldn't copy", description: c.email!, variant: "error" }),
              );
            },
          },
        ]
      : []),
    ...(canManage ? [{ label: "Mark as left the company", onSelect: () => onLeft(c) }] : []),
  ];
  return (
    <li data-contact-row={c.id} className="flex items-center gap-2.5 py-1.5">
      <MemberAvatar name={c.name} size={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-semibold leading-tight text-[var(--ent-title)]">{c.name}</p>
        <p className="truncate text-[12px] leading-tight text-ink-soft" title={c.role ? (ROLE_LABEL[c.role] ?? c.role) : undefined}>
          {c.title ?? (c.role ? ROLE_LABEL[c.role] : "")}
        </p>
      </div>
      {c.email && (
        <a href={`mailto:${c.email}`} aria-label={`E-mail ${c.name}`} title={c.email} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-accent hover:bg-accent-soft">
          <MailIcon size={17} aria-hidden />
        </a>
      )}
      {items.length > 0 && <Kebab items={items} label={`More for ${c.name}`} />}
    </li>
  );
}

function Notes({ d, orgId, replace, onChanged, expanded, onExpand }: { d: ClientDetail; orgId: number | string; replace: (x: ClientDetail) => void; onChanged: () => void; expanded: boolean; onExpand: () => void }) {
  const toast = useToast();
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const shown = expanded ? d.notes : d.notes.slice(0, 1);

  async function send() {
    const body = text.trim();
    if (body === "" || busy) return;
    setBusy(true);
    const r = await clientsApi.addNote(orgId, d.id, body);
    setBusy(false);
    if (!r.ok) {
      toast({ title: "Couldn't add the note", description: errorSentence(r), variant: "error" });
      return;
    }
    replace(r.data);
    onChanged();
    setText("");
    setComposing(false);
    toast({ title: "Note added", variant: "success" });
  }

  return (
    <section aria-label="Relationship notes" data-notes>
      <SectionHead
        title="Relationship Notes"
        action={
          d.noteCount > 1 && !expanded ? (
            <LinkButton onClick={onExpand} label="View all relationship notes">
              View All
            </LinkButton>
          ) : d.access.canManage && !composing ? (
            <LinkButton onClick={() => setComposing(true)} label="Add a relationship note">
              Add note
            </LinkButton>
          ) : undefined
        }
      />
      {shown.length === 0 && !composing && <p className="mt-2 rounded-xl bg-paper-2 p-2.5 text-[12.5px] text-ink-soft">No notes yet. Write down what you learn about this relationship.</p>}
      <ul className="mt-2 space-y-2">
        {shown.map((n) => (
          <li key={n.id} data-note className="flex gap-3 rounded-xl border border-[var(--ent-table-line)] bg-white p-2.5">
            <span aria-hidden className="mt-0.5 flex-none text-[var(--ent-kpi-orange-fg)]">
              <FileTextIcon size={22} />
            </span>
            <div className="min-w-0">
              <p className="whitespace-pre-line text-[12.5px] leading-snug text-[var(--ent-nav-text)]">{n.body}</p>
              <p className="mt-1 text-[11.5px] text-muted">
                {dayText(n.at)}
                {n.author ? ` by ${n.author}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {d.access.canManage && (expanded || composing) && !composing && (
        <button type="button" onClick={() => setComposing(true)} className="mt-2 text-[13px] font-medium text-accent-deep hover:underline">
          Add note
        </button>
      )}
      {composing && (
        <div className="mt-2 space-y-2" data-note-composer>
          <Textarea aria-label="New relationship note" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="What should the team know about this client?" autoFocus />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setComposing(false); setText(""); }} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => void send()} disabled={busy || text.trim() === ""} data-note-send>
              {busy ? "Adding..." : "Add note"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Overview({ d, p, replace, save, editing, notesOpen, onNotesOpen, onLeft }: { d: ClientDetail; p: ClientDrawerProps; replace: (x: ClientDetail) => void; save: Save; editing: boolean; notesOpen: boolean; onNotesOpen: () => void; onLeft: (c: Contact) => void }) {
  if (editing) return <EditForm key={d.id} detail={d} managers={p.managers} save={save} />;
  const subsHref = hrefWith(p.hrefs.applications, `client=${d.id}`);
  return (
    <div className="space-y-4" data-overview>
      <section aria-label="About">
        <SectionHead title="About" />
        <p className="mt-1 whitespace-pre-line text-[12.5px] leading-[1.45] text-ink-soft" data-about>
          {d.about || "No description yet."}
        </p>
        <ul className="mt-2.5 space-y-2" data-facts>
          {d.location && <Fact icon={<MapPinIcon size={16} />}>{d.location}</Fact>}
          {d.sizeBand && <Fact icon={<UsersIcon size={16} />}>{sizeLabel(d.sizeBand)}</Fact>}
          {d.industry && <Fact icon={<BuildingIcon size={16} />}>{d.industry}</Fact>}
          {sinceText(d.clientSince) && <Fact icon={<CalendarIcon size={16} />}>{sinceText(d.clientSince)}</Fact>}
          {d.manager && <Fact icon={<BriefcaseIcon size={16} />}>Account manager: {d.manager.name}</Fact>}
        </ul>
      </section>

      <hr className="border-[var(--ent-table-line)]" />
      <section aria-label="Key contacts" data-key-contacts>
        <SectionHead title="Key Contacts" action={d.contactCount > 3 || d.contactCount > 0 ? <LinkButton onClick={() => p.onTab("contacts")} label="View all contacts">View All</LinkButton> : undefined} />
        {d.contacts.length === 0 ? (
          <p className="mt-2 rounded-xl bg-paper-2 p-2.5 text-[12.5px] text-ink-soft">No contacts yet.</p>
        ) : (
          <ul className="mt-1.5">
            {d.contacts.slice(0, 3).map((c) => (
              <ContactRowView key={c.id} c={c} canManage={d.access.canManage} onLeft={onLeft} />
            ))}
          </ul>
        )}
      </section>

      <hr className="border-[var(--ent-table-line)]" />
      <section aria-label="Recent requirements" data-recent-requirements>
        <SectionHead title="Recent Requirements" action={d.requirementCount > 0 ? <LinkButton onClick={() => p.onTab("requirements")} label="View all requirements">View All</LinkButton> : undefined} />
        {d.requirements.length === 0 ? (
          <p className="mt-2 rounded-xl bg-paper-2 p-2.5 text-[12.5px] text-ink-soft">No requirements yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {d.requirements.slice(0, 3).map((r) => (
              <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-[12.5px]">
                <span className="truncate text-[var(--ent-nav-text)]">{r.title}</span>
                <Pill tone={REQUIREMENT_TONE[r.status] ?? "grey"} className="!px-3 !py-1 !text-[12px] !font-medium">
                  {REQUIREMENT_STATUS_LABEL[r.status] ?? r.status}
                </Pill>
                <span className="w-[86px] text-right text-[12px] text-ink-soft">{dayText(r.postedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <hr className="border-[var(--ent-table-line)]" />
      <section aria-label="Recent submissions" data-recent-submissions>
        <SectionHead title="Recent Submissions" action={subsHref ? <LinkButton href={subsHref} label="View all submissions">View All</LinkButton> : undefined} />
        {d.submissions.length === 0 ? (
          <p className="mt-2 rounded-xl bg-paper-2 p-2.5 text-[12.5px] text-ink-soft">No one has been submitted to this client yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {d.submissions.slice(0, 3).map((s) => (
              <li key={s.applicationId} className="grid grid-cols-[34px_minmax(0,1fr)_auto_auto] items-center gap-2.5">
                <MemberAvatar name={s.consultantName} size={30} />
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-semibold leading-tight text-[var(--ent-title)]">{s.consultantName}</p>
                  <p className="truncate text-[11.5px] leading-tight text-muted">{s.jobTitle}</p>
                </div>
                <Pill tone={STAGE_TONE[s.stage] ?? "grey"} className="!px-2.5 !py-1 !text-[11.5px] !font-medium">
                  {STAGE_PILL[s.stage] ?? s.stage}
                </Pill>
                <span className="w-[62px] text-right text-[11.5px] text-ink-soft">{relativeTime(s.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <hr className="border-[var(--ent-table-line)]" />
      <Notes d={d} orgId={p.orgId} replace={replace} onChanged={p.onChanged} expanded={notesOpen} onExpand={onNotesOpen} />
    </div>
  );
}

function ContactsTab({ d, onLeft, onAdd }: { d: ClientDetail; onLeft: (c: Contact) => void; onAdd: () => void }) {
  return (
    <div data-contacts-tab className="space-y-2">
      {d.contacts.length === 0 ? (
        <p className="rounded-xl bg-paper-2 p-3 text-[12.5px] text-ink-soft">No contacts yet. Add the people you work with at {d.name}.</p>
      ) : (
        <ul className="divide-y divide-[var(--ent-table-line)]">
          {d.contacts.map((c) => (
            <ContactRowView key={c.id} c={c} canManage={d.access.canManage} onLeft={onLeft} />
          ))}
        </ul>
      )}
      {d.access.canManage && (
        <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
          Add a contact
        </Button>
      )}
    </div>
  );
}

function RequirementsTab({ d, jobsHref }: { d: ClientDetail; jobsHref: string | null }) {
  if (d.requirements.length === 0) return <p className="rounded-xl bg-paper-2 p-3 text-[12.5px] text-ink-soft">No requirements yet.</p>;
  return (
    <ul className="divide-y divide-[var(--ent-table-line)]" data-requirements-tab>
      {d.requirements.map((r) => {
        const href = hrefWith(jobsHref, `job=${r.id}`);
        const inner = (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-[var(--ent-title)]">{r.title}</p>
              <p className="truncate text-[11.5px] text-muted">
                {r.filled}/{r.positions} filled · {r.submissions} {r.submissions === 1 ? "submission" : "submissions"} · {dayText(r.postedAt)}
              </p>
            </div>
            <Pill tone={REQUIREMENT_TONE[r.status] ?? "grey"} className="!px-3 !py-1 !text-[12px] !font-medium">
              {REQUIREMENT_STATUS_LABEL[r.status] ?? r.status}
            </Pill>
          </>
        );
        return (
          <li key={r.id}>
            {href ? (
              <a href={href} className="flex items-center gap-2 py-2 hover:bg-paper-2/60">
                {inner}
              </a>
            ) : (
              <div className="flex items-center gap-2 py-2">{inner}</div>
            )}
          </li>
        );
      })}
      {d.requirementCount > d.requirements.length && <li className="py-2 text-[12px] text-muted">Showing {d.requirements.length} of {d.requirementCount}.</li>}
    </ul>
  );
}

/** The drawer: docks beside the list on a wide screen, floats over it on a tablet and rises from the bottom on a phone. */
export default function ClientDrawer(p: ClientDrawerProps) {
  const open = p.clientId !== null;
  const toast = useToast();
  const { state, save, replace, reload } = useClientDetail(p.orgId, p.clientId, p.reloadToken);
  const [editing, setEditing] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [editFor, setEditFor] = useState<number | null>(null);
  // leaving the client being edited ends the edit mode (state derived during render, no effect)
  if (editFor !== p.clientId) {
    setEditFor(p.clientId);
    if (editing) setEditing(false);
    if (notesOpen) setNotesOpen(false);
  }

  async function changeStatus(d: ClientDetail, v: string) {
    const prev = d.status;
    const r = await save({ status: v as PatchBody["status"] });
    if (!r.ok) {
      toast({ title: "Couldn't change the status", description: r.error, variant: "error" });
      return;
    }
    p.onChanged();
    toast({
      title: `${d.name} is now ${STATUS_LABEL[v] ?? v}`,
      variant: "success",
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () =>
          void save({ status: prev }).then((u) => {
            toast(u.ok ? { title: "Undone", variant: "success" } : { title: "Couldn't undo", description: u.error, variant: "error" });
            p.onChanged();
          }),
      },
    });
  }

  async function markLeft(d: ClientDetail, c: Contact) {
    const r = await clientsApi.patchContact(p.orgId, d.id, c.id, { status: "LEFT" });
    if (!r.ok) {
      toast({ title: "Couldn't update the contact", description: errorSentence(r), variant: "error" });
      return;
    }
    replace(r.data);
    p.onChanged();
    toast({
      title: `${c.name} was marked as having left`,
      variant: "success",
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () =>
          void clientsApi.patchContact(p.orgId, d.id, c.id, { status: "ACTIVE" }).then((u) => {
            if (u.ok) {
              replace(u.data);
              p.onChanged();
              toast({ title: "Restored", variant: "success" });
            } else toast({ title: "Couldn't undo", description: errorSentence(u), variant: "error" });
          }),
      },
    });
  }

  const detail = state.status === "ok" ? state.detail : null;

  const body = (() => {
    if (state.status === "idle" || state.status === "loading") return <Loading />;
    if (state.status === "gone") return <ErrorState variant="inline" what="this client" description="It is no longer in your view. It may have been removed." />;
    if (state.status === "error") return <ErrorState variant="inline" what="this client" description={state.message} onRetry={() => void reload()} />;
    const d = state.detail;
    const site = siteHref(d.website);
    const placementsHref = hrefWith(p.hrefs.placements, `client=${d.id}`);
    return (
      <div data-detail-body data-client-id={d.id}>
        <div className="flex items-start gap-3.5" data-client-head>
          <span className="grid h-[68px] w-[68px] flex-none place-items-center rounded-2xl bg-[var(--ent-kpi-indigo-bg)]">
            <CompanyTile name={d.name} size={56} />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h2 className="truncate text-[17px] font-bold leading-tight text-[var(--ent-title)]" data-client-title>
                {d.name}
              </h2>
              {d.access.canManage ? (
                <Menu
                  trigger={
                    <button type="button" aria-label="Status" data-status-menu className="inline-flex items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                      <Pill tone={STATUS_TONE[d.status] ?? "grey"} className="gap-1 !px-3 !py-1 !text-[12px] !font-medium" data-client-status={d.status}>
                        {STATUS_LABEL[d.status] ?? d.status}
                        <ChevronDownIcon aria-hidden size={12} />
                      </Pill>
                    </button>
                  }
                  items={Object.entries(STATUS_LABEL).map(([value, label]) => ({ label, onSelect: () => void changeStatus(d, value), disabled: value === d.status }))}
                />
              ) : (
                <Pill tone={STATUS_TONE[d.status] ?? "grey"} className="!px-3 !py-1 !text-[12px] !font-medium" data-client-status={d.status}>
                  {STATUS_LABEL[d.status] ?? d.status}
                </Pill>
              )}
            </div>
            {d.industry && <p className="mt-0.5 text-[12.5px] text-ink-soft">{d.industry}</p>}
            {d.website &&
              (site ? (
                <a href={site} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline">
                  {siteText(d.website)} <ExternalLinkIcon size={13} aria-hidden />
                </a>
              ) : (
                <p className="text-[12.5px] text-ink-soft">{siteText(d.website)}</p>
              ))}
          </div>
          {p.mode === "push" && (
            <button type="button" onClick={p.onClose} aria-label="Close client details" className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[var(--ent-nav-text)] hover:bg-paper-2">
              <XIcon size={18} aria-hidden />
            </button>
          )}
        </div>

        <p className="mt-2 text-[12px] leading-snug text-ink-soft" data-health-reason>
          <span className="font-semibold text-[var(--ent-nav-text)]">{d.health.level === "HEALTHY" ? "Healthy" : d.health.level === "AT_RISK" ? "At risk" : "Neutral"}:</span> {d.health.reason}
        </p>

        <Tabs value={p.tab} onValueChange={(v) => p.onTab(v as DrawerTab)} variant="underline" className="mt-3">
          <TabList aria-label="Client details">
            <Tab value="overview" className="!flex-1 !justify-center !px-1 !text-[12.5px]">Overview</Tab>
            <Tab value="contacts" className="!flex-1 !justify-center !px-1 !text-[12.5px]">Contacts ({d.contactCount})</Tab>
            <Tab value="requirements" className="!flex-1 !justify-center !px-1 !text-[12.5px]">Requirements ({d.requirementCount})</Tab>
          </TabList>
        </Tabs>

        <div className="pt-3.5" role="tabpanel" aria-label={p.tab}>
          {p.tab === "overview" && (
            <>
              {d.access.canManage && (
                <div className="-mt-1 mb-2 flex justify-end">
                  <button type="button" aria-pressed={editing} onClick={() => setEditing((e) => !e)} data-edit-toggle className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-accent-deep hover:bg-accent-soft">
                    <PencilIcon size={13} aria-hidden /> {editing ? "Done editing" : "Edit client"}
                  </button>
                </div>
              )}
              <Overview d={d} p={p} replace={replace} save={save} editing={editing} notesOpen={notesOpen} onNotesOpen={() => setNotesOpen(true)} onLeft={(c) => void markLeft(d, c)} />
            </>
          )}
          {p.tab === "contacts" && <ContactsTab d={d} onLeft={(c) => void markLeft(d, c)} onAdd={() => p.onAddContact(d)} />}
          {p.tab === "requirements" && <RequirementsTab d={d} jobsHref={p.hrefs.jobs} />}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5" data-drawer-actions>
          {d.access.canManage && (
            <Button type="button" variant="accent" className={`!min-h-10 !rounded-[10px] !text-[13px] ${d.access.canCreateRequirement ? "" : "col-span-2"}`} onClick={() => p.onAddContact(d)} data-add-contact>
              <UsersIcon size={16} aria-hidden /> Add Contact
            </Button>
          )}
          {d.access.canCreateRequirement && (
            <Button type="button" variant="ghost" className={`!min-h-10 !rounded-[10px] !border-[var(--ent-control-border)] !bg-white !text-[13px] !text-accent-deep ${d.access.canManage ? "" : "col-span-2"}`} onClick={() => p.onCreateRequirement(d)} data-create-requirement>
              <FileTextIcon size={16} aria-hidden /> Create Requirement
            </Button>
          )}
          {placementsHref && (
            <a href={placementsHref} data-view-placements className="col-span-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[var(--ent-control-border)] bg-white text-[13px] font-medium text-accent-deep hover:bg-accent-soft">
              <BriefcaseIcon size={16} aria-hidden /> View Placements
            </a>
          )}
        </div>
      </div>
    );
  })();

  const title = detail ? detail.name : "Client";

  if (p.mode === "sheet") {
    return (
      <BottomSheet id="ent-client-sheet" open={open} onClose={p.onClose} title={title} description={detail?.industry ?? undefined} returnFocusTo={p.returnFocusTo} defaultSnap="partial">
        {body}
      </BottomSheet>
    );
  }
  if (p.mode === "overlay") {
    return (
      <SideSheet id="ent-client-sheet" side="right" mode="overlay" width={440} open={open} onClose={p.onClose} title={title} returnFocusTo={p.returnFocusTo}>
        {body}
      </SideSheet>
    );
  }
  if (!open) return null;
  return (
    <aside aria-label={`${title} details`} data-client-drawer className="ent-card sticky top-3 max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto !rounded-[14px] p-3.5 ent-scroll">
      {body}
    </aside>
  );
}
