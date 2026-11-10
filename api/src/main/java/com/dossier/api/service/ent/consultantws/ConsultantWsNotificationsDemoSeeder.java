package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsNotificationRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gives the consultants who are real seats (Anika, Ben, Sam) their default notification preferences and a first feed. The feed is not invented: it
 * is derived from each consultant's own rows (matches, submissions, interviews, offers, tasks, profile) by {@link ConsultantNotificationGenerator},
 * exactly as it is on every page load, so there is nothing marked SAMPLE here. Idempotent: a consultant who already has any notification or any
 * preference row is skipped (the page generates the rest on its first GET anyway). Touches only its own tables. Call it after the other
 * consultant-workspace seeders, because it reads their rows.
 */
@Service
public class ConsultantWsNotificationsDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsNotificationsDemoSeeder.class);

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final CwsNotificationRepository notifications;
    private final ConsultantNotificationGenerator generator;
    private final ConsultantNotificationsService service;

    public ConsultantWsNotificationsDemoSeeder(
        OrganizationRepository orgs,
        ConsultantProfileRepository consultants,
        CwsNotificationRepository notifications,
        ConsultantNotificationGenerator generator,
        ConsultantNotificationsService service
    ) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.notifications = notifications;
        this.generator = generator;
        this.service = service;
    }

    @Transactional
    public int seed() {
        int made = 0;
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            for (ConsultantProfile c : consultants.findByOrgId(org.getId())) {
                if (c.getMemberId() == null) continue;
                if (notifications.countByOrgIdAndConsultantId(org.getId(), c.getId()) > 0) continue;
                service.ensureDefaultPrefs(c);
                made += generator.generateFor(c);
            }
        }
        if (made > 0) LOG.info("Consultant workspace demo: {} notifications derived", made);
        return made;
    }
}
