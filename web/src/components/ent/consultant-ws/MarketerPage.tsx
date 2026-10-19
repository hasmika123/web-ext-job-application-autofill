"use client";

import { useCallback, type ComponentType } from "react";
import {
  BriefcaseIcon,
  CheckCircleIcon,
  ErrorState,
  FileTextIcon,
  LightbulbIcon,
  MailIcon,
  MessageIcon,
  PhoneIcon,
  Skeleton,
  SparklesIcon,
  TargetIcon,
  TrendingUpIcon,
  UsersIcon,
  cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { TONES } from "@/components/ent/dashboard/parts";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  BASE,
  Card,
  Empty,
  MoreButton,
  Pill,
  SampleMark,
  useWorkspaceData,
} from "./parts";
import { shortDate } from "@/lib/ent/consultant-ws/home";
import {
  fetchMarketer,
  personInitials,
  relativeTime,
  type MarketerView,
} from "@/lib/ent/consultant-ws/marketer";

/**
 * My Marketer (design/enterprise-consultant/marketer.webp): one call to `GET /api/orgs/{orgId}/me-workspace/marketer` (through the BFF)
 * draws the page for the signed-in consultant's OWN data. The marketer card, focus opportunities, follow-ups and the focus summary are
 * real. Messages, the shared action plan and collaboration notes do not exist as data yet, so they show an honest empty state (never sample
 * content), and the Send Message / Schedule Call / View Calendar buttons are disabled with the reason as their tooltip (nothing is sent).
 */

/* ── messaging your marketer is not built: the buttons are honest about it ─────────── */

/** There is no message, call or request channel between a consultant and a marketer yet (D12, 2026-10-16 audit): nothing here pretends to send anything. */
export const NOT_AVAILABLE = "Messaging your marketer isn't available yet. They reach you by the email on your profile, and what they prepare for you shows up in Assigned Opportunities.";

const ACTION_BTN =
  "flex min-h-12 w-full items-center gap-3 rounded-xl border border-line bg-paper px-3.5 text-left text-[14px] font-semibold text-accent-deep hover:bg-accent-soft";

/* ── the cards ──────────────────────────────────────────────────────────────────────── */

function YourMarketer({ view }: { view: MarketerView }) {
  const m = view.marketer;
  const actions: { label: string; icon: ComponentType<IconProps> }[] = [
    { label: "Send Message", icon: MailIcon },
    { label: "Schedule Call", icon: PhoneIcon },
  ];
  return (
    <Card id="marketer-card" title="Your marketer" icon={UsersIcon}>
      {!m ? (
        <Empty>
          No marketer assigned yet. When your organization assigns one, they
          appear here.
        </Empty>
      ) : (
        <div
          data-marketer-card
          className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,200px)]"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <span
                aria-hidden
                className="grid h-20 w-20 flex-none place-items-center rounded-full bg-accent-soft text-[26px] font-extrabold text-accent-deep sm:h-24 sm:w-24 sm:text-[30px]"
              >
                {personInitials(m.name)}
              </span>
              <div className="min-w-0">
                <h3
                  data-marketer-name
                  className="truncate text-[22px] font-extrabold leading-tight text-ink"
                >
                  {m.name}
                </h3>
                {m.title ? (
                  <p className="mt-0.5 text-[15px] font-semibold text-ink-soft">
                    {m.title}
                  </p>
                ) : null}
                <p className="mt-1 text-[13px] text-muted">
                  Your advocate for new opportunities
                </p>
              </div>
            </div>
            {view.responseBadge.label ? (
            <p
              data-response-badge
              className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5"
            >
              <Pill
                tone="green"
                className="min-h-8 gap-1.5 rounded-full px-3 text-[13px]"
              >
                <CheckCircleIcon size={15} />
                {view.responseBadge.label}
              </Pill>
              <span className="text-[13px] text-muted">
                {view.responseBadge.detail}
              </span>
              {view.responseBadge.sample ? <SampleMark /> : null}
            </p>
            ) : null}
          </div>
          <ul
            className="grid min-w-0 content-start gap-2.5"
            aria-label="Contact your marketer"
          >
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <li key={a.label}>
                  <button
                    type="button"
                    disabled
                    title={NOT_AVAILABLE}
                    data-marketer-action={a.label}
                    className={cn(ACTION_BTN, "cursor-not-allowed opacity-60 hover:bg-paper")}
                  >
                    <Icon size={18} className="flex-none" />
                    {a.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

function RecentMessages({ view }: { view: MarketerView }) {
  const m = view.messages;
  const generated = Date.parse(view.generatedAt);
  const now = Number.isNaN(generated) ? undefined : generated; // the server's clock keeps the render pure and the labels consistent
  return (
    <Card
      id="marketer-messages"
      title="Recent messages"
      icon={MessageIcon}
      viewAll={`${BASE}/marketer`}
      extra={m.sample && m.items.length > 0 ? <SampleMark /> : null}
    >
      {m.items.length === 0 ? (
        <Empty>
          {view.marketer
            ? "No messages yet."
            : "Messages appear once a marketer is assigned."}
        </Empty>
      ) : (
        <ul className="divide-y divide-line">
          {m.items.map((x, i) => (
            <li
              key={i}
              data-message
              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span
                aria-hidden
                className={cn(
                  "grid h-10 w-10 flex-none place-items-center rounded-full text-[13px] font-bold",
                  x.mine
                    ? "bg-paper-2 text-ink-soft"
                    : "bg-accent-soft text-accent-deep",
                )}
              >
                {personInitials(x.from)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2 text-[13.5px]">
                  <span className="font-bold text-ink">{x.from}</span>
                  <span className="text-[12px] text-muted">
                    {relativeTime(x.at, now)}
                  </span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-soft">
                  {x.preview}
                </p>
              </div>
              {x.unread ? (
                <span
                  aria-label="Unread"
                  className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-accent"
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CollaborationNotes({ view }: { view: MarketerView }) {
  const n = view.notes;
  return (
    <Card
      id="marketer-notes"
      title="Collaboration notes"
      icon={FileTextIcon}
      viewAll={`${BASE}/marketer`}
      extra={n.sample && n.items.length > 0 ? <SampleMark /> : null}
    >
      {n.items.length === 0 ? (
        <Empty>
          {view.marketer
            ? "No notes yet."
            : "Shared notes appear once a marketer is assigned."}
        </Empty>
      ) : (
        <ul className="divide-y divide-line">
          {n.items.map((x) => (
            <li
              key={x.title}
              data-note
              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
            >
              <FileTextIcon
                size={18}
                className="mt-0.5 flex-none text-accent-deep"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold text-ink">{x.title}</p>
                <p className="text-[12px] text-muted">{shortDate(x.on)}</p>
              </div>
              <p className="min-w-0 flex-[2] text-[13px] leading-snug text-ink-soft">
                {x.body}
              </p>
              <MoreButton label={`More actions for ${x.title}`} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const FOCUS_ICON: Record<
  string,
  { icon: ComponentType<IconProps>; tone: keyof typeof TONES }
> = {
  marketing: { icon: TrendingUpIcon, tone: "violet" },
  skills: { icon: TargetIcon, tone: "coral" },
  assigned: { icon: BriefcaseIcon, tone: "green" },
  strong: { icon: LightbulbIcon, tone: "amber" },
};

function MarketerFocus({ view }: { view: MarketerView }) {
  return (
    <Card
      id="marketer-focus"
      title="Marketer's focus for you"
      icon={SparklesIcon}
    >
      {view.marketerFocus.length === 0 ? (
        <Empty>
          {view.marketer
            ? "Your marketer's focus shows once you have matched opportunities."
            : "Appears once a marketer is assigned."}
        </Empty>
      ) : (
        <ul className="space-y-2">
          {view.marketerFocus.map((f) => {
            const spec = FOCUS_ICON[f.key] ?? FOCUS_ICON.marketing;
            const Icon = spec.icon;
            return (
              <li
                key={f.key}
                data-focus-item={f.key}
                className="flex items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5"
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid h-10 w-10 flex-none place-items-center rounded-full",
                    TONES[spec.tone],
                  )}
                >
                  <Icon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold leading-tight text-ink">
                    {f.title}
                  </span>
                  <span className="block text-[12px] text-muted">
                    {f.detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface MarketerPageProps {
  orgId: number;
  firstName: string;
}

export default function MarketerPage({ orgId }: MarketerPageProps) {
  const { view, status, reload } = useWorkspaceData(
    useCallback(() => fetchMarketer(orgId), [orgId]),
  );

  if (status === "denied")
    return (
      <ErrorState
        what="your workspace"
        title="This page isn't part of your role"
        description="Ask an organization admin if you should see it."
        variant="inline"
      />
    );

  return (
    <div
      data-consultant-marketer
      data-status={status}
      className="flex flex-col gap-4 sm:gap-5"
    >
      <PageHeader title="My Marketer" subtitle={view?.marketer ? `${view.marketer.name} finds and prepares openings for you. Reach them here.` : "Your marketer finds and prepares openings for you."} />

      {status === "failed" ? (
        <ErrorState
          what="your marketer page"
          description="Your workspace didn't load. Nothing has changed."
          onRetry={() => void reload()}
          variant="inline"
          className="rounded-[var(--radius-lg)] border border-line bg-paper"
        />
      ) : view ? (
        <div className="grid min-w-0 content-start gap-4 sm:gap-5 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <YourMarketer view={view} />
          </div>
          <RecentMessages view={view} />
          <CollaborationNotes view={view} />
          <div className="lg:col-span-2">
            <MarketerFocus view={view} />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      )}

    </div>
  );
}
