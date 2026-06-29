import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin · Kiwiply",
  robots: { index: false, follow: false },
};

type Section = { title: string; desc: string; status: "Live" | "Soon"; href?: string };

// The admin console build-out (Phase 9). Each lights up as its phase lands; this Overview
// will gain real KPIs in A3 (business analytics).
const SECTIONS: Section[] = [
  { title: "Users", desc: "Browse accounts and status. Detail actions land next.", status: "Live", href: "/admin/users" },
  { title: "AI usage", desc: "Per-user drafting usage and quota overrides.", status: "Soon" },
  { title: "Security & sessions", desc: "Active refresh-token families; revoke / force logout.", status: "Soon" },
  { title: "Analytics", desc: "Signups, activation rate, DAU/WAU, funnel.", status: "Soon" },
  { title: "Email", desc: "Newsletter subscribers, consent, export, Brevo sync.", status: "Soon" },
  { title: "Bug reports", desc: "Triage queue for reports from web + extension.", status: "Soon" },
  { title: "System", desc: "Health, metrics, log levels, build info (read-only).", status: "Soon" },
  { title: "Audit log", desc: "Every admin action and reason-gated PII access.", status: "Soon" },
];

export default function AdminOverviewPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-7">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Admin overview</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Operate Kiwiply — accounts, AI usage, security, comms, and the audit trail. Live metrics land with
          the analytics phase; sections below open up as they ship.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => {
          const inner = (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold text-ink">{s.title}</h2>
                <StatusPill status={s.status} />
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{s.desc}</p>
            </>
          );
          return s.href ? (
            <Link
              key={s.title}
              href={s.href}
              className="rounded-[var(--radius)] border border-line bg-paper p-5 transition-colors hover:border-ink"
            >
              {inner}
            </Link>
          ) : (
            <div key={s.title} className="rounded-[var(--radius)] border border-line bg-paper p-5">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Section["status"] }) {
  const live = status === "Live";
  return (
    <span
      className={
        live
          ? "rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-accent"
          : "rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft"
      }
    >
      {status}
    </span>
  );
}
