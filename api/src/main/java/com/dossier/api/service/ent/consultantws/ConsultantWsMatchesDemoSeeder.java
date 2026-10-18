package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsMatchInterest;
import com.dossier.api.domain.ent.consultantws.CwsMatchView;
import com.dossier.api.domain.ent.consultantws.CwsSavedJob;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsMatchInterestRepository;
import com.dossier.api.repository.ent.consultantws.CwsMatchViewRepository;
import com.dossier.api.repository.ent.consultantws.CwsSavedJobRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
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
 * Demo rows for the Job Matches page (saved jobs, opened matches, one expressed interest) for the consultants who are real seats
 * (Anika, Ben, Sam). Call it after {@link ConsultantWsDemoSeeder} (it needs their matches). Idempotent: a consultant who already has any
 * saved, viewed or interest row is skipped, and nobody without matches gets anything.
 */
@Service
public class ConsultantWsMatchesDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsMatchesDemoSeeder.class);

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final RequirementMatchRepository matches;
    private final CwsSavedJobRepository saved;
    private final CwsMatchViewRepository views;
    private final CwsMatchInterestRepository interests;

    public ConsultantWsMatchesDemoSeeder(
        OrganizationRepository orgs, ConsultantProfileRepository consultants, RequirementMatchRepository matches, CwsSavedJobRepository saved,
        CwsMatchViewRepository views, CwsMatchInterestRepository interests
    ) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.matches = matches;
        this.saved = saved;
        this.views = views;
        this.interests = interests;
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
                if (!saved.findByOrgIdAndConsultantIdOrderByCreatedAtDesc(org.getId(), c.getId()).isEmpty()
                    || !views.findByOrgIdAndConsultantId(org.getId(), c.getId()).isEmpty()
                    || !interests.findByOrgIdAndConsultantId(org.getId(), c.getId()).isEmpty()) continue;
                List<RequirementMatch> mine = matches.findByOrgIdAndConsultantIdOrderByScoreDesc(org.getId(), c.getId()).stream().filter(m -> !"DISMISSED".equals(m.getStatus())).toList();
                for (int i = 0; i < mine.size() && i < 5; i++) {
                    Long req = mine.get(i).getRequirementId();
                    if (i < 2 || i == 3) {
                        CwsSavedJob s = new CwsSavedJob();
                        s.setOrgId(org.getId());
                        s.setConsultantId(c.getId());
                        s.setRequirementId(req);
                        s.setCreatedAt(now.minus(Duration.ofDays(i == 3 ? 10 : 1 + i)));
                        saved.save(s);
                        made++;
                    }
                    if (i < 4) {
                        CwsMatchView v = new CwsMatchView();
                        v.setOrgId(org.getId());
                        v.setConsultantId(c.getId());
                        v.setRequirementId(req);
                        v.setViewedAt(now.minus(Duration.ofDays(i < 3 ? i : 9)));
                        views.save(v);
                        made++;
                    }
                    if (i == 1) {
                        CwsMatchInterest in = new CwsMatchInterest();
                        in.setOrgId(org.getId());
                        in.setConsultantId(c.getId());
                        in.setRequirementId(req);
                        in.setCreatedAt(now.minus(Duration.ofHours(20)));
                        interests.save(in);
                        made++;
                    }
                }
            }
        }
        if (made > 0) LOG.info("Consultant workspace Job Matches demo rows seeded: {}", made);
        return made;
    }
}
