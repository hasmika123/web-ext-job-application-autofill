import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  ChartIcon,
  FileTextIcon,
  HeartIcon,
  SearchIcon,
  UsersIcon,
  ZapIcon,
  cn,
} from "@kiwiply/ui";
import BrandLogo from "@/components/marketing/BrandLogo";

/** Caveat marker annotation in the boards' navy ink. Decorative (aria-hidden); size comes from className. */
export function Hand({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span aria-hidden className={cn("block font-[family-name:var(--font-hand)] leading-[1.05] text-[#232A86]", className)}>
      {children}
    </span>
  );
}

/** Soft sky/foliage wash behind the whole auth screen (the boards' blurred campus + greenery). */
export function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-[#F4FAF0]">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 6% 4%, rgba(190,235,140,.55) 0%, transparent 70%)," +
            "radial-gradient(45% 40% at 62% 6%, rgba(200,228,255,.7) 0%, transparent 72%)," +
            "radial-gradient(40% 40% at 100% 96%, rgba(132,227,61,.28) 0%, transparent 70%)",
        }}
      />
      <div className="absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-v2-green/25 blur-3xl" />
      <div className="absolute bottom-24 left-[34%] hidden h-64 w-64 rounded-full bg-v2-lime/30 blur-3xl lg:block" />
      <div className="absolute -right-24 top-16 h-72 w-72 rounded-full bg-v2-lime/25 blur-3xl" />
    </div>
  );
}

/** The white right-hand card (24px radius) that holds every auth form. */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative z-10 w-full rounded-[24px] bg-paper px-5 py-7 shadow-v2-float sm:px-9 sm:py-9 lg:px-10 lg:py-10 xl:px-12",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Stacked-look logo + title + subtitle at the top of the card. */
export function CardHeader({
  title,
  subtitle,
  adornment,
  alwaysLogo,
}: {
  title: string;
  subtitle?: ReactNode;
  adornment?: ReactNode;
  /** Show the logo at every width (the standalone card pages have no art panel above it). */
  alwaysLogo?: boolean;
}) {
  return (
    <header className="mb-7 text-center">
      <Link href="/" aria-label="Kiwiply home" className={cn("mx-auto mb-4 w-fit", alwaysLogo ? "block" : "hidden lg:block")}>
        <BrandLogo height={52} priority />
      </Link>
      <h1 className="relative mx-auto w-fit text-[28px] text-v2-navy sm:text-[32px]">
        {title}
        {adornment}
      </h1>
      {subtitle && <p className="mt-2 text-[15px] text-v2-ink-soft">{subtitle}</p>}
    </header>
  );
}

/** "or continue with" hairline divider. */
export function AuthDivider({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3 text-[13px] text-v2-muted">
      <span className="h-px flex-1 bg-line" />
      {children}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Green-soft "Hiring for a team or organization?" card, links to /organizations. */
export function OrgCard({ title, body }: { title: string; body: string }) {
  return (
    <Link
      href="/organizations"
      className="group mt-6 flex min-h-[44px] items-center gap-4 rounded-2xl bg-v2-green-soft/70 p-4 transition-colors hover:bg-v2-green-soft"
    >
      <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-v2-green-soft text-v2-green">
        <UsersIcon size={26} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-v2-navy">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-v2-ink-soft">{body}</span>
      </span>
      <ArrowRightIcon size={22} className="flex-none text-v2-navy transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

const TONES = {
  blue: "bg-v2-blue-soft text-v2-blue",
  amber: "bg-v2-amber-soft text-v2-amber",
  pink: "bg-v2-pink-soft text-v2-pink",
  teal: "bg-v2-teal-soft text-v2-teal",
} as const;

export type Feature = {
  icon: "search" | "zap" | "file" | "chart";
  tone: keyof typeof TONES;
  title: string;
  sub?: string;
};

function FeatureGlyph({ icon, size }: { icon: Feature["icon"]; size: number }) {
  if (icon === "search") return <SearchIcon size={size} />;
  if (icon === "zap") return <ZapIcon size={size} />;
  if (icon === "file") return <FileTextIcon size={size} />;
  return <ChartIcon size={size} />;
}

function FeatureTile({ f, size, glyph }: { f: Feature; size: string; glyph: number }) {
  return (
    <span aria-hidden className={cn("grid flex-none place-items-center rounded-xl", size, TONES[f.tone])}>
      <FeatureGlyph icon={f.icon} size={glyph} />
    </span>
  );
}

/** Login board: the white floating card of four one-line features (tilted on wide screens). */
export function FeatureCard({ items, className }: { items: Feature[]; className?: string }) {
  return (
    <ul className={cn("w-full max-w-[260px] space-y-3.5 rounded-[22px] bg-paper p-4 shadow-v2-float", className)}>
      {items.map((f) => (
        <li key={f.title} className="flex items-center gap-3">
          <FeatureTile f={f} size="h-10 w-10" glyph={20} />
          <span className="text-[13.5px] font-semibold leading-tight text-v2-navy">{f.title}</span>
        </li>
      ))}
    </ul>
  );
}

/** Signup board: icon tile + bold title + grey sub-line, stacked. */
export function FeatureList({ items, className, compact }: { items: Feature[]; className?: string; compact?: boolean }) {
  return (
    <ul className={cn("space-y-5", compact && "space-y-4", className)}>
      {items.map((f) => (
        <li key={f.title} className="flex items-start gap-4">
          <FeatureTile f={f} size={compact ? "h-12 w-12" : "h-[52px] w-[52px]"} glyph={compact ? 24 : 26} />
          <span className="min-w-0 pt-0.5">
            <span className="block text-[15px] font-bold leading-tight text-v2-navy">{f.title}</span>
            {f.sub && <span className="mt-1 block text-[13px] leading-snug text-v2-ink-soft">{f.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Yellow sticky note carrying "Big dreams. You got this." (decorative). */
export function StickyNote({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "w-[130px] rounded-[6px] bg-v2-sticky px-4 pb-4 pt-3 shadow-[0_10px_20px_rgba(27,31,94,0.12)] sm:w-[150px]",
        className,
      )}
    >
      <HeartIcon size={20} className="absolute right-3 top-2.5 text-v2-green" />
      <Hand className="text-[22px] leading-[1.1] sm:text-[26px]">
        Big dreams.
        <br />
        You got this.
      </Hand>
    </div>
  );
}
