"use client";

import { useState } from "react";
import { Tab, TabList, TabPanel, Tabs } from "@kiwiply/ui";
import AuditPage from "./AuditPage";
import JobDataAudit from "./JobDataAudit";

/** Audit Log: the activity log, and (MKT-46) the captured-jobs audit. Both need audit.view at ORG scope; the API is the gate. */
export default function AuditTabs({ orgId }: { orgId: number }) {
  const [tab, setTab] = useState("activity");
  return (
    <Tabs value={tab} onValueChange={setTab} variant="underline">
      <TabList aria-label="Audit log">
        <Tab value="activity">Activity</Tab>
        <Tab value="jobs">Captured jobs</Tab>
      </TabList>
      <TabPanel value="activity">
        <AuditPage orgId={orgId} />
      </TabPanel>
      <TabPanel value="jobs">
        <JobDataAudit orgId={orgId} />
      </TabPanel>
    </Tabs>
  );
}
