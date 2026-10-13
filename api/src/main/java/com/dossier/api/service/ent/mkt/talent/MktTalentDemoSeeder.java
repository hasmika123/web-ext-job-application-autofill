package com.dossier.api.service.ent.mkt.talent;

import com.dossier.api.domain.ent.mkt.MktSavedView;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktSavedViewRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Demo rows for {@code mkt_saved_view}: every marketer who has assigned consultants in a demo tenant gets two example filter sets on
 * "My Assigned Talent". Same switches as the other demo seeds ({@code DEMO_ENABLED} and {@code ENT_DEMO_SEED}, never under prod: the
 * gate is {@link TalentDemoSeeder#refusal()}), idempotent (an org that already has saved views is skipped), and it only looks at orgs
 * whose talent demo data exists. It is an {@link ApplicationRunner} at the lowest precedence, i.e. it runs after
 * {@code EnterpriseDemoBootstrap} (which seeds the tenants and the talent data); on a database that is still empty at that moment it
 * does nothing and the next start fills it. A failure is logged and never stops the API.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class MktTalentDemoSeeder implements ApplicationRunner {

    private static final Logger LOG = LoggerFactory.getLogger(MktTalentDemoSeeder.class);

    private final TalentDemoSeeder gate;
    private final OrganizationRepository orgs;
    private final MarketerAssignmentRepository assignments;
    private final MktSavedViewRepository views;
    private final TransactionTemplate tx;

    public MktTalentDemoSeeder(TalentDemoSeeder gate, OrganizationRepository orgs, MarketerAssignmentRepository assignments, MktSavedViewRepository views, TransactionTemplate tx) {
        this.gate = gate;
        this.orgs = orgs;
        this.assignments = assignments;
        this.views = views;
        this.tx = tx;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            tx.executeWithoutResult(s -> seed());
        } catch (RuntimeException e) {
            LOG.error("Marketing talent demo seed failed; My Assigned Talent has no demo saved views.", e);
        }
    }

    /** Returns the number of rows added. */
    public int seed() {
        if (gate.refusal() != null) return 0;
        int added = 0;
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null || views.countByOrgId(org.getId()) > 0) continue;
            Set<Long> marketers = new LinkedHashSet<>();
            for (MarketerAssignment a : assignments.findByOrgId(org.getId())) marketers.add(a.getMarketerMemberId());
            for (Long memberId : marketers) {
                views.save(example(org.getId(), memberId, "Available this week", "AVAILABLE_NOW", null));
                views.save(example(org.getId(), memberId, "Resumes to refresh", "NEEDS_UPDATE", null));
                added += 2;
            }
        }
        if (added > 0) LOG.info("Marketing talent demo seeded: {} saved views", added);
        return added;
    }

    private static MktSavedView example(Long orgId, Long memberId, String name, String status, String skill) {
        MktSavedView v = new MktSavedView();
        v.setOrgId(orgId);
        v.setMemberId(memberId);
        v.setPageKey(MktSavedView.PAGE_TALENT);
        v.setName(name);
        v.setStatusFilter(status);
        v.setSkillFilter(skill);
        return v;
    }
}
