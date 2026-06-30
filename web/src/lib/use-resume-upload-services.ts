import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { track } from "@/lib/analytics";
import type { ResumeUploadServices, SaveInput, SaveResult } from "@/components/ResumeUpload";

/**
 * Web wiring for the (now portable) ResumeUpload form — the exact persistence + side effects
 * the component used to call inline, lifted out so the same form can mount in the extension
 * with a different services impl (W1.2). Browser → Next route handlers (Option A), GA4
 * `track`, the toast surface, and `router.refresh()`. Behavior is unchanged.
 */
export function useResumeUploadServices(): ResumeUploadServices {
  const router = useRouter();
  const { toast } = useToast();

  return useMemo<ResumeUploadServices>(
    () => ({
      onSave: async (input: SaveInput): Promise<SaveResult> => {
        if (input.mode === "edit") {
          // Editing a saved resume: update label + parsed structure only (file unchanged).
          const res = await fetch(`/api/resumes/${input.id}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ label: input.label, parsedJson: input.parsedJson }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return { ok: false, error: data.error ?? "Couldn't save your changes." };
          return { ok: true, id: input.id, label: input.label };
        }
        const form = new FormData();
        form.append("file", input.file, input.file.name);
        form.append("label", input.label);
        form.append("parsedJson", input.parsedJson);
        const res = await fetch("/api/resumes/upload", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: data.error ?? "Couldn't save the resume." };
        return { ok: true, id: data.id, label: data.label ?? input.label };
      },
      onUpdateProfile: async (merged) => {
        const res = await fetch("/api/profile", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ payload: JSON.stringify(merged) }),
        });
        if (res.ok) return { ok: true };
        const d = await res.json().catch(() => ({}));
        return { ok: false, error: d.error };
      },
      track, // module-level GA4 helper (stable reference)
      toast,
      onRefresh: () => router.refresh(),
    }),
    [router, toast],
  );
}
