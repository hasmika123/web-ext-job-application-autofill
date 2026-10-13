"use client";

import { useState } from "react";
import { BuildingIcon, ChevronDownIcon, ChevronRightIcon, cn } from "@kiwiply/ui";
import { plural, TONE_BAR, toneOf, type Group, type Structure } from "@/lib/ent/groups";
import { GroupTile } from "./GroupVisuals";

/** The organization as a small chart: the organization on top, its departments in a row beneath, joined by a line. Used on the Departments page. */
export function OrgChart({ structure, onOpen }: { structure: Structure; onOpen: (g: Group) => void }) {
  const deps = structure.departments.map((d) => d.group);
  return (
    <div data-org-chart className="flex flex-col items-center gap-0 py-1">
      <div className="inline-flex items-center gap-2 rounded-xl bg-accent-soft px-4 py-2 text-[14px] font-bold text-accent-deep">
        <BuildingIcon size={18} /> {structure.organizationName}
      </div>
      {deps.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted">No departments yet.</p>
      ) : (
        <>
          <span aria-hidden className="h-4 w-px bg-line" />
          <ul aria-label="Departments in the organization" className="relative flex w-full flex-wrap justify-center gap-x-3 gap-y-3 border-t border-line pt-4">
            {deps.map((d) => (
              <li key={d.id} className="relative">
                <span aria-hidden className="absolute -top-4 left-1/2 h-4 w-px bg-line" />
                <button
                  type="button"
                  onClick={() => onOpen(d)}
                  title={`${d.name}: ${plural(d.activeCount, "employee")}`}
                  className={cn("flex w-[78px] flex-col items-center gap-1.5 rounded-xl border border-line p-2 text-center hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-accent", d.status === "INACTIVE" && "opacity-60")}
                >
                  <GroupTile icon={d.icon} color={d.color} size={38} />
                  <span className="w-full truncate text-[12px] font-semibold text-ink">{d.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** The full tree: organization, departments (open or closed), their teams, teams with no department, cohorts. Each row opens the group. */
export function StructureTree({ structure, onOpen, withCohorts = true }: { structure: Structure; onOpen: (g: Group) => void; withCohorts?: boolean }) {
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setClosed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const row = (g: Group, depth: number) => (
    <li key={g.id}>
      <button
        type="button"
        onClick={() => onOpen(g)}
        className={cn("flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-accent", depth > 0 && "pl-3")}
      >
        <span aria-hidden className={cn("h-2.5 w-2.5 flex-none rounded-full", TONE_BAR[toneOf(g.color)])} />
        <span className={cn("min-w-0 flex-1 truncate text-[13.5px] text-ink", g.status === "INACTIVE" && "text-muted line-through")}>{g.name}</span>
        <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-ink-soft" aria-label={plural(g.activeCount, "person", "people")}>
          {g.activeCount}
        </span>
      </button>
    </li>
  );

  return (
    <div data-structure-tree className="text-[13.5px]">
      <div className="flex items-center gap-2 rounded-lg bg-accent-soft/60 px-2.5 py-2 font-bold text-accent-deep">
        <BuildingIcon size={16} />
        <span className="min-w-0 flex-1 truncate">{structure.organizationName}</span>
        <span className="text-[12px] font-semibold tabular-nums">{structure.employees}</span>
      </div>
      <ul className="mt-1 flex flex-col border-l border-line pl-2.5">
        {structure.departments.map(({ group, teams }) => {
          const shut = closed.has(group.id);
          return (
            <li key={group.id}>
              <div className="flex items-center">
                {teams.length > 0 ? (
                  <button type="button" aria-expanded={!shut} aria-label={`${shut ? "Expand" : "Collapse"} ${group.name}`} onClick={() => toggle(group.id)} className="grid h-11 w-8 flex-none place-items-center text-muted focus-visible:outline-2 focus-visible:outline-accent">
                    {shut ? <ChevronRightIcon size={15} /> : <ChevronDownIcon size={15} />}
                  </button>
                ) : (
                  <span className="w-8 flex-none" />
                )}
                <ul className="min-w-0 flex-1">{row(group, 0)}</ul>
              </div>
              {teams.length > 0 && !shut && <ul className="ml-8 border-l border-line pl-1.5">{teams.map((t) => row(t, 1))}</ul>}
            </li>
          );
        })}
        {structure.unassignedTeams.length > 0 && (
          <li>
            <div className="px-2 pb-0.5 pt-2 text-[11.5px] font-bold uppercase tracking-wide text-muted">Teams without a department</div>
            <ul>{structure.unassignedTeams.map((t) => row(t, 0))}</ul>
          </li>
        )}
        {withCohorts && structure.cohorts.length > 0 && (
          <li>
            <div className="px-2 pb-0.5 pt-2 text-[11.5px] font-bold uppercase tracking-wide text-muted">Cohorts</div>
            <ul>{structure.cohorts.map((t) => row(t, 0))}</ul>
          </li>
        )}
      </ul>
      {structure.departments.length === 0 && structure.unassignedTeams.length === 0 && <p className="mt-2 px-2 text-[13px] text-muted">Nothing here yet.</p>}
    </div>
  );
}

