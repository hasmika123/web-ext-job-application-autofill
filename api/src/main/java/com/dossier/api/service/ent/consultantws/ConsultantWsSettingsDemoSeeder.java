package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsSetting;
import com.dossier.api.domain.ent.consultantws.CwsSettingEvent;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsSettingEventRepository;
import com.dossier.api.repository.ent.consultantws.CwsSettingRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo rows for the Settings page, for the consultants who are real seats (Anika, Ben, Sam): one stored settings row and one privacy event each,
 * so the page is not all defaults. No password, token or phone number is seeded (none exists). Idempotent: a consultant who already has a
 * settings row or any event is skipped, and it never touches another table.
 */
@Service
public class ConsultantWsSettingsDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsSettingsDemoSeeder.class);

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final CwsSettingRepository settings;
    private final CwsSettingEventRepository events;

    public ConsultantWsSettingsDemoSeeder(OrganizationRepository orgs, ConsultantProfileRepository consultants, CwsSettingRepository settings, CwsSettingEventRepository events) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.settings = settings;
        this.events = events;
    }

    @Transactional
    public int seed() {
        int made = 0;
        Instant now = Instant.now();
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            for (ConsultantProfile c : consultants.findByOrgId(org.getId())) {
                if (c.getMemberId() == null) continue;
                if (settings.findByOrgIdAndConsultantId(org.getId(), c.getId()).isPresent() || events.countByOrgIdAndConsultantId(org.getId(), c.getId()) > 0) continue;
                CwsSetting s = new CwsSetting();
                s.setOrgId(org.getId());
                s.setConsultantId(c.getId());
                s.setProfileVisibility(CwsSetting.ORG_ONLY);
                s.setShareProfileWithEmployers(true);
                s.setShowContactInformation(false);
                s.setAllowAnalytics(true);
                s.setTheme("SYSTEM");
                s.setLanguage("en-US");
                s.setTimezone("America/New_York");
                s.setUpdatedAt(now.minus(Duration.ofDays(3)));
                settings.save(s);
                CwsSettingEvent e = new CwsSettingEvent();
                e.setOrgId(org.getId());
                e.setConsultantId(c.getId());
                e.setKind(CwsSettingEvent.PRIVACY);
                e.setLabel("Privacy settings updated");
                e.setDetail("Changed sharing with employers, analytics usage");
                e.setOccurredAt(now.minus(Duration.ofDays(3)));
                events.save(e);
                made++;
            }
        }
        if (made > 0) LOG.info("Consultant workspace demo settings seeded for {} consultant(s)", made);
        return made;
    }
}
