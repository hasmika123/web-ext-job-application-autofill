"use client";

import { useState } from "react";
import { Button } from "@kiwiply/ui";
import { AdminPanel } from "../common";
import { adminFetch } from "@/lib/admin-client";

/** What `GET /api/admin/orgs/{id}/extension-package` answers (AdminExtensionPackageService.Package). */
export type ExtensionPackage = {
  orgId: number;
  slug: string;
  name: string;
  shortName: string;
  primaryColor: string | null;
  logo: { url: string; host: string } | null;
  web: string;
  origins: string[];
  api: string;
};

/**
 * The organization's own extension (CUSTOM-DOMAINS-BUILD.md A6; user decision 2026-11-15): a white-label build, uploaded as its own UNLISTED Chrome
 * Web Store item, that names no Kiwiply anywhere a consultant sees it. It serves on the organization's live custom domains only, so the settings are
 * refused until it has one. Nothing loads until the admin asks: the download is the settings file `package-org-extension.mjs` reads.
 */
export default function OrgExtensionPanel({ orgId }: { orgId: number }) {
  const [pkg, setPkg] = useState<ExtensionPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    setError(null);
    const res = await adminFetch<ExtensionPackage>("GET", `/orgs/${orgId}/extension-package`);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPkg(res.data);
    save(`${res.data.slug}-extension.json`, JSON.stringify(res.data, null, 2) + "\n");
  }

  return (
    <AdminPanel title="Extension package" description="The organization's own browser extension: its name, logo and colour, and no Kiwiply anywhere a consultant sees it.">
      <div className="space-y-3 text-[13px] leading-snug text-ink-soft" data-admin-extension={orgId}>
        <p>
          Each organization gets its own unlisted item in the Chrome Web Store. It works on the organization&apos;s live custom domains, so add one first and
          wait for its certificate.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Build the extension: <code className="rounded bg-paper-2 px-1 text-[12px]">npm run build -w job-autofill</code>
          </li>
          <li>Download the package settings below.</li>
          <li>
            Run <code className="rounded bg-paper-2 px-1 text-[12px]">node web/scripts/package-org-extension.mjs --config {pkg ? `${pkg.slug}-extension.json` : "<file>"}</code>. It makes the zip and
            the store listing text.
          </li>
          <li>Upload the zip as a new item, set it to Unlisted, and send the organization the link once it is approved.</li>
        </ol>
        {pkg && (
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2" data-extension-package>
            <div className="min-w-0">
              <dt className="text-[12px] font-semibold text-v2-muted">Signs in at</dt>
              <dd className="break-all text-ink">{pkg.web}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[12px] font-semibold text-v2-muted">Works on</dt>
              <dd className="break-all text-ink">{pkg.origins.join(", ")}</dd>
            </div>
            {!pkg.logo && <p className="text-[12.5px] text-v2-muted sm:col-span-2">No published logo yet: publish one on its branding page, or pass --logo to the script.</p>}
          </dl>
        )}
        {error && (
          <p role="alert" className="text-[12.5px] text-danger-text">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={() => void download()} disabled={busy} className="min-h-11 sm:min-h-0" data-extension-download>
            {busy ? "Preparing…" : "Download package settings"}
          </Button>
        </div>
      </div>
    </AdminPanel>
  );
}

function save(name: string, text: string) {
  if (typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
