"use client";

import { useState } from "react";
import { Button, PlusIcon, Tab, TabList, Tabs } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { useTabParam } from "@/components/ent/shared/useTabParam";
import DepartmentsPage from "./DepartmentsPage";
import TeamsPage from "./TeamsPage";

const TABS = ["teams", "departments"] as const;
type TabKey = (typeof TABS)[number];

/**
 * Teams & Departments: one page, two tabs (`?tab=departments`), one create button for the tab that is open. The two lists share the
 * same groups API; each tab draws one directory, and the structure tree sits on the Departments tab.
 */
export default function TeamsDepartmentsPage({ orgId, orgName, canManage }: { orgId: number | string; orgName: string; canManage: boolean }) {
  const [tab, setTab] = useTabParam(TABS, "teams");
  const [creating, setCreating] = useState(false);
  const pick = (t: TabKey) => {
    setCreating(false);
    setTab(t);
  };

  return (
    <div data-teams-departments className="ent-page space-y-4">
      <PageHeader title="Teams & Departments" subtitle={`How ${orgName} is organized: departments, and the teams inside them.`} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs value={tab} onValueChange={(t) => pick(t as TabKey)} variant="underline" className="ent-tabs">
          <TabList aria-label="Teams and departments views">
            <Tab value="teams">Teams</Tab>
            <Tab value="departments">Departments</Tab>
          </TabList>
        </Tabs>
        {canManage && (
          <Button type="button" variant="accent" onClick={() => setCreating(true)} data-create-group={tab}>
            <PlusIcon size={16} aria-hidden /> {tab === "teams" ? "Create team" : "Create department"}
          </Button>
        )}
      </div>
      {tab === "teams" ? <TeamsPage orgId={orgId} canManage={canManage} creating={creating} onCreatingChange={setCreating} /> : <DepartmentsPage orgId={orgId} canManage={canManage} creating={creating} onCreatingChange={setCreating} />}
    </div>
  );
}
