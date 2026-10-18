"use client";

import { useEffect, useRef, useState } from "react";
import { Switch } from "@kiwiply/ui";
import { fetchRejectionSetting, saveRejectionSetting, type ReviewEndpoints } from "@/lib/inbox-review";

/**
 * "Apply rejections automatically", off by default. Off means a rejection email waits in "Needs your review" until the person accepts it;
 * on means the application is marked Rejected as soon as the mail is read, and the change can be undone from its history.
 */
export default function RejectionToggle({ endpoints, workspace = false }: { endpoints: ReviewEndpoints; workspace?: boolean }) {
  const [value, setValue] = useState<boolean | null>(null);
  const [failed, setFailed] = useState<"load" | "save" | null>(null);
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  const ep = useRef(endpoints);
  ep.current = endpoints;

  useEffect(() => {
    alive.current = true;
    void fetchRejectionSetting(ep.current).then((r) => {
      if (!alive.current) return;
      if (r.kind === "ok") setValue(r.applyRejectionsAutomatically);
      else setFailed("load");
    });
    return () => {
      alive.current = false;
    };
  }, []);

  async function change(next: boolean) {
    const before = value;
    setValue(next);
    setSaving(true);
    setFailed(null);
    const r = await saveRejectionSetting(ep.current, next);
    if (!alive.current) return;
    setSaving(false);
    if (r.kind === "ok") setValue(r.applyRejectionsAutomatically);
    else {
      setValue(before);
      setFailed("save");
    }
  }

  if (failed === "load") return null;
  const who = workspace ? "this workspace" : "Kiwiply";
  return (
    <section data-rejection-setting aria-label="Rejection emails" className="rounded-[var(--radius-lg)] border border-line bg-paper p-4 sm:p-5">
      <Switch
        label="Apply rejections automatically"
        description={`Off: when an email says you were not selected, ${who} asks you first and nothing changes until you accept. On: the application is marked Rejected as soon as the email is read. You can undo it from the application's history for a short time.`}
        checked={value === true}
        disabled={value === null || saving}
        onCheckedChange={(v) => void change(v)}
      />
      {failed === "save" ? (
        <p role="alert" className="mt-2 text-[13px] font-medium text-danger-text">
          Couldn&apos;t save that. It stays as it was.
        </p>
      ) : null}
    </section>
  );
}
