"use client";

import { BriefcaseIcon, BuildingIcon, FileTextIcon, KpiTile, UsersIcon } from "@kiwiply/ui";
import type { KpiDelta, KpiTone } from "@kiwiply/ui";
import { tileDelta, type Summary, type Tile } from "@/lib/ent/clients";

interface TileDef {
  key: keyof Pick<Summary, "totalClients" | "activeRequirements" | "newThisMonth" | "placementsViaClients">;
  id: string;
  label: string;
  tone: KpiTone;
  icon: React.ReactNode;
}

/** The boards' tones, left to right: violet (building), green (document), orange (people), blue (briefcase). */
const TILES: TileDef[] = [
  { key: "totalClients", id: "totalClients", label: "Total Clients", tone: "violet", icon: <BuildingIcon size={22} /> },
  { key: "activeRequirements", id: "activeRequirements", label: "Active Requirements", tone: "green", icon: <FileTextIcon size={22} /> },
  { key: "newThisMonth", id: "newThisMonth", label: "New Clients This Month", tone: "orange", icon: <UsersIcon size={22} /> },
  { key: "placementsViaClients", id: "placementsViaClients", label: "Placements via Clients", tone: "blue", icon: <BriefcaseIcon size={22} /> },
];

function deltaOf(t: Tile | null): KpiDelta | null {
  const d = tileDelta(t, "percent");
  if (!d) return null;
  return { text: d.text, dir: d.dir, good: d.dir === "flat" ? null : d.dir === "up", suffix: "vs last month" };
}

/**
 * The four KPI tiles of the Clients page. The delta ("vs last month") is drawn only when the API gave one (an organization with no
 * client older than a month has nothing to compare with), and the sparkline only when it has at least two weekly points: nothing here is invented.
 */
export default function KpiTiles({ summary, loading, error }: { summary: Summary | null; loading: boolean; error: boolean }) {
  return (
    <ul aria-label="Client figures" className="grid grid-cols-2 gap-3.5 xl:grid-cols-4" data-kpi-tiles>
      {TILES.map((t) => {
        const tile: Tile | null = summary ? summary[t.key] : null;
        return (
          <li key={t.key}>
            <KpiTile
              id={t.id}
              tone={t.tone}
              label={t.label}
              icon={t.icon}
              loading={loading}
              value={tile ? tile.value.toLocaleString("en-US") : error ? "—" : ""}
              delta={deltaOf(tile)}
              series={tile && tile.series.length >= 2 ? tile.series : null}
              seriesLabel={`${t.label}, last ${tile?.series.length ?? 8} weeks`}
            />
          </li>
        );
      })}
    </ul>
  );
}
