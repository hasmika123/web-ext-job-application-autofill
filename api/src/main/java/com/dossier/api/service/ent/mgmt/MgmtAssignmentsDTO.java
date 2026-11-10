package com.dossier.api.service.ent.mgmt;

import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO;
import java.time.Instant;
import java.util.List;

/** The manager's Workload page (MM-07). People appear by display name only; the figures are counts of the team's own assignment rows. */
public final class MgmtAssignmentsDTO {

    private MgmtAssignmentsDTO() {}

    /** One marketer of the workload report with eight weekly load points (oldest first, the last one is now). */
    public record WorkloadRow(MarketingAssignmentsDTO.WorkloadRow marketer, List<Integer> series) {}

    /** The workload of the team: a row per marketer, the footer figures and the end of each of the eight weeks. */
    public record Workload(List<WorkloadRow> items, MarketingAssignmentsDTO.Summary summary, Instant generatedAt, List<Instant> weekEnds) {}
}
