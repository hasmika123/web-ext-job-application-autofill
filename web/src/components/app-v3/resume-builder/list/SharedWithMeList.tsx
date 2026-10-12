"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileTextIcon, ShareNodesIcon } from "@kiwiply/ui";
import { loadSharedWithMe, type SharedResume } from "@/lib/resume-access";
import { SHARED_EMPTY } from "./constants";

type State = { kind: "loading" } | { kind: "ok"; items: SharedResume[] } | { kind: "error"; message: string };

/**
 * The "Shared with me" tab of My Resumes (R3.11): resumes other people, or my organisation's marketer under my
 * own consent, let me read. Read-only; each row opens `/resume-builder/shared/[id]`. Loaded when the tab opens,
 * so a signed-in user who never looks at it never pays for it.
 */
export default function SharedWithMeList() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    loadSharedWithMe().then((r) => live && setState(r));
    return () => {
      live = false;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <p role="status" className="rounded-2xl border border-dashed border-v2-line bg-paper px-6 py-10 text-center text-[13.5px] text-ink-soft">
        Loading...
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <p role="alert" className="rounded-2xl border border-v2-line bg-paper px-6 py-10 text-center text-[13.5px] text-ink">
        {state.message}
      </p>
    );
  }
  if (state.items.length === 0) {
    return (
      <div role="status" className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-v2-line bg-paper px-6 py-12 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-v2-blue-soft text-v2-blue">
          <ShareNodesIcon size={22} aria-hidden />
        </span>
        <p className="text-[15px] font-bold text-ink">{SHARED_EMPTY.title}</p>
        <p className="max-w-sm text-[13.5px] text-ink-soft">{SHARED_EMPTY.body}</p>
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3">
      {state.items.map((r) => (
        <li key={`${r.via}-${r.resumeId}`}>
          <Link
            href={`/resume-builder/shared/${r.resumeId}`}
            className="flex items-center gap-3 rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft transition-colors hover:bg-paper-2"
          >
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-v2-blue-soft text-v2-blue">
              <FileTextIcon size={18} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold text-ink">{r.name}</span>
              <span className="block truncate text-[12.5px] text-ink-soft">
                From {r.owner || "someone"} {"·"} {r.via === "ORG" ? "your marketer" : "view only"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
