package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsOffer;
import com.dossier.api.domain.ent.consultantws.CwsOfferEvent;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsOfferEventRepository;
import com.dossier.api.repository.ent.consultantws.CwsOfferRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo STAND-IN offers for the Offers page, for the consultants who are real seats (Anika, Ben, Sam). In the product an offer originates on the
 * employer / marketer side, which is not built in this branch, so these rows play that part and every one is flagged {@code sample_data = true}
 * (the page shows a Sample mark). Five offers per consultant (two pending review, one in negotiation, one declined, one accepted) with a timeline
 * each. Money is a record in minor units. Idempotent: a consultant who already has any offer is skipped, and it touches no other table.
 * Call it after {@link ConsultantWsDemoSeeder} (only for the consultant profiles).
 */
@Service
public class ConsultantWsOffersDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsOffersDemoSeeder.class);

    /** company, role, package text, base (dollars), total (dollars), work mode, start in days (from today), deadline in days (negative = passed), status, created days ago, benefits. */
    private record Demo(
        String company, String role, String pkg, long base, long total, String mode, int startInDays, int deadlineInDays, String status, int createdDaysAgo, String benefits
    ) {}

    private static final Demo[] DEMOS = {
        new Demo("CloudWave", "Senior Software Engineer", "$145K base + 15% bonus + equity", 145_000, 166_750, "REMOTE", 90, 5, CwsOffer.PENDING_REVIEW, 0,
            "Health, dental and vision from day one. 401(k) with a 4% match. 25 days of paid time off. Annual learning budget."),
        new Demo("InnovateTech", "Full Stack Developer", "$130K base + 10% bonus", 130_000, 143_000, "HYBRID", 50, 8, CwsOffer.NEGOTIATION, 6,
            "Health and dental. 401(k) with a 3% match. 20 days of paid time off. Two office days a week."),
        new Demo("FinServe Inc.", "Data Engineer", "$125K base + 10% bonus + equity", 125_000, 137_500, "REMOTE", 85, 12, CwsOffer.PENDING_REVIEW, 3,
            "Health, dental and vision. Equity vests over four years. Home-office stipend."),
        new Demo("GlobalTech", "DevOps Engineer", "$118K base + 10% bonus", 118_000, 129_800, "ONSITE", 20, -3, CwsOffer.DECLINED, 40,
            "Health and dental. 401(k) with a 3% match. Relocation help for the first month."),
        new Demo("NextGen", "React Developer", "$120K base + 5% bonus", 120_000, 126_000, "HYBRID", 100, -6, CwsOffer.ACCEPTED, 12,
            "Health, dental and vision. 401(k) with a 4% match. Three office days a week."),
    };

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final CwsOfferRepository offers;
    private final CwsOfferEventRepository events;

    public ConsultantWsOffersDemoSeeder(OrganizationRepository orgs, ConsultantProfileRepository consultants, CwsOfferRepository offers, CwsOfferEventRepository events) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.offers = offers;
        this.events = events;
    }

    @Transactional
    public int seed() {
        int made = 0;
        Instant now = Instant.now();
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            for (ConsultantProfile c : consultants.findByOrgId(org.getId())) {
                if (c.getMemberId() == null) continue;
                if (offers.countByOrgIdAndConsultantId(org.getId(), c.getId()) > 0) continue;
                for (Demo d : DEMOS) {
                    CwsOffer o = new CwsOffer();
                    o.setOrgId(org.getId());
                    o.setConsultantId(c.getId());
                    o.setClientName(d.company());
                    o.setRoleTitle(d.role());
                    o.setPackageSummary(d.pkg());
                    o.setBenefitsSummary(d.benefits());
                    o.setBaseSalaryMinor(d.base() * 100);
                    o.setTotalCompMinor(d.total() * 100);
                    o.setCurrency("USD");
                    o.setWorkMode(d.mode());
                    o.setStartDate(today.plusDays(d.startInDays()));
                    o.setOfferDeadline(today.plusDays(d.deadlineInDays()));
                    o.setStatus(d.status());
                    o.setSampleData(true);
                    o.setUpdatedByKind(CwsOfferEvent.BY_SYSTEM); // the seeder writes through the same table the org side records into; stand-ins are marked sample_data and SYSTEM
                    Instant created = d.createdDaysAgo() == 0 ? now.minus(Duration.ofHours(2)) : now.minus(Duration.ofDays(d.createdDaysAgo()));
                    o.setCreatedAt(created);
                    o.setUpdatedAt(created);
                    if (CwsOffer.DECLINED.equals(d.status())) {
                        o.setRespondedAt(now.minus(Duration.ofDays(5)));
                        o.setResponseNote("The role needs a daily commute I can't take on.");
                        o.setUpdatedAt(o.getRespondedAt());
                    } else if (CwsOffer.ACCEPTED.equals(d.status())) {
                        o.setRespondedAt(now.minus(Duration.ofDays(3)));
                        o.setUpdatedAt(o.getRespondedAt());
                    } else if (CwsOffer.NEGOTIATION.equals(d.status())) {
                        o.setRespondedAt(now.minus(Duration.ofDays(1)));
                        o.setResponseNote("Would like to talk about the base salary and the start date.");
                        o.setUpdatedAt(o.getRespondedAt());
                    }
                    o = offers.saveAndFlush(o);
                    events.save(CwsOfferEvent.of(o, CwsOfferEvent.RECEIVED, "New offer received", created));
                    if (CwsOffer.NEGOTIATION.equals(d.status())) {
                        events.save(CwsOfferEvent.of(o, CwsOfferEvent.UPDATED, "Offer updated", now.minus(Duration.ofDays(2))));
                        events.save(CwsOfferEvent.of(o, CwsOfferEvent.NEGOTIATING, "Negotiation requested", o.getRespondedAt()));
                    } else if (CwsOffer.ACCEPTED.equals(d.status())) {
                        events.save(CwsOfferEvent.of(o, CwsOfferEvent.ACCEPTED, "Offer accepted", o.getRespondedAt()));
                    } else if (CwsOffer.DECLINED.equals(d.status())) {
                        events.save(CwsOfferEvent.of(o, CwsOfferEvent.DECLINED, "Offer declined", o.getRespondedAt()));
                    }
                    made++;
                }
            }
        }
        if (made > 0) LOG.info("Consultant workspace Offers demo rows seeded: {}", made);
        return made;
    }
}
