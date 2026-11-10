"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataTable, FilterSelect, KebabMenu, Pagination, SearchInput } from "@/components/app-v2/common";
import { AdminPanel, PersonCell, RoleChip, StatusDot } from "@/components/admin-v3/common";
import { MailIcon, UserIcon } from "@kiwiply/ui";

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
 * "User management" panel (admin v3). REAL data: the list is server-paginated by the page (Spring
 * `/api/admin/users`, `page` is 0-based in the URL); search / role / status filter the CURRENTLY
 * LOADED page only (cross-page search is a later backend enhancement). Each row links to the user's
 * detail page, where every action lives (activate, reset, roles, force-logout, delete: UserActions).
 */
export default function UsersTable({
  users,
  total,
  page,
  pageSize,
  totalPages,
  initialQuery = "",
}: {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  initialQuery?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [role, setRole] = useState("All roles");
  const [status, setStatus] = useState("All statuses");
  const needle = q.trim().toLowerCase();

  const rows = users.filter((u) => {
    if (needle && !`${u.login} ${u.email ?? ""} ${fullName(u)}`.toLowerCase().includes(needle)) return false;
    const isAdmin = (u.authorities ?? []).includes("ROLE_ADMIN");
    if (role === "Admin" && !isAdmin) return false;
    if (role === "User" && isAdmin) return false;
    if (status === "Active" && !u.activated) return false;
    if (status === "Pending" && u.activated) return false;
    return true;
  });
  const filtered = needle !== "" || role !== "All roles" || status !== "All statuses";

  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = page * pageSize + users.length;
  const go = (p: number) => router.push(`/admin/users?page=${p - 1}${needle ? `&q=${encodeURIComponent(q.trim())}` : ""}`);

  return (
    <AdminPanel
      title="User management"
      description="Search, filter and manage user accounts. Open a user to activate, reset, change roles, force log out or delete."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <SearchInput
          variant="grey"
          size="sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search users by name or email..."
          wrapperClassName="min-w-[220px] flex-1 sm:max-w-[420px]"
        />
        <FilterSelect label="Role" options={["All roles", "Admin", "User"]} value={role} onChange={setRole} className="w-[130px]" />
        <FilterSelect label="Status" options={["All statuses", "Active", "Pending"]} value={status} onChange={setStatus} className="w-[150px]" />
        <span className="ml-auto text-[12px] text-v2-muted">
          {filtered ? `${rows.length} of ${users.length} on this page` : `${users.length} on this page`}
        </span>
      </div>

      <DataTable
        inCard
        minWidth={760}
        aria-label="Users"
        rows={rows}
        rowKey={(u) => u.id}
        empty={filtered ? `No users on this page match your filters.` : "No users yet."}
        columns={[
          {
            key: "user",
            header: "USER",
            primary: true,
            render: (u) => (
              <PersonCell
                avatarName={fullName(u) || u.login}
                name={
                  <Link href={`/admin/users/${encodeURIComponent(u.login)}`} className="hover:underline">
                    {fullName(u) || u.login}
                  </Link>
                }
                sub={`@${u.login}`}
              />
            ),
          },
          { key: "email", header: "EMAIL", render: (u) => <span className="break-all text-ink-soft">{u.email || "—"}</span> },
          {
            key: "role",
            header: "ROLE",
            render: (u) => <RoleChip role={(u.authorities ?? []).includes("ROLE_ADMIN") ? "Admin" : "User"} />,
          },
          {
            key: "status",
            header: "STATUS",
            render: (u) => (u.activated ? <StatusDot status="Active" /> : <StatusDot status="Pending" />),
          },
          { key: "joined", header: "JOINED", className: "whitespace-nowrap", render: (u) => (u.createdDate ? u.createdDate.slice(0, 10) : "—") },
        ]}
        actions={(u) => (
          <span className="relative inline-block">
          <KebabMenu
            label={`Actions for ${u.login}`}
            items={[
              { label: "Manage account", icon: <UserIcon size={15} />, onSelect: () => router.push(`/admin/users/${encodeURIComponent(u.login)}`) },
              ...(u.email
                ? [{ label: "Email user", icon: <MailIcon size={15} />, onSelect: () => (window.location.href = `mailto:${u.email}`) }]
                : []),
            ]}
          />
          </span>
        )}
        footer={
          totalPages > 1 || total > 0 ? (
            <Pagination
              tone="blue"
              page={page + 1}
              pages={totalPages}
              summary={`Showing ${from}-${to} of ${total.toLocaleString("en-US")} users · ${pageSize} per page`}
              onPageChange={go}
              className="pt-3"
            />
          ) : null
        }
      />
    </AdminPanel>
  );
}
