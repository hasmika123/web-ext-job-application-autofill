import type { ReactNode } from "react";
import { CheckCircleIcon, Mark, cn } from "@kiwiply/ui";
import { Mascot } from "../media";
import { AboutHeading, AboutSection, FAMILY, type Family } from "./shared";

/* ── Tiny pure-HTML product mocks (fictional sample data, each tagged "Example") ───── */

function MockFrame({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="relative h-32 overflow-hidden rounded-xl bg-gradient-to-br from-v2-blue-soft/70 via-white to-v2-lime-soft/60 p-3"
    >
      <span className="absolute right-2 top-2 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-v2-muted">
        Example
      </span>
      {children}
    </div>
  );
}

function Bar({ w, className }: { w: string; className?: string }) {
  return <span className={cn("block h-1.5 rounded-full bg-v2-line", w, className)} />;
}

function MockAutofill() {
  return (
    <MockFrame>
      <div className="grid gap-1.5 pt-4">
        <Bar w="w-3/4" />
        <Bar w="w-1/2" />
        <Bar w="w-2/3" />
        <span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-lg bg-v2-lime px-3 py-1.5 text-[11px] font-bold text-ink">
          <Mark size={12} /> Review &amp; fill
        </span>
      </div>
    </MockFrame>
  );
}

function MockResume() {
  return (
    <MockFrame>
      <div className="mx-auto grid w-[70%] gap-1.5 rounded-md bg-white p-2.5 shadow-v2-card">
        <Bar w="w-1/2" className="bg-v2-navy/30" />
        <Bar w="w-full" />
        <Bar w="w-5/6" />
        <span className="w-fit rounded bg-v2-lime-soft px-1.5 py-0.5 text-[9px] font-semibold text-ink">
          Tailored for this job
        </span>
      </div>
    </MockFrame>
  );
}

function MockInbox() {
  const rows = [
    ["Interview invitation", "bg-v2-lime-soft"],
    ["Application received", "bg-v2-blue-soft"],
    ["Update from Northwind", "bg-v2-amber-soft"],
  ] as const;
  return (
    <MockFrame>
      <ul className="grid gap-1.5 pt-4">
        {rows.map(([t, bg]) => (
          <li key={t} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-[10px] font-semibold text-ink shadow-v2-card">
            <span className={cn("h-3 w-3 rounded-full", bg)} />
            {t}
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}

function MockMatches() {
  const rows = [
    ["Product Designer", "92%"],
    ["Operations Coordinator", "88%"],
    ["Data Analyst", "84%"],
  ] as const;
  return (
    <MockFrame>
      <ul className="grid gap-1.5 pt-4">
        {rows.map(([t, pct]) => (
          <li key={t} className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 text-[10px] font-semibold text-ink shadow-v2-card">
            {t}
            <span className="rounded bg-v2-green-soft px-1.5 text-[9px] text-ink">{pct} match</span>
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}

function MockInterview() {
  const rows = ["Practice questions", "Expert feedback", "Build confidence"];
  return (
    <MockFrame>
      <ul className="mx-auto grid w-[80%] gap-1.5 pt-4">
        {rows.map((t) => (
          <li key={t} className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1.5 text-[10px] font-semibold text-ink shadow-v2-card">
            <CheckCircleIcon size={12} className="text-v2-green" />
            {t}
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}

function MockDashboard() {
  return (
    <MockFrame>
      <div className="grid gap-2 pt-4">
        <div className="flex items-end gap-1.5">
          {[28, 40, 34, 52, 46, 62].map((h) => (
            <span key={h} className="w-4 rounded-t bg-v2-blue/70" style={{ height: h * 0.6 }} />
          ))}
        </div>
        <div className="flex gap-1.5 text-[9px] font-semibold text-ink">
          <span className="rounded bg-v2-blue-soft px-1.5 py-0.5">Applied</span>
          <span className="rounded bg-v2-amber-soft px-1.5 py-0.5">In review</span>
          <span className="rounded bg-v2-green-soft px-1.5 py-0.5">Interview</span>
        </div>
      </div>
    </MockFrame>
  );
}

const TILES: Array<{ title: string; body: string; family: Family; mock: ReactNode }> = [
  {
    title: "AI autofill",
    body: "Skip the repeat typing. Kiwiply fills the form from your profile and you review every answer.",
    family: "violet",
    mock: <MockAutofill />,
  },
  {
    title: "Best resume per job",
    body: "Keep several resumes and pick the one that fits each role.",
    family: "green",
    mock: <MockResume />,
  },
  {
    title: "Email tracking",
    body: "Connect your Gmail and see replies next to the application they belong to.",
    family: "amber",
    mock: <MockInbox />,
  },
  {
    title: "Job match discovery",
    body: "Find openings that fit your skills and goals, ranked for you.",
    family: "teal",
    mock: <MockMatches />,
  },
  {
    title: "Interview readiness",
    body: "Expert mock interviews and coaching, available as services when you want a human in your corner.",
    family: "pink",
    mock: <MockInterview />,
  },
  {
    title: "All-in-one dashboard",
    body: "Every application and its status in one board, so nothing slips.",
    family: "blue",
    mock: <MockDashboard />,
  },
];

/** §8.5 — six feature tiles, each with a tiny fictional mock. */
export default function Different() {
  return (
    <AboutSection labelledBy="different-title">
      <div className="relative">
        <AboutHeading
          id="different-title"
          eyebrow="What makes Kiwiply different"
          family="violet"
          title="Powerful tools for a"
          accent="simpler, smarter job search."
        />
        <div aria-hidden className="absolute -top-4 right-0 hidden items-center gap-2 lg:flex">
          <span className="-rotate-3 text-right font-[family-name:var(--font-hand)] text-2xl leading-6 text-ink">
            Less effort.
            <br />
            More opportunity.
          </span>
          <Mascot pose="laptop" className="h-24 w-24" />
        </div>
      </div>

      <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((t) => (
          <li
            key={t.title}
            className="flex flex-col gap-4 rounded-[var(--radius-v2-card)] bg-white p-4 shadow-v2-card"
          >
            {t.mock}
            <div className="px-1 pb-1">
              <h3 className="flex items-center gap-2 text-[17px] font-bold tracking-normal text-ink">
                <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", FAMILY[t.family].dot)} />
                {t.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{t.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </AboutSection>
  );
}
