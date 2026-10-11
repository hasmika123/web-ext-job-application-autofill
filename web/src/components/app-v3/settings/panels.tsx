import type { ReactNode } from "react";
import { DEMO_NOTE } from "@/lib/demo";

/** Presentational pieces shared by the Settings panels (server-safe: no hooks). */

export function SettingsCard({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="rounded-2xl border border-v2-line/70 bg-paper p-5 shadow-v2-soft">
      <h2 className="mb-3 font-display text-[17px] font-extrabold text-v2-navy">{title}</h2>
      {children}
    </section>
  );
}

/** A setting that lives in the browser extension (chrome.storage), shown here for information. */
export function ExtensionSettingRow({ title, desc, last }: { title: string; desc: string; last?: boolean }) {
  return (
    <div className={last ? "py-3" : "border-b border-v2-line/60 py-3"}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-v2-navy">{title}</span>
        <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-v2-muted">In the extension</span>
      </div>
      <p className="mt-1 text-[13px] text-v2-muted">{desc}</p>
    </div>
  );
}

/** A setting the web app will own later; rendered inert, labelled plainly. */
export function SoonRow({ title, desc, last }: { title: string; desc: string; last?: boolean }) {
  return (
    <div className={last ? "py-3" : "border-b border-v2-line/60 py-3"}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-v2-navy">{title}</span>
        <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-v2-muted">Coming soon</span>
      </div>
      <p className="mt-1 text-[13px] text-v2-muted">{desc}</p>
    </div>
  );
}

/** Shown to the public demo accounts where a real account would get a save, delete or billing action. */
export function DemoNote() {
  return (
    <p className="mb-3 rounded-[var(--radius)] border border-v2-amber/40 bg-v2-amber-soft px-3 py-2 text-[13px] font-medium text-v2-amber">
      {DEMO_NOTE}
    </p>
  );
}
