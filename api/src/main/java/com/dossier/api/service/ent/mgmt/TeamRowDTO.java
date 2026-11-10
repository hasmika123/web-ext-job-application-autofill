package com.dossier.api.service.ent.mgmt;

import java.time.Instant;
import java.util.List;

/** One marketer of the manager's team (the Team page): load, status, and what waits on them. People appear by display name only. */
public record TeamRowDTO(
    Long memberId,
    String name,
    String title,
    String status,
    int capacity,
    int assigned,
    int percent,
    boolean overloaded,
    int openApprovals,
    int openEscalations,
    Instant lastActiveAt,
    boolean canManage
) {
    /** A page of rows with the total (the header also carries X-Total-Count). */
    public record Page(List<TeamRowDTO> items, int page, int size, long total, boolean hasMore) {}

    /** The filters: {@code q} (name or title), {@code status} (ACTIVE, PAUSED or ALL) and {@code sort} (name, load, approvals, escalations, activity; a leading minus reverses it). */
    public record Filter(String q, String status, String sort) {}
}
