"use client";

import { useCallback, useState } from "react";
import { ErrorState, LockIcon, MailIcon, ShieldIcon, Skeleton, cn } from "@kiwiply/ui";
import InboxConnect, { type InboxLinks } from "@/components/settings/InboxConnect";
import PageHeader from "@/components/ent/shell/ShellContext";
import LocalDate from "@/components/LocalDate";
import { Card, Empty, Pill, useWorkspaceData } from "./parts";
import { acceptLabel, actOnSuggestion, fetchConsultantInbox, inboxEndpoints, stageTone, type ConsultantInboxView, type InboxSuggestion, type InboxUpdate } from "@/lib/ent/consultant-ws/inbox";

/**
 * Inbox (docs/enterprise-v2/18-consultant-inbox.md): the consultant's OWN Gmail, connected the same guided way as on kiwiply.com (a Gmail just for
 * job hunting, 2-Step Verification, an app password, a live check against Gmail), so that replies from employers move their applications by
 * themselves. One call to `GET /api/orgs/{orgId}/me-workspace/inbox` (through the BFF) draws the page.
 *
 * The privacy line is part of the page, in words: only the consultant sees the mail; the organization sees the stage an application reached and
 * nothing the mail said. Nothing here is shown to anyone else: the routes answer the consultant and are the generic 404 for every other member.
 */

/** Every link inside the connect guide stays on THIS organization's host: its own privacy policy (docs/enterprise-v2/62), the consultant's profile, and no pricing page (the license decides). */
const TENANT_INBOX_LINKS: InboxLinks = { privacy: "/privacy", profile: "/w/consultant/profile", pricing: "/w/consultant/features", appName: "This workspace" };

const WHEN = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;
const BTN = "inline-flex min-h-8 items-center rounded-lg px-3.5 text-[13px] font-semibold disabled:opacity-60";

function PrivacyCard() {
  return (
    <section data-inbox-privacy aria-label="Who can see your inbox" className="flex gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-4 text-[13px] text-ink-soft">
      <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-full bg-accent-soft text-accent-deep">
        <ShieldIcon size={18} />
      </span>
      <div className="min-w-0">
        <h3 className="text-[14px] font-bold text-ink">Only you see your mail</h3>
        <p className="mt-1 leading-relaxed">
          This is your own Gmail, connected with an app password that is kept encrypted and never shown again. Your organization, your marketer and
          your administrators never see the password, the address, a subject, a sender or a word of a message. They only see the stage an application
          reaches (for example, Interview), the same as if you had updated it yourself. This workspace only reads; it never sends, moves or deletes mail.
        </p>
      </div>
    </section>
  );
}

function Locked() {
  return (
    <section data-inbox-locked aria-label="Inbox tracking is not included" className="rounded-[var(--radius-lg)] border border-line bg-paper p-6">
      <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full bg-paper-2 text-muted">
        <LockIcon size={20} />
      </span>
      <h2 className="mt-3 text-[16px] font-bold text-ink">Inbox tracking isn&apos;t part of your license</h2>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-soft">
        Inbox tracking reads replies from employers in your own Gmail and moves your applications for you. Your organization&apos;s license doesn&apos;t
        include it. Ask your administrator to add Inbox monitoring to your license, and this page will let you connect your Gmail.
      </p>
    </section>
  );
}

function SuggestionRow({ s, busy, onAct }: { s: InboxSuggestion; busy: boolean; onAct: (id: number, action: "accept" | "dismiss") => void }) {
  return (
    <li data-suggestion={s.id} className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-bold text-ink">{s.company || "A company"}</span>
          {s.role ? <span className="text-[13px] text-ink-soft">{s.role}</span> : null}
          <Pill tone={stageTone(s.stage)}>{s.stage === "SAVED" ? "Seen in mail" : s.stage === "IN_REVIEW" ? "Under review" : s.stage.charAt(0) + s.stage.slice(1).toLowerCase()}</Pill>
        </div>
        <p className="mt-0.5 truncate text-[12.5px] text-muted">
          {s.fromName || s.fromAddress} · {s.subject}
          {s.sentAt ? (
            <>
              {" · "}
              <LocalDate iso={s.sentAt} options={WHEN} />
            </>
          ) : null}
        </p>
      </div>
      <div className="flex flex-none gap-2">
        <button type="button" data-action="accept" disabled={busy} onClick={() => onAct(s.id, "accept")} className={cn(BTN, "bg-accent text-white hover:bg-accent-deep")}>
          {acceptLabel(s.stage)}
        </button>
        <button type="button" data-action="dismiss" disabled={busy} onClick={() => onAct(s.id, "dismiss")} className={cn(BTN, "border border-line bg-paper text-ink-soft hover:bg-paper-2")}>
          Dismiss
        </button>
      </div>
    </li>
  );
}

function UpdateRow({ u }: { u: InboxUpdate }) {
  return (
    <li data-update={u.applicationId} data-stage={u.stage} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 first:border-t-0">
      <div className="min-w-0">
        <span className="text-[14px] font-bold text-ink">{u.company}</span>
        {u.role ? <span className="ml-2 text-[13px] text-ink-soft">{u.role}</span> : null}
        <p className="mt-0.5 text-[12.5px] text-muted">
          {u.reading ? `${u.reading} · ` : ""}
          {u.at ? <LocalDate iso={u.at} options={WHEN} /> : null}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Pill tone={stageTone(u.stage)}>{u.stageLabel}</Pill>
        <span data-from-inbox className="rounded-md bg-paper-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
          from your inbox
        </span>
      </div>
    </li>
  );
}

export default function InboxPage({ orgId }: { orgId: number; firstName?: string }) {
  const { view, status, reload } = useWorkspaceData(useCallback(() => fetchConsultantInbox(orgId), [orgId]));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function act(id: number, action: "accept" | "dismiss") {
    setBusy(true);
    setNote(null);
    const r = await actOnSuggestion(orgId, id, action);
    setBusy(false);
    if (!r.ok) setNote(r.message);
    await reload();
  }

  if (status === "denied")
    return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  const v: ConsultantInboxView | null = view;
  return (
    <div data-consultant-inbox data-status={status} data-entitled={v ? String(v.entitled) : undefined} data-connection={v?.inbox.connected ? (v.inbox.status ?? "CONNECTED") : v ? "NONE" : undefined} className="flex max-w-3xl flex-col gap-4 sm:gap-5">
      <PageHeader title="Inbox" subtitle="Connect the Gmail you apply from, and your applications update themselves when employers write back." />

      {status === "failed" ? (
        <ErrorState what="your inbox" description="Your inbox page didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : !v ? (
        <div className="grid gap-4" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : (
        <>
          <PrivacyCard />
          <InboxConnect
            isPro={v.entitled || v.inbox.connected}
            view={v.inbox}
            endpoints={inboxEndpoints(orgId)}
            locked={<Locked />}
            onChanged={() => void reload()}
            links={TENANT_INBOX_LINKS}
          />
          {v.inbox.connected && v.entitled && v.inbox.status !== "NEEDS_RECONNECT" ? (
            <>
              {note ? (
                <p role="alert" className="text-[13px] font-medium text-danger-text">
                  {note}
                </p>
              ) : null}
              <Card id="inbox-suggestions" title="Found in your mail" icon={MailIcon} tone="accent">
                {v.suggestions.length === 0 ? (
                  <Empty>Nothing new. Jobs your mail shows that your board doesn&apos;t track yet will appear here.</Empty>
                ) : (
                  <ul data-suggestions>
                    {v.suggestions.map((s) => (
                      <SuggestionRow key={s.id} s={s} busy={busy} onAct={(id, a) => void act(id, a)} />
                    ))}
                  </ul>
                )}
              </Card>
            </>
          ) : null}
          {v.inbox.connected ? (
            <Card id="inbox-updates" title="Applications your mail is tracking" icon={MailIcon} tone="green">
              {v.updates.length === 0 ? (
                <Empty>None of your applications has a matching email yet.</Empty>
              ) : (
                <ul data-updates>
                  {v.updates.map((u) => (
                    <UpdateRow key={u.applicationId} u={u} />
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
