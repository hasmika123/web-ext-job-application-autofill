package com.dossier.api.service.ent.consultants;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import java.util.Comparator;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Believable FICTIONAL contact details (555-01xx numbers, a time zone, a preferred contact) for the Acme demo consultants, so the marketer overview and
 * the Org Admin drawer have something to show. Same switches as the other demo seeds (the gate is {@link TalentDemoSeeder#refusal()}); idempotent:
 * a consultant that already has a phone, a zone and a preference is left alone, so an edit made through the UI is never overwritten. Runs after the
 * tenants and talent data exist; on an empty database it does nothing and the next start fills it. A failure is logged and never stops the API.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class ConsultantContactDemoSeeder implements ApplicationRunner {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantContactDemoSeeder.class);

    static final List<String> ZONES = List.of("America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Chicago", "America/New_York");
    static final List<String> PREFERRED = List.of("EMAIL", "PHONE", "TEXT");

    private final TalentDemoSeeder gate;
    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final TransactionTemplate tx;

    public ConsultantContactDemoSeeder(TalentDemoSeeder gate, OrganizationRepository orgs, ConsultantProfileRepository consultants, TransactionTemplate tx) {
        this.gate = gate;
        this.orgs = orgs;
        this.consultants = consultants;
        this.tx = tx;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            tx.executeWithoutResult(s -> seed());
        } catch (RuntimeException e) {
            LOG.error("Consultant contact demo seed failed; the demo consultants have no phone or time zone.", e);
        }
    }

    /** Returns the number of consultants filled in. */
    public int seed() {
        if (gate.refusal() != null) return 0;
        Organization org = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElse(null);
        if (org == null) return 0;
        List<ConsultantProfile> all = consultants.findByOrgId(org.getId()).stream().sorted(Comparator.comparing(ConsultantProfile::getId)).toList();
        int filled = 0;
        for (int i = 0; i < all.size(); i++) {
            ConsultantProfile c = all.get(i);
            boolean changed = false;
            if (c.getPhone() == null) {
                c.setPhone(String.format("(555) 010-%04d", 100 + i)); // 555-01xx: reserved for fiction
                changed = true;
            }
            if (c.getTimeZone() == null) {
                c.setTimeZone(ZONES.get(i % ZONES.size()));
                changed = true;
            }
            if (c.getPreferredContact() == null) {
                c.setPreferredContact(PREFERRED.get(i % PREFERRED.size()));
                changed = true;
            }
            if (changed) {
                consultants.save(c);
                filled++;
            }
        }
        if (filled > 0) LOG.info("Consultant contact demo seeded: {} consultants", filled);
        return filled;
    }
}
