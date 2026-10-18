"use client";

import type { ReactNode } from "react";
import { HEALTH_LABEL, HEALTH_TONE, tileInitials, tileTone, type TileTone } from "@/lib/ent/clients";

/**
 * The company tile: initials on a solid colour, round, as the board's logos. No logos exist, so this is the logo. The colour family is
 * stable for a name; the solid colours are the boards' fixed icon palette (`--ent-kpi-<tone>-fg`), never the tenant's brand colours.
 */
const TONE_VAR: Record<TileTone, string> = {
  violet: "var(--ent-kpi-violet-fg)",
  blue: "var(--ent-kpi-blue-fg)",
  pink: "var(--ent-kpi-pink-fg)",
  ink: "var(--ent-title)",
  orange: "var(--ent-kpi-orange-fg)",
  green: "var(--ent-kpi-green-fg)",
  indigo: "var(--ent-kpi-indigo-fg)",
  teal: "var(--ent-pill-green-fg)",
};

export function CompanyTile({ name, size = 38 }: { name: string; size?: number }) {
  const text = tileInitials(name);
  return (
    <span
      aria-hidden
      data-company-tile
      style={{ width: size, height: size, background: TONE_VAR[tileTone(name)], fontSize: Math.round(size * (text.length > 1 ? 0.36 : 0.46)) }}
      className="inline-grid flex-none place-items-center rounded-full font-bold leading-none tracking-tight text-white"
    >
      {text}
    </span>
  );
}

/** A status pill in one of the boards' tones (`.ent-pill`, theme-tenant.css: soft tint, bold coloured text). */
export function Pill({ tone, children, round = false, className = "", ...rest }: { tone: string; children: ReactNode; round?: boolean; className?: string } & Record<`data-${string}`, string | undefined>) {
  return (
    <span className={`ent-pill ${className}`} data-tone={tone} data-shape={round ? "round" : undefined} {...rest}>
      {children}
    </span>
  );
}

/** Healthy / At Risk / Neutral: the API's computed level, in the board's green, orange and blue. */
export function HealthPill({ level, className = "" }: { level: string; className?: string }) {
  return (
    <Pill tone={HEALTH_TONE[level] ?? "blue"} className={`!px-3 !py-1 !text-[12px] !font-medium ${className}`} data-health={level}>
      {HEALTH_LABEL[level] ?? level}
    </Pill>
  );
}

/** The tiny line under a section title in the drawer. */
export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-[14px] font-bold leading-tight text-[var(--ent-title)]">{title}</h3>
      {action}
    </div>
  );
}

export function LinkButton({ children, onClick, href, label }: { children: ReactNode; onClick?: () => void; href?: string | null; label?: string }) {
  const cls = "text-[13px] font-medium text-accent-deep hover:underline";
  if (href) {
    return (
      <a href={href} aria-label={label} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cls}>
      {children}
    </button>
  );
}
