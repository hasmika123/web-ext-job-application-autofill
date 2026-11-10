package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.catalog.dto.PlanDTOs.SubscriberRow;
import com.dossier.api.service.catalog.dto.PlanDTOs.SubscribersDTO;
import com.dossier.api.service.catalog.plan.PlanRetireGuard;
import com.dossier.api.service.catalog.plan.PlanSubscriberCounts;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Story K2.4: the lifecycle rules that protect subscribers (docs/subscriptions/04 section 5 and 6). A subscription keeps its {@code plan_version_id}, prices,
 * allowances and included services across any later publish (structural: publish never writes a subscription, and a published snapshot never changes;
 * GrandfatherTest). A plan or a version can only reach RETIRED once nothing references it ({@link PlanRetireGuard}). The retirement lifecycle itself (notices,
 * choices, RETIRING, the Free fallback) is epic K10.
 *
 * <p><b>FUTURE, not built (S-03: there are no existing subscribers):</b> the opt-in version-migration primitive ({@code POST .../versions/{v}/migrations}: a
 * MIGRATION_OFFER notice and a prepared quote, applied at period end on confirmation; AT_RENEWAL_WITH_NOTICE only when every new price is at most the old,
 * else 422 PRICE_INCREASE_REQUIRES_CONSENT; notice at least {@code billing.migration.notice_days}, hard minimum 30). Revisit when the first cohort exists; the
 * route and the {@code plan_migration} tables are deliberately absent.
 */
@Service
public class PlanLifecycleService {

    public static final String PLAN_RETIRED = "PLAN_RETIRED";
    public static final String PLAN_VERSION_ARCHIVED = "PLAN_VERSION_ARCHIVED";

    private final PlanRepository plans;
    private final PlanVersionRepository versions;
    private final PlanSubscriberCounts counts;
    private final PlanRetireGuard guard;
    private final CatalogChangeRecorder changes;
    private final AdminAuditService audit;

    public PlanLifecycleService(PlanRepository plans, PlanVersionRepository versions, PlanSubscriberCounts counts, PlanRetireGuard guard, CatalogChangeRecorder changes, AdminAuditService audit) {
        this.plans = plans;
        this.versions = versions;
        this.counts = counts;
        this.guard = guard;
        this.changes = changes;
        this.audit = audit;
    }

    /** Counts per version for everyone; the roster (logins) of one version when {@code version} is given. Admin only. */
    @Transactional(readOnly = true)
    public SubscribersDTO subscribers(String planKey, Integer version, int page, int size) {
        Plan p = plan(planKey);
        int sz = Math.max(1, Math.min(size, 200));
        int pg = Math.max(0, page);
        Map<String, Long> byVersion = new LinkedHashMap<>();
        long total = 0;
        for (Map.Entry<Integer, Long> e : counts.byVersion(p.getId()).entrySet()) {
            byVersion.put(String.valueOf(e.getKey()), e.getValue());
            total += e.getValue();
        }
        List<SubscriberRow> rows = new ArrayList<>();
        if (version != null) {
            PlanVersion v = versions.findByPlanIdAndVersion(p.getId(), version).orElseThrow(() -> CatalogException.notFound("plan version", p.getPlanKey() + " v" + version));
            for (PlanSubscriberCounts.Row r : counts.roster(v.getId(), sz, pg * sz)) rows.add(new SubscriberRow(r.login(), r.since(), r.interval(), List.of(), r.state()));
        }
        return new SubscribersDTO(p.getPlanKey(), version, total, byVersion, rows, pg, sz);
    }

    /**
     * A SUPERSEDED version nobody holds becomes RETIRED (read-only forever; 04 section 5). 409 VERSION_IN_USE while any subscription references it.
     */
    @Transactional
    public void archiveVersion(String planKey, int version, String reason) {
        String why = reason(reason, "Archiving a version");
        Plan p = plan(planKey);
        PlanVersion v = versions.findByPlanIdAndVersion(p.getId(), version).orElseThrow(() -> CatalogException.notFound("plan version", planKey + " v" + version));
        if (!"SUPERSEDED".equals(v.getStatus()) && !"RETIRING".equals(v.getStatus())) {
            throw CatalogException.conflict("VERSION_STATE", "Version " + version + " is " + v.getStatus() + ": only a SUPERSEDED or RETIRING version can be archived.", Map.of("status", v.getStatus()));
        }
        long held = counts.byVersion(p.getId()).getOrDefault(version, 0L);
        if (held > 0) throw CatalogException.conflict("VERSION_IN_USE", "Version " + version + " of " + planKey + " still has " + held + " subscriber(s).", Map.of("planKey", planKey, "version", version, "subscribers", held));
        String before = v.getStatus();
        v.setStatus("RETIRED");
        v.setUpdatedAt(Instant.now().truncatedTo(ChronoUnit.MILLIS));
        versions.saveAndFlush(v);
        changes.record(CatalogChangeRecorder.ENTITY_PLAN_VERSION, planKey + ":" + version, Map.of("status", before), Map.of("status", "RETIRED"), why);
        audit.record(PLAN_VERSION_ARCHIVED, AdminAuditService.TARGET_CATALOG, "plan:" + planKey + ":v" + version, why, "risk=HIGH plan=" + planKey + " version=" + version);
    }

    /**
     * The plan reaches RETIRED only when {@link PlanRetireGuard} finds no reference to any of its versions (409 PLAN_HAS_SUBSCRIBERS) and it has no draft (409
     * DRAFT_EXISTS: discard it first). Every version becomes RETIRED and the plan stops being sold. The notices, choices and the Free fallback that bring a live
     * cohort to this point are the retirement lifecycle of epic K10.
     */
    @Transactional
    public void retire(String planKey, String reason) {
        String why = reason(reason, "Retiring a plan");
        Plan p = plan(planKey);
        guard.requireClear(p);
        List<PlanVersion> all = versions.findByPlanIdOrderByVersionDesc(p.getId());
        if (all.stream().anyMatch(v -> "DRAFT".equals(v.getStatus()))) {
            throw CatalogException.conflict("DRAFT_EXISTS", "Plan " + planKey + " has a draft version: discard it first.", Map.of("planKey", planKey));
        }
        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        String before = p.getStatus();
        for (PlanVersion v : all) {
            if ("RETIRED".equals(v.getStatus())) continue;
            if (v.getEffectiveUntil() == null) v.setEffectiveUntil(now);
            v.setStatus("RETIRED");
            v.setUpdatedAt(now);
            versions.saveAndFlush(v);
        }
        p.setStatus("RETIRED");
        p.setPublicPlan(false);
        p.setUpdatedAt(now);
        p.setUpdatedBy(SecurityUtils.getCurrentUserLogin().orElse("system"));
        plans.saveAndFlush(p);
        changes.record(CatalogChangeRecorder.ENTITY_PLAN, planKey, Map.of("status", before), Map.of("status", "RETIRED"), why);
        audit.record(PLAN_RETIRED, AdminAuditService.TARGET_CATALOG, "plan:" + planKey, why, "risk=HIGH plan=" + planKey + " from=" + before);
    }

    private Plan plan(String planKey) {
        return plans.findByPlanKey(planKey == null ? "" : planKey.trim().toUpperCase(Locale.ROOT)).orElseThrow(() -> CatalogException.notFound("plan", String.valueOf(planKey)));
    }

    private static String reason(String reason, String what) {
        if (reason == null || reason.trim().length() < CatalogException.REASON_MIN_LENGTH) {
            throw CatalogException.unprocessable("REASON_REQUIRED", what + " needs a reason of at least " + CatalogException.REASON_MIN_LENGTH + " characters.", Map.of("minLength", CatalogException.REASON_MIN_LENGTH));
        }
        return reason.trim();
    }
}
