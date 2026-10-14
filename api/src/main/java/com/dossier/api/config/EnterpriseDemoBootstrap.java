package com.dossier.api.config;

import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.RoleTemplateSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsInterviewPrepDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsInterviewsDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsJobDiscoveryDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsMarketerDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsMatchesDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsOpportunitiesDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsProfileDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsResumesDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsSubmissionsDemoSeeder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Seeds the Enterprise V2 demo tenants at startup (X1.12) after Liquibase and the role-template seeder. Does nothing unless
 * {@link EnterpriseDemoSeeder#refusal()} allows it (DEMO_ENABLED and ENT_DEMO_SEED both on, never under the prod profile).
 * A failure is logged and never stops the API.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class EnterpriseDemoBootstrap implements ApplicationRunner {

    private static final Logger LOG = LoggerFactory.getLogger(EnterpriseDemoBootstrap.class);

    private final EnterpriseDemoSeeder seeder;
    private final RoleTemplateSeeder roleTemplates;
    private final TalentDemoSeeder talent;
    private final ConsultantWsDemoSeeder consultantWs;
    private final java.util.List<Runnable> consultantPages;
    private final boolean createAccounts;

    public EnterpriseDemoBootstrap(EnterpriseDemoSeeder seeder, RoleTemplateSeeder roleTemplates, TalentDemoSeeder talent, ConsultantWsDemoSeeder consultantWs, ConsultantWsProfileDemoSeeder profileSeed, ConsultantWsResumesDemoSeeder resumesSeed, ConsultantWsMarketerDemoSeeder marketerSeed, ConsultantWsMatchesDemoSeeder matchesSeed, ConsultantWsJobDiscoveryDemoSeeder discoverySeed, ConsultantWsInterviewsDemoSeeder interviewsSeed, ConsultantWsInterviewPrepDemoSeeder prepSeed, ConsultantWsSubmissionsDemoSeeder submissionsSeed, ConsultantWsOpportunitiesDemoSeeder opportunitiesSeed, @Value("${dossier.demo.create-accounts:true}") boolean createAccounts) {
        this.seeder = seeder;
        this.roleTemplates = roleTemplates;
        this.talent = talent;
        this.consultantWs = consultantWs;
        // the consultant workspace pages' own demo rows, in dependency order (all after ConsultantWsDemoSeeder: matches build on its matches)
        this.consultantPages = java.util.List.of(profileSeed::seed, resumesSeed::seed, marketerSeed::seed, matchesSeed::seed, discoverySeed::seed, interviewsSeed::seed, prepSeed::seed, submissionsSeed::seed, opportunitiesSeed::seed);
        this.createAccounts = createAccounts;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!createAccounts) return;
        try {
            if (seeder.refusal() != null) return;
            roleTemplates.seed(); // the system roles must exist before a member can hold one (idempotent)
            seeder.seed();
        } catch (RuntimeException e) {
            LOG.error("Enterprise demo seed failed; the demo tenants were not created/updated.", e);
            return;
        }
        try {
            talent.seed(); // talent boards demo data: only after the tenants exist, same switches
        } catch (RuntimeException e) {
            LOG.error("Talent demo seed failed; the talent pages have no demo data.", e);
        }
        try {
            consultantWs.seed(); // the consultant workspace's own demo rows (tasks), after the consultants exist
        } catch (RuntimeException e) {
            LOG.error("Consultant workspace demo seed failed; the Home tasks card is empty.", e);
            return;
        }
        for (Runnable page : consultantPages) {
            try {
                page.run();
            } catch (RuntimeException e) {
                LOG.error("A consultant workspace page demo seed failed; that page has less demo data.", e);
            }
        }
    }
}
