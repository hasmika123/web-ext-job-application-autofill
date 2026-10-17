"use client";

import type { ReactNode } from "react";
import { CheckCircleIcon, ClockIcon, FileTextIcon, UsersIcon } from "@kiwiply/ui";
import { STATE_TONE, type OfferState } from "@/lib/ent/offers";

/** The state chip: Draft and the closed states are grey, Extended blue, Negotiating amber, Accepted green, Declined red. */
export function StatePill({ state, label }: { state: OfferState; label: string }) {
  return (
    <span className="ent-pill !rounded-md !px-2.5 !py-[3px] !text-[11px] !font-medium" data-tone={STATE_TONE[state]} data-offer-state={state}>
      {label}
    </span>
  );
}

export interface TileDef {
  key: string;
  label: string;
  icon: ReactNode;
  tone: "blue" | "green" | "orange" | "violet";
  value: number | null;
  hint: string;
}

/** The four tiles above the table: real counts from the offer table, none estimated. */
export function OfferTiles({ tiles, loading }: { tiles: TileDef[]; loading: boolean }) {
  return (
    <ul aria-label="Offer figures" className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-offer-tiles>
      {tiles.map((t) => (
        <li key={t.key} data-tile={t.key}>
          <div className="ent-card flex h-full flex-col px-4 pb-3 pt-3.5">
            <span aria-hidden className="ent-kpi-chip !h-10 !w-10 !rounded-[10px]" data-tone={t.tone}>
              {t.icon}
            </span>
            <span className="ent-kpi-label mt-2.5 !text-[12.5px] !font-normal leading-tight">{t.label}</span>
            <span className="ent-kpi-value mt-1 !text-[25px]" data-tile-value>
              {loading ? "" : t.value === null ? "—" : t.value.toLocaleString("en-US")}
            </span>
            <span className="mt-1 text-[12px] text-muted">{t.hint}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export const TILE_ICONS = {
  open: <ClockIcon size={20} />,
  soon: <ClockIcon size={20} />,
  accepted: <CheckCircleIcon size={20} />,
  placed: <UsersIcon size={20} />,
  records: <FileTextIcon size={20} />,
};
