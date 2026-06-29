import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import UserActions from "@/components/admin/UserActions";
import AiQuotaControl from "@/components/admin/AiQuotaControl";
import SessionsList, { type SessionFamily } from "@/components/admin/SessionsList";

export const metadata: Metadata = {
  title: "User · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

interface AdminUserDetail {
  login: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  activated: boolean;
  authorities?: string[];
  langKey?: string | null;
  createdBy?: string | null;
  createdDate?: string | null;
  lastModifiedDate?: string | null;
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ login: string }> }) {
  const { login } = await params; // Next already URL-decodes the segment

  const res = await serverApiFetch(`/api/admin/users/${encodeURIComponent(login)}`);
  if (res.status === 404) notFound();
  if (!res.ok) {
    return (
      <div className="mx-auto max-w-3xl">
        <BackLink />
        <div className="mt-4 rounded-[var(--radius)] border border-line bg-paper p-6 text-sm text-ink-soft">
          Couldn&apos;t load this user.
        </div>
      </div>
    );
  }

  const user = (await res.json()) as AdminUserDetail;

  // Current admin's login → disable self-harming actions in the UI (the server guards too).
  let currentLogin = "";
  const acc = await serverApiFetch("/api/account");
  if (acc.ok) {
    const a = (await acc.json().catch(() => null)) as { login?: string } | null;
    currentLogin = a?.login ?? "";
  }

  const isAdmin = (user.authorities ?? []).includes("ROLE_ADMIN");
  const isSelf = currentLogin.toLowerCase() === user.login.toLowerCase();
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");

  // AI quota override (A2.2): { defaultQuota, override: number|null }
  let defaultQuota = 0;
  let quotaOverride: number | null = null;
  const q = await serverApiFetch(`/api/admin/users/${encodeURIComponent(user.login)}/ai-quota`);
  if (q.ok) {
    const qd = (await q.json().catch(() => null)) as { defaultQuota?: number; override?: number | null } | null;
    defaultQuota = qd?.defaultQuota ?? 0;
    quotaOverride = qd?.override ?? null;
  }

  // Sessions (A2.3): the user's refresh-token families.
  let sessions: SessionFamily[] = [];
  const s = await serverApiFetch(`/api/admin/users/${encodeURIComponent(user.login)}/sessions`);
  if (s.ok) {
    sessions = ((await s.json().catch(() => [])) as SessionFamily[]) ?? [];
  }

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink />

      <header className="mb-6 mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">{user.login}</h1>
        {user.activated ? (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent">Active</span>
        ) : (
          <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-ink-soft ring-1 ring-line">Pending</span>
        )}
        {isAdmin && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-paper">Admin</span>}
        {isSelf && <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-ink-soft ring-1 ring-line">You</span>}
      </header>

      <dl className="mb-6 grid gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line sm:grid-cols-2">
        <Detail label="Name" value={name || "—"} />
        <Detail label="Email" value={user.email || "—"} />
        <Detail label="Language" value={user.langKey || "—"} />
        <Detail label="Created by" value={user.createdBy || "—"} />
        <Detail label="Joined" value={user.createdDate ? user.createdDate.slice(0, 10) : "—"} />
        <Detail label="Last modified" value={user.lastModifiedDate ? user.lastModifiedDate.slice(0, 10) : "—"} />
      </dl>

      <div className="flex flex-col gap-5">
        <UserActions login={user.login} activated={user.activated} isAdmin={isAdmin} isSelf={isSelf} />
        <SessionsList login={user.login} families={sessions} />
        <AiQuotaControl login={user.login} defaultQuota={defaultQuota} override={quotaOverride} />
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin/users" className="text-sm font-medium text-ink-soft hover:text-ink">
      ← Users
    </Link>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper px-4 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}
