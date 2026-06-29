import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import BugTriageControl from "@/components/admin/BugTriageControl";

export const metadata: Metadata = {
  title: "Bug report · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

interface Report {
  id: number;
  source?: string | null;
  userLogin?: string | null;
  email?: string | null;
  message: string;
  category: string;
  severity?: string | null;
  status: string;
  url?: string | null;
  appVersion?: string | null;
  userAgent?: string | null;
  adminNotes?: string | null;
  createdDate?: string | null;
}

export default async function AdminBugReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const res = await serverApiFetch(`/api/admin/bug-reports/${id}`);
  if (res.status === 404) notFound();
  if (!res.ok) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link href="/admin/bug-reports" className="text-sm font-medium text-ink-soft hover:text-ink">← Bug reports</Link>
        <div className="mt-4 rounded-[var(--radius)] border border-line bg-paper p-6 text-sm text-ink-soft">Couldn&apos;t load this report.</div>
      </div>
    );
  }
  const r = (await res.json()) as Report;
  const when = r.createdDate ? r.createdDate.replace("T", " ").slice(0, 19) : "—";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/bug-reports" className="text-sm font-medium text-ink-soft hover:text-ink">← Bug reports</Link>

      <header className="mb-5 mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[24px] font-bold tracking-tight text-ink">{r.category} #{r.id}</h1>
        <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-ink-soft ring-1 ring-line">{r.source || "web"}</span>
      </header>

      <section className="mb-5 rounded-[var(--radius)] border border-line bg-paper p-5">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{r.message}</p>
      </section>

      <dl className="mb-5 grid gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line sm:grid-cols-2">
        <Detail label="From" value={r.userLogin || r.email || "anonymous"} />
        <Detail label="Reported" value={when} />
        <Detail label="URL" value={r.url || "—"} />
        <Detail label="App version" value={r.appVersion || "—"} />
        <Detail label="User agent" value={r.userAgent || "—"} wide />
      </dl>

      <BugTriageControl id={r.id} status={r.status} severity={r.severity ?? null} adminNotes={r.adminNotes ?? null} />
    </div>
  );
}

function Detail({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`bg-paper px-4 py-3 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{value}</dd>
    </div>
  );
}
