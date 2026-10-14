package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsMatchInterest;
import com.dossier.api.domain.ent.consultantws.CwsOpportunityResponse;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsMatchInterestRepository;
import com.dossier.api.repository.ent.consultantws.CwsOpportunityResponseRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
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
 * Demo rows for the Assigned Opportunities page, for the consultants who are real seats (Anika, Ben, Sam): the marketer's priority and due date
 * (SAMPLE stand-ins: no marketer-side write exists yet, "mock data now, fix cross-role data when all role branches merge") and a spread of
 * response states over their ASSIGNED matches. Call it after {@link ConsultantWsDemoSeeder}. Idempotent: a consultant who already has a response
 * row is skipped, and a consultant without ASSIGNED matches gets nothing.
 */
@Service
public class ConsultantWsOpportunitiesDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsOpportunitiesDemoSeeder.class);

    /** Per position among the consultant's ASSIGNED matches (best score first): status, priority, days until due (negative = overdue). */
    private static final String[] STATUS = { "NEW", "AWAITING_RESPONSE", "IN_REVIEW", "NEW", "AWAITING_RESPONSE", "DECLINED", "NEW", "IN_REVIEW" };
    private static final String[] PRIORITY = { "HIGH", "HIGH", "MEDIUM", "HIGH", "MEDIUM", "MEDIUM", "LOW", "MEDIUM" };
    private static final int[] DUE_IN_DAYS = { 2, 4, 8, 11, 14, 22, 18, 16 };

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final RequirementMatchRepository matches;
    private final CwsOpportunityResponseRepository responses;
    private final CwsMatchInterestRepository interests;

    public ConsultantWsOpportunitiesDemoSeeder(
        OrganizationRepository orgs, ConsultantProfileRepository consultants, RequirementMatchRepository matches, CwsOpportunityResponseRepository responses, CwsMatchInterestRepository interests
    ) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.matches = matches;
        this.responses = responses;
        this.interests = interests;
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
                if (!responses.findByOrgIdAndConsultantId(org.getId(), c.getId()).isEmpty()) continue;
                List<RequirementMatch> assigned = matches.findByOrgIdAndConsultantIdOrderByScoreDesc(org.getId(), c.getId()).stream().filter(m -> "ASSIGNED".equals(m.getStatus())).toList();
                for (int i = 0; i < assigned.size() && i < STATUS.length; i++) {
                    RequirementMatch m = assigned.get(i);
                    CwsOpportunityResponse r = new CwsOpportunityResponse();
                    r.setOrgId(org.getId());
                    r.setConsultantId(c.getId());
                    r.setRequirementId(m.getRequirementId());
                    r.setStatus(STATUS[i]);
                    r.setPriority(PRIORITY[i]);
                    r.setDueOn(today.plusDays(DUE_IN_DAYS[i]));
                    Instant at = now.minus(Duration.ofDays(1 + i));
                    r.setCreatedAt(at);
                    r.setUpdatedAt(at);
                    if (!"NEW".equals(STATUS[i])) r.setRespondedAt(at);
                    if ("AWAITING_RESPONSE".equals(STATUS[i])) r.setInfoRequest("Could you confirm the team size and whether the start date is flexible?");
                    if ("DECLINED".equals(STATUS[i])) r.setDeclineReason("The commute is too long for me right now.");
                    responses.save(r);
                    made++;
                    if ("IN_REVIEW".equals(STATUS[i]) && interests.findByOrgIdAndConsultantIdAndRequirementId(org.getId(), c.getId(), m.getRequirementId()).isEmpty()) {
                        CwsMatchInterest in = new CwsMatchInterest();
                        in.setOrgId(org.getId());
                        in.setConsultantId(c.getId());
                        in.setRequirementId(m.getRequirementId());
                        in.setCreatedAt(at.minus(Duration.ofHours(6)));
                        interests.save(in);
                        made++;
                    }
                }
            }
        }
        if (made > 0) LOG.info("Consultant workspace Assigned Opportunities demo rows seeded: {}", made);
        return made;
    }
}
