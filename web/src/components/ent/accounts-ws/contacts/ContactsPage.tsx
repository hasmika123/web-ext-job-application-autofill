"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, EmptyState, ErrorState, Input, MailIcon, PhoneIcon, PlusIcon, Select, Skeleton, useToast } from "@kiwiply/ui";
import PageHeader, { ClaimsMascot } from "@/components/ent/shell/ShellContext";
import TalentPagination from "@/components/ent/shell/TalentPagination";
import { clientsApi, errorSentence, PAGE_SIZES, relativeTime, ROLE_LABEL, showingText, type ContactRow, type Paged } from "@/lib/ent/clients";
import { requirementsApi, type ClientOption } from "@/lib/ent/accounts-ws/requirements";
import type { AccountsPageProps } from "../parts";
import ContactFormDialog from "./ContactFormDialog";

/**
 * Contacts (Account Manager): the people at your clients. Search by name, title, e-mail or client; filter by client; add, edit, and mark someone as having
 * left (and back). Business data only: a work e-mail, a work phone and a short note. A card on a phone, a row on a desktop.
 */

type Phase = "loading" | "ready" | "failed" | "denied";

export default function ContactsPage({ orgId }: AccountsPageProps) {
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [clientId, setClientId] = useState("");
  const [pageNo, setPageNo] = useState(0);
  const [size, setSize] = useState<number>(10);
  const [data, setData] = useState<Paged<ContactRow> | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [dialog, setDialog] = useState<{ editing: ContactRow | null } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const r = await clientsApi.contactList(orgId, { q, clientId, page: pageNo, size });
    if (mine !== seq.current) return;
    if (!r.ok) {
      if (r.status === 404) setPhase("denied");
      else setPhase((p) => (p === "ready" ? p : "failed"));
      return;
    }
    setData(r.data);
    setPhase("ready");
  }, [orgId, q, clientId, pageNo, size]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // the client choices and what the caller may do come once
  useEffect(() => {
    let live = true;
    void Promise.all([requirementsApi.summary(orgId), clientsApi.summary(orgId)]).then(([s, c]) => {
      if (!live) return;
      if (s.ok) setClients(s.data.clientOptions);
      if (c.ok) setCanManage(c.data.access.canManage);
    });
    return () => {
      live = false;
    };
  }, [orgId]);

  // the search box waits for a pause in typing before it asks the server
  useEffect(() => {
    const t = setTimeout(() => {
      setQ((cur) => (cur === typed ? cur : typed));
      setPageNo(0);
    }, 300);
    return () => clearTimeout(t);
  }, [typed]);

  async function toggleLeft(c: ContactRow) {
    setBusyId(c.id);
    const r = await clientsApi.patchContact(orgId, c.client.id, c.id, { status: c.status === "LEFT" ? "ACTIVE" : "LEFT" });
    setBusyId(null);
    if (!r.ok) {
      toast({ title: "Couldn't change the contact", description: errorSentence(r), variant: "error" });
      return;
    }
    toast({ title: c.status === "LEFT" ? `${c.name} is back at ${c.client.name}` : `${c.name} marked as left`, variant: "success" });
    void load();
  }

  if (phase === "denied") return <ErrorState what="the Contacts page" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  const header = (
    <>
      <PageHeader title="Contacts" subtitle="The people at your clients: who sends you requirements and who decides." />
      <ClaimsMascot />
    </>
  );
  if (phase === "failed") {
    return (
      <div data-contacts-page data-status="failed">
        {header}
        <ErrorState what="your contacts" description="Your contacts didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );
  }

  const loading = phase === "loading";
  const rows = data?.items ?? [];
  const filtered = q.trim().length >= 2 || !!clientId;

  return (
    <div data-contacts-page data-status={phase} className="flex flex-col gap-4 sm:gap-5">
      {header}
      <section aria-label="Contacts" className="min-w-0 rounded-[var(--radius-lg)] border border-line bg-paper p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <div className="min-w-[12rem] flex-1">
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search name, title, e-mail or client" aria-label="Search contacts" maxLength={80} />
          </div>
          <div className="min-w-[10rem]">
            <Select
              value={clientId}
              onChange={(v) => {
                setClientId(v);
                setPageNo(0);
              }}
              aria-label="Client"
              options={[{ value: "", label: "Any client" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))]}
            />
          </div>
          {canManage && (
            <Button type="button" onClick={() => setDialog({ editing: null })} data-add-contact>
              <PlusIcon size={16} aria-hidden /> Add contact
            </Button>
          )}
        </div>

        {loading ? (
          <div aria-busy="true" className="space-y-3 py-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState
              variant="inline"
              title="No contacts match"
              description="Try a different search or another client."
              action={
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setTyped("");
                    setQ("");
                    setClientId("");
                    setPageNo(0);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No contacts yet"
              description="Add the people at your clients: the hiring manager who sends requirements, the recruiter, the vendor admin."
              action={
                canManage ? (
                  <Button type="button" onClick={() => setDialog({ editing: null })}>
                    Add contact
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <ul aria-label="Contacts list" data-contacts-list className="divide-y divide-line">
            {rows.map((c) => (
              <li
                key={c.id}
                data-contact-row={c.id}
                className={`flex flex-col gap-2 px-1 py-3 md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_auto] md:items-center md:gap-3 ${c.status === "LEFT" ? "opacity-70" : ""}`}
              >
                <div className="min-w-0">
                  <h3 className="truncate text-[14.5px] font-bold text-ink" data-contact-name>
                    {c.name}
                    {c.status === "LEFT" && (
                      <span className="ent-pill ml-2 align-middle" data-tone="grey" data-shape="round">
                        Left
                      </span>
                    )}
                  </h3>
                  <p className="truncate text-[13px] text-ink-soft">
                    {[c.title, c.role ? (ROLE_LABEL[c.role] ?? c.role) : null].filter(Boolean).join(" · ") || "No title"}
                  </p>
                </div>
                <div className="min-w-0 text-[13px] text-ink-soft">
                  <p className="truncate font-semibold text-ink">{c.client.name}</p>
                  <p className="text-[11.5px] text-muted">Added {relativeTime(c.addedAt)}</p>
                </div>
                <div className="min-w-0 space-y-0.5 text-[13px] text-ink-soft">
                  {c.email ? (
                    <p className="flex items-center gap-1.5 truncate">
                      <MailIcon size={13} aria-hidden />
                      <a href={`mailto:${c.email}`} className="truncate underline-offset-2 hover:underline">
                        {c.email}
                      </a>
                    </p>
                  ) : null}
                  {c.phone ? (
                    <p className="flex items-center gap-1.5">
                      <PhoneIcon size={13} aria-hidden />
                      <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`} className="underline-offset-2 hover:underline">
                        {c.phone}
                      </a>
                    </p>
                  ) : null}
                  {!c.email && !c.phone ? <p className="text-muted">No e-mail or phone</p> : null}
                  {c.notes ? (
                    <p className="line-clamp-2 text-[12px] text-muted" title={c.notes}>
                      {c.notes}
                    </p>
                  ) : null}
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDialog({ editing: c })} aria-label={`Edit ${c.name}`}>
                      Edit
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={busyId === c.id} onClick={() => void toggleLeft(c)} aria-label={c.status === "LEFT" ? `${c.name} is back at the client` : `Mark ${c.name} as left`}>
                      {c.status === "LEFT" ? "Back at client" : "Mark as left"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {!loading && data && data.total > 0 && (
          <TalentPagination
            className="mt-3 px-1"
            page={pageNo}
            size={size}
            total={data.total}
            showing={showingText(data.total, data.page, data.size, rows.length, "contact")}
            sizes={PAGE_SIZES}
            onPage={setPageNo}
            onSize={(s) => {
              setSize(s);
              setPageNo(0);
            }}
          />
        )}
      </section>

      <ContactFormDialog
        orgId={orgId}
        open={dialog !== null}
        editing={dialog?.editing ?? null}
        clients={clients}
        onClose={() => setDialog(null)}
        onSaved={(name, created) => {
          setDialog(null);
          toast({ title: created ? `${name} added` : "Changes saved", variant: "success" });
          void load();
        }}
      />
    </div>
  );
}
