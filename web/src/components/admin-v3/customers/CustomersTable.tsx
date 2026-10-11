"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilterIcon, PlusIcon, UserIcon, MailIcon, ExternalLinkIcon, useToast } from "@kiwiply/ui";
import { DataTable, FilterSelect, KebabMenu, Pagination, SearchInput, ToolbarButton } from "@/components/app-v2/common";
import { AdminPanel, PersonCell, StatusDot } from "../common";
import { billingLabel, money, periodLabel, STATUS_LABEL, type Customer } from "@/lib/customers";

const TONE = { ACTIVE: "green", PAST_DUE: "coral", CANCELLING: "amber", LAPSED: "slate" } as const;

export interface CustomerTab {
  key: string;
  label: string;
  count: number;
}

/**
 * "Customers" panel (board 20). REAL: the server-paginated list, status filter (URL `?filter=`, the
 * tab counts come from `/api/admin/customers/counts`), per-row Manage (-> the billing timeline and
 * notes on the user's detail page) and the Stripe link. Search filters the loaded page only.
 * "Add Customer" has no backend (customers are created by Stripe checkout): it says "Coming soon".
 */
export default function CustomersTable({
  rows,
  total,
  page,
  pageSize,
  filter,
  tabs,
}: {
  rows: Customer[];
  total: number;
  page: number;
  pageSize: number;
  filter: string;
  tabs: CustomerTab[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((c) => `${c.name ?? ""} ${c.login} ${c.email ?? ""}`.toLowerCase().includes(needle)) : rows;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = page * pageSize + rows.length;
  const labelOf = (k: string) => {
    const t = tabs.find((x) => x.key === k);
    return t ? `${t.label} (${t.count})` : "";
  };
  const options = tabs.map((t) => labelOf(t.key));
  const href = (f: string, p: number) => `/admin/customers?${f ? `filter=${f}&` : ""}page=${p}`;
  const manage = (c: Customer) => `/admin/users/${encodeURIComponent(c.login)}#billing`;

  return (
    <AdminPanel
      title="Customers"
      description="Everyone who has ever subscribed. Refunds and disputes happen in Stripe: open a customer there from their row."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <SearchInput
          variant="grey"
          size="sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search customers by name or email..."
          wrapperClassName="min-w-[220px] flex-1 sm:max-w-[420px]"
        />
        <FilterSelect
          label="Status"
          leadingIcon={<FilterIcon size={14} />}
          options={options}
          value={labelOf(filter)}
          onChange={(v) => router.push(href(tabs.find((t) => labelOf(t.key) === v)?.key ?? "", 0))}
          className="w-[210px]"
        />
        <ToolbarButton
          solid
          size="md"
          icon={<PlusIcon size={15} />}
          className="ml-auto bg-v2-violet px-4 py-2.5 text-[13px]"
          onClick={() => toast({ title: "Coming soon", description: "Customers are created when someone subscribes through Stripe Checkout." })}
        >
          Add Customer
        </ToolbarButton>
      </div>

      <DataTable
        inCard
        minWidth={820}
        aria-label="Customers"
        rows={shown}
        rowKey={(c) => c.login}
        empty={needle ? "No customers on this page match your search." : "No customers here yet."}
        actionsHeader="Actions"
        columns={[
          {
            key: "customer",
            header: "CUSTOMER",
            primary: true,
            render: (c) => (
              <PersonCell
                avatarName={c.name || c.login}
                name={
                  <Link href={manage(c)} className="hover:underline">
                    {c.name || c.login}
                  </Link>
                }
                sub={c.email || c.login}
              />
            ),
          },
          { key: "sub", header: "SUBSCRIPTION", render: (c) => billingLabel(c.billing) },
          { key: "renewal", header: "RENEWAL", className: "whitespace-nowrap", render: (c) => periodLabel(c) },
          {
            key: "status",
            header: "STATUS",
            render: (c) => <span title={c.stripeStatus ?? undefined}><StatusDot status={STATUS_LABEL[c.statusGroup]} tone={TONE[c.statusGroup]} /></span>,
          },
          { key: "paid", header: "TOTAL PAID", className: "whitespace-nowrap font-medium text-ink", render: (c) => money(c.totalPaidCents, c.currency) },
        ]}
        actions={(c) => (
          <span className="inline-flex items-center gap-1">
            <Link href={manage(c)} className="rounded-lg bg-paper-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:bg-[#EEF1F8]">
              Manage
            </Link>
            <span className="relative inline-block">
              <KebabMenu
                label={`Actions for ${c.login}`}
                items={[
                  { label: "Billing & notes", icon: <UserIcon size={15} />, onSelect: () => router.push(manage(c)) },
                  ...(c.stripeUrl ? [{ label: "Open in Stripe", icon: <ExternalLinkIcon size={15} />, onSelect: () => window.open(c.stripeUrl!, "_blank", "noreferrer") }] : []),
                  ...(c.email ? [{ label: "Email customer", icon: <MailIcon size={15} />, onSelect: () => (window.location.href = `mailto:${c.email}`) }] : []),
                ]}
              />
            </span>
          </span>
        )}
        footer={
          total > 0 ? (
            <Pagination
              tone="blue"
              page={page + 1}
              pages={totalPages}
              summary={`Showing ${from}-${to} of ${total.toLocaleString("en-US")} customers · ${pageSize} per page`}
              onPageChange={(p) => router.push(href(filter, p - 1))}
              className="pt-3"
            />
          ) : null
        }
      />
    </AdminPanel>
  );
}
