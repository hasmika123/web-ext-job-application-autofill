"use client";

import { useState } from "react";
import { BuildingIcon, ChevronDownIcon, ChevronRightIcon, cn } from "@kiwiply/ui";
import { plural, TONE_TILE, toneOf, type Group, type Structure } from "@/lib/ent/groups";
import { GROUP_ICON, GroupTile } from "./GroupVisuals";

export function StructureTree({ structure, onOpen, withCohorts = true }: { structure: Structure; onOpen: (g: Group) => void; withCohorts?: boolean }) {
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setClosed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const row = (g: Group) => (
    <li key={g.id} className="relative">
      <button type="button" onClick={() => onOpen(g)} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left hover:bg-accent-soft/40 focus-visible:outline-2 focus-visible:outline-accent">
        <GroupTile icon={g.icon} color={g.color} size={24} fallback="users" />
        <span className={cn("min-w-0 flex-1 truncate text-[13.5px] text-ink", g.status === "INACTIVE" && "text-muted line-through")}>{g.name}</span>
        <span className="min-w-9 rounded-full bg-accent-soft/60 px-2.5 py-0.5 text-center text-[12.5px] font-medium tabular-nums text-ink" aria-label={plural(g.activeCount, "person", "people")}>
          {g.activeCount}
        </span>
      </button>
    </li>
  );
  /** one nested list: a vertical rail and a short tick into each row */
  const rail = "ml-[18px] border-l border-line pl-3 [&>li]:relative [&>li]:before:absolute [&>li]:before:-left-3 [&>li]:before:top-5 [&>li]:before:h-px [&>li]:before:w-3 [&>li]:before:bg-line";

  return (
    <div data-structure-tree className="text-[13.5px]">
      <div className="flex items-center gap-2.5 px-1.5 py-1 font-bold text-ink">
        <span aria-hidden className="grid h-6 w-6 flex-none place-items-center rounded-lg bg-accent-soft text-accent">
          <BuildingIcon size={14} />
        </span>
        <span className="min-w-0 flex-1 truncate">{structure.organizationName}</span>
        <span className="rounded-full bg-accent-soft/60 px-2.5 py-0.5 text-[12.5px] font-medium tabular-nums">{structure.employees}</span>
      </div>
      <ul className={cn("mt-1 flex flex-col", rail)}>
        {structure.departments.map(({ group, teams }) => {
          const shut = closed.has(group.id);
          return (
            <li key={group.id}>
              <div className="flex items-center">
                {teams.length > 0 ? (
                  <button type="button" aria-expanded={!shut} aria-label={`${shut ? "Expand" : "Collapse"} ${group.name}`} onClick={() => toggle(group.id)} className="grid h-10 w-6 flex-none place-items-center text-muted focus-visible:outline-2 focus-visible:outline-accent">
                    {shut ? <ChevronRightIcon size={15} /> : <ChevronDownIcon size={15} />}
                  </button>
                ) : (
                  <span className="w-6 flex-none" />
                )}
                <ul className="min-w-0 flex-1">{row(group)}</ul>
              </div>
              {teams.length > 0 && !shut && <ul className={cn("ml-6", rail)}>{teams.map((t) => row(t))}</ul>}
            </li>
          );
        })}
        {structure.unassignedTeams.length > 0 && (
          <li>
            <div className="px-2 pb-0.5 pt-2 text-[11.5px] font-bold uppercase tracking-wide text-muted">Teams without a department</div>
            <ul>{structure.unassignedTeams.map((t) => row(t))}</ul>
          </li>
        )}
        {withCohorts && structure.cohorts.length > 0 && (
          <li>
            <div className="px-2 pb-0.5 pt-2 text-[11.5px] font-bold uppercase tracking-wide text-muted">Cohorts</div>
            <ul>{structure.cohorts.map((t) => row(t))}</ul>
          </li>
        )}
      </ul>
      {structure.departments.length === 0 && structure.unassignedTeams.length === 0 && <p className="mt-2 px-2 text-[13px] text-muted">Nothing here yet.</p>}
    </div>
  );
}

