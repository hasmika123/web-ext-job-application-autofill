"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileTextIcon, PlusIcon, Spinner, cn, useToast } from "@kiwiply/ui";
import type { Resume } from "@/components/ResumeList";
import ResumeDrawer from "@/components/app-v2/resume/ResumeDrawer";
import { HeroBand, IconTile, SectionCard, StatusChip } from "@/components/app-v2/common";
import { createBuilt } from "@/lib/resume-doc";

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";

const LIME_BTN =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-v2-lime px-4 text-[13.5px] font-bold text-v2-navy hover:brightness-95 disabled:pointer-events-none disabled:opacity-60";
const GHOST_BTN =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-v2-line bg-white px-4 text-[13.5px] font-semibold text-v2-navy hover:bg-[#F1F5FB]";

/** Why "New resume" did not open an editor: the plan's cap, with the copy the upload screen uses. */
interface LimitNotice {
  message: string;
  plan?: string;
}

/**
 * "New resume": `POST /api/resumes/built`, then straight into the editor. The 402 `RESUME_LIMIT`
 * becomes an inline notice (Free: a link to Pro; Pro: archive one), the same pattern the upload
 * screen uses (`use-resume-upload-services`).
 */
function useNewResume() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState<LimitNotice | null>(null);

  async function create() {
    if (busy) return;
    setBusy(true);
    setLimit(null);
    const res = await createBuilt({});
    if (res.kind === "ok") {
      router.push(`/resume-builder/${res.id}`); // stay busy until the editor takes over
      return;
    }
    setBusy(false);
    if (res.kind === "limit") setLimit({ message: res.message, plan: res.plan });
    else toast({ title: "Couldn't create the resume", description: res.message });
  }
  return { create, busy, limit, dismissLimit: () => setLimit(null) };
}

/**
 * Resume Builder list (APP-V3-SPEC 2.7 board layout, now real): the hero, the "your resumes"
 * strip (default resume, recent resumes, Manage resumes, New resume) and one card per resume.
 * Built resumes open in the editor at `/resume-builder/[id]`; uploaded ones are managed in the
 * side panel (`ResumeDrawer` -> `ResumesWorkspace`), unchanged.
 */
export default function ResumeList({
  resumes,
  usage,
  baseProfile,
  isPro,
}: {
  resumes: Resume[];
  usage: Record<number, number>;
  baseProfile: Record<string, unknown>;
  isPro: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { create, busy, limit } = useNewResume();

  const live = resumes.filter((r) => !r.archived);
  const newestFirst = [...live].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const current = newestFirst.find((r) => r.defaultResume) ?? newestFirst[0] ?? null;

  const newButton = (
    <button type="button" onClick={create} disabled={busy} className={LIME_BTN}>
      {busy ? <Spinner role="presentation" aria-hidden className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />} New resume
    </button>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <HeroBand
        title="Resume Builder"
        subtitle="Create a professional resume that gets you interviews."
        mascot="mascot-resume"
        note="Same resume. More opportunities."
      />

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-v2-line bg-white p-3.5 shadow-v2-soft">
        <div className="flex min-w-[240px] flex-1 items-center gap-3">
          <span className="flex-none">
            <IconTile tone="blue">
              <FileTextIcon className="h-5 w-5" />
            </IconTile>
          </span>
          <div className="min-w-0">
            {current ? (
              <>
                <p className="truncate text-[15px] font-bold text-v2-navy">{current.label}</p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-v2-ink-soft">
                  <span>
                    Added {fmt(current.createdAt)} {"·"} {live.length} {live.length === 1 ? "resume" : "resumes"}
                  </span>
                  {current.defaultResume && (
                    <StatusChip tone="green" className="rounded-md px-2 py-0.5 text-[11.5px]">
                      Default Resume
                    </StatusChip>
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-bold text-v2-navy">No resumes yet</p>
                <p className="text-[12.5px] text-v2-ink-soft">Build one from your profile in a minute.</p>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setOpen(true)} className={GHOST_BTN}>
            Manage resumes
          </button>
          {newButton}
        </div>
      </section>

      {limit && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-v2-line bg-white p-3.5 text-[13.5px] text-v2-navy shadow-v2-soft">
          <p className="min-w-0 flex-1">{limit.message}</p>
          {limit.plan === "PRO" || isPro ? (
            <button type="button" onClick={() => setOpen(true)} className="font-bold text-v2-blue hover:underline">
              Archive a resume
            </button>
          ) : (
            <Link href="/pricing" className="font-bold text-v2-blue hover:underline">
              See Pro
            </Link>
          )}
        </div>
      )}

      <SectionCard title="Your resumes" subtitle="Built resumes open in the editor. Uploaded files are managed from Manage resumes.">
        {newestFirst.length === 0 ? (
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="text-[13.5px] text-v2-ink-soft">Nothing here yet. A new resume starts from your profile, so most of it is already written.</p>
            {newButton}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {newestFirst.map((r) => {
              const built = r.kind === "BUILT";
              const card = (
                <>
                  <span className="flex items-start gap-3">
                    <IconTile tone={built ? "green" : "blue"}>
                      <FileTextIcon className="h-5 w-5" />
                    </IconTile>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold text-v2-navy">{r.label}</span>
                      <span className="mt-0.5 block text-[12.5px] text-v2-ink-soft">
                        {built ? "Built in Resume Builder" : "Uploaded file"} {"·"} {fmt(r.createdAt)}
                      </span>
                    </span>
                  </span>
                  <span className="mt-3 flex flex-wrap items-center gap-1.5">
                    <StatusChip tone={built ? "green" : "slate"}>{built ? "Built" : "Uploaded"}</StatusChip>
                    {r.defaultResume && <StatusChip tone="blue">Default</StatusChip>}
                    {(usage[r.id] ?? 0) > 0 && (
                      <StatusChip tone="slate">
                        Used in {usage[r.id]} {usage[r.id] === 1 ? "application" : "applications"}
                      </StatusChip>
                    )}
                  </span>
                </>
              );
              const cardClass = cn(
                "block w-full rounded-2xl border border-v2-line bg-white p-4 text-left shadow-v2-soft transition-colors hover:bg-[#F8FAFF]",
              );
              return (
                <li key={r.id}>
                  {built ? (
                    <Link href={`/resume-builder/${r.id}`} className={cardClass} aria-label={`Open ${r.label} in the editor`}>
                      {card}
                    </Link>
                  ) : (
                    <button type="button" onClick={() => setOpen(true)} className={cardClass}>
                      {card}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {open && <ResumeDrawer onClose={() => setOpen(false)} baseProfile={baseProfile} resumes={resumes} usage={usage} isPro={isPro} />}
    </div>
  );
}
