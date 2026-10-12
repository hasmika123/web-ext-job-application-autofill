"use client";

import Link from "next/link";
import type { ReactNode, Ref } from "react";
import { Button, ChartIcon, LockIcon, SparklesIcon, TargetIcon, Tab, TabList, TabPanel, Tabs, cn } from "@kiwiply/ui";
import type { ResumeScoreReport } from "@kiwiply/ui";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import InsightsTab from "./InsightsTab";
import RailCard from "./RailCard";
import type { RailTab } from "./state/ui";

/** The rail's three tabs, in board order; `RailStrip` shows the same three as icons. */
export const RAIL_TABS: ReadonlyArray<{ value: RailTab; label: string }> = [
  { value: "insights", label: "Insights" },
  { value: "ai", label: "AI Suggestions" },
  { value: "match", label: "Job Match" },
];

/** The tabs the admin switches leave on (`features.aiSuggestions`, `features.jobMatch`). */
export function visibleRailTabs(features: Pick<ResumeBuilderConfig["features"], "aiSuggestions" | "jobMatch">) {
  return RAIL_TABS.filter((t) => (t.value === "ai" ? features.aiSuggestions : t.value === "match" ? features.jobMatch : true));
}

export const railIcon = (tab: RailTab, className = "h-4 w-4"): ReactNode =>
  tab === "insights" ? <ChartIcon className={className} /> : tab === "ai" ? <SparklesIcon className={className} /> : <TargetIcon className={className} />;

const Card = RailCard;

/**
 * The right rail (DESIGN 10.7): tabs Insights · AI Suggestions (n) · Job Match. The Insights body is the
 * Resume Score (R2.5); suggestions arrive with R4.x, the target with R5.x (placeholders until then).
 * `aiAllowed` and the feature switches come from the builder config, never from plan names.
 */
export default function RightRail({
  tab,
  onTab,
  config,
  aiUsageLine,
  suggestionCount = 0,
  onTailor,
  insights,
  className,
}: {
  tab: RailTab;
  onTab: (tab: RailTab) => void;
  config: ResumeBuilderConfig;
  /** The words for this period's Kiwiply AI meter (`describeAiUsage`, computed on the server), or null. */
  aiUsageLine?: { headline: string; detail: string } | null;
  /** Open AI suggestion cards; the count badge hides at 0 and for plans without builder AI. */
  suggestionCount?: number;
  /** Opens the Tailor to Job left panel. */
  onTailor: () => void;
  /** The Resume Score (R2.5): the live report, whether it is at or above the pass threshold, and how to open the tips. */
  insights: {
    report: ResumeScoreReport;
    good: boolean;
    onViewTips: (group?: "G6") => void;
    viewTipsRef?: Ref<HTMLButtonElement>;
  };
  className?: string;
}) {
  const tabs = visibleRailTabs(config.features);
  const current = tabs.some((t) => t.value === tab) ? tab : "insights";
  const showCount = config.aiAllowed && suggestionCount > 0;

  return (
    <Tabs value={current} onValueChange={(v) => onTab(v as RailTab)} variant="underline" className={cn("flex min-w-0 flex-col gap-4", className)}>
      <TabList aria-label="Resume insights">
        {tabs.map((t) => (
          <Tab key={t.value} value={t.value}>
            {railIcon(t.value)}
            {t.label}
            {t.value === "ai" && showCount && (
              <span className="rounded-full bg-v2-blue-soft px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-v2-blue" aria-label={`${suggestionCount} suggestions`}>
                {suggestionCount}
              </span>
            )}
          </Tab>
        ))}
      </TabList>

      <TabPanel value="insights">
        <InsightsTab report={insights.report} good={insights.good} onViewTips={insights.onViewTips} viewTipsRef={insights.viewTipsRef} />
      </TabPanel>

      <TabPanel value="ai">
        <Card title={<><SparklesIcon className="h-4 w-4 text-v2-blue" />AI Suggestions</>}>
          {config.aiAllowed ? (
            <div className="rounded-xl border border-dashed border-line bg-paper-2/60 p-4 text-center">
              <p className="text-[14px] font-semibold text-ink">No suggestions yet</p>
              <Button variant="accent" size="sm" disabled className="mt-3" aria-describedby="rb-ai-stub-note">
                Get suggestions
              </Button>
              <p id="rb-ai-stub-note" className="mt-2 text-[12px] text-muted">
                Suggestions arrive in a later release.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-paper-2/60 p-4 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-v2-violet-soft text-v2-violet-ink">
                <LockIcon className="h-5 w-5" />
              </span>
              <p className="mt-2 text-[14px] font-semibold text-ink">AI suggestions are part of Pro</p>
              <Link href="/pricing" className="mt-2 inline-block text-[13px] font-bold text-v2-blue hover:underline">
                See Pro
              </Link>
            </div>
          )}
          {aiUsageLine && (
            <p className="mt-3 text-[12px] leading-snug text-muted">
              {aiUsageLine.headline}. {aiUsageLine.detail}
            </p>
          )}
        </Card>
      </TabPanel>

      <TabPanel value="match">
        <Card
          title={<><TargetIcon className="h-4 w-4 text-v2-blue" />Job Match</>}
          aside={<span className="rounded-md bg-v2-violet-soft px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-v2-violet-ink">Beta</span>}
        >
          <div className="rounded-xl border border-dashed border-line bg-paper-2/60 p-4 text-center">
            <p className="text-[14px] font-semibold text-ink">Pick the job this resume is for</p>
            {config.features.tailor && (
              <Button variant="accent" size="sm" className="mt-3" onClick={onTailor}>
                <SparklesIcon className="h-4 w-4" /> Tailor to Job
              </Button>
            )}
          </div>
        </Card>
      </TabPanel>
    </Tabs>
  );
}
