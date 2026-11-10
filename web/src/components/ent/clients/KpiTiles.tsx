"use client";

import { BuildingIcon, FileTextIcon, KpiTile } from "@kiwiply/ui";
import type { KpiTone } from "@kiwiply/ui";
import type { Summary, Tile } from "@/lib/ent/clients";

interface TileDef {
  key: keyof Pick<Summary, "totalClients" | "activeRequirements">;
  id: string;
  label: string;
  tone: KpiTone;
  icon: React.ReactNode;
}

const TILES: TileDef[] = [
  { key: "totalClients", id: "totalClients", label: "Clients", tone: "violet", icon: <BuildingIcon size={22} /> },
  { key: "activeRequirements", id: "activeRequirements", label: "Active requirements", tone: "green", icon: <FileTextIcon size={22} /> },
];

/**
 * The two KPI tiles of the Clients page: how many clients there are and how many requirements are open. Plain figures from the API (no
 * trend line, no comparison).
 */
export default function KpiTiles({ summary, loading, error }: { summary: Summary | null; loading: boolean; error: boolean }) {
  return (
    <ul aria-label="Client figures" className="grid grid-cols-2 gap-3.5 xl:max-w-[50%]" data-kpi-tiles>
      {TILES.map((t) => {
        const tile: Tile | null = summary ? summary[t.key] : null;
        return (
          <li key={t.key}>
            <KpiTile id={t.id} tone={t.tone} label={t.label} icon={t.icon} loading={loading} value={tile ? tile.value.toLocaleString("en-US") : error ? "\u2014" : ""} />
          </li>
        );
      })}
    </ul>
  );
}
