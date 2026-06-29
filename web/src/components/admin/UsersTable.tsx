"use client";

import { useState } from "react";
import Link from "next/link";

export interface AdminUser {
  id: number;
  login: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  activated: boolean;
  authorities?: string[];
  createdDate?: string | null;
}

function fullName(u: AdminUser): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ");
}

/**
 * Users table for the admin console (Phase 9.A1.3). The list is server-paginated (the page
 * fetches one page from Spring's `/api/admin/users`); this client component adds a quick search
 * over the CURRENTLY LOADED page (cross-page search is a later backend enhancement — the count
 * hint shows the loaded scope).
 */
export default function UsersTable({ users }: { users: AdminUser[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? users.filter((u) => `${u.login} ${u.email ?? ""} ${fullName(u)}`.toLowerCase().includes(needle))
    : users;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search users…"
            aria-label="Search users"
            className="w-full rounded-full border border-line bg-paper py-2 pl-9 pr-3 text-sm text-ink outline-none transition-colors focus:border-ink"
          />
        </div>
        <span className="shrink-0 text-xs text-ink-soft">
          {rows.length}
          {needle ? ` of ${users.length}` : ""} {rows.length === 1 ? "user" : "users"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-paper shadow-[0_1px_2px_rgba(35,40,38,.04)]">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-paper-2 text-left text-[11px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Roles</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-soft">
                  No users match “{q.trim()}”.
                </td>
              </tr>
            )}
            {rows.map((u) => {
              const isAdmin = (u.authorities ?? []).includes("ROLE_ADMIN");
              return (
                <tr key={u.id} className="border-b border-line transition-colors last:border-0 hover:bg-paper-2">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${encodeURIComponent(u.login)}`} className="font-medium text-ink hover:underline">
                      {u.login}
                    </Link>
                    {fullName(u) && <div className="text-xs text-ink-soft">{fullName(u)}</div>}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{u.email || "—"}</td>
                  <td className="px-4 py-3">
                    {u.activated ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-semibold text-ink">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-2 px-2.5 py-0.5 text-[11px] font-semibold text-ink-soft ring-1 ring-line">
                        <span className="h-1.5 w-1.5 rounded-full bg-ink-soft/50" />
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-paper">Admin</span>
                    ) : (
                      <span className="text-ink-soft">User</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{u.createdDate ? u.createdDate.slice(0, 10) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
