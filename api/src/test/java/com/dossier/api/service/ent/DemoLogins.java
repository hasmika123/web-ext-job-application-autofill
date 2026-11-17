package com.dossier.api.service.ent;

import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import java.util.Map;

/**
 * Test helper: the {@code ent#<orgId>#...} login of a seeded demo person named by its one-click handle {@code demo-ent-<orgKey>-<key>} (a roster
 * person or one of the talent seed's marketers). Since the demo moved to SEPARATE accounts the handle is no longer a login, and the real login
 * carries the organization id, so a test resolves it after seeding.
 */
public final class DemoLogins {

    private DemoLogins() {}

    public static String of(UserRepository users, OrganizationRepository orgs, String handle) {
        String rest = handle.substring(EnterpriseDemoSeeder.LOGIN_PREFIX.length());
        int dash = rest.indexOf('-');
        String orgKey = rest.substring(0, dash);
        String key = rest.substring(dash + 1);
        EnterpriseDemoSeeder.Tenant t = EnterpriseDemoSeeder.byOrgKey(orgKey).orElseThrow(() -> new IllegalArgumentException("no demo tenant " + orgKey));
        Long orgId = orgs.findBySlug(t.slug()).orElseThrow(() -> new IllegalStateException(t.slug() + " is not seeded")).getId();
        String email = TalentDemoSeeder.demoKeysByEmail(orgKey).entrySet().stream()
            .filter(e -> e.getValue().equals(key))
            .map(Map.Entry::getKey)
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("no demo person " + handle));
        return users.findOneByOrgIdAndEmailIgnoreCase(orgId, email).orElseThrow(() -> new IllegalStateException(handle + " has no account")).getLogin();
    }
}
