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
 * fetches one page from Spring's `/api/admin/users`); this client component adds a quick
 * filter over the CURRENTLY LOADED page only — labelled as such, since the backend list
 * endpoint has no search yet (cross-page search is a later backend enhancement).
 */
export default function UsersTable({ users }: { users: AdminUser[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? users.filter((u) => `${u.login} ${u.email ?? ""} ${fullName(u)}`.toLowerCase().includes(needle))
    : users;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter this page…"
          aria-label="Filter the loaded users"
          className="w-full max-w-xs rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
        <span className="text-xs text-ink-soft">
          {rows.length} shown{needle && ` of ${users.length}`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-paper-2 text-left text-[12px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-2.5 font-semibold">User</th>
              <th className="px-4 py-2.5 font-semibold">Email</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Roles</th>
              <th className="px-4 py-2.5 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-soft">
                  No users match.
                </td>
              </tr>
            )}
            {rows.map((u) => {
              const isAdmin = (u.authorities ?? []).includes("ROLE_ADMIN");
              return (
                <tr key={u.id} className="border-b border-line last:border-0 bg-paper hover:bg-paper-2">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/users/${encodeURIComponent(u.login)}`} className="font-medium text-ink hover:underline">
                      {u.login}
                    </Link>
                    {fullName(u) && <div className="text-xs text-ink-soft">{fullName(u)}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{u.email || "—"}</td>
                  <td className="px-4 py-2.5">
                    {u.activated ? (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent">Active</span>
                    ) : (
                      <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-ink-soft ring-1 ring-line">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {isAdmin ? (
                      <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-paper">Admin</span>
                    ) : (
                      <span className="text-ink-soft">User</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{u.createdDate ? u.createdDate.slice(0, 10) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
