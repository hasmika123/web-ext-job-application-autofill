package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsAvailabilityBlock;
import com.dossier.api.domain.ent.consultantws.CwsAvailabilityHistory;
import com.dossier.api.domain.ent.consultantws.CwsWorkPreference;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsAvailabilityBlockRepository;
import com.dossier.api.repository.ent.consultantws.CwsAvailabilityHistoryRepository;
import com.dossier.api.repository.ent.consultantws.CwsWorkPreferenceRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo rows for the Availability page, for the consultants who are real seats (Anika, Ben, Sam). Per consultant: work preferences, four
 * calendar entries (one in the past, three coming up, one of them still PENDING) and a short availability history whose newest row mirrors
 * the consultant's current profile values. The calendar entries are the consultant's own, but their APPROVED / PENDING status is the
 * marketer's call and the marketer side is not built, so the seeder stands in for it and every row is flagged {@code sample_data = true}
 * (the page marks the status as a sample). Idempotent: a consultant who already has any row in these three tables is skipped, and it never
 * touches another table.
 */
@Service
public class ConsultantWsAvailabilityDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsAvailabilityDemoSeeder.class);

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final CwsAvailabilityBlockRepository blocks;
    private final CwsAvailabilityHistoryRepository history;
    private final CwsWorkPreferenceRepository workPrefs;

    public ConsultantWsAvailabilityDemoSeeder(
        OrganizationRepository orgs,
        ConsultantProfileRepository consultants,
        CwsAvailabilityBlockRepository blocks,
        CwsAvailabilityHistoryRepository history,
        CwsWorkPreferenceRepository workPrefs
    ) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.blocks = blocks;
        this.history = history;
        this.workPrefs = workPrefs;
    }

    @Transactional
    public int seed() {
        int made = 0;
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            int index = 0;
            for (ConsultantProfile c : consultants.findByOrgId(org.getId())) {
                if (c.getMemberId() == null) continue;
                int i = index++;
                if (blocks.countByOrgIdAndConsultantId(org.getId(), c.getId()) > 0
                    || history.countByOrgIdAndConsultantId(org.getId(), c.getId()) > 0
                    || workPrefs.findByOrgIdAndConsultantId(org.getId(), c.getId()).isPresent()) continue;

                CwsWorkPreference pref = new CwsWorkPreference();
                pref.setOrgId(org.getId());
                pref.setConsultantId(c.getId());
                pref.setPreferredWorkMode(List.of("HYBRID", "REMOTE", "ONSITE").get(i % 3));
                pref.setNoticeWeeks(2 + (i % 3));
                pref.setRateMinMinor(11000L + 1000L * (i % 3));
                pref.setRateMaxMinor(14000L + 1000L * (i % 3));
                pref.setRateNote("Flexible based on role and scope");
                pref.setTravelLabel("OCCASIONAL");
                pref.setTravelPercent(25);
                pref.setUpdatedAt(Instant.now());
                workPrefs.save(pref);
                made++;

                made += block(org.getId(), c.getId(), CwsAvailabilityBlock.VACATION, today.minusDays(24), today.minusDays(23), "Personal vacation", CwsAvailabilityBlock.APPROVED);
                made += block(org.getId(), c.getId(), CwsAvailabilityBlock.VACATION, today.plusDays(9), today.plusDays(10), "Family trip", CwsAvailabilityBlock.APPROVED);
                made += block(org.getId(), c.getId(), CwsAvailabilityBlock.VACATION, today.plusDays(40), today.plusDays(44), "Holiday vacation", CwsAvailabilityBlock.PENDING);
                made += block(org.getId(), c.getId(), CwsAvailabilityBlock.PERSONAL, today.plusDays(70), today.plusDays(70), "Personal day", CwsAvailabilityBlock.APPROVED);

                made += past(org.getId(), c.getId(), today.minusDays(200), "AVAILABLE", null, "ONSITE", CwsAvailabilityHistory.EXPIRED);
                made += past(org.getId(), c.getId(), today.minusDays(120), "AVAILABLE", today.minusDays(100), "REMOTE", CwsAvailabilityHistory.EXPIRED);
                made += past(org.getId(), c.getId(), today.minusDays(60), "NOTICE", today.minusDays(30), "HYBRID", CwsAvailabilityHistory.EXPIRED);
                made += past(org.getId(), c.getId(), today.minusDays(5), c.getAvailabilityStatus(), c.getAvailableFrom(), pref.getPreferredWorkMode(), CwsAvailabilityHistory.ACTIVE);
            }
        }
        if (made > 0) LOG.info("Consultant workspace Availability demo rows seeded: {}", made);
        return made;
    }

    private int block(Long org, Long consultantId, String kind, LocalDate from, LocalDate to, String reason, String status) {
        CwsAvailabilityBlock b = new CwsAvailabilityBlock();
        b.setOrgId(org);
        b.setConsultantId(consultantId);
        b.setKind(kind);
        b.setStartDate(from);
        b.setEndDate(to);
        b.setReason(reason);
        b.setStatus(status);
        b.setSampleData(true);
        blocks.save(b);
        return 1;
    }

    private int past(Long org, Long consultantId, LocalDate effective, String status, LocalDate from, String mode, String rowStatus) {
        CwsAvailabilityHistory h = new CwsAvailabilityHistory();
        h.setOrgId(org);
        h.setConsultantId(consultantId);
        h.setEffectiveDate(effective);
        h.setAvailabilityStatus(status);
        h.setAvailableFrom(from);
        h.setWorkMode(mode);
        h.setStatus(rowStatus);
        h.setSampleData(true);
        history.save(h);
        return 1;
    }
}
