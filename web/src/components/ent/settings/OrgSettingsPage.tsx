"use client";

import { Tab, TabList, TabPanel, Tabs } from "@kiwiply/ui";
import PoliciesPage from "@/components/ent/policy/PoliciesPage";
import { useTabParam } from "@/components/ent/shared/useTabParam";
import GeneralSecuritySettings from "./GeneralSecuritySettings";
import PrepareSettingsSection from "./PrepareSettingsSection";
import ResumeSettingsSection from "./ResumeSettingsSection";

/**
 * Settings (admin workspace, `/w/admin/settings`, needs org.settings.manage): five tabs, kept in the address (`?tab=autopilot`).
 * General and Security are the organization's identity and sign-in rules; Autopilot is the "prepare selected openings" switch and its
 * limits; Resumes is the share-link policy; Policies is the organization's privacy policy, terms and support page. The API is the gate
 * for every one of them; this page only draws what it answers.
 */
export interface OrgSettingsPageProps {
  orgId: number;
}

const TABS = ["general", "security", "autopilot", "resumes", "policies"] as const;
type TabKey = (typeof TABS)[number];

export default function OrgSettingsPage({ orgId }: OrgSettingsPageProps) {
  const [tab, setTab] = useTabParam(TABS, "general");
  return (
    <div data-org-settings-page className="ent-page flex flex-col gap-4">
      <Tabs value={tab} onValueChange={(t) => setTab(t as TabKey)} variant="underline" className="ent-tabs">
        <TabList aria-label="Settings sections">
          <Tab value="general">General</Tab>
          <Tab value="security">Security</Tab>
          <Tab value="autopilot">Autopilot</Tab>
          <Tab value="resumes">Resumes</Tab>
          <Tab value="policies">Policies</Tab>
        </TabList>
        <TabPanel value="general" className="pt-4">
          <GeneralSecuritySettings orgId={orgId} section="general" />
        </TabPanel>
        <TabPanel value="security" className="pt-4">
          <GeneralSecuritySettings orgId={orgId} section="security" />
        </TabPanel>
        <TabPanel value="autopilot" className="pt-4">
          <PrepareSettingsSection orgId={orgId} />
        </TabPanel>
        <TabPanel value="resumes" className="pt-4">
          <ResumeSettingsSection orgId={orgId} />
        </TabPanel>
        <TabPanel value="policies" className="pt-4">
          <PoliciesPage orgId={orgId} />
        </TabPanel>
      </Tabs>
    </div>
  );
}
