"use client";

import { Tab, TabList, Tabs } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import FollowupsPage from "../followups/FollowupsPage";
import type { MktPageProps } from "../parts";
import { useTabParam } from "../useTabParam";
import TasksPage from "./TasksPage";

/**
 * Tasks: the one page that replaced Tasks and Follow-ups. The tab is in the URL (`?tab=followups`; Tasks is the page without a tab), so the old
 * `/followups` address redirects straight onto the right tab. Only the open tab is mounted, so only its calls are made.
 */
export const TASK_PAGE_TABS = ["tasks", "followups"] as const;
export type TaskPageTab = (typeof TASK_PAGE_TABS)[number];
const LABEL: Record<TaskPageTab, string> = { tasks: "Tasks", followups: "Follow-ups" };

export default function TaskTabsPage(props: MktPageProps) {
  const [tab, setTab] = useTabParam(TASK_PAGE_TABS, "tasks");
  return (
    <div data-mkt-tasks data-tab={tab} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Tasks" subtitle="What you owe and when: tasks, calls and reminders." />
      <Tabs value={tab} onValueChange={(t) => setTab(t as TaskPageTab)} variant="underline" className="ent-tabs ent-card !inline-flex !w-auto max-w-full px-2">
        <TabList aria-label="Tasks views">
          {TASK_PAGE_TABS.map((t) => (
            <Tab key={t} value={t}>{LABEL[t]}</Tab>
          ))}
        </TabList>
      </Tabs>
      {tab === "tasks" ? <TasksPage {...props} embedded /> : <FollowupsPage {...props} embedded />}
    </div>
  );
}
