"use client";

import { useSyncExternalStore } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  BriefcaseIcon,
  BuildingIcon,
  ChartIcon,
  GlobeIcon,
  GraduationCapIcon,
  HandshakeIcon,
  HeartIcon,
  LightbulbIcon,
  MemberAvatar,
  RocketIcon,
  ShieldIcon,
  ChevronRightIcon,
  SparklesIcon,
  UsersIcon,
  XIcon,
  DollarIcon,
} from "@kiwiply/ui";
import { cn } from "@kiwiply/ui";
import { openHelpPanel } from "@/components/ent/shell/ShellContext";
import { EnterpriseMascot } from "@/lib/ent/mascot";
import { TONE_TILE, toneOf, type GroupPerson } from "@/lib/ent/groups";

/** Icon name (the API's closed list) -> the `@kiwiply/ui` glyph. */
export const GROUP_ICON: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  briefcase: BriefcaseIcon,
  users: UsersIcon,
  building: BuildingIcon,
  chart: ChartIcon,
  heart: HeartIcon,
  rocket: RocketIcon,
  globe: GlobeIcon,
  shield: ShieldIcon,
  graduation: GraduationCapIcon,
  dollar: DollarIcon,
  lightbulb: LightbulbIcon,
  handshake: HandshakeIcon,
};

/** The board's status chip: a soft green pill with green text (archived is the same shape in grey). */
export function GroupStatus({ status }: { status: string }) {
  const off = status === "INACTIVE";
  return (
    <span data-group-status={status} className={cn("inline-flex items-center rounded-lg px-2.5 py-0.5 text-[12px] font-semibold leading-5", off ? "bg-paper-2 text-ink-soft" : "bg-v2-green-soft text-v2-green-ink")}>
      {off ? "Archived" : "Active"}
    </span>
  );
}

/** The rounded icon tile of a department or team, in its picked tone (brand tones follow the tenant theme). */
export function GroupTile({ icon, color, size = 44, fallback = "users" }: { icon: string | null; color: string | null; size?: number; fallback?: string }) {
  const Icon = GROUP_ICON[icon ?? fallback] ?? UsersIcon;
  return (
    <span aria-hidden data-group-tile style={{ width: size, height: size }} className={cn("inline-grid flex-none place-items-center", size >= 40 ? "rounded-[12px]" : "rounded-lg", TONE_TILE[toneOf(color)])}>
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}

/** Up to four avatars overlapped, then a "+N" chip (the board's pale pill). */
export function AvatarStack({ people, total, size = 28 }: { people: GroupPerson[]; total: number; size?: number }) {
  const extra = Math.max(0, total - people.length);
  if (people.length === 0) return <span className="text-[12px] text-muted">No people yet</span>;
  return (
    <span className="inline-flex items-center" role="img" aria-label={`${total} ${total === 1 ? "person" : "people"}`}>
      {people.map((p, i) => (
        <span key={p.memberId} className={cn("rounded-full ring-2 ring-white", i > 0 && "-ml-2")}>
          <MemberAvatar name={p.name} size={size} />
        </span>
      ))}
      {extra > 0 && <span className="-ml-1 inline-flex h-7 items-center rounded-full bg-accent-soft/70 px-2 pl-3 text-[12px] font-semibold text-ink-soft">+{extra}</span>}
    </span>
  );
}

/** One KPI tile of the board: a pastel icon tile, the label, the big number, a small hint line. A tile appears only when the API has a real number for it. */
export function Kpi({ icon, label, value, hint, tone = "primary" }: { icon: ReactNode; label: string; value: ReactNode; hint?: string; tone?: string }) {
  return (
    <div data-kpi={label} className="grp-card flex min-w-0 flex-col p-4">
      <span aria-hidden className={cn("inline-grid h-10 w-10 place-items-center rounded-[11px]", TONE_TILE[toneOf(tone)])}>
        {icon}
      </span>
      <div className="mt-2.5 text-[14px] font-medium text-ink-soft">{label}</div>
      <div className="mt-1 text-[30px] font-extrabold leading-[1.1] tabular-nums text-ink">{value}</div>
      <div className="mt-1.5 min-h-[18px] text-[12.5px] text-muted">{hint ?? " "}</div>
    </div>
  );
}

/** A section heading as on the board: an accent icon, the title and a one-line subtitle, with the page's controls to the right. */
export function SectionHead({ icon, title, subtitle, children, id }: { icon: ReactNode; title: string; subtitle?: string; children?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <span aria-hidden className="grid h-9 w-9 flex-none place-items-center text-accent">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 id={id} className="text-[18px] font-extrabold leading-tight text-ink">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

const HELP_CARD_EVENT = "kiwiply:help-card";

/** The page's own "Need help with ...?" card (the board has one under the right column): the bee, the offer and the question button. */
export function PageHelpCard({ topic, text, layout = "stacked" }: { topic: string; text: string; layout?: "stacked" | "side" }) {
  const key = `kiwiply.ent.help-card.${topic}`;
  const hidden = useSyncExternalStore(
    (cb) => {
      window.addEventListener(HELP_CARD_EVENT, cb);
      return () => window.removeEventListener(HELP_CARD_EVENT, cb);
    },
    () => {
      try {
        return window.localStorage.getItem(key) === "off";
      } catch {
        return false;
      }
    },
    () => false,
  );
  if (hidden) return null;
  const close = () => {
    try {
      window.localStorage.setItem(key, "off");
    } catch {
      /* storage blocked: the card comes back on reload */
    }
    window.dispatchEvent(new Event(HELP_CARD_EVENT));
  };
  const side = layout === "side";
  return (
    <section aria-label={`Need help with ${topic}?`} data-help-card={topic} className={cn("grp-card relative overflow-hidden", side ? "grid grid-cols-[minmax(0,42%)_1fr] gap-4 p-3.5" : "flex flex-col")}>
      <div className={cn("flex items-end justify-center bg-gradient-to-b from-accent-soft to-white", side ? "min-h-[150px] items-center rounded-xl" : "pt-3")}>
        <EnterpriseMascot pose="greet" size="lg" />
      </div>
      <div className={cn("min-w-0", side ? "" : "p-4 pt-3")}>
        <button type="button" onClick={close} aria-label="Hide this card" title="Hide" className={cn("absolute grid h-7 w-7 place-items-center rounded-lg text-ink-soft hover:bg-paper-2", side ? "right-2 top-2" : "right-3 top-3 bg-white/90 shadow-sm")}>
          <XIcon size={15} />
        </button>
        <h2 className={cn("font-extrabold leading-tight text-ink", side ? "pr-6 text-[15px]" : "text-[17px]")}>Need help with {topic}?</h2>
        <p className="mt-1 text-[12.5px] leading-snug text-ink-soft">{text}</p>
        <button
          type="button"
          onClick={openHelpPanel}
          className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-accent-soft/70 px-3 text-left text-[14px] font-semibold text-accent-deep hover:bg-accent-soft"
        >
          <SparklesIcon size={17} className="flex-none" />
          <span className="min-w-0 flex-1 truncate">Ask a question...</span>
          <ChevronRightIcon size={16} className="flex-none" />
        </button>
      </div>
    </section>
  );
}
