import Link from "next/link";
import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import { isTopic, TOPIC_LABELS } from "@/lib/catalog";
import InquiryFollowUp from "@/components/admin/InquiryFollowUp";

export const metadata: Metadata = {
  title: "Inquiries · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 30;

interface Inquiry {
  id: number;
  topic: string;
  name: string;
  email: string;
  company?: string | null;
  teamSize?: string | null;
  message?: string | null;
  userLogin?: string | null;
  status: string;
  adminNotes?: string | null;
  createdDate?: string | null;
}

const TABS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "NEW", label: "New" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" },
];

/** "Contact us" requests from /pricing and /contact (Phase 15.6). */
export default async function AdminInquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? (sp.status ?? "") : "";
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const statusQs = status ? `status=${status}&` : "";

  const [listRes, countsRes] = await Promise.all([
    serverApiFetch(`/api/admin/inquiries?${statusQs}page=${page}&size=${PAGE_SIZE}&sort=createdDate,desc`),
    serverApiFetch("/api/admin/inquiries/counts"),
  ]);

  let rows: Inquiry[] = [];
  let total = 0;
  let error = false;
  if (listRes.ok) {
    rows = ((await listRes.json().catch(() => [])) as Inquiry[]) ?? [];
    total = Number.parseInt(listRes.headers.get("x-total-count") ?? "0", 10) || 0;
  } else {
    error = true;
  }
  const counts = countsRes.ok ? ((await countsRes.json().catch(() => ({}))) as Record<string, number>) : {};
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const tabCount = (key: string) => (key === "" ? allCount : counts[key] ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Inquiries</h1>
        <p className="mt-1 text-sm text-ink-soft">
          &ldquo;Contact us&rdquo; requests for Autopilot, organizations, consultancies and services. Reply by email, then set a status.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.key === status;
          return (
            <Link
              key={t.key || "all"}
              href={`/admin/inquiries${t.key ? `?status=${t.key}` : ""}`}
              className={
                active
                  ? "rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-paper"
                  : "rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper-2"
              }
            >
              {t.label} <span className={active ? "text-paper/70" : "text-ink-soft/70"}>({tabCount(t.key)})</span>
            </Link>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-[var(--radius)] border border-line bg-paper p-6 text-sm text-ink-soft">Couldn&apos;t load inquiries.</div>
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-line bg-paper p-8 text-center text-sm text-ink-soft">No inquiries.</div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-[var(--radius)] border border-line bg-paper p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-ink">{r.name}</span>
                  <a href={`mailto:${r.email}`} className="text-sm text-accent-deep hover:underline">
                    {r.email}
                  </a>
                  {r.userLogin && <span className="text-[12px] text-muted">· account {r.userLogin}</span>}
                </div>
                <span className="text-[12px] text-muted">{(r.createdDate ?? "").slice(0, 10) || "—"}</span>
              </div>
              <p className="mt-1 text-[13px] text-ink-soft">
                <span className="font-semibold text-ink">{isTopic(r.topic) ? TOPIC_LABELS[r.topic] : r.topic}</span>
                {r.company && <> · {r.company}</>}
                {r.teamSize && <> · {r.teamSize} people</>}
              </p>
              {r.message && <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{r.message}</p>}
              <InquiryFollowUp id={r.id} status={r.status} adminNotes={r.adminNotes ?? null} />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          <PageLink status={status} page={page - 1} disabled={page <= 0} label="← Previous" />
          <span className="text-ink-soft">
            Page {page + 1} of {totalPages}
          </span>
          <PageLink status={status} page={page + 1} disabled={page + 1 >= totalPages} label="Next →" />
        </nav>
      )}
    </div>
  );
}

function PageLink({ status, page, disabled, label }: { status: string; page: number; disabled: boolean; label: string }) {
  if (disabled) return <span className="rounded-[var(--radius)] border border-line px-3 py-1.5 text-ink-soft/50">{label}</span>;
  const qs = `${status ? `status=${status}&` : ""}page=${page}`;
  return (
    <Link href={`/admin/inquiries?${qs}`} className="rounded-[var(--radius)] border border-line px-3 py-1.5 font-medium text-ink hover:bg-paper-2">
      {label}
    </Link>
  );
}
