package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Gap D10: the demo members' one-click sign-in is offered only on the demo tenant's own development host, never on a real tenant's address. */
class EnterpriseDemoHostTest {

    @Test
    void onlyTheRostersOwnLocalhostHostCounts() {
        EnterpriseDemoSeeder.Tenant acme = EnterpriseDemoSeeder.ACME;
        assertThat(acme.host()).endsWith(".localhost");
        assertThat(EnterpriseDemoService.isDemoHost(acme, acme.host())).isTrue();
        assertThat(EnterpriseDemoService.isDemoHost(acme, acme.host().toUpperCase())).isTrue();
        assertThat(EnterpriseDemoService.isDemoHost(acme, EnterpriseDemoSeeder.BETA_HOST)).as("another demo tenant's host").isFalse();
        assertThat(EnterpriseDemoService.isDemoHost(acme, "acme.kiwiply.com")).as("a real address of the same organization").isFalse();
        assertThat(EnterpriseDemoService.isDemoHost(acme, "careers.acme.com")).isFalse();
    }

    @Test
    void everyDemoTenantLivesOnADevelopmentHost() {
        for (EnterpriseDemoSeeder.Tenant t : EnterpriseDemoSeeder.TENANTS) assertThat(t.host()).as(t.slug()).endsWith(".localhost");
    }
}
