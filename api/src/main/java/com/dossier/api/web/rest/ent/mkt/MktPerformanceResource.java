package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Goals;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.GoalsRequest;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Query;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.View;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Marketing workspace Performance board (`/w/marketing/performance`). Permission {@code reports.view}, ASSIGNED scope: only the caller's consultants are
 * counted (anyone else: the generic 404). Read-only (E1) except the marketer's own monthly targets, which are only recorded.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/performance")
@Tag(name = "mkt-performance", description = "Marketing workspace: the Performance board (read-only) and the marketer's own monthly targets.")
public class MktPerformanceResource {

    private final MktPerformanceService service;

    public MktPerformanceResource(MktPerformanceService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Performance board (one call)",
        description = "{generatedAt, kpis[6], weekly, trend, funnel, readiness, streams, top[5], benchmarks, goals, actions}. weeks = 4w|8w|12w; trend, funnel, streams = 1m|3m|6m; benchmarks, goals = month|lastMonth. A section with no rows is empty or null. 404 without reports.view."
    )
    @GetMapping
    @OrgPermissionRequired
    public View get(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String weeks,
        @RequestParam(required = false) String trend,
        @RequestParam(required = false) String funnel,
        @RequestParam(required = false) String streams,
        @RequestParam(required = false) String benchmarks,
        @RequestParam(required = false) String goals
    ) {
        return service.view(me, new Query(weeks, trend, funnel, streams, benchmarks, goals));
    }

    @Operation(
        summary = "Set your own monthly targets",
        description = "{submissions?, interviews?, offers?, placements?} (0 to 100000; omitted ones are left as they are). Records numbers only; returns the Goals card. 404 without reports.view."
    )
    @PutMapping("/goals")
    @OrgPermissionRequired
    public Goals putGoals(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody GoalsRequest body) {
        return service.updateGoals(me, body);
    }
}
