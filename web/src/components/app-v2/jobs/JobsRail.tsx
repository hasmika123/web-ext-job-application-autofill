"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  BellIcon,
  BriefcaseIcon,
  BuildingIcon,
  ChartIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DollarIcon,
  LightbulbIcon,
  MailIcon,
  MapPinIcon,
  TargetIcon,
  cn,
  useToast,
} from "@kiwiply/ui";
import { SectionCard, TONE, Toggle, type Tone } from "@/components/app-v2/common";
import { CAREER_TIP, JOB_ALERTS, JOB_PREFERENCES, POPULAR_SEARCHES } from "@/components/app-v2/sample-data";

const PREF_ICON: Record<string, ReactNode> = {
  target: <TargetIcon size={18} />,
  pin: <MapPinIcon size={18} />,
  salary: <DollarIcon size={18} />,
  briefcase: <BriefcaseIcon size={18} />,
  building: <BuildingIcon size={18} />,
};
const ALERT_ICON: Record<string, ReactNode> = {
  clock: <ClockIcon size={18} />,
  send: <MailIcon size={18} />,
};

const TIPS = [
  CAREER_TIP,
  "Save the jobs you like. Kiwiply keeps them together so you can compare and come back.",
  "Review every field before you submit. Kiwiply fills the form, you press Submit.",
];

/** The right rail of Job Search: preferences, alerts, popular searches and a career tip. */
export default function JobsRail({
  onSearch,
  matchEnabled,
}: {
  onSearch: (q: string) => void;
  /** The real daily-matches switch, when the account has one (Pro). */
  matchEnabled?: boolean;
}) {
  const toast = useToast();
  const [alerts, setAlerts] = useState<boolean[]>(() => JOB_ALERTS.map(() => true));
  const [tip, setTip] = useState(0);

  async function setAlert(i: number, on: boolean) {
    // The first alert IS the real daily-matches switch for accounts that have one.
    if (i === 0 && matchEnabled !== undefined) {
      try {
        const res = await fetch("/api/job-matches/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: on }),
        });
        if (!res.ok) {
          toast({ variant: "error", title: "Couldn't change that right now." });
          return;
        }
      } catch {
        toast({ variant: "error", title: "Couldn't change that right now." });
        return;
      }
    }
    setAlerts((a) => a.map((v, j) => (j === i ? on : v)));
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <SectionCard title="Your Job Preferences" action={{ label: "Edit", href: "/profile" }}>
        <ul className="divide-y divide-v2-line/60">
          {JOB_PREFERENCES.map((p) => {
            const t = TONE[p.tone as Tone];
            return (
              <li key={p.label}>
                <Link href="/profile" className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
                  <span className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl", t.soft, t.ink)}>{PREF_ICON[p.icon]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold text-ink">{p.label}</span>
                    <span className="block truncate text-[12.5px] text-v2-muted">{p.value}</span>
                  </span>
                  <ChevronRightIcon size={16} className="flex-none text-v2-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <section className="rounded-2xl border border-v2-line/70 bg-paper p-5 shadow-v2-soft">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-[16px] font-bold! leading-tight! tracking-normal! text-ink">
            <BellIcon size={18} className="text-v2-blue" />
            Job Alerts
          </h2>
          <Link href="/settings" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-v2-blue-ink hover:underline">
            Manage
            <ArrowRightIcon size={13} />
          </Link>
        </div>
        <ul className="divide-y divide-v2-line/60">
          {JOB_ALERTS.map((a, i) => {
            const t = TONE[a.tone as Tone];
            return (
              <li key={a.label} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
                <span className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl", t.soft, t.ink)}>{ALERT_ICON[a.icon]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold text-ink">{a.label}</span>
                  <span className="block text-[12px] leading-snug text-v2-muted">{a.hint}</span>
                </span>
                <Toggle checked={alerts[i]} onCheckedChange={(v) => void setAlert(i, v)} aria-label={a.label} />
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-v2-line/70 bg-paper p-5 shadow-v2-soft">
        <h2 className="mb-3 flex items-center gap-2 font-display text-[16px] font-bold! leading-tight! tracking-normal! text-ink">
          <ChartIcon size={18} className="text-v2-blue" />
          Popular Searches
        </h2>
        <ul className="flex flex-wrap gap-2">
          {POPULAR_SEARCHES.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => onSearch(s)}
                className="rounded-lg bg-v2-blue-soft px-2.5 py-1.5 text-[12.5px] font-medium text-v2-blue-ink transition-colors hover:bg-v2-blue-soft/60"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-v2-line/70 bg-[linear-gradient(160deg,#FFFBEA_0%,#FFF6DA_100%)] p-5 shadow-v2-soft">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-[16px] font-bold! leading-tight! tracking-normal! text-ink">
            <LightbulbIcon size={18} className="text-v2-amber" />
            Career Tip
          </h2>
          <div className="flex items-center gap-1 text-ink-soft">
            <button
              type="button"
              aria-label="Previous tip"
              onClick={() => setTip((t) => (t + TIPS.length - 1) % TIPS.length)}
              className="grid h-6 w-6 place-items-center rounded-full hover:bg-white/70"
            >
              <ChevronLeftIcon size={14} />
            </button>
            <button
              type="button"
              aria-label="Next tip"
              onClick={() => setTip((t) => (t + 1) % TIPS.length)}
              className="grid h-6 w-6 place-items-center rounded-full hover:bg-white/70"
            >
              <ChevronRightIcon size={14} />
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-end gap-3">
          <p className="min-w-0 flex-1 pb-2 text-[13px] leading-snug text-ink-soft" aria-live="polite">
            {TIPS[tip]}
          </p>
          <Image src="/v2/app/mascot-wave-laptop.png" alt="" unoptimized width={90} height={88} className="h-auto w-[84px] flex-none object-contain" />
        </div>
      </section>
    </div>
  );
}
