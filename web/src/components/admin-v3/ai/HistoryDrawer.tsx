"use client";

import type { RefObject } from "react";
import { aiFetch } from "@/lib/ai-admin";
import type { AiHistoryRow } from "@/lib/ai-admin";
import KitHistoryDrawer from "../common/HistoryDrawer";

/** "ai.route.parse.model" reads better as "route · parse · model". */
function keyLabel(key: string): string {
  return key.replace(/^ai\./, "").split(".").join(" · ");
}

/** The AI settings' change history: the admin kit's drawer pointed at `/api/admin/ai/config/history`. */
export default function HistoryDrawer({ open, onClose, returnFocusTo }: { open: boolean; onClose: () => void; returnFocusTo?: RefObject<HTMLElement | null> }) {
  return (
    <KitHistoryDrawer
      id="ai-history-drawer"
      open={open}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      description="Who changed which AI setting, and why."
      emptyDescription="Every change to AI settings shows up here with who made it and why."
      formatKey={keyLabel}
      load={(limit) => aiFetch<AiHistoryRow[]>("GET", `/config/history?limit=${limit}`)}
    />
  );
}
