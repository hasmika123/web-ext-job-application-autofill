package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsJobSource;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsJobSourceRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo rows for the job source flow: every OPEN job of the demo organizations gets an example source link
 * ({@code https://jobs.example.com/<org-slug>/<requirementId>}), a source name and a short note, all marked {@code sample_data}. In the real product the
 * MARKETER role writes these (no marketer-side write exists yet: "mock data now, fix cross-role data when all role branches merge"). Call it after the
 * other consultant seeders. Idempotent: a job that already has a row is skipped, so only jobs without one are filled.
 */
@Service
public class ConsultantWsJobSourceDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsJobSourceDemoSeeder.class);

    private static final String[] SOURCE_NAMES = { "LinkedIn", "Dice", "Company site", "Indeed" };
    private static final String[] NOTES = {
        "Contract role. Apply on the source site and tailor your resume to the posting first.",
        "Client wants a fast turnaround. Open the link, check the posting details, then apply.",
        "Strong fit for your recent work. The full posting is on the source site.",
        "Interview process is quick on this one. Apply from the link with the extension.",
        "Rate is negotiable. Read the posting on the source site before you apply."
    };

    private final OrganizationRepository orgs;
    private final ClientRequirementRepository requirements;
    private final CwsJobSourceRepository sources;

    public ConsultantWsJobSourceDemoSeeder(OrganizationRepository orgs, ClientRequirementRepository requirements, CwsJobSourceRepository sources) {
        this.orgs = orgs;
        this.requirements = requirements;
        this.sources = sources;
    }

    @Transactional
    public int seed() {
        int made = 0;
        Instant now = Instant.now();
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            List<ClientRequirement> open = requirements.findByOrgIdAndStatusOrderByPostedAtDesc(org.getId(), "OPEN");
            if (open.isEmpty()) continue;
            Set<Long> have = sources.findByOrgIdAndRequirementIdIn(org.getId(), open.stream().map(ClientRequirement::getId).toList()).stream().map(CwsJobSource::getRequirementId).collect(Collectors.toSet());
            for (ClientRequirement r : open) {
                if (have.contains(r.getId())) continue;
                int k = (int) (r.getId() % 1000);
                CwsJobSource s = new CwsJobSource();
                s.setOrgId(org.getId());
                s.setRequirementId(r.getId());
                s.setSourceUrl("https://jobs.example.com/" + slug + "/" + r.getId());
                s.setSourceName(SOURCE_NAMES[k % SOURCE_NAMES.length]);
                s.setQuickInfo(NOTES[k % NOTES.length]);
                s.setSampleData(true);
                s.setCreatedAt(now);
                s.setUpdatedAt(now);
                sources.save(s);
                made++;
            }
        }
        if (made > 0) LOG.info("Consultant workspace job source demo rows seeded: {}", made);
        return made;
    }
}
