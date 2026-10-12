"use client";

import { useId, useState } from "react";
import { BottomSheet, CheckIcon, ChevronDownIcon, MinusIcon } from "@kiwiply/ui";
import type { Consent, ConsentRow, ShareScope } from "@/lib/org-join";

/** What each kind of fact is called to a person (the API sends the matrix's own label; this is the friendlier wording). */
const FIELD_WORDS: Record<string, string> = {
  SEAT: "That you're a member: your name, email, role and group",
  ACTIVATED: "Whether you've started using Kiwiply",
  STAGE_COUNTS: "How many applications you have in each stage",
  LAST_ACTIVITY: "The day you were last active",
  RESUME_READINESS: "Whether you have a resume and how strong it looks",
  UPCOMING_INTERVIEW_COUNT: "How many interviews you have coming up (a number only)",
  PLACEMENT: "Whether you've told us you were placed, and when",
  EMPLOYER_DETAILS: "Company names, job titles, locations and salaries",
  APPLICATION_DETAIL: "Your applications in detail",
  RESUMES: "Your resumes",
  INTERVIEW_CALENDAR: "Your interview calendar",
  JOB_ASSIGNMENTS: "Jobs assigned to you",
};

/** What no scope ever shows (the consent text's promise; the API's `neverSees` says the same). */
export const NEVER_SHOWN = ["Your saved answers", "AI drafts", "Your inbox", "Private notes", "Sign-in details"];

function visibleAt(row: ConsentRow, scope: ShareScope): boolean {
  if (row.minScope === null) return false;
  const order: ShareScope[] = ["NONE", "SUMMARY", "FULL"];
  return order.indexOf(scope) >= order.indexOf(row.minScope);
}

/** A tick or a dash, with words for a screen reader. */
function Mark({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center justify-center text-accent-deep">
      <CheckIcon size={18} aria-hidden="true" />
      <span className="sr-only">Yes</span>
    </span>
  ) : (
    <span className="inline-flex items-center justify-center text-muted">
      <MinusIcon size={18} aria-hidden="true" />
      <span className="sr-only">No</span>
    </span>
  );
}

/** Renders the few markdown shapes the consent text uses: `#` / `##` headings, `-` lists, paragraphs. */
export function ConsentText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length) {
      blocks.push(
        <ul key={`ul${blocks.length}`} className="ml-5 list-disc space-y-1 text-[13px] leading-relaxed text-muted">
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>,
      );
      items = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("- ")) {
      items.push(line.slice(2));
      continue;
    }
    flush();
    if (!line) continue;
    if (line.startsWith("## ")) blocks.push(<h4 key={blocks.length} className="mt-4 text-sm font-semibold text-ink">{line.slice(3)}</h4>);
    else if (line.startsWith("# ")) blocks.push(<h3 key={blocks.length} className="font-display text-base text-ink">{line.slice(2)}</h3>);
    else blocks.push(<p key={blocks.length} className="mt-1.5 text-[13px] leading-relaxed text-muted">{line}</p>);
  }
  flush();
  return <div>{blocks}</div>;
}

/**
 * "What exactly?" (consent-data-sharing.md section 5.1): the visibility matrix rendered from the API's own rows, so what
 * this sheet says is what the server enforces. Two columns, the two choices the join screen offers; a third line says what
 * is never shown to anyone; the full consent text sits behind a disclosure so the sheet stays short on a phone.
 */
export default function WhatExactlySheet({ open, onClose, orgName, consent }: { open: boolean; onClose(): void; orgName: string; consent: Consent }) {
  const textId = useId();
  const [showText, setShowText] = useState(false);
  const rows = consent.matrix.filter((r) => r.minScope !== null && r.minScope !== "FULL");
  return (
    <BottomSheet id="what-exactly" open={open} onClose={onClose} title="What exactly can they see?" description={`What ${orgName} sees, for each choice.`} defaultSnap="full">
      <div className="px-1 pb-6">
        <table className="w-full border-collapse text-left text-[13px]">
          <caption className="sr-only">What {orgName} sees for each choice</caption>
          <thead>
            <tr className="border-b border-line align-bottom text-[12px] font-semibold text-muted">
              <th scope="col" className="py-2 pr-2 font-semibold">
                {orgName} sees
              </th>
              <th scope="col" className="w-[76px] px-1 py-2 text-center font-semibold">
                Only that I joined
              </th>
              <th scope="col" className="w-[76px] px-1 py-2 text-center font-semibold">
                Progress summary
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.field} className="border-b border-line/70">
                <th scope="row" className="py-2.5 pr-2 text-[13px] font-normal text-ink">
                  {FIELD_WORDS[r.field] ?? r.label}
                </th>
                <td className="px-1 text-center">
                  <Mark on={visibleAt(r, "NONE")} />
                </td>
                <td className="px-1 text-center">
                  <Mark on={visibleAt(r, "SUMMARY")} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 rounded-[var(--radius-md)] bg-accent-soft/60 p-3 text-[13px] text-ink">
          <p className="font-semibold">Neither choice ever shows</p>
          <p className="mt-1 text-muted">Company names, job titles, your resumes or any file, and {NEVER_SHOWN.map((n) => n.toLowerCase()).join(", ")}.</p>
        </div>
        <p className="mt-3 text-[13px] text-muted">
          Sharing everything is a separate choice for one named person, like a marketer who prepares applications for you. It is never part of joining.
        </p>

        <button
          type="button"
          aria-expanded={showText}
          aria-controls={textId}
          onClick={() => setShowText((v) => !v)}
          className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold text-accent-deep hover:underline"
        >
          Read the full text
          <ChevronDownIcon size={16} aria-hidden="true" className={showText ? "rotate-180" : undefined} />
        </button>
        <div id={textId} hidden={!showText} className="mt-1">
          <ConsentText text={consent.text} />
        </div>
      </div>
    </BottomSheet>
  );
}
