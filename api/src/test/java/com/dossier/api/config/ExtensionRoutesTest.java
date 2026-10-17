package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The allow-list of an enterprise account's extension token (decision O4, docs/enterprise-v2/19 section 6.3), pinned in both directions. The allowed
 * list is every endpoint the extension really calls (job-autofill/src/lib/tracking.js and the service worker) plus the workspace routes of the
 * token's own organization; everything else, and every other organization, is refused.
 */
class ExtensionRoutesTest {

    static final Long TID = 7L;

    record Call(String method, String path) {}

    static Call c(String method, String path) {
        return new Call(method, path);
    }

    /** What job-autofill really calls (tracking.js): the contract the client report (HANDOFF-ENT-ACCOUNTS-TRACK-B-REPORT.md) asked for. */
    static final List<Call> EXTENSION_CALLS = List.of(
        c("GET", "/api/profile"),
        c("PUT", "/api/profile"),
        c("GET", "/api/profile/version"),
        c("GET", "/api/profile/resumes"),
        c("POST", "/api/profile/resumes"),
        c("PUT", "/api/profile/resumes/12"),
        c("DELETE", "/api/profile/resumes/12"),
        c("POST", "/api/resumes/12/file"),
        c("GET", "/api/profile/applications"),
        c("POST", "/api/profile/applications"),
        c("PUT", "/api/profile/applications/5"),
        c("DELETE", "/api/profile/applications/5"),
        c("POST", "/api/profile/applications/5/attachment"),
        c("POST", "/api/profile/field-caches/sync"),
        c("POST", "/api/profile/suggestions"),
        c("GET", "/api/ai/usage"),
        c("POST", "/api/ai/draft"),
        c("POST", "/api/ai/job-fit"),
        c("POST", "/api/ai/parse-resume"),
        c("POST", "/api/ai/resume-match"),
        c("POST", "/api/telemetry/fills"),
        c("POST", "/api/telemetry/fills/abc-123/correction"),
        c("POST", "/api/bug-reports"),
        c("POST", "/api/refresh"),
        c("POST", "/api/logout"),
        c("GET", "/api/orgs/7/con/opportunities"),
        c("GET", "/api/orgs/7/con/opportunities/44"),
        c("POST", "/api/orgs/7/con/opportunities/44/applied"),
        c("POST", "/api/orgs/7/con/opportunities/44/interest"),
        c("POST", "/api/orgs/7/con/opportunities/44/decline"),
        c("POST", "/api/orgs/7/con/opportunities/44/request-info"),
        c("POST", "/api/orgs/7/con/opportunities/44/viewed"),
        c("POST", "/api/orgs/7/con/opportunities/44/link"),
        c("POST", "/api/orgs/7/con/opportunities/44/unlink"),
        c("POST", "/api/orgs/7/con/prepare"),
        c("POST", "/api/orgs/7/con/prepare/31/events"),
        c("GET", "/api/orgs/7/mkt/opportunities/options"),
        c("POST", "/api/orgs/7/mkt/opportunities/from-extension"),
        c("GET", "/api/orgs/7/me-workspace/inbox"),
        c("POST", "/api/orgs/7/me-workspace/inbox"),
        c("GET", "/api/orgs/7/me-workspace/resumes")
    );

    static final List<Call> REFUSED = List.of(
        // another organization is never reachable, whatever the route
        c("GET", "/api/orgs/8/con/opportunities"),
        c("POST", "/api/orgs/8/mkt/opportunities/from-extension"),
        c("GET", "/api/orgs/8/me-workspace/inbox"),
        c("POST", "/api/orgs/8/con/prepare"),
        c("POST", "/api/orgs/8/con/prepare/31/events"),
        // Prepare selected openings: the web page's reads, a non-numeric session, the wrong verbs and a path trick are not the extension's
        c("GET", "/api/orgs/7/con/prepare/status"),
        c("GET", "/api/orgs/7/con/prepare/31"),
        c("GET", "/api/orgs/7/con/prepare"),
        c("DELETE", "/api/orgs/7/con/prepare"),
        c("POST", "/api/orgs/7/con/prepare/abc/events"),
        c("GET", "/api/orgs/7/con/prepare/31/events"),
        c("POST", "/api/orgs/7/con/prepare/31/events/extra"),
        c("POST", "/api/orgs/7/con/prepare/31"),
        // the organization console, members, admin, billing, account and the personal-plan routes
        c("GET", "/api/orgs/7/members"),
        c("GET", "/api/orgs/7"),
        c("GET", "/api/orgs/7/mkt/opportunities"),
        c("POST", "/api/orgs/7/mkt/opportunities"),
        c("GET", "/api/orgs/7/mkt/resumes"),
        c("GET", "/api/ent/anything"),
        c("GET", "/api/me/tenant"),
        c("GET", "/api/admin/users"),
        c("GET", "/api/account"),
        c("POST", "/api/account/change-password"),
        c("GET", "/api/billing/me"),
        c("POST", "/api/billing/checkout"),
        c("GET", "/api/profile/inbox"),
        c("GET", "/api/notifications"),
        c("GET", "/api/resumes"),
        c("GET", "/api/resumes/12/file"),
        c("POST", "/api/extension/session"),
        c("POST", "/api/extension/connect-code"),
        c("POST", "/api/authenticate"),
        // the right path, the wrong verb
        c("DELETE", "/api/profile"),
        c("POST", "/api/profile/version"),
        c("DELETE", "/api/orgs/7/con/opportunities"),
        c("GET", "/api/ai/draft"),
        // the paths the OLD design listed, which the extension never calls
        c("GET", "/api/application"),
        c("POST", "/api/field-cache"),
        c("POST", "/api/fill-telemetry"),
        c("POST", "/api/bug-report"),
        // path tricks
        c("GET", "/api/profile/../account"),
        c("GET", "/api/orgs/07/con/opportunities"),
        c("GET", "/api/orgs/7x/con/opportunities"),
        c("GET", "/api/profile/resumes/abc"),
        c("GET", "/api/orgs/7")
    );

    @Test
    void everyEndpointTheExtensionReallyCallsIsAllowedForItsOwnOrganization() {
        for (Call call : EXTENSION_CALLS) assertThat(ExtensionRoutes.allows(call.method(), call.path(), TID)).as(call.toString()).isTrue();
    }

    @Test
    void everythingElseIsRefused() {
        for (Call call : REFUSED) assertThat(ExtensionRoutes.allows(call.method(), call.path(), TID)).as(call.toString()).isFalse();
    }

    @Test
    void anOrganizationRouteNeedsTheTokensOwnOrganizationAndATid() {
        assertThat(ExtensionRoutes.allows("GET", "/api/orgs/7/con/opportunities", 8L)).isFalse();
        assertThat(ExtensionRoutes.allows("GET", "/api/orgs/7/con/opportunities", null)).isFalse();
        // the organization-independent routes do not depend on the tid
        assertThat(ExtensionRoutes.allows("GET", "/api/profile/version", null)).isTrue();
        assertThat(ExtensionRoutes.allows(null, "/api/profile/version", TID)).isFalse();
        assertThat(ExtensionRoutes.allows("GET", null, TID)).isFalse();
    }
}
