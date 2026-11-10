"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@kiwiply/ui";
import { DEFAULT_QUERY, invitationsApi, type FormOptions } from "@/lib/ent/invitations";
import { undoToast } from "@/lib/undo-toast";
import BulkInviteSheet from "@/components/ent/invitations/BulkInviteSheet";
import InvitePanel, { type Sent } from "@/components/ent/invitations/InvitePanel";
import Sheet from "@/components/ent/invitations/Sheet";

/**
 * "Add employee": the one place a person is added, whichever tab of Employees is open. A dialog (a bottom sheet on a phone) with the
 * two ways in (create the account now, or send an invitation) and a "Bulk invite" link that opens the list sheet. Sending an
 * invitation closes it and offers Undo (a revoke) in a toast; creating an account keeps it open for the next person, behind the
 * one-time temporary-password dialog. `onChanged` tells the page to reload what it lists.
 */
export default function AddEmployeeDialog({ orgId, orgName, open, onClose, onChanged }: { orgId: number | string; orgName: string; open: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const asked = useRef(false);

  // the roles and departments are asked once, the first time the dialog opens
  useEffect(() => {
    if (!open || asked.current) return;
    asked.current = true;
    void invitationsApi.options(orgId).then((r) => setOptions(r.ok ? r.data : { roles: [], departments: [], rolesAvailable: false, departmentsAvailable: false }));
  }, [open, orgId]);

  /** The Undo of "Invite sent": find the invitation that was just made (the API does not hand back its id) and revoke it. */
  const undoSent = useCallback(
    async (sent: Sent) => {
      const found = await invitationsApi.list(orgId, { ...DEFAULT_QUERY, status: "PENDING", roleId: "", departmentGroupId: "", range: "all", q: sent.email, page: 1, size: 5 });
      const row = found.ok ? found.data.items.find((i) => i.email.toLowerCase() === sent.email.toLowerCase()) : undefined;
      const r = row ? await invitationsApi.revoke(orgId, row.id) : null;
      if (!r || !r.ok) toast({ title: "Couldn't undo", description: "Revoke it from the Invitations tab instead.", variant: "error" });
      else toast({ title: "Invitation cancelled", description: sent.email });
      onChanged();
    },
    [orgId, toast, onChanged],
  );

  const onSent = (sent: Sent) => {
    onClose();
    undoToast(toast, { title: "Invite sent", description: sent.email, onUndo: () => void undoSent(sent) });
    onChanged();
  };

  return (
    <>
      <Sheet id="employees-add-sheet" open={open} onClose={onClose} title="Add employee">
        <InvitePanel orgId={orgId} orgName={orgName} options={options} onSent={onSent} onCreated={onChanged} onBulk={() => {
          onClose();
          setBulkOpen(true);
        }} />
      </Sheet>
      <BulkInviteSheet
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        orgId={orgId}
        options={options}
        onDone={(n) => {
          toast({ title: `${n} ${n === 1 ? "invitation" : "invitations"} sent`, variant: "success" });
          onChanged();
        }}
      />
    </>
  );
}
