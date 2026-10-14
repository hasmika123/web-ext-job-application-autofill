"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, ErrorState, MailIcon, MemberAvatar, TableSkeleton } from "@kiwiply/ui";
import {
  clientsApi,
  dayText,
  errorSentence,
  relativeTime,
  REQUIREMENT_STATUS_LABEL,
  REQUIREMENT_TONE,
  ROLE_LABEL,
  type ActivityItem,
  type ClientQuery,
  type ContactRow,
  type Paged,
  type RequirementRow,
} from "@/lib/ent/clients";
import { CompanyTile, Pill } from "./parts";
import { Pagination } from "./ClientsTable";

type State<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: T };

function useLoaded<T>(load: () => Promise<{ ok: true; data: T } | { ok: false; status: number; code?: string; message: string; extra?: Record<string, unknown> }>, key: string, token: number) {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  const seq = useRef(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const run = useCallback(async (quiet: boolean) => {
    const mine = ++seq.current;
    if (!quiet) setState({ status: "loading" });
    const r = await loadRef.current();
    if (mine !== seq.current) return;
    setState(r.ok ? { status: "ok", data: r.data } : { status: "error", message: errorSentence(r) });
  }, []);
  useEffect(() => {
    void run(false);
  }, [run, key, token]);
  return { state, retry: () => void run(false) };
}

const hrefWith = (base: string | null, query: string) => (base ? `${base.split("?")[0]}?${query}` : null);

/** Every contact of every client: a work e-mail, a title and the client it belongs to. */
export function ContactsView({ orgId, query, token, onPage, onSize, onOpenClient, filtered }: { orgId: number; query: ClientQuery; token: number; onPage: (p: number) => void; onSize: (s: number) => void; onOpenClient: (id: number) => void; filtered: boolean }) {
  const { state, retry } = useLoaded<Paged<ContactRow>>(() => clientsApi.contacts(orgId, query), `${orgId}|${query.q}|${query.page}|${query.size}`, token);
  if (state.status === "loading") return <TableSkeleton count={6} columns={4} label="Loading contacts" />;
  if (state.status === "error") return <ErrorState what="the contacts" description={state.message} onRetry={retry} />;
  const { items, total } = state.data;
  if (items.length === 0) {
    return <EmptyState variant="page" mascot={false} title={filtered ? "No contacts match" : "No contacts yet"} description={filtered ? "Try a different search." : "Add the people you work with from a client's drawer."} />;
  }
  return (
    <div data-contacts-view>
      <div className="ent-card overflow-hidden !rounded-[14px]">
        <ul aria-label="Contacts" className="divide-y divide-[var(--ent-table-line)]">
          {items.map((c) => (
            <li key={c.id} data-contact-row={c.id} className="grid grid-cols-[34px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[34px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <MemberAvatar name={c.name} size={34} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-[var(--ent-title)]">{c.name}</p>
                <p className="truncate text-[12px] text-ink-soft">{c.title ?? (c.role ? ROLE_LABEL[c.role] : "")}</p>
              </div>
              <button type="button" onClick={() => onOpenClient(c.client.id)} className="col-start-2 flex min-w-0 items-center gap-2 text-left sm:col-start-auto" aria-label={`Open ${c.client.name}`}>
                <CompanyTile name={c.client.name} size={24} />
                <span className="truncate text-[12.5px] font-medium text-accent-deep hover:underline">{c.client.name}</span>
              </button>
              <p className="col-start-2 min-w-0 truncate text-[12.5px] text-ink-soft sm:col-start-auto">{c.email ?? "No e-mail"}</p>
              <div className="col-start-2 flex items-center gap-2 sm:col-start-auto">
                <span className="hidden text-[12px] text-muted lg:inline">{dayText(c.addedAt)}</span>
                {c.email && (
                  <a href={`mailto:${c.email}`} aria-label={`E-mail ${c.name}`} title={c.email} className="grid h-8 w-8 place-items-center rounded-lg text-accent hover:bg-accent-soft">
                    <MailIcon size={17} aria-hidden />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <Pagination page={query.page} size={query.size} total={total} shown={items.length} onPage={onPage} onSize={onSize} noun="contact" />
    </div>
  );
}

/** Every requirement of every client (a requirement is a Jobs row). */
export function RequirementsView({ orgId, query, token, onPage, onSize, onOpenClient, jobsHref, filtered }: { orgId: number; query: ClientQuery; token: number; onPage: (p: number) => void; onSize: (s: number) => void; onOpenClient: (id: number) => void; jobsHref: string | null; filtered: boolean }) {
  const { state, retry } = useLoaded<Paged<RequirementRow>>(() => clientsApi.requirements(orgId, query), `${orgId}|${query.q}|${query.page}|${query.size}`, token);
  if (state.status === "loading") return <TableSkeleton count={6} columns={4} label="Loading requirements" />;
  if (state.status === "error") return <ErrorState what="the requirements" description={state.message} onRetry={retry} />;
  const { items, total } = state.data;
  if (items.length === 0) {
    return <EmptyState variant="page" mascot={false} title={filtered ? "No requirements match" : "No requirements yet"} description={filtered ? "Try a different search." : "Requirements your clients send you appear here."} />;
  }
  return (
    <div data-requirements-view>
      <div className="ent-card overflow-hidden !rounded-[14px]">
        <ul aria-label="Requirements" className="divide-y divide-[var(--ent-table-line)]">
          {items.map((r) => {
            const href = hrefWith(jobsHref, `job=${r.id}`);
            return (
              <li key={r.id} data-requirement-row={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_90px_100px]">
                <div className="min-w-0">
                  {href ? (
                    <a href={href} className="truncate text-[13px] font-semibold text-[var(--ent-title)] hover:underline">
                      {r.title}
                    </a>
                  ) : (
                    <p className="truncate text-[13px] font-semibold text-[var(--ent-title)]">{r.title}</p>
                  )}
                  <p className="truncate text-[12px] text-ink-soft">{r.location ?? ""}</p>
                </div>
                <Pill tone={REQUIREMENT_TONE[r.status] ?? "grey"} className="justify-self-end !px-3 !py-1 !text-[12px] !font-medium sm:order-3 sm:justify-self-start">
                  {REQUIREMENT_STATUS_LABEL[r.status] ?? r.status}
                </Pill>
                <button type="button" onClick={() => onOpenClient(r.client.id)} className="col-span-2 flex min-w-0 items-center gap-2 text-left sm:order-2 sm:col-span-1" aria-label={`Open ${r.client.name}`}>
                  <CompanyTile name={r.client.name} size={24} />
                  <span className="truncate text-[12.5px] font-medium text-accent-deep hover:underline">{r.client.name}</span>
                </button>
                <p className="hidden text-[12px] text-ink-soft sm:order-4 sm:block">
                  {r.filled}/{r.positions} filled
                </p>
                <p className="hidden text-[12px] text-ink-soft sm:order-5 sm:block">{dayText(r.postedAt)}</p>
              </li>
            );
          })}
        </ul>
      </div>
      <Pagination page={query.page} size={query.size} total={total} shown={items.length} onPage={onPage} onSize={onSize} noun="requirement" />
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { client: "New client", contact: "Contact", note: "Note", requirement: "Requirement", submission: "Submission", placement: "Placement" };
const KIND_TONE: Record<string, string> = { client: "purple", contact: "blue", note: "amber", requirement: "green", submission: "blue", placement: "green" };

/** The newest happenings across every client, merged from the rows that record them. */
export function ActivityView({ orgId, token, onOpenClient }: { orgId: number; token: number; onOpenClient: (id: number) => void }) {
  const [limit, setLimit] = useState(30);
  const { state, retry } = useLoaded<{ items: ActivityItem[] }>(() => clientsApi.activity(orgId, limit), `${orgId}|${limit}`, token);
  if (state.status === "loading") return <TableSkeleton count={6} columns={3} label="Loading activity" />;
  if (state.status === "error") return <ErrorState what="the activity" description={state.message} onRetry={retry} />;
  const { items } = state.data;
  if (items.length === 0) return <EmptyState variant="page" mascot={false} title="No activity yet" description="New clients, contacts, notes, requirements and placements show up here as they happen." />;
  return (
    <div data-activity-view>
      <div className="ent-card !rounded-[14px] p-4">
        <ol aria-label="Client activity" className="space-y-3.5">
          {items.map((a, i) => (
            <li key={`${a.at}-${i}`} className="flex gap-3" data-activity-row>
              <span aria-hidden className="mt-1.5 h-2 w-2 flex-none rounded-full bg-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-[var(--ent-nav-text)]">{a.summary}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                  <Pill tone={KIND_TONE[a.kind] ?? "grey"} className="!px-2 !py-0.5 !text-[11px] !font-medium">
                    {KIND_LABEL[a.kind] ?? a.kind}
                  </Pill>
                  {a.actor ? `${a.actor} · ` : ""}
                  {relativeTime(a.at)}
                  <button type="button" onClick={() => onOpenClient(a.client.id)} className="font-medium text-accent-deep hover:underline">
                    Open {a.client.name}
                  </button>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      {items.length >= limit && limit < 100 && (
        <div className="mt-3 text-center">
          <button type="button" onClick={() => setLimit((n) => Math.min(100, n + 30))} className="rounded-lg border border-[var(--ent-control-border)] bg-white px-4 py-2 text-[13px] font-medium text-accent-deep hover:bg-accent-soft">
            Show more
          </button>
        </div>
      )}
    </div>
  );
}
