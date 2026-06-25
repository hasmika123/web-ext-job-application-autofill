import Link from "next/link";
import { serverApiFetch } from "@/lib/api";
import { buttonVariants } from "@/components/ui/Button";
import type { Application } from "@/components/ApplicationBoard";

/**
 * Dashboard — the authed home (post-login redirect target). KPI row, a "finish setting
 * up" activation checklist, quick actions, and a recent-activity feed that surfaces the
 * "Draft — confirm?" nudge. All read-only/server-rendered from the existing APIs; the
 * board owns the mutations. Session gate + nav live in the `(app)` shell.
 */

type Account = { login?: string; email?: string; firstName?: string };
type Bio = Record<string, unknown>;

const APPLIED_STATUSES = new Set(["APPLIED", "INTERVIEW", "OFFER", "REJECTED"]);

function isTruthy(v: unknown): boolean {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

function relTime(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function statusPill(status: string): { label: string; cls: string } {
  switch (status) {
    case "DRAFT":
      return { label: "Draft — confirm?", cls: "bg-brown-soft text-brown-deep" };
    case "SAVED":
      return { label: "Saved", cls: "bg-paper-2 text-ink-soft" };
    case "APPLIED":
      return { label: "Applied", cls: "bg-accent-soft text-accent-deep" };
    case "INTERVIEW":
      return { label: "Interview", cls: "bg-[#dbeafe] text-[#1d4ed8]" };
    case "OFFER":
      return { label: "Offer", cls: "bg-accent text-on-accent" };
    case "REJECTED":
      return { label: "Rejected", cls: "bg-paper-2 text-muted" };
    default:
      return { label: status, cls: "bg-paper-2 text-ink-soft" };
  }
}

function Kpi({ label, value, note, warn }: { label: string; value: string; note: string; warn?: boolean }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-[18px] shadow-[var(--shadow)]">
      <div className="text-[12.5px] font-semibold text-muted">{label}</div>
      <div className="mt-1.5 font-display text-[30px] font-bold text-ink">{value}</div>
      <div className={`mt-1 text-xs font-semibold ${warn ? "text-warn" : "text-accent-deep"}`}>{note}</div>
    </div>
  );
}

function PanelCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[var(--radius-lg)] border border-line bg-paper p-[22px] shadow-[var(--shadow)] ${className ?? ""}`}>
      {children}
    </div>
  );
}

export default async function DashboardPage() {
  const [accountRes, appsRes, resumesRes, profileRes] = await Promise.all([
    serverApiFetch("/api/account"),
    serverApiFetch("/api/profile/applications"),
    serverApiFetch("/api/profile/resumes"),
    serverApiFetch("/api/profile"),
  ]);

  const account: Account | null = accountRes.ok ? await accountRes.json().catch(() => null) : null;
  const applications: Application[] = appsRes.ok ? ((await appsRes.json().catch(() => [])) as Application[]) : [];
  const resumes: unknown[] = resumesRes.ok ? ((await resumesRes.json().catch(() => [])) as unknown[]) : [];

  let bio: Bio = {};
  if (profileRes.ok) {
    const dto = (await profileRes.json().catch(() => null)) as { payload?: string } | null;
    if (dto?.payload) {
      try {
        const parsed = JSON.parse(dto.payload);
        if (parsed && typeof parsed === "object") bio = parsed as Bio;
      } catch {
        /* empty/corrupt bio — treat as not-set */
      }
    }
  }

  // KPIs
  const appliedCount = applications.filter((a) => APPLIED_STATUSES.has(a.status)).length;
  const interviewCount = applications.filter((a) => a.status === "INTERVIEW" || a.status === "OFFER").length;
  const offerCount = applications.filter((a) => a.status === "OFFER").length;
  const savedCount = applications.filter((a) => a.status === "SAVED").length;
  const draftCount = applications.filter((a) => a.status === "DRAFT").length;
  const responseRate = appliedCount > 0 ? Math.round((interviewCount / appliedCount) * 100) : 0;

  // Setup checklist (verifiable items drive the %; extension install is a tip).
  const checklist = [
    { label: "Add your contact details", hint: "Name, email, phone — the basics every form asks for", done: isTruthy(bio.firstName) && isTruthy(bio.email), href: "/profile", cta: "Add" },
    { label: "Upload a resume", hint: "Kiwiply parses it so the right details autofill", done: resumes.length > 0, href: "/resumes", cta: "Upload" },
    { label: "Answer work-authorization questions", hint: "Speeds up Workday & Greenhouse forms", done: isTruthy(bio.authorizedToWork), href: "/profile", cta: "Add" },
  ];
  const doneCount = checklist.filter((i) => i.done).length;
  const pct = Math.round((doneCount / checklist.length) * 100);

  // Recent activity — newest first by appliedAt/createdAt.
  const recent = [...applications]
    .sort((a, b) => {
      const ta = new Date(a.appliedAt || a.createdAt || 0).getTime();
      const tb = new Date(b.appliedAt || b.createdAt || 0).getTime();
      return tb - ta;
    })
    .slice(0, 6);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Topbar */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[.08em] text-muted">Home</div>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink">
            Welcome back{account?.firstName ? `, ${account.firstName}` : ""}
          </h1>
        </div>
        <Link href="/board" className={buttonVariants("accent")}>
          Go to board
        </Link>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-[15px] lg:grid-cols-4">
        <Kpi label="Applications" value={String(appliedCount)} note={`${savedCount} saved`} />
        <Kpi label="Interviews" value={String(interviewCount)} note={offerCount > 0 ? `${offerCount} offer${offerCount === 1 ? "" : "s"}` : "keep going"} />
        <Kpi label="Response rate" value={`${responseRate}%`} note="interviews ÷ applied" />
        <Kpi label="Drafts to confirm" value={String(draftCount)} note={draftCount > 0 ? "Needs review" : "All clear"} warn={draftCount > 0} />
      </div>

      {/* Checklist + quick actions */}
      <div className="grid gap-[18px] lg:grid-cols-[1.4fr_1fr]">
        <PanelCard>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Finish setting up</h2>
              <span className="text-[13px] text-muted">A complete profile fills more fields automatically.</span>
            </div>
            <span className="inline-block flex-none rounded-full bg-accent-soft px-[9px] py-[3px] text-[11px] font-bold text-accent-deep">
              {pct}% complete
            </span>
          </div>
          <ul className="flex flex-col gap-2.5">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-3 rounded-[var(--radius)] border border-line p-3">
                <span
                  className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full border-2 text-[11px] ${
                    item.done ? "border-ok bg-ok text-white" : "border-line text-transparent"
                  }`}
                >
                  ✓
                </span>
                <div className="flex-1">
                  <div className={`text-sm font-semibold ${item.done ? "text-muted line-through" : "text-ink"}`}>{item.label}</div>
                  {!item.done && <div className="text-[12.5px] text-muted">{item.hint}</div>}
                </div>
                {!item.done && (
                  <Link href={item.href} className="flex-none text-[12.5px] font-bold text-accent-deep hover:underline">
                    {item.cta} →
                  </Link>
                )}
              </li>
            ))}
            {/* Extension install — can't be detected server-side, shown as a tip. */}
            <li className="flex items-center gap-3 rounded-[var(--radius)] border border-line p-3">
              <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full border-2 border-line text-transparent">✓</span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-ink">Install the browser extension</div>
                <div className="text-[12.5px] text-muted">The on-page agent that does the filling</div>
              </div>
              <Link href="/#features" className="flex-none text-[12.5px] font-bold text-accent-deep hover:underline">
                Install →
              </Link>
            </li>
          </ul>
        </PanelCard>

        <PanelCard>
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">Quick actions</h2>
          <div className="flex flex-col gap-3">
            {[
              { icon: "📄", t: "Upload a resume", s: "Parse a new variant", href: "/resumes" },
              { icon: "✏️", t: "Edit your profile", s: "Update details & answers", href: "/profile" },
              { icon: "📊", t: "View your board", s: "Every application you've tracked", href: "/board" },
            ].map((a) => (
              <Link key={a.t} href={a.href} className="flex items-center gap-3 rounded-[var(--radius)] bg-paper-2 p-[13px] transition-colors hover:bg-[var(--brown-soft)]">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-accent-soft text-[17px]">{a.icon}</span>
                <div>
                  <div className="text-[13.5px] font-semibold text-ink">{a.t}</div>
                  <div className="text-xs text-muted">{a.s}</div>
                </div>
              </Link>
            ))}
          </div>
        </PanelCard>
      </div>

      {/* Recent activity */}
      <PanelCard>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">Recent activity</h2>
          <Link href="/board" className="text-[12.5px] font-bold text-accent-deep hover:underline">
            View board →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No applications yet — fill or save a job with the extension and it shows up here.
          </p>
        ) : (
          <ul className="flex flex-col">
            {recent.map((app) => {
              const pill = statusPill(app.status);
              return (
                <li key={app.id} className="flex items-center gap-3 border-b border-line py-2.5 text-sm last:border-b-0">
                  <span className="w-[74px] flex-none text-xs text-muted">{relTime(app.appliedAt || app.createdAt)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <b className="text-ink">{app.company}</b>
                    {app.roleTitle ? <span className="text-ink-soft"> · {app.roleTitle}</span> : null}
                  </span>
                  <span className={`flex-none rounded-full px-[9px] py-[3px] text-[11px] font-bold ${pill.cls}`}>{pill.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
