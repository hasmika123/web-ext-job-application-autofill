package com.dossier.api.config;

import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.RoleTemplateSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
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
    private final ClientsDemoSeeder clientsDemo;
    private final boolean createAccounts;

    public EnterpriseDemoBootstrap(EnterpriseDemoSeeder seeder, RoleTemplateSeeder roleTemplates, TalentDemoSeeder talent, ClientsDemoSeeder clientsDemo, @Value("${dossier.demo.create-accounts:true}") boolean createAccounts) {
        this.seeder = seeder;
        this.roleTemplates = roleTemplates;
        this.talent = talent;
        this.clientsDemo = clientsDemo;
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
            return;
        }
        try {
            clientsDemo.seed(); // the Clients page's extra demo clients, contacts and notes (idempotent)
        } catch (RuntimeException e) {
            LOG.error("Clients demo seed failed; the Clients page shows only the foundation's clients.", e);
        }
    }
}
