"use client";

import { useState, type ReactNode } from "react";
import { Badge, Button, MemberAvatar, Meter, cn } from "@kiwiply/ui";
import { relativeTime } from "@/lib/ent/dashboard";
import { CARD, Empty, Head, KpiTile, TINTS, VIEW_ALL, type TintName } from "@/components/ent/marketer-ws/parts";

export { CARD, Empty, Head, KpiTile, TINTS, VIEW_ALL };
export type { TintName };

export interface MgmtPageProps {
  orgId: number;
  orgName: string;
  firstName: string;
  hrefs: Record<string, string | null>;
  initialSearch?: Record<string, string | string[] | undefined>;
}

export const TABLE = "w-full min-w-[660px] border-collapse text-left text-[13px]";
export const TABLE_WRAP = "overflow-x-auto rounded-[var(--radius-lg)] border border-line";
export const SOFT_CARD = "min-w-0 rounded-[var(--radius-lg)] border border-line bg-paper p-4";

export function statusTone(value: string): string {
  const tone = value.toUpperCase();
  if (["ACTIVE", "APPROVED", "RESOLVED", "INTERESTED", "OFFER"].includes(tone)) return "bg-v2-green-soft text-v2-green-ink";
  if (["PAUSED", "SNOOZED", "NEEDS_INFO", "PENDING", "MEDIUM"].includes(tone)) return "bg-v2-amber-soft text-v2-amber-ink";
  if (["REJECTED", "HIGH", "OPEN", "STALE", "ESCALATED"].includes(tone)) return "bg-v2-pink-soft text-v2-pink-ink";
  if (["INTERVIEW", "VIEWED", "ACKNOWLEDGED"].includes(tone)) return "bg-v2-violet-soft text-v2-violet-ink";
  return "bg-paper-2 text-ink-soft";
}

export function StatusBadge({ value }: { value: string }) {
  return <Badge variant="default" className={cn("normal-case tracking-normal", statusTone(value))}>{value.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</Badge>;
}

export function SeverityBadge({ value }: { value: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold", statusTone(value))}><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />{value.toLowerCase()}</span>;
}

export function Person({ name, subtitle, avatar = true }: { name: string; subtitle?: string | null; avatar?: boolean }) {
  return <span className="flex min-w-0 items-center gap-2">{avatar ? <MemberAvatar name={name} size={30} /> : null}<span className="min-w-0"><span className="block truncate font-semibold text-ink">{name}</span>{subtitle ? <span className="block truncate text-[12px] text-muted">{subtitle}</span> : null}</span></span>;
}

export function Since({ value }: { value: string | null | undefined }) {
  const [now] = useState(() => Date.now());
  if (!value) return null;
  return <span className="text-[12px] text-muted">{relativeTime(value, now)}</span>;
}

export function EmptyManager({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="rounded-[var(--radius-lg)] border border-dashed border-line bg-paper p-8 text-center"><h2 className="text-[17px] font-bold text-ink">{title}</h2><p className="mx-auto mt-1 max-w-md text-[13.5px] text-muted">{description}</p>{action ? <div className="mt-4">{action}</div> : null}</div>;
}

export function LoadMeter({ assigned, capacity, percent, overloaded, label }: { assigned: number; capacity: number; percent: number; overloaded?: boolean; label: string }) {
  return <div className="min-w-[120px]"><div className="mb-1 flex items-center justify-between gap-2 text-[12px] text-muted"><span>{assigned} / {capacity || "—"}</span><span className={cn("font-semibold", overloaded ? "text-v2-pink-ink" : "text-ink-soft")}>{percent}%</span></div><Meter value={Math.max(0, Math.min(100, percent))} max={100} label={label} valueText={`${percent}% loaded`} /></div>;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3">{children}</div>;
}

export function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-muted"><span className="sr-only">{label}</span><input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" /></label>;
}

export { Button };
