package com.dossier.api.web.rest.vm;

import com.dossier.api.service.ent.consultant.ProfileWorkspaces;
import java.util.List;

/**
 * Response body of {@code GET /api/profile/version}: {@code {"version": "<16 hex>", "plan": "PRO", "workspaces": [...]}}.
 *
 * <p>The plan rides along with the version deliberately (Phase 12.3): the extension already polls
 * this endpoint on an alarm, on window focus and on drawer open (11.3), so plan changes reach it
 * within one existing check — no extra round-trip, and no plan claim baked into a JWT that would
 * stay stale for the rest of a session after someone upgrades.
 *
 * <p>{@code workspaces} (docs/enterprise-v2/60-job-phase1-contract.md section 4) rides along for the same reason: the organizations the person can
 * work in, each as {@code {orgId, name, consultant, marketer}}. It is additive (an older extension ignores it), always present (an empty list for a
 * person with no organization seat) and deliberately NOT part of {@code version}: that hash is what a bio/resume pull returns.
 */
public class ProfileVersionVM {

    private String version;
    private String plan;
    private List<ProfileWorkspaces.Workspace> workspaces = List.of();

    public ProfileVersionVM() {}

    public ProfileVersionVM(String version, String plan) {
        this.version = version;
        this.plan = plan;
    }

    public ProfileVersionVM(String version, String plan, List<ProfileWorkspaces.Workspace> workspaces) {
        this.version = version;
        this.plan = plan;
        this.workspaces = workspaces == null ? List.of() : List.copyOf(workspaces);
    }

    public String getPlan() {
        return plan;
    }

    public void setPlan(String plan) {
        this.plan = plan;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public List<ProfileWorkspaces.Workspace> getWorkspaces() {
        return workspaces;
    }

    public void setWorkspaces(List<ProfileWorkspaces.Workspace> workspaces) {
        this.workspaces = workspaces == null ? List.of() : List.copyOf(workspaces);
    }
}
