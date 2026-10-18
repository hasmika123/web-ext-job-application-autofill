package com.dossier.api.service.ent.mgmt;

import com.dossier.api.service.ent.mkt.approvals.ApprovalRequestDTO;
import com.dossier.api.service.ent.mkt.escalations.EscalationDTO;
import java.util.List;

/**
 * One marketer of the team in full (the Team page's side sheet): their row, the consultants they carry, eight weeks of what they got done and their open items.
 * Display names only; nothing here is resume content, a rate or a contact.
 */
public record TeamMemberDTO(
    TeamRowDTO row,
    List<ConsultantRow> consultants,
    List<WeekPoint> weeks,
    List<ApprovalRequestDTO> approvals,
    List<EscalationDTO> escalations
) {
    /** A consultant the marketer carries (as marketer or as backup). */
    public record ConsultantRow(Long consultantId, String name, String priority, String status, boolean backup) {}

    /** One week (its Monday): consultants assigned, packages recorded as submitted, interviews scheduled. */
    public record WeekPoint(String weekStart, long assigned, long submitted, long interviews) {}
}
