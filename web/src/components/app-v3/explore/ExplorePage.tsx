"use client";

import { useState } from "react";
import { ArrowRightIcon, ChevronRightIcon, EmptyState, FileTextIcon, cn, useToast } from "@kiwiply/ui";
import { CompanyTile, IconTile, SectionCard, UnderlineTabs } from "@/components/app-v2/common";
import { TONE } from "@/components/app-v2/common";
import { HeroBand } from "@/components/app-v2/common";
import { EX_TABS } from "../sample-data";
import { useSamples } from "../SamplesProvider";

/**
 * Explore (APP-V3-SPEC 2.11). All four sections sit on one page; the tabs scroll to their section
 * (the richest-variant rule). The companies, roles, paths and resources are SAMPLE content until U11.1-U11.3 build
 * them from real data, so only a demo account on a sample-enabled build sees them (`samples()`, U0.5); a real
 * account sees an honest empty state. Company / role / resource clicks say "Coming soon" until the browse flows ship.
 */
export default function ExplorePage() {
  const toast = useToast();
  const sample = useSamples();
  const companies = sample("EX_COMPANIES");
  const roles = sample("EX_ROLES");
  const paths = sample("EX_PATHS");
  const resources = sample("EX_RESOURCES");
  const soon = () => toast({ title: "Coming soon" });
  const [tab, setTab] = useState(EX_TABS[0].id);

  const go = (id: string) => {
    setTab(id);
    document.getElementById(`explore-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (companies.length + roles.length + paths.length + resources.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
        <HeroBand title="Explore" subtitle="Discover companies, roles, and career resources." mascot="mascot-binoculars" note="So much to discover!" />
        <EmptyState mascot title="Nothing to explore yet" description="Companies and roles appear here as jobs come in." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <HeroBand title="Explore" subtitle="Discover companies, roles, and career resources." mascot="mascot-binoculars" note="So much to discover!" />

      <div className="rounded-2xl border border-v2-line bg-white shadow-v2-soft">
        <UnderlineTabs padded counts="pill" ariaLabel="Explore sections" value={tab} onChange={go} className="border-b-0 px-2 sm:px-4" tabs={EX_TABS} />
      </div>

      <section id="explore-companies" className="scroll-mt-24">
        <SectionCard title="Popular Companies" action={{ label: "View all", onClick: soon }}>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
            {companies.map((c) => (
              <li key={c.name}>
                <button
                  type="button"
                  onClick={soon}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl border border-v2-line bg-white px-2 py-4 text-center transition-shadow hover:shadow-v2-soft"
                >
                  <CompanyTile name={c.name} size={48} />
                  <span className="text-[14.5px] font-bold text-v2-navy">{c.name}</span>
                  <span className="text-[12.5px] text-v2-ink-soft">{c.jobs} jobs</span>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      </section>

      <section id="explore-roles" className="scroll-mt-24">
        <SectionCard title="Trending Roles" action={{ label: "View all", onClick: soon }}>
          <ul className="flex flex-wrap gap-2.5">
            {roles.map((r) => (
              <li key={r}>
                <button
                  type="button"
                  onClick={soon}
                  className="rounded-full border border-v2-line bg-white px-4 py-2.5 text-[13.5px] font-semibold text-v2-navy hover:bg-v2-blue-soft hover:text-v2-blue"
                >
                  {r}
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      </section>

      <section id="explore-career-paths" className="scroll-mt-24">
        <SectionCard title="Career Paths">
          <ul className="grid gap-4 lg:grid-cols-2">
            {paths.map((p) => (
              <li key={p.title} className={cn("rounded-2xl p-4", TONE[p.tone].soft)}>
                <p className={cn("text-[12.5px] font-bold uppercase tracking-wide", TONE[p.tone].ink)}>{p.title}</p>
                <ol className="mt-3 flex flex-wrap items-center gap-2">
                  {p.steps.map((s, i) => (
                    <li key={s} className="flex items-center gap-2">
                      <span className="rounded-xl bg-white px-3.5 py-2 text-[13.5px] font-bold text-v2-navy shadow-v2-soft">{s}</span>
                      {i < p.steps.length - 1 && <ArrowRightIcon aria-hidden className="h-4 w-4 flex-none text-v2-ink-soft" />}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        </SectionCard>
      </section>

      <section id="explore-resources" className="scroll-mt-24">
        <SectionCard title="Resources">
          <ul className="divide-y divide-v2-line/70">
            {resources.map((r) => (
              <li key={r.title} className="py-3 first:pt-0 last:pb-0">
                <button type="button" onClick={soon} className="flex w-full items-center gap-3 text-left">
                  <IconTile tone="blue">
                    <FileTextIcon className="h-5 w-5" />
                  </IconTile>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-bold text-v2-navy">{r.title}</span>
                    <span className="block text-[12.5px] text-v2-ink-soft">{r.sub}</span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 flex-none text-v2-muted" />
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      </section>
    </div>
  );
}
