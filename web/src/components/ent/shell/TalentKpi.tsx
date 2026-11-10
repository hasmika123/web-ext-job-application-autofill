"use client";

import type { ReactNode } from "react";
import { KpiTile } from "@kiwiply/ui";
import type { KpiDelta, KpiTone } from "@kiwiply/ui";

/** A delta as the pages compute it: a direction and a text that may or may not carry its sign. */
export interface TalentDelta {
  dir: "up" | "down" | "flat";
  text: string;
  /** Whether the move is good news, when the page already knows (otherwise `lowerIsBetter` decides). */
  good?: boolean | null;
}

/** The boards write "+12%" / "-22%" (sign in the text, arrow beside it); `lowerIsBetter` turns a rise red. */
export function toKpiDelta(d: TalentDelta | null | undefined, vs: string, lowerIsBetter = false): KpiDelta | null {
  if (!d) return null;
  const signed = /^[+-]/.test(d.text) || d.dir === "flat" ? d.text : `${d.dir === "up" ? "+" : "-"}${d.text}`;
  return { text: signed, dir: d.dir, good: d.dir === "flat" ? null : d.good !== undefined ? d.good : (d.dir === "up") !== lowerIsBetter, suffix: vs };
}

/**
 * One KPI tile of the talent boards: the shared `KpiTile` with the sparkline drawn in the icon's own colour (violet, green, orange, blue,
 * pink), as the boards do. The page keeps its `data-kpi` hook and its `aria-label`ed list.
 */
export default function TalentKpi({
  id,
  tone,
  label,
  icon,
  value,
  delta,
  vs,
  lowerIsBetter,
  series,
  seriesLabel,
  loading,
}: {
  id: string;
  tone: KpiTone;
  label: string;
  icon: ReactNode;
  value: ReactNode;
  delta?: TalentDelta | null;
  vs: string;
  lowerIsBetter?: boolean;
  series?: number[] | null;
  seriesLabel?: string;
  loading?: boolean;
}) {
  return (
    <KpiTile
      id={id}
      tone={tone}
      label={label}
      icon={icon}
      value={value}
      delta={toKpiDelta(delta, vs, lowerIsBetter)}
      series={series}
      seriesLabel={seriesLabel}
      lineColor={`var(--ent-kpi-${tone}-fg)`}
      loading={loading}
    />
  );
}
