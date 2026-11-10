"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, PlusIcon, Tab, TabList, Tabs } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { invitationsApi } from "@/lib/ent/invitations";
import InvitationsPage from "@/components/ent/invitations/InvitationsPage";
import { useTabParam } from "@/components/ent/shared/useTabParam";
import AddEmployeeDialog from "./AddEmployeeDialog";
import EmployeesList from "./EmployeesList";

const TABS = ["employees", "invitations"] as const;

export interface EmployeesPageProps {
  orgId: number;
  orgName: string;
  selfMemberId: number;
  /** `me.permissions` of the tenant session: decides which buttons are drawn (the API is the gate). */
  permissions: Record<string, string>;
}

/**
 * Employees, with the Invitations tab (`?tab=invitations`) and the one "Add employee" button. Everyone with an account at the
 * organization is on the Employees tab; the invitations still waiting (or expired, accepted, revoked) are on the other. The
 * dialog is the page's, so a person added from either tab shows up in both.
 */
export default function EmployeesPage({ orgId, orgName, selfMemberId, permissions }: EmployeesPageProps) {
  const [tab, setTab] = useTabParam(TABS, "employees");
  const [addOpen, setAddOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState<number | null>(null);
  const canInvite = Object.prototype.hasOwnProperty.call(permissions, "members.invite");
  const changed = useCallback(() => setVersion((n) => n + 1), []);
  const current = canInvite ? tab : "employees";

  // the number on the Invitations tab, known before the tab is opened (and after a person is added)
  useEffect(() => {
    if (!canInvite) return;
    let live = true;
    void invitationsApi.counts(orgId).then((r) => {
      if (live && r.ok) setPending(r.data.counts.find((c) => c.status === "PENDING")?.count ?? 0);
    });
    return () => {
      live = false;
    };
  }, [orgId, canInvite, version]);

  return (
    <div data-employees-workspace className="ent-page space-y-4">
      <PageHeader title="Employees" subtitle={`Everyone with an account at ${orgName}, their role and access.`} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        {canInvite ? (
          <Tabs value={current} onValueChange={(t) => setTab(t as (typeof TABS)[number])} variant="underline" className="ent-tabs">
            <TabList aria-label="Employees views">
              <Tab value="employees">Employees</Tab>
              <Tab value="invitations">{pending ? `Invitations (${pending})` : "Invitations"}</Tab>
            </TabList>
          </Tabs>
        ) : (
          <span />
        )}
        {canInvite && (
          <Button type="button" variant="accent" onClick={() => setAddOpen(true)} data-add-employee>
            <PlusIcon size={16} aria-hidden /> Add employee
          </Button>
        )}
      </div>

      {current === "employees" ? (
        <EmployeesList orgId={orgId} selfMemberId={selfMemberId} permissions={permissions} onAdd={() => setAddOpen(true)} reloadSignal={version} />
      ) : (
        <InvitationsPage orgId={orgId} canInvite onAdd={() => setAddOpen(true)} reloadSignal={version} onPendingChange={setPending} />
      )}

      {canInvite && <AddEmployeeDialog orgId={orgId} orgName={orgName} open={addOpen} onClose={() => setAddOpen(false)} onChanged={changed} />}
    </div>
  );
}
