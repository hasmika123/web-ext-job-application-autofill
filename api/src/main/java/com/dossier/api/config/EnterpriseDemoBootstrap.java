package com.dossier.api.config;

import com.dossier.api.service.ent.BillingDemoSeeder;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.OpsDemoSeeder;
import com.dossier.api.service.ent.RoleTemplateSeeder;
import com.dossier.api.service.ent.PlacementDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsInterviewPrepDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsInterviewsDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsJobDiscoveryDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsJobSourceDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsMarketerDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsMatchesDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsOpportunitiesDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsProfileDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsResumesDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsSubmissionsDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsPlacementDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsSettingsDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsNotificationsDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsOffersDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsAvailabilityDemoSeeder;
import com.dossier.api.service.ent.consultantws.ConsultantWsTasksDemoSeeder;
import com.dossier.api.service.ent.clients.ClientsDemoSeeder;
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
    private final BillingDemoSeeder billing;
    private final OpsDemoSeeder ops;
    private final ClientsDemoSeeder clientsDemo;
    private final PlacementDemoSeeder placementDemo;
    private final com.dossier.api.service.ent.consultantws.ConsultantInboxDemoSeeder inboxDemo;
    private final boolean createAccounts;

    public EnterpriseDemoBootstrap(EnterpriseDemoSeeder seeder, RoleTemplateSeeder roleTemplates, TalentDemoSeeder talent, ConsultantWsDemoSeeder consultantWs, ConsultantWsProfileDemoSeeder profileSeed, ConsultantWsResumesDemoSeeder resumesSeed, ConsultantWsMarketerDemoSeeder marketerSeed, ConsultantWsMatchesDemoSeeder matchesSeed, ConsultantWsJobDiscoveryDemoSeeder discoverySeed, ConsultantWsInterviewsDemoSeeder interviewsSeed, ConsultantWsInterviewPrepDemoSeeder prepSeed, ConsultantWsSubmissionsDemoSeeder submissionsSeed, ConsultantWsOpportunitiesDemoSeeder opportunitiesSeed, ConsultantWsTasksDemoSeeder tasksSeed, ConsultantWsAvailabilityDemoSeeder availabilitySeed, ConsultantWsOffersDemoSeeder offersSeed, ConsultantWsPlacementDemoSeeder placementSeed, ConsultantWsSettingsDemoSeeder settingsSeed, ConsultantWsNotificationsDemoSeeder notificationsSeed, ConsultantWsJobSourceDemoSeeder jobSourceSeed, BillingDemoSeeder billing, OpsDemoSeeder ops, ClientsDemoSeeder clientsDemo, PlacementDemoSeeder placementDemo, com.dossier.api.service.ent.consultantws.ConsultantInboxDemoSeeder inboxDemo, @Value("${dossier.demo.create-accounts:true}") boolean createAccounts) {
        this.seeder = seeder;
        this.roleTemplates = roleTemplates;
        this.talent = talent;
        this.consultantWs = consultantWs;
        this.billing = billing;
        this.ops = ops;
        this.clientsDemo = clientsDemo;
        this.placementDemo = placementDemo;
        this.inboxDemo = inboxDemo;
        // the consultant workspace pages' own demo rows, in dependency order (all after ConsultantWsDemoSeeder: matches build on its matches)
        this.consultantPages = java.util.List.of(profileSeed::seed, resumesSeed::seed, marketerSeed::seed, matchesSeed::seed, discoverySeed::seed, interviewsSeed::seed, prepSeed::seed, submissionsSeed::seed, opportunitiesSeed::seed, tasksSeed::seed, availabilitySeed::seed, offersSeed::seed, placementSeed::seed, settingsSeed::seed, notificationsSeed::seed, jobSourceSeed::seed);
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
            seeder.seedSeparate(); // Gamma Consulting (SEPARATE accounts, gamma.localhost), own transaction: a failure here never touches acme or beta
        } catch (RuntimeException e) {
            LOG.error("Separate-accounts demo seed failed; the Gamma demo organization was not created/updated.", e);
        }
        try {
            talent.seed(); // talent boards demo data: only after the tenants exist, same switches
        } catch (RuntimeException e) {
            LOG.error("Talent demo seed failed; the talent pages have no demo data.", e);
            return; // the ops data is built on the talent rows
        }
        try {
            ops.seed(); // HR, finance and reports demo data: built from the talent rows, same switches
        } catch (RuntimeException e) {
            LOG.error("Ops demo seed failed; the HR, finance and reports pages have no demo data.", e);
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
        try {
            billing.seed(); // billing boards demo data (licenses, invoices, usage): after the talent seed, it links to its consultants
        } catch (RuntimeException e) {
            LOG.error("Billing demo seed failed; the billing pages have no demo data.", e);
        }
        try {
            clientsDemo.seed(); // the Clients page's extra demo clients, contacts and notes (idempotent)
        } catch (RuntimeException e) {
            LOG.error("Clients demo seed failed; the Clients page shows only the foundation's clients.", e);
        }
        try {
            placementDemo.seed(); // Placements page demo data (end dates, upcoming, extensions, pool): after the talent rows exist
        } catch (RuntimeException e) {
            LOG.error("Placements demo seed failed; the Placements page has only the foundation rows.", e);
        }
        try {
            inboxDemo.seed(); // the consultant Inbox page's demo rows (the add-on on Anika's license, two applications for the sample mailbox): after billing
        } catch (RuntimeException e) {
            LOG.error("Consultant inbox demo seed failed; the Inbox page has no demo add-on or applications.", e);
        }
    }
}
