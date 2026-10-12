"use client";

import { ReasonForm, SheetFrame, useLastSpec } from "./ReasonSheet";
import type { ReasonSpec } from "./ReasonSheet";

/**
 * ConfirmTypedSheet: `ReasonSheet` plus type-to-confirm, for the IRREVERSIBLE actions (ADMIN-E2E-PLAN section 3.3:
 * delete an account, execute a DELETE privacy request, archive a source, retire a price). The admin must type the
 * thing's name (a login, a source name) exactly AND give a reason before the red button lights.
 *
 *   askConfirmTyped({ title: "Delete priya.nair?", body: "Erases the account and every resume. This cannot be undone.",
 *                     confirmLabel: "Delete account", expected: "priya.nair", expectedLabel: "login",
 *                     run: (reason) => deleteUser(login, reason) });
 */
export interface ConfirmTypedSpec extends ReasonSpec {
  /** The exact text to type (a login, a source name). Compared after trimming; case matters. */
  expected: string;
  /** What `expected` is, shown after the prompt: "login", "source name". */
  expectedLabel?: string;
}

export default function ConfirmTypedSheet({ spec, onClose }: { spec: ConfirmTypedSpec | null; onClose: () => void }) {
  const shown = useLastSpec(spec);
  return (
    <SheetFrame id="admin-confirm-typed-sheet" open={spec !== null} onClose={onClose} title={shown?.title ?? ""}>
      {shown && <ReasonForm spec={shown} onClose={onClose} typed={{ expected: shown.expected, label: shown.expectedLabel }} />}
    </SheetFrame>
  );
}
