"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, BookmarkIcon, SearchIcon, cn } from "@kiwiply/ui";
import { FIND_FILTERS, RECOMMENDED_JOBS } from "../sample-data.pages";
import { CompanyTile, FilterSelect } from "../local";

/**
 * "Find & Apply" panel (board `app-ai-apply-find.webp`): the AI search bar, the filter row and
 * the recommended jobs. `onApply` is the shared "Coming soon" toast; bookmarks are client state.
 */
export default function FindApply({ onApply }: { onApply: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="p-4 sm:p-5">
      <h2 className="text-[18px] font-extrabold tracking-tight text-v2-navy">Find jobs to apply with AI</h2>
      <p className="mt-1 text-[13.5px] text-v2-ink-soft">
        Search or choose from recommended jobs. Kiwiply will tailor your application for each job.
      </p>

      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          router.push("/jobs");
        }}
      >
        <label className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-xl border border-v2-line bg-white px-4 focus-within:border-v2-blue">
          <SearchIcon className="h-5 w-5 flex-none text-v2-ink-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Describe the jobs you want"
            placeholder={"Try “Software engineer internships in remote, $80k+”"}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-v2-navy outline-none placeholder:text-v2-muted"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-v2-lime px-6 text-[15px] font-bold text-v2-navy hover:brightness-95"
        >
          Find Jobs <ArrowRightIcon className="h-4 w-4" />
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {FIND_FILTERS.map((f) => (
          <FilterSelect key={f} label={f} options={[]} className="min-w-[110px]" />
        ))}
      </div>

      <div className="mt-6 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-bold tracking-normal text-v2-navy">AI Recommended Jobs for You</h3>
          <p className="mt-0.5 text-[13px] text-v2-ink-soft">Based on your resume, skills and preferences</p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/jobs")}
          className="inline-flex flex-none items-center gap-1 text-[13px] font-semibold text-v2-blue hover:underline"
        >
          View all <ArrowRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <ul className="mt-2 divide-y divide-v2-line/70">
        {RECOMMENDED_JOBS.map((j) => (
          <li key={j.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <CompanyTile name={j.company} size={48} />
              <div className="min-w-0">
                <h4 className="text-[15px] font-bold leading-snug text-v2-navy">{j.title}</h4>
                <p className="mt-0.5 text-[13px] text-v2-ink-soft">
                  {j.company} {"·"} {j.location} {"·"} {j.mode}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {j.tags.map((t) => (
                    <li key={t} className="rounded-md bg-v2-blue-soft px-2 py-0.5 text-[12px] font-medium text-v2-blue">
                      {t}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[12px] text-v2-muted">{j.posted}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#F1F5FB] px-3 py-1.5 text-[13px] font-bold text-v2-navy">
                <span
                  aria-hidden
                  className="h-5 w-5 rounded-full"
                  style={{ background: `conic-gradient(var(--color-v2-green) ${j.match}%, #E8ECF4 0)`, mask: "radial-gradient(circle, transparent 5px, #000 6px)" }}
                />
                {j.match}% Match
              </span>
              <button
                type="button"
                onClick={onApply}
                className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-v2-lime px-4 text-[13.5px] font-bold text-v2-navy hover:brightness-95"
              >
                Apply with AI <ArrowRightIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={saved.has(j.id) ? "Remove bookmark" : "Save job"}
                aria-pressed={saved.has(j.id)}
                onClick={() => toggle(j.id)}
                className={cn("ml-auto flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[#F1F5FB] md:ml-0", saved.has(j.id) ? "text-v2-green" : "text-v2-navy")}
              >
                <BookmarkIcon className="h-5 w-5" fill={saved.has(j.id) ? "currentColor" : "none"} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
