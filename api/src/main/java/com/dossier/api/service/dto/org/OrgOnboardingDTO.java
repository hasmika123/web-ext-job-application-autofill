package com.dossier.api.service.dto.org;

import java.util.List;

/**
 * {@code GET /api/orgs/{orgId}/onboarding}: the admin activation checklist (onboarding-invites.md section 5), computed on the
 * server so the web and, later, the mobile app render the same list. {@code done} / {@code total} count the required items.
 *
 * @param complete every required item is done (the dashboard then hides the checklist)
 */
public record OrgOnboardingDTO(List<Item> items, int done, int total, boolean complete) {

    /**
     * One row. {@code count} / {@code total} are the live numbers behind it ("38 of 60 joined") and null when the row has none.
     * {@code available} is false while the action it points at is not built yet (invites arrive with O2.2, plans with the
     * billing wave): the row is shown as "soon", never as a dead link. {@code optional} rows do not count towards completion.
     */
    public record Item(String key, boolean done, Integer count, Integer total, String href, boolean available, boolean optional) {}
}
