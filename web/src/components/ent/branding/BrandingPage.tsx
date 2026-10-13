"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge, ChoiceGroup, ClockIcon, Dialog, EmptyState, ErrorState, Menu, SaveStatusChip, SavedTick, Skeleton, Textarea, useSavedFlash, useToast } from "@kiwiply/ui";
import { Button, Field, Input } from "@/components/ui";
import { undoToast } from "@/lib/undo-toast";
import {
  TEXT_LIMITS,
  assetHashOf,
  brandingApi,
  previewLoginProps,
  ASSET_KINDS,
  type AssetKind,
  type BrandingView,
  type EditableDraft,
  type ThemeMode,
} from "@/lib/ent/branding";
import { AssetDrop, ColourField } from "./fields";
import LoginPreview, { type PreviewPayload } from "./LoginPreview";
import PublishDialog from "./PublishDialog";
import { useBrandingEditor, type BrandingEditor } from "./useBrandingEditor";

/**
 * Organization Branding (X2.18; docs/enterprise-v2/11 s1, 16 s7): make the portal yours before anyone sees it.
 * Everything you change lands in a DRAFT (autosaved, no Save button, a check beside the field); the live preview draws the
 * real sign-in page from the draft; Publish is the one deliberate step and lists exactly what will change.
 */
const THEMES: { value: ThemeMode; label: string }[] = [
  { value: "SYSTEM", label: "Match device" },
  { value: "LIGHT", label: "Light" },
  { value: "DARK", label: "Dark" },
];

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="rounded-[var(--radius-lg)] border border-line bg-paper p-4 sm:p-5" data-branding-section={id}>
      <h2 id={`${id}-h`} className="text-[15px] font-semibold text-ink">
        {title}
      </h2>
      {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** A label with the inline "saved" check beside it. */
function Labeled({ text, flash, id }: { text: string; flash: ReturnType<typeof useSavedFlash>; id: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      <SavedTick flash={flash} id={id} />
    </span>
  );
}

/* ── the editor ────────────────────────────────────────────────────────────────── */

export function BrandingEditorView({ orgId, orgName, initial, previewSrc }: { orgId: number | string; orgName: string; initial: BrandingView; previewSrc?: string }) {
  const ed = useBrandingEditor(orgId, initial);
  const toast = useToast();
  const flash = useSavedFlash();
  const [publishOpen, setPublishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // the inline check beside whatever field just reached the server
  const lastN = useRef(0);
  useEffect(() => {
    if (ed.savedKeys.n === lastN.current) return;
    lastN.current = ed.savedKeys.n;
    const key = ed.savedKeys.keys[0];
    if (key) flash.flash(key);
  }, [ed.savedKeys, flash]);

  const { draft, view } = ed;
  const logoSrc = useMemo(() => {
    const draftHash = assetHashOf(view.draft, "logo");
    if (!draftHash) return null;
    if (ed.assets.logo.localUrl) return ed.assets.logo.localUrl;
    return draftHash === assetHashOf(view.published, "logo") ? `/tenant-assets/logo?v=${draftHash}` : null;
  }, [view.draft, view.published, ed.assets.logo.localUrl]);

  const payload: PreviewPayload = useMemo(
    () => ({ type: "kiwiply:branding-preview", props: previewLoginProps(draft, orgName, logoSrc), primary: ed.colours.primary, secondary: ed.colours.secondary }),
    [draft, orgName, logoSrc, ed.colours.primary, ed.colours.secondary],
  );

  const assetSrc = useCallback(
    (kind: AssetKind): string | null => {
      const h = assetHashOf(view.draft, kind);
      if (!h) return null;
      if (ed.assets[kind].localUrl) return ed.assets[kind].localUrl;
      return h === assetHashOf(view.published, kind) ? `/tenant-assets/${kind}?v=${h}` : null;
    },
    [view.draft, view.published, ed.assets],
  );

  const set = <K extends keyof EditableDraft>(key: K) => (value: EditableDraft[K]) => ed.edit({ [key]: value } as Partial<EditableDraft>);
  const setChip = (i: number, value: string) => {
    const chips = [...draft.chips] as EditableDraft["chips"];
    chips[i] = value;
    ed.edit({ chips });
  };

  async function openPublish() {
    await ed.flush(); // what was just typed is in the draft before the list is built
    setPublishOpen(true);
  }

  async function publish(): Promise<string | null> {
    const r = await ed.publish();
    if (r.ok) {
      toast({ title: `Published as version ${r.data.versionNo}`, description: "Your sign-in page is up to date.", variant: "success" });
      return null;
    }
    if (r.code === "BRANDING_NOTHING_TO_PUBLISH") {
      void ed.reload();
      return "Nothing has changed since the last publish.";
    }
    return r.message;
  }

  async function discard() {
    const before = { ...draft };
    const r = await ed.discard();
    setDiscardOpen(false);
    if (r.ok) undoToast(toast, { title: "Draft discarded", description: "Back to what's live.", onUndo: () => ed.edit(before) });
    else toast({ title: "Couldn't discard the draft", description: r.message, variant: "error" });
  }

  async function restore(versionNo: number) {
    const before = { ...draft };
    const r = await ed.restore(versionNo);
    if (r.ok) undoToast(toast, { title: `Version ${versionNo} restored into your draft`, description: "Publish to make it live.", onUndo: () => ed.edit(before) });
    else toast({ title: `Couldn't restore version ${versionNo}`, description: r.message, variant: "error" });
  }

  async function reload() {
    setReloading(true);
    const r = await ed.reload();
    setReloading(false);
    if (!r.ok) toast({ title: "Couldn't reload the draft", description: r.message, variant: "error" });
  }

  const liveState = view.publishedAt ? (ed.differs ? "Draft differs from live" : "Live, no draft changes") : "Not published yet";
  const versions = [...view.versions].sort((a, b) => b.versionNo - a.versionNo);
  const colourServerMessage = (field: string) => (ed.fieldError?.field === field ? ed.fieldError.message : null);

  return (
    <div className="flex flex-col gap-5" data-branding-page>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="sr-only">Branding status</h2>
          <Badge variant={ed.differs ? "review" : "ready"} data-draft-badge={ed.differs ? "differs" : "live"}>
            {liveState}
          </Badge>
          <SaveStatusChip status={ed.status} savedAt={ed.savedAt} now={now} error={ed.error} onRetry={ed.retry} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Menu
            align="end"
            trigger={
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 max-sm:min-h-11" aria-label="Version history">
                <ClockIcon className="h-4 w-4" />
                History
              </Button>
            }
            items={
              versions.length === 0
                ? [{ heading: "No published versions yet" }]
                : [
                    { heading: "Restore a published version into the draft" },
                    ...versions.map((v) => ({ label: `Version ${v.versionNo} · ${shortDate(v.publishedAt)}`, onSelect: () => void restore(v.versionNo) })),
                  ]
            }
          />
          <Button type="button" variant="ghost" size="sm" disabled={!view.hasDraft && !ed.differs} onClick={() => setDiscardOpen(true)} className="max-sm:min-h-11" data-discard>
            Discard draft
          </Button>
          <Button type="button" variant="accent" size="sm" disabled={!ed.differs || ed.conflict} onClick={openPublish} className="max-sm:min-h-11" data-publish>
            Publish
          </Button>
        </div>
      </header>

      {ed.conflict && (
        <div role="alert" data-branding-conflict className="flex flex-col gap-2 rounded-[var(--radius)] border border-danger/40 bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-danger-text">This draft was changed somewhere else (another tab or another admin). Reload to see the latest version. Edits you made here since then are not saved.</p>
          <Button type="button" size="sm" variant="primary" onClick={reload} disabled={reloading} className="max-sm:min-h-11 sm:flex-none">
            {reloading ? "Reloading…" : "Reload draft"}
          </Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <Section id="identity" title="Identity" description="How your organization is named across the portal.">
            <Field label="Organization name" hint="Change it in Organization settings. It appears in the page title and on the sign-in page.">
              <Input value={orgName} readOnly aria-readonly />
            </Field>
          </Section>

          <Section id="images" title="Logo, favicon and banner" description="Raster images only (PNG, JPEG or WebP). They go into your draft; Publish makes them live.">
            {ASSET_KINDS.map((kind) => (
              <AssetDrop
                key={kind}
                kind={kind}
                src={assetSrc(kind)}
                hasDraftAsset={!!assetHashOf(view.draft, kind)}
                state={ed.assets[kind]}
                onFile={(f) => void ed.uploadAsset(kind, f)}
                onRemove={() => void ed.removeAsset(kind)}
                flash={flash}
              />
            ))}
          </Section>

          <Section id="colours" title="Colours" description="Primary and secondary. We build the whole shade range from them, and white text must stay readable on them.">
            <ColourField label="Primary colour" hint="Readable with white text." value={draft.primary} onChange={set("primary")} flash={flash} flashId="primary" serverMessage={colourServerMessage("primary")} />
            <ColourField label="Secondary colour" hint="Readable with white text." value={draft.secondary} onChange={set("secondary")} flash={flash} flashId="secondary" serverMessage={colourServerMessage("secondary")} />
          </Section>

          <Section id="welcome" title="Welcome copy" description="Shown on the sign-in page. Leave a field empty to use the default.">
            <Field label={<Labeled text="Welcome title" flash={flash} id="welcomeTitle" />} hint={`Replaces "Welcome to ${orgName} Portal". Up to ${TEXT_LIMITS.welcomeTitle} characters.`}>
              <Input value={draft.welcomeTitle} maxLength={TEXT_LIMITS.welcomeTitle} onChange={(e) => set("welcomeTitle")(e.target.value)} />
            </Field>
            <Field label={<Labeled text="Welcome message" flash={flash} id="welcomeMessage" />} hint={`Up to ${TEXT_LIMITS.welcomeMessage} characters.`}>
              <Textarea value={draft.welcomeMessage} maxLength={TEXT_LIMITS.welcomeMessage} rows={2} onChange={(e) => set("welcomeMessage")(e.target.value)} />
            </Field>
            <Field
              label={<Labeled text="Support email" flash={flash} id="supportEmail" />}
              hint="Shown as the 'Need help?' line. Leave empty to hide it."
              error={ed.fieldError?.field === "supportEmail" ? ed.fieldError.message : undefined}
            >
              <Input type="email" inputMode="email" value={draft.supportEmail} maxLength={TEXT_LIMITS.supportEmail} onChange={(e) => set("supportEmail")(e.target.value)} />
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft">
                <Labeled text="Three highlights under the title" flash={flash} id="featureChips" />
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {draft.chips.map((c, i) => (
                  <Input key={i} aria-label={`Highlight ${i + 1}`} placeholder={["Secure Access", "Connect & Collaborate", "Tools for What's Next"][i]} value={c} maxLength={TEXT_LIMITS.chip} onChange={(e) => setChip(i, e.target.value)} />
                ))}
              </div>
              <p className="text-xs text-muted">Up to {TEXT_LIMITS.chip} characters each. Empty ones keep the default.</p>
            </fieldset>
          </Section>

          <Section id="theme" title="Theme" description="How your workspace looks after sign-in. The sign-in page stays light.">
            <div className="flex items-center gap-2">
              <ChoiceGroup aria-label="Theme" options={THEMES} value={draft.theme} onChange={(v) => set("theme")(v as ThemeMode)} />
              <SavedTick flash={flash} id="theme" />
            </div>
          </Section>
        </div>

        <div className="min-w-0 lg:sticky lg:top-4">
          <LoginPreview payload={payload} src={previewSrc} initialDevice="desktop" />
        </div>
      </div>

      <PublishDialog open={publishOpen} rows={ed.rows} onClose={() => setPublishOpen(false)} onPublish={publish} />

      <Dialog
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Discard your draft?"
        description="Your draft goes back to what's live. Uploaded images in the draft are dropped; text and colours can be brought back with Undo."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDiscardOpen(false)} className="max-sm:min-h-11">
              Keep editing
            </Button>
            <Button variant="danger" onClick={discard} className="max-sm:min-h-11" data-discard-confirm>
              Discard draft
            </Button>
          </>
        }
      />
    </div>
  );
}

/* ── the loader: loading, no access, error, ready ──────────────────────────────── */

type Load = { s: "loading" } | { s: "forbidden" } | { s: "error"; message: string } | { s: "ready"; view: BrandingView };

export default function BrandingPage({ orgId, orgName, previewSrc }: { orgId: number | string; orgName: string; previewSrc?: string }) {
  const [state, setState] = useState<Load>({ s: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    brandingApi.get(orgId).then((r) => {
      if (!live) return;
      if (r.ok) setState({ s: "ready", view: r.data });
      else if (r.status === 403 || r.status === 404) setState({ s: "forbidden" });
      else setState({ s: "error", message: r.message });
    });
    return () => {
      live = false;
    };
  }, [orgId, attempt]);

  if (state.s === "loading")
    return (
      <div className="flex flex-col gap-4" aria-busy="true" data-branding-loading>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (state.s === "forbidden")
    return (
      <EmptyState
        mascotPose="peek"
        title="Branding isn't part of your role"
        description="Only organization admins can change how the portal looks. Ask an admin if something needs to change."
        action={undefined}
      />
    );
  if (state.s === "error")
    return (
      <ErrorState
        what="the branding settings"
        description={state.message}
        onRetry={() => {
          setState({ s: "loading" });
          setAttempt((n) => n + 1);
        }}
      />
    );
  return <BrandingEditorView orgId={orgId} orgName={orgName} initial={state.view} previewSrc={previewSrc} />;
}

export type { BrandingEditor };
