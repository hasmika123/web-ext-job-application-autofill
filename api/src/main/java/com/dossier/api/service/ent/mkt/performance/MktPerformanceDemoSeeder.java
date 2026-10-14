package com.dossier.api.service.ent.mkt.performance;

import com.dossier.api.domain.ent.mkt.MktBenchmark;
import com.dossier.api.domain.ent.mkt.MktGoal;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktBenchmarkRepository;
import com.dossier.api.repository.ent.mkt.MktGoalRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo rows for the Performance board's own tables: the organization's default monthly targets (Submissions 200, Interviews 60, Offers 40, Placements 15, the
 * board's numbers) and the industry benchmarks (Interview Rate 25%, Offer Rate 12%, Placement Rate 5%). Same switches as the other demo seeds
 * ({@code DEMO_ENABLED} + {@code ENT_DEMO_SEED}, never prod, the gate is {@link TalentDemoSeeder#refusal()}); it runs on {@link ApplicationReadyEvent}, after the tenants
 * exist, so no shared class is edited. <b>Idempotent:</b> each table is only filled for an organization that has no rows in it yet. No PII: plain numbers.
 */
@Component
public class MktPerformanceDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(MktPerformanceDemoSeeder.class);

    static final Map<String, Integer> TARGETS = new LinkedHashMap<>();
    static final Map<String, String> INDUSTRY = new LinkedHashMap<>();

    static {
        TARGETS.put(MktGoal.SUBMISSIONS, 200);
        TARGETS.put(MktGoal.INTERVIEWS, 60);
        TARGETS.put(MktGoal.OFFERS, 40);
        TARGETS.put(MktGoal.PLACEMENTS, 15);
        INDUSTRY.put(MktBenchmark.INTERVIEW_RATE, "25.00");
        INDUSTRY.put(MktBenchmark.OFFER_RATE, "12.00");
        INDUSTRY.put(MktBenchmark.PLACEMENT_RATE, "5.00");
    }

    private final TalentDemoSeeder gate;
    private final OrganizationRepository orgs;
    private final MktGoalRepository goals;
    private final MktBenchmarkRepository benchmarks;

    public MktPerformanceDemoSeeder(TalentDemoSeeder gate, OrganizationRepository orgs, MktGoalRepository goals, MktBenchmarkRepository benchmarks) {
        this.gate = gate;
        this.orgs = orgs;
        this.goals = goals;
        this.benchmarks = benchmarks;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        try {
            seed();
        } catch (RuntimeException e) {
            LOG.error("Performance demo seed failed; the Performance page shows no targets or benchmarks.", e);
        }
    }

    /** Seeds every demo tenant; returns the rows created per organization slug. */
    @Transactional
    public Map<String, Integer> seed() {
        Map<String, Integer> done = new LinkedHashMap<>();
        if (gate.refusal() != null) return done;
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            int n = seedOrg(org.getId());
            if (n > 0) {
                done.put(slug, n);
                LOG.info("Performance demo seeded for {}: {} rows", slug, n);
            }
        }
        return done;
    }

    /** Fills the org's default targets and benchmarks where it has none; returns the rows created. */
    int seedOrg(Long orgId) {
        Instant now = Instant.now();
        int n = 0;
        if (goals.countByOrgId(orgId) == 0) {
            for (Map.Entry<String, Integer> e : TARGETS.entrySet()) {
                MktGoal g = new MktGoal();
                g.setOrgId(orgId);
                g.setOwnerMemberId(null);
                g.setMetric(e.getKey());
                g.setPeriod(MktGoal.MONTH);
                g.setTarget(e.getValue());
                g.setCreatedAt(now);
                g.setUpdatedAt(now);
                goals.save(g);
                n++;
            }
        }
        if (benchmarks.countByOrgId(orgId) == 0) {
            for (Map.Entry<String, String> e : INDUSTRY.entrySet()) {
                MktBenchmark m = new MktBenchmark();
                m.setOrgId(orgId);
                m.setMetric(e.getKey());
                m.setIndustryValue(new BigDecimal(e.getValue()));
                m.setUpdatedAt(now);
                benchmarks.save(m);
                n++;
            }
        }
        return n;
    }
}
