package com.dossier.api.web.rest.vm;

/**
 * Response body of {@code GET /api/profile/version}: {@code {"version": "<16 hex>", "plan": "PRO"}}.
 *
 * <p>The plan rides along with the version deliberately (Phase 12.3): the extension already polls
 * this endpoint on an alarm, on window focus and on drawer open (11.3), so plan changes reach it
 * within one existing check — no extra round-trip, and no plan claim baked into a JWT that would
 * stay stale for the rest of a session after someone upgrades.
 */
public class ProfileVersionVM {

    private String version;
    private String plan;

    public ProfileVersionVM() {}

    public ProfileVersionVM(String version, String plan) {
        this.version = version;
        this.plan = plan;
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
}
