package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsSavedJob;
import com.dossier.api.domain.ent.consultantws.CwsSavedSearch;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsSavedJobRepository;
import com.dossier.api.repository.ent.consultantws.CwsSavedSearchRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
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
 * Demo data for Job Discovery: a few saved searches, recent searches and bookmarked jobs for the consultants who are real seats
 * (member_id set: Anika, Ben, Sam). Idempotent: a consultant who already has any search row (or any saved job) is skipped. The jobs,
 * skills, matches and trending numbers come from the talent seed; nothing else is invented here. Not called from the bootstrap by this
 * class; the integrator wires it.
 */
@Service
public class ConsultantWsJobDiscoveryDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsJobDiscoveryDemoSeeder.class);

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final CwsSavedSearchRepository searches;
    private final CwsSavedJobRepository savedJobs;
    private final ClientRequirementRepository requirements;

    public ConsultantWsJobDiscoveryDemoSeeder(OrganizationRepository orgs, ConsultantProfileRepository consultants, CwsSavedSearchRepository searches, CwsSavedJobRepository savedJobs, ClientRequirementRepository requirements) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.searches = searches;
        this.savedJobs = savedJobs;
        this.requirements = requirements;
    }

    private record Spec(String name, String keyword, String location, String jobType, String workMode, String skill, int daysAgo) {}

    private static final Spec[] SAVED = {
        new Spec("Data Engineer - Remote", "data engineer", null, null, "REMOTE", null, 9),
        new Spec("Contract roles", null, null, "CONTRACT", null, null, 6),
        new Spec("Java jobs", null, null, null, null, "Java", 3),
    };

    private static final Spec[] RECENT = {
        new Spec(null, "data engineer", null, null, "REMOTE", null, 0),
        new Spec(null, "cloud", null, "CONTRACT", null, null, 1),
        new Spec(null, "developer", "Austin", null, null, null, 3),
        new Spec(null, null, null, null, null, "Python", 4),
    };

    @Transactional
    public int seed() {
        int made = 0;
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            List<ClientRequirement> open = requirements.findByOrgIdAndStatusOrderByPostedAtDesc(org.getId(), "OPEN");
            for (ConsultantProfile c : consultants.findByOrgId(org.getId())) {
                if (c.getMemberId() == null) continue;
                // the guard is this page's own rows only (searches): the Job Matches seeder also saves jobs and runs first
                boolean has = searches.countByOrgIdAndConsultantIdAndKind(org.getId(), c.getId(), CwsSavedSearch.SAVED) > 0
                    || searches.countByOrgIdAndConsultantIdAndKind(org.getId(), c.getId(), CwsSavedSearch.RECENT) > 0;
                if (has) continue;
                Instant now = Instant.now();
                for (Spec s : SAVED) made += row(org, c, CwsSavedSearch.SAVED, s, now);
                for (Spec s : RECENT) made += row(org, c, CwsSavedSearch.RECENT, s, now);
                for (int i = 0; i < Math.min(2, open.size()); i++) {
                    Long reqId = open.get(i * 2 % open.size()).getId();
                    if (savedJobs.findByOrgIdAndConsultantIdAndRequirementId(org.getId(), c.getId(), reqId).isPresent()) continue;
                    CwsSavedJob j = new CwsSavedJob();
                    j.setOrgId(org.getId());
                    j.setConsultantId(c.getId());
                    j.setRequirementId(reqId);
                    j.setCreatedAt(now.minus(Duration.ofDays(1L + i)));
                    savedJobs.save(j);
                    made++;
                }
            }
        }
        if (made > 0) LOG.info("Consultant workspace Job Discovery demo rows seeded: {}", made);
        return made;
    }

    private int row(Organization org, ConsultantProfile c, String kind, Spec s, Instant now) {
        CwsSavedSearch r = new CwsSavedSearch();
        r.setOrgId(org.getId());
        r.setConsultantId(c.getId());
        r.setKind(kind);
        r.setName(s.name());
        r.setKeyword(s.keyword());
        r.setLocation(s.location());
        r.setJobType(s.jobType());
        r.setWorkMode(s.workMode());
        r.setSkill(s.skill());
        Instant at = now.minus(Duration.ofDays(s.daysAgo()));
        r.setCreatedAt(at);
        r.setLastUsedAt(at);
        searches.save(r);
        return 1;
    }
}
