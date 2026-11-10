import type { ReactNode } from "react";
import { BellIcon, CalendarIcon, CheckIcon, ChatIcon, ClockIcon, MailIcon, UserIcon, cn } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";
import { Avatar } from "./parts";

/**
 * Mini product mocks for the 12 feature cards, as drawn on the board. Pure HTML and decorative:
 * every mock is aria-hidden, uses fictional names and initials tiles instead of portraits.
 */

/** Shared white mini-card surface. */
function Chip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-v2-line/70 bg-white px-2 py-1.5 shadow-[0_4px_12px_rgba(27,31,94,0.06)]", className)}>
      {children}
    </div>
  );
}

/** A grey bar standing in for a line of text. */
function Line({ w, tone = "bg-v2-line" }: { w: string; tone?: string }) {
  return <span className={cn("block h-1.5 rounded-full", tone, w)} />;
}

/** Small round icon dot used in the list-style mocks. */
function IconDot({ family, children }: { family: Family; children: ReactNode }) {
  const f = FAMILY[family];
  return <span className={cn("grid h-5 w-5 flex-none place-items-center rounded-full", f.soft, f.icon)}>{children}</span>;
}

/** Two-line label used inside list mocks. */
function Label({ title, sub, subClass }: { title: string; sub: string; subClass?: string }) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-[10px] font-bold text-v2-navy">{title}</span>
      <span className={cn("truncate text-[9.5px] text-v2-muted", subClass)}>{sub}</span>
    </span>
  );
}

export function TeamManagementMock() {
  return (
    <Chip className="flex items-center px-2.5 py-2.5">
      {["AL", "MK", "DC"].map((i, n) => (
        <Avatar
          key={i}
          initials={i}
          family={(["pink", "blue", "teal"] as const)[n]}
          className="-ml-2 h-8 w-8 border-2 border-white text-[10px] first:ml-0"
        />
      ))}
      <span className="-ml-2 grid h-8 w-8 flex-none place-items-center rounded-full border-2 border-white bg-v2-blue-soft text-[15px] font-bold leading-none text-v2-blue">
        +
      </span>
    </Chip>
  );
}

export function EmployeeProfilesMock() {
  return (
    <Chip className="flex items-center gap-2.5 px-2.5 py-2">
      <Avatar initials="PN" family="coral" className="h-9 w-9 text-[11px]" />
      <span className="flex flex-1 flex-col gap-1.5">
        <Line w="w-full" tone="bg-v2-blue/30" />
        <Line w="w-4/5" />
        <Line w="w-3/5" />
      </span>
    </Chip>
  );
}

export function ResumeManagementMock() {
  return (
    <div className="relative">
      <Chip className="flex flex-col gap-1.5 px-2.5 py-2.5">
        <Line w="w-1/2" tone="bg-v2-blue/40" />
        <Line w="w-full" />
        <Line w="w-5/6" />
        <Line w="w-2/3" />
      </Chip>
      <span className="absolute -bottom-2 -right-2 grid h-7 w-7 place-items-center rounded-full bg-v2-green text-[10px] font-bold text-white shadow-sm">
        v3
      </span>
    </div>
  );
}

export function SupportCoachesMock() {
  return (
    <div className="flex flex-col gap-1.5">
      {[
        { i: "CC", t: "Career Coach", f: "blue" },
        { i: "RC", t: "Recruiter", f: "violet" },
      ].map((r) => (
        <Chip key={r.t} className="flex items-center gap-2 py-1">
          <Avatar initials={r.i} family={r.f as Family} className="h-6 w-6 text-[9px]" />
          <span className="text-[10px] font-bold text-v2-navy">{r.t}</span>
        </Chip>
      ))}
    </div>
  );
}

export function AiMatchingMock() {
  return (
    <div className="flex flex-col gap-1.5">
      {[
        { t: "Marketing Specialist", m: "95% match", f: "green" },
        { t: "Product Designer", m: "87% match", f: "violet" },
      ].map((r) => (
        <Chip key={r.t} className="flex items-center gap-2 py-1.5">
          <IconDot family={r.f as Family}>
            <UserIcon className="h-3 w-3" />
          </IconDot>
          <Label title={r.t} sub={r.m} subClass="font-semibold text-[#14702A]" />
        </Chip>
      ))}
    </div>
  );
}

export function AutomationMock() {
  return (
    <div className="relative">
      <Chip className="flex flex-col gap-1.5 px-2.5 pb-7 pt-2.5">
        <Line w="w-1/2" tone="bg-v2-blue/40" />
        <Line w="w-full" />
        <Line w="w-4/5" />
      </Chip>
      <span className="absolute -bottom-1.5 right-1.5 rounded-md bg-[#1F9D3A] px-3 py-1 text-[10px] font-bold text-white shadow-sm">
        Auto Apply
      </span>
    </div>
  );
}

export function EmailTrackingMock() {
  return (
    <div className="flex items-start gap-1.5">
      <span className="grid h-6 w-6 flex-none place-items-center rounded-md border border-v2-line/70 bg-white text-[13px] font-extrabold leading-none text-[#D93025] shadow-[0_4px_12px_rgba(27,31,94,0.06)]">
        M
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
      {[
        { t: "Interview Invitation", s: "2h ago", f: "coral", Icon: MailIcon },
        { t: "Application Viewed", s: "1 day ago", f: "blue", Icon: CheckIcon },
        { t: "No Response", s: "3 days ago", f: "amber", Icon: ClockIcon },
      ].map((r) => (
        <Chip key={r.t} className="flex items-center gap-2 py-1">
          <IconDot family={r.f as Family}>
            <r.Icon className="h-3 w-3" />
          </IconDot>
          <Label title={r.t} sub={r.s} />
        </Chip>
      ))}
      </div>
    </div>
  );
}

export function InterviewTrackingMock() {
  return (
    <Chip className="flex flex-col gap-2 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-v2-coral-soft text-v2-coral">
          <CalendarIcon className="h-4 w-4" />
        </span>
        <Label title="Interview" sub="Mon, Apr 22 · 10:00 AM" />
      </div>
      <div className="flex items-center gap-1">
        <Avatar initials="SK" family="blue" className="h-5 w-5 text-[8px]" />
        <Avatar initials="JP" family="teal" className="h-5 w-5 text-[8px]" />
      </div>
    </Chip>
  );
}

export function PermissionsMock() {
  return (
    <Chip className="flex flex-col gap-1.5 px-2.5 py-2">
      {["Admin", "Manager", "Coach", "Viewer"].map((r) => (
        <div key={r} className="flex items-center gap-2">
          <IconDot family="blue">
            <UserIcon className="h-3 w-3" />
          </IconDot>
          <span className="text-[10px] font-medium text-v2-ink-soft">{r}</span>
          <CheckIcon className="ml-auto h-3 w-3 text-v2-green" />
        </div>
      ))}
    </Chip>
  );
}

export function AlertsMock() {
  return (
    <div className="flex flex-col gap-1">
      {[
        { t: "Follow up", s: "Due today", f: "coral", Icon: BellIcon },
        { t: "Interview prep", s: "Tomorrow", f: "blue", Icon: CalendarIcon },
        { t: "Application update", s: "3 new updates", f: "amber", Icon: ChatIcon },
      ].map((r) => (
        <Chip key={r.t} className="flex items-center gap-2 py-1">
          <IconDot family={r.f as Family}>
            <r.Icon className="h-3 w-3" />
          </IconDot>
          <Label title={r.t} sub={r.s} />
        </Chip>
      ))}
    </div>
  );
}

export function NotesMock() {
  return (
    <div className="flex items-start gap-2">
      <Avatar initials="SM" family="pink" className="h-8 w-8 text-[10px]" />
      <Chip className="px-2.5 py-2">
        <p className="text-[10px] leading-snug text-v2-ink-soft">
          Had a great conversation! Very interested in the role.
        </p>
        <p className="mt-2 text-[9px] text-v2-muted">Apr 18, 2024 · by Sarah</p>
      </Chip>
    </div>
  );
}

/** Heights (%) of the analytics bars, light and dark alternating as on the board. */
const ANALYTICS_BARS = [28, 42, 54, 68, 82, 96];

export function AnalyticsMock() {
  return (
    <div className="flex h-[78px] w-full items-end gap-2 rounded-lg bg-v2-blue-soft/50 px-3 pb-1.5">
      {ANALYTICS_BARS.map((h, n) => (
        <span
          key={n}
          className={cn("flex-1 rounded-t-sm", n % 2 === 0 ? "bg-v2-blue" : "bg-v2-green")}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}
