"use client";

import { useState } from "react";
import { ArrowRightIcon, BriefcaseIcon, ChevronDownIcon, GearIcon, GlobeIcon, MonitorIcon, PlayIcon, SearchIcon, XIcon, Switch, cn } from "@kiwiply/ui";
import { AUTO_ACTIVITY, AUTO_ADVANCED_FILTERS, CAMPAIGNS, type AutoActivitySample } from "../sample-data.pages";
import { CompanyTile, DataTable, FilterSelect, KebabMenu, StatusChip, TONE, type DataColumn, type Tone } from "../local";

const STATUS_TONE: Record<AutoActivitySample["status"], Tone> = { Applied: "blue", "Under Review": "amber", Interview: "violet" };

const ACTIVITY_COLUMNS: DataColumn<AutoActivitySample>[] = [
  {
    key: "date",
    header: "Date",
    cell: (r) => (
      <span className="flex items-center gap-2.5 text-[13.5px] text-v2-navy">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-v2-blue-soft text-v2-blue">
          <MonitorIcon className="h-3.5 w-3.5" />
        </span>
        {r.date}
      </span>
    ),
  },
  { key: "title", header: "Job Title", cell: (r) => <span className="text-[13.5px] font-medium text-v2-navy">{r.title}</span> },
  {
    key: "company",
    header: "Company",
    cell: (r) => (
      <span className="flex items-center gap-2 text-[13.5px] text-v2-navy">
        <CompanyTile name={r.company} size={22} className="rounded-md" />
        {r.company}
      </span>
    ),
  },
  { key: "status", header: "Status", cell: (r) => <StatusChip tone={STATUS_TONE[r.status]} dot>{r.status}</StatusChip> },
  {
    key: "match",
    header: "Match",
    cell: (r) => (
      <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-v2-navy">
        <span aria-hidden className="h-2 w-2 rounded-full bg-v2-green" />
        {r.match}%
      </span>
    ),
  },
  { key: "with", header: "Applied With", cell: () => <span className="text-[13.5px] text-v2-ink-soft">AI Apply</span> },
];

/**
 * "Auto Apply Agent" panel (board `app-ai-apply-campaigns.webp`): set-up form, campaigns with
 * pause toggles (client state) and the recent activity table. "Start Auto Apply" and
 * "New Campaign" are the shared "Coming soon" toast.
 */
export default function AutoApply({ onStart }: { onStart: () => void }) {
  const [titles, setTitles] = useState("Software Engineer, Frontend, Full Stack");
  const [active, setActive] = useState<Record<string, boolean>>(() => Object.fromEntries(CAMPAIGNS.map((c) => [c.id, c.active])));

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-5">
      <section aria-labelledby="auto-setup">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <GearIcon className="mt-0.5 h-5 w-5 flex-none text-v2-ink-soft" />
            <div>
              <h2 id="auto-setup" className="text-[17px] font-extrabold leading-tight tracking-tight text-v2-navy">
                Set Up Auto Apply Agent
              </h2>
              <p className="mt-1 text-[13px] text-v2-ink-soft">Tell Kiwiply what you&apos;re looking for and let AI handle the rest.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-v2-blue-soft px-3.5 text-[13px] font-semibold text-v2-blue"
          >
            How it works
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-v2-blue text-white">
              <PlayIcon className="h-2.5 w-2.5" />
            </span>
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]">
          <label className="flex h-12 items-center gap-2.5 rounded-xl border border-v2-line bg-white px-3.5 focus-within:border-v2-blue">
            <SearchIcon className="h-4 w-4 flex-none text-v2-ink-soft" />
            <input
              value={titles}
              onChange={(e) => setTitles(e.target.value)}
              aria-label="Target job titles"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-v2-navy outline-none"
            />
            {titles && (
              <button type="button" aria-label="Clear job titles" onClick={() => setTitles("")} className="text-v2-ink-soft hover:text-v2-navy">
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </label>
          <label className="flex h-12 items-center gap-2.5 rounded-xl border border-v2-line bg-white px-3.5 focus-within:border-v2-blue">
            <GlobeIcon className="h-4 w-4 flex-none text-v2-ink-soft" />
            <input defaultValue="United States" aria-label="Location" className="min-w-0 flex-1 bg-transparent text-[14px] text-v2-navy outline-none" />
          </label>
          <FilterSelect label="Remote / Hybrid" options={["Remote", "Hybrid", "On-site"]} className="[&_select]:h-12" />
          <button
            type="button"
            onClick={onStart}
            className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-v2-lime px-5 text-[14.5px] font-bold text-v2-navy hover:brightness-95"
          >
            <PlayIcon className="h-4 w-4" /> Start Auto Apply
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[13px] font-semibold text-v2-navy">Advanced Filters</span>
          {AUTO_ADVANCED_FILTERS.map((f) => (
            <FilterSelect key={f} label={f} options={[]} />
          ))}
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-v2-line bg-white px-3.5 text-[13.5px] font-medium text-v2-navy hover:bg-[#F1F5FB]"
          >
            <ChevronDownIcon className="h-4 w-4" /> More Filters
          </button>
        </div>
      </section>

      <section aria-labelledby="auto-campaigns">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="auto-campaigns" className="text-[17px] font-extrabold leading-tight tracking-tight text-v2-navy">
              Active Auto Apply Campaigns ({CAMPAIGNS.length})
            </h2>
            <p className="mt-1 text-[13px] text-v2-ink-soft">Kiwiply is applying to matching jobs based on your preferences.</p>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-v2-lime-soft px-4 text-[13.5px] font-bold text-v2-navy hover:brightness-95"
          >
            <span aria-hidden>+</span> New Campaign
          </button>
        </div>

        <ul className="mt-3 space-y-2.5">
          {CAMPAIGNS.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-v2-line bg-white p-3.5 lg:flex-row lg:items-center lg:gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3.5">
                <Switch
                  checked={active[c.id]}
                  onCheckedChange={(v) => setActive((p) => ({ ...p, [c.id]: v }))}
                  aria-label={`${c.title} campaign ${active[c.id] ? "on" : "paused"}`}
                />
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold leading-snug tracking-normal text-v2-navy">{c.title}</h3>
                  <p className="text-[12.5px] text-v2-ink-soft">{c.meta}</p>
                  <p className="text-[12.5px] text-v2-muted">{c.created}</p>
                </div>
              </div>
              <dl className="grid grid-cols-4 gap-2 text-center lg:w-[300px] lg:flex-none">
                {(
                  [
                    [c.applied, "Applied", "text-v2-navy"],
                    [c.underReview, "Under Review", "text-v2-navy"],
                    [c.interviews, c.interviews === 1 ? "Interview" : "Interviews", TONE.violet.ink],
                    [c.offers, c.offers === 1 ? "Offer" : "Offers", TONE.amber.ink],
                  ] as const
                ).map(([n, label, color]) => (
                  <div key={label} className="flex flex-col-reverse">
                    <dt className={cn("mt-1 text-[11.5px] leading-tight", n === 0 || color === "text-v2-navy" ? "text-v2-ink-soft" : color)}>{label}</dt>
                    <dd className="text-[16px] font-extrabold leading-none text-v2-navy">{n}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  className="inline-flex h-10 items-center whitespace-nowrap rounded-xl border border-v2-line bg-white px-4 text-[13.5px] font-semibold text-v2-navy hover:bg-[#F1F5FB]"
                >
                  View Jobs
                </button>
                <KebabMenu
                  label={`More actions for ${c.title}`}
                  items={[
                    { label: active[c.id] ? "Pause campaign" : "Resume campaign", onSelect: () => setActive((p) => ({ ...p, [c.id]: !p[c.id] })) },
                    { label: "Edit preferences", icon: <BriefcaseIcon className="h-4 w-4" />, onSelect: onStart },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="auto-activity">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="auto-activity" className="text-[17px] font-extrabold tracking-tight text-v2-navy">
            Recent Auto Apply Activity
          </h2>
          <button type="button" onClick={onStart} className="inline-flex items-center gap-1 text-[13px] font-semibold text-v2-blue hover:underline">
            View all <ArrowRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <DataTable
          columns={ACTIVITY_COLUMNS}
          rows={AUTO_ACTIVITY}
          rowKey={(r) => `${r.date}-${r.company}-${r.title}`}
          template="minmax(0,1.2fr) minmax(0,1.3fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,0.7fr) minmax(0,1fr)"
        />
      </section>
    </div>
  );
}
