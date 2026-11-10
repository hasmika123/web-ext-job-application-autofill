package com.dossier.api.service.catalog.plan;

import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.service.catalog.CatalogException;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Story K2.4: a plan is RETIRED only when nothing references any of its versions: no personal subscription (current or scheduled), no organization
 * subscription and no entitlement grant (docs/subscriptions/04 section 5; the retirement lifecycle of epic K10 ends here). One question, one answer, so the
 * lifecycle service, the retirement job and the tests all ask the same thing.
 */
@Component
public class PlanRetireGuard {

    private final PlanSubscriberCounts counts;

    public PlanRetireGuard(PlanSubscriberCounts counts) {
        this.counts = counts;
    }

    /** How many rows still reference a version of {@code plan}. */
    public long references(Plan plan) {
        return counts.references(plan.getId());
    }

    public boolean isClear(Plan plan) {
        return references(plan) == 0;
    }

    /** 409 PLAN_HAS_SUBSCRIBERS while anything still references a version of the plan. */
    public void requireClear(Plan plan) {
        long n = references(plan);
        if (n > 0) {
            throw CatalogException.conflict("PLAN_HAS_SUBSCRIBERS", "Plan " + plan.getPlanKey() + " is still held by " + n + " subscription(s): it cannot be retired.", Map.of("planKey", plan.getPlanKey(), "references", n));
        }
    }
}
