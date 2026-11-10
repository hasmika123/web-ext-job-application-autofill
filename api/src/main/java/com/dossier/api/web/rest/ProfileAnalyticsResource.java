package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.ProfileAnalyticsService;
import com.dossier.api.service.dto.AnalyticsDTOs.Analytics;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The user's own job-search analytics (APP-E2E U12.1). Scoped to the signed-in user, who only ever sees counts of
 * their own applications.
 */
@RestController
@RequestMapping("/api/profile/analytics")
@Tag(name = "analytics", description = "The user's job-search numbers, from the application history.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ProfileAnalyticsResource {

    private final ProfileAnalyticsService service;

    public ProfileAnalyticsResource(ProfileAnalyticsService service) {
        this.service = service;
    }

    @Operation(
        summary = "My job-search analytics",
        description = "{range, granularity: week|month, real, stats{applied, appliedPrev, replies, interviews, offers, responseRate?}, overTime[{start, applied, interviews, offers}], " +
        "byStatus[{status, label, count}], inboxSeen, responseByCompany[{company, applied, replied}]}. Counts are applications by the first time they reached each stage, " +
        "over the last `range` days (default and cap are settings). `real` is false until the account has applied anywhere. responseByCompany is empty until a reply " +
        "has come through the user's inbox. Days are named in `tz` (an IANA zone, default UTC)."
    )
    @GetMapping
    public Analytics analytics(@RequestParam(name = "range", required = false) Integer range, @RequestParam(name = "tz", required = false) String tz) {
        return service.analytics(range, tz);
    }
}
