"use client";

import { useEffect, useState } from "react";
import LocalDate from "@/components/LocalDate";
import { cn } from "@/lib/cn";

/**
 * "Emails" in an application's panel (Phase 14.4b): the mail the connected inbox matched to this
 * application, newest first — who, when, what it was read as, and the status it moved the
 * application to, if it did. Shows nothing until there's something to show (no inbox, or no mail
 * about this job yet), so the panel stays quiet for everyone else.
 */

interface Mail {
  id: number;
  direction: "IN" | "OUT";
  subject: string | null;
  fromName: string | null;
  fromAddress: string | null;
  sentAt: string | null;
  category: string | null;
  statusChange: string | null;
  classifiedBy: string | null;
  snippet: string | null;
}

const READ_AS: Record<string, string> = {
  APPLIED: "Confirmation",
  INTERVIEW: "Interview",
  ASSESSMENT: "Assessment",
  REJECTED: "Rejection",
  OFFER: "Offer",
};
const STATUS: Record<string, string> = { APPLIED: "Applied", INTERVIEW: "Interview", OFFER: "Offer", REJECTED: "Rejected" };
const WHEN = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;

export default function ApplicationEmails({ appId }: { appId: number }) {
  const [mail, setMail] = useState<Mail[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/applications/${appId}/mail`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Mail[]) => {
        if (live) setMail(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (live) setMail([]);
      });
    return () => {
      live = false;
    };
  }, [appId]);

  if (!mail || mail.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="font-display text-base font-semibold text-ink">Emails</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {mail.map((m) => {
          const who = m.direction === "OUT" ? "You" : m.fromName || m.fromAddress || "Unknown sender";
          const readAs = m.category ? READ_AS[m.category] : null;
          return (
            <li key={m.id} className="rounded-[var(--radius)] border border-line p-3">
              <button
                type="button"
                onClick={() => setOpen((o) => (o === m.id ? null : m.id))}
                aria-expanded={open === m.id}
                disabled={!m.snippet}
                className="w-full text-left disabled:cursor-default"
              >
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{m.subject || "(no subject)"}</span>
                  {m.sentAt && (
                    <span className="flex-none text-[11.5px] text-muted">
                      <LocalDate iso={m.sentAt} options={WHEN} />
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                  <span className="truncate">{who}</span>
                  {readAs && (
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", m.category === "REJECTED" ? "bg-brown-soft text-brown-deep" : "bg-accent-soft text-accent-deep")}>
                      {readAs}
                    </span>
                  )}
                  {m.statusChange && STATUS[m.statusChange] && <span className="font-semibold text-ink-soft">→ moved to {STATUS[m.statusChange]}</span>}
                  {m.classifiedBy === "UNSURE" && <span title="Kiwiply couldn't tell what this email means, so it didn't change anything.">not sure what this means</span>}
                </div>
              </button>
              {open === m.id && m.snippet && <p className="mt-2 border-t border-line pt-2 text-[12.5px] leading-relaxed text-ink-soft">{m.snippet}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
