"use client";

import type { ReactNode } from "react";
import {
  BriefcaseIcon,
  ChartIcon,
  ChevronRightIcon,
  FileTextIcon,
  GlobeIcon,
  PencilIcon,
  SparklesIcon,
  StarIcon,
  TargetIcon,
  XIcon,
} from "@kiwiply/ui";
import { IconTile, type Tone } from "../common";

const SETTING_ICON: Record<string, ReactNode> = {
  "Default Resume": <FileTextIcon className="h-5 w-5" />,
  "Cover Letter Style": <PencilIcon className="h-5 w-5" />,
  "Application Answers": <SparklesIcon className="h-5 w-5" />,
  "Preferred Job Types": <BriefcaseIcon className="h-5 w-5" />,
  "Location Preferences": <GlobeIcon className="h-5 w-5" />,
  "Additional Preferences": <StarIcon className="h-5 w-5" />,
  "Target Job Titles": <TargetIcon className="h-5 w-5" />,
  Locations: <GlobeIcon className="h-5 w-5" />,
  "Salary Range": <ChartIcon className="h-5 w-5" />,
  "Job Types": <BriefcaseIcon className="h-5 w-5" />,
  "Exclude Companies": <XIcon className="h-5 w-5" />,
};

/** A settings summary list: tinted icon tile, bold title, muted summary, chevron. */
export function SettingsList({ items, onSelect }: { items: { title: string; sub: string; tone: Tone }[]; onSelect: () => void }) {
  return (
    <ul className="divide-y divide-v2-line/70">
      {items.map((s) => (
        <li key={s.title}>
          <button type="button" onClick={onSelect} className="flex w-full items-center gap-3 py-2.5 text-left">
            <IconTile tone={s.tone}>{SETTING_ICON[s.title]}</IconTile>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold leading-tight text-v2-navy">{s.title}</span>
              <span className="mt-0.5 block truncate text-[12.5px] text-v2-ink-soft">{s.sub}</span>
            </span>
            <ChevronRightIcon className="h-4 w-4 flex-none text-v2-muted" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Mini bar chart: tinted bars with the value above each (Application Activity). */
export function MiniBars({ data, max }: { data: { label: string; value: number }[]; max: number }) {
  return (
    <div className="flex h-[132px] items-end gap-2 sm:gap-3" role="img" aria-label={`Activity: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
      {data.map((d) => (
        <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[11px] font-semibold text-v2-navy">{d.value}</span>
          <div
            className="w-full rounded-t-md bg-[linear-gradient(180deg,#B7EE8C_0%,#D9F6BF_100%)]"
            style={{ height: `${Math.max(8, (d.value / max) * 82)}px` }}
          />
          <span className="text-[10.5px] text-v2-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** The lime "AI Application Copilot" eyebrow chip. */
export function CopilotChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-v2-lime/40 px-3 py-1 text-[12.5px] font-bold text-v2-navy">
      <SparklesIcon className="h-3.5 w-3.5 text-v2-amber" />
      AI Application Copilot
    </span>
  );
}
