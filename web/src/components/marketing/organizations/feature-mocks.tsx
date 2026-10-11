import type { ReactNode } from "react";
import { CheckIcon, cn } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";
import { ExampleBadge } from "./parts";

/**
 * Mini product mocks for the 12 feature cards (spec section 9, block 2). Pure HTML, decorative:
 * every one sits in `MockFrame` (aria-hidden, "Example" badge) and uses fictional names. Nothing
 * here shows a button that submits an application on someone's behalf.
 */

/** Fixed-height frame shared by every mini mock, so cards line up across a row. */
function MockFrame({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className="relative h-[116px] overflow-hidden rounded-xl border border-v2-line bg-v2-canvas p-3">
      <ExampleBadge className="absolute right-2 top-2 z-10" />
      {children}
    </div>
  );
}

/** A grey bar standing in for a line of text. */
function Line({ w, className }: { w: string; className?: string }) {
  return <span className={cn("block h-1.5 rounded-full bg-v2-line", w, className)} />;
}

function Dot({ initials, family }: { initials: string; family: Family }) {
  const f = FAMILY[family];
  return (
    <span className={cn("grid h-6 w-6 flex-none place-items-center rounded-full text-[9px] font-bold", f.soft, f.text)}>
      {initials}
    </span>
  );
}

function Pill({ family, children }: { family: Family; children: ReactNode }) {
  const f = FAMILY[family];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[9.5px] font-semibold leading-tight", f.soft, f.text)}>
      {children}
    </span>
  );
}

export function ConsultantAccountsMock() {
  return (
    <MockFrame>
      <div className="mt-5 flex flex-col gap-2">
        {[
          { i: "JL", f: "blue", plan: "Pro" },
          { i: "AM", f: "violet", plan: "Autopilot" },
          { i: "SK", f: "teal", plan: "Pro" },
        ].map((r) => (
          <div key={r.i} className="flex items-center gap-2">
            <Dot initials={r.i} family={r.f as Family} />
            <Line w="w-16" />
            <span className="ml-auto">
              <Pill family={r.plan === "Pro" ? "lime" : "violet"}>{r.plan}</Pill>
            </span>
          </div>
        ))}
      </div>
    </MockFrame>
  );
}

export function ProfilesResumesMock() {
  return (
    <MockFrame>
      <div className="mt-5 flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5 rounded-lg bg-white p-2 shadow-sm">
          <Line w="w-1/2" className="bg-v2-pink/50" />
          <Line w="w-full" />
          <Line w="w-5/6" />
          <Line w="w-2/3" />
        </div>
        <div className="flex w-16 flex-col gap-1.5">
          <Pill family="pink">Resume v3</Pill>
          <Pill family="blue">Resume v2</Pill>
        </div>
      </div>
    </MockFrame>
  );
}

export function AutofillReviewMock() {
  return (
    <MockFrame>
      <div className="mt-5 flex flex-col gap-1.5">
        {[
          { w: "w-24", ok: true },
          { w: "w-32", ok: true },
          { w: "w-20", ok: false },
        ].map((r, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md bg-white px-2 py-1">
            <Line w={r.w} />
            <span className="ml-auto text-[9px] font-semibold text-v2-ink-soft">{r.ok ? "Filled" : "Check this"}</span>
          </div>
        ))}
        <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-md bg-v2-navy px-2 py-0.5 text-[9.5px] font-semibold text-white">
          <CheckIcon size={9} /> You review and submit
        </span>
      </div>
    </MockFrame>
  );
}

export function InboxTrackingMock() {
  return (
    <MockFrame>
      <div className="mt-5 flex flex-col gap-1.5">
        {[
          { t: "Interview invitation", f: "green" },
          { t: "Application received", f: "blue" },
          { t: "Update on your application", f: "amber" },
        ].map((r) => (
          <div key={r.t} className="flex items-center gap-2 rounded-md bg-white px-2 py-1">
            <span className={cn("h-2 w-2 flex-none rounded-full", FAMILY[r.f as Family].solid)} />
            <span className="truncate text-[9.5px] font-semibold text-v2-navy">{r.t}</span>
          </div>
        ))}
      </div>
    </MockFrame>
  );
}

export function RolesMock() {
  return (
    <MockFrame>
      <div className="mt-5 flex flex-col gap-1.5">
        {["Admin", "Consultant"].map((r) => (
          <div key={r} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5">
            <Dot initials={r[0]} family={r === "Admin" ? "green" : "blue"} />
            <span className="text-[10px] font-semibold text-v2-navy">{r}</span>
            <span className="ml-auto grid h-4 w-4 place-items-center rounded-full bg-v2-green-soft text-v2-green">
              <CheckIcon size={9} />
            </span>
          </div>
        ))}
      </div>
    </MockFrame>
  );
}

export function NotesMock() {
  return (
    <MockFrame>
      <div className="mt-5 flex gap-2">
        <div className="flex flex-1 flex-col gap-1.5 rounded-lg bg-v2-sticky p-2">
          <span className="text-[9.5px] font-semibold leading-tight text-v2-sticky-ink">Strong first call. Send updated resume.</span>
        </div>
        <div className="flex flex-col gap-2 pl-1">
          {["bg-v2-teal", "bg-v2-blue", "bg-v2-pink"].map((c) => (
            <span key={c} className={cn("h-2 w-2 rounded-full", c)} />
          ))}
        </div>
      </div>
    </MockFrame>
  );
}

export function ExpertServicesMock() {
  return (
    <MockFrame>
      <div className="mt-6 flex flex-wrap gap-1.5">
        <Pill family="violet">Resume review</Pill>
        <Pill family="pink">Resume rewrite</Pill>
        <Pill family="teal">Mock interview</Pill>
        <Pill family="amber">Coaching</Pill>
      </div>
    </MockFrame>
  );
}

export function MarketerMock() {
  return (
    <MockFrame>
      <div className="mt-5 flex items-center gap-2">
        <div className="flex flex-1 flex-col gap-1.5 rounded-lg bg-white p-2">
          <Pill family="violet">Marketer</Pill>
          <Line w="w-full" />
          <Line w="w-2/3" />
        </div>
        <span className="text-[11px] font-bold text-v2-muted">then</span>
        <div className="flex flex-1 flex-col gap-1.5 rounded-lg bg-white p-2">
          <Pill family="green">Consultant</Pill>
          <span className="text-[9.5px] font-semibold text-v2-navy">Approves and submits</span>
        </div>
      </div>
    </MockFrame>
  );
}

export function JobBanksMock() {
  return (
    <MockFrame>
      <div className="mt-5 flex flex-col gap-1.5">
        {[
          { t: "Data Engineer", r: "Resume A" },
          { t: "Platform Engineer", r: "Resume B" },
          { t: "Backend Developer", r: "Resume A" },
        ].map((j) => (
          <div key={j.t} className="flex items-center gap-2 rounded-md bg-white px-2 py-1">
            <span className="truncate text-[9.5px] font-semibold text-v2-navy">{j.t}</span>
            <span className="ml-auto">
              <Pill family="pink">{j.r}</Pill>
            </span>
          </div>
        ))}
      </div>
    </MockFrame>
  );
}

export function OutreachMock() {
  return (
    <MockFrame>
      <div className="mt-5 flex items-center gap-2">
        <div className="flex flex-1 flex-col gap-1.5 rounded-lg bg-white p-2">
          <span className="text-[9.5px] font-semibold text-v2-navy">Recruiter note</span>
          <Line w="w-full" />
          <Line w="w-3/4" />
        </div>
        <span aria-hidden className="text-v2-blue">&rarr;</span>
        <Dot initials="JL" family="blue" />
      </div>
    </MockFrame>
  );
}

export function AnalyticsMock() {
  const heights = ["h-4", "h-6", "h-5", "h-8", "h-7", "h-10", "h-9"];
  return (
    <MockFrame>
      <div className="mt-5 flex h-12 items-end gap-1.5">
        {heights.map((h, i) => (
          <span key={i} className={cn("w-full max-w-5 rounded-t-sm bg-v2-green/70", h)} />
        ))}
      </div>
    </MockFrame>
  );
}

export function AutopilotBatchMock() {
  return (
    <MockFrame>
      <div className="mt-5 flex flex-col gap-1.5">
        {["Ready to review", "Ready to review", "Needs a sign-in"].map((s, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md bg-white px-2 py-1">
            <Line w="w-20" />
            <span className="ml-auto">
              <Pill family={i < 2 ? "violet" : "amber"}>{s}</Pill>
            </span>
          </div>
        ))}
      </div>
    </MockFrame>
  );
}
