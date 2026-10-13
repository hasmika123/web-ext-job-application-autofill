package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsResumeActivity;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.OrgResumeExperience;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsResumeActivityRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeExperienceRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo data for the My Resumes page, for the consultants who are real seats (member_id set: Anika, Ben, Sam). Tops each of them up to
 * five resumes (board titles, versions and visibility; one primary when they have none) and adds view, download and share activity
 * spread over the last 60 days so the tiles show a change against last month. Idempotent: one-time per consultant, guarded by "no
 * resume activity yet". Called from the bootstrap by the integrator, not from here.
 */
@Service
public class ConsultantWsResumesDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsResumesDemoSeeder.class);

    private record Spec(String title, String role, int version, String visibility, int updatedDaysAgo) {}

    private static final Spec[] SPECS = {
        new Spec("Technical Consultant Resume", "General consulting opportunities", 3, "PUBLIC", 1),
        new Spec("Data Engineer Resume", "Data & Analytics roles", 2, "PUBLIC", 3),
        new Spec("Full Stack Developer Resume", "Web development roles", 4, "PRIVATE", 5),
        new Spec("Cloud Solutions Resume", "Cloud & Infrastructure roles", 2, "PUBLIC", 10),
        new Spec("Product Consultant Resume", "Product management & strategy", 1, "PUBLIC", 15),
    };
    private static final int[] VIEWS = { 8, 6, 4, 3, 3 };
    private static final int[] DOWNLOADS = { 4, 3, 2, 2, 1 };
    private static final int[] SHARES = { 3, 2, 1, 1, 1 };
    private static final int TARGET = 5;

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final OrgResumeRepository resumes;
    private final OrgResumeExperienceRepository experience;
    private final CwsResumeActivityRepository activity;

    public ConsultantWsResumesDemoSeeder(
        OrganizationRepository orgs, ConsultantProfileRepository consultants, OrgResumeRepository resumes, OrgResumeExperienceRepository experience, CwsResumeActivityRepository activity
    ) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.resumes = resumes;
        this.experience = experience;
        this.activity = activity;
    }

    /** @return how many rows (resumes + activity) it added */
    @Transactional
    public int seed() {
        int made = 0;
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            for (ConsultantProfile c : consultants.findByOrgId(org.getId())) {
                if (c.getMemberId() == null || activity.countByOrgIdAndConsultantId(org.getId(), c.getId()) > 0) continue;
                made += topUpResumes(c);
                made += addActivity(c);
            }
        }
        if (made > 0) LOG.info("Consultant workspace resumes demo rows seeded: {}", made);
        return made;
    }

    private int topUpResumes(ConsultantProfile c) {
        Long org = c.getOrgId();
        List<OrgResume> have = resumes.findByOrgIdAndConsultantId(org, c.getId());
        boolean hasPrimary = have.stream().anyMatch(OrgResume::isPrimaryForOrg);
        Instant now = Instant.now();
        int made = 0;
        for (int i = have.size(); i < TARGET; i++) {
            Spec s = SPECS[i];
            OrgResume r = new OrgResume();
            r.setOrgId(org);
            r.setConsultantId(c.getId());
            r.setMemberId(c.getMemberId());
            r.setOwnerMemberId(c.getMemberId());
            r.setName(s.title());
            r.setTargetRole(s.role());
            r.setVersionNo(s.version());
            r.setVisibility(s.visibility());
            r.setApprovalStatus("APPROVED");
            r.setApprovedAt(now.minus(Duration.ofDays(s.updatedDaysAgo())));
            r.setHeadline(c.getJobTitle() != null ? c.getJobTitle() : "Consultant");
            r.setSummaryText("Consultant focused on " + s.role().toLowerCase() + ". Clear communicator with a record of dependable delivery on client engagements.");
            r.setCreatedAt(now.minus(Duration.ofDays(s.updatedDaysAgo() + 45)));
            r.setUpdatedAt(now.minus(Duration.ofDays(s.updatedDaysAgo())).minus(Duration.ofHours(i + 2)));
            boolean primary = !hasPrimary && i == have.size();
            r.setPrimaryForOrg(primary);
            if (primary) hasPrimary = true;
            r = resumes.saveAndFlush(r);
            String[] employers = { "Northwind Systems", "Bluepeak Digital" };
            int year = now.atZone(java.time.ZoneOffset.UTC).getYear();
            for (int e = 0; e < 2; e++) {
                OrgResumeExperience x = new OrgResumeExperience();
                x.setOrgId(org);
                x.setResumeId(r.getId());
                x.setTitle(e == 0 ? "Senior Consultant" : "Consultant");
                x.setEmployer(employers[e]);
                x.setStartYear(year - 3 - e * 3);
                x.setEndYear(e == 0 ? null : year - 3);
                x.setSortOrder(e);
                experience.save(x);
            }
            made++;
        }
        return made;
    }

    private int addActivity(ConsultantProfile c) {
        List<OrgResume> mine = new ArrayList<>(resumes.findByOrgIdAndConsultantId(c.getOrgId(), c.getId()));
        mine.sort(java.util.Comparator.comparing(OrgResume::getId));
        Instant now = Instant.now();
        int made = 0;
        for (int i = 0; i < Math.min(TARGET, mine.size()); i++) {
            made += events(c, mine.get(i), CwsResumeActivity.VIEWED, VIEWS[i], i, now);
            made += events(c, mine.get(i), CwsResumeActivity.DOWNLOADED, DOWNLOADS[i], i + 1, now);
            made += events(c, mine.get(i), CwsResumeActivity.SHARED, SHARES[i], i + 2, now);
        }
        return made;
    }

    /** {@code n} events spread over the last 57 days (the first ones recent, later ones older than 30 days). */
    private int events(ConsultantProfile c, OrgResume r, String kind, int n, int shift, Instant now) {
        for (int j = 0; j < n; j++) {
            CwsResumeActivity a = new CwsResumeActivity();
            a.setOrgId(c.getOrgId());
            a.setConsultantId(c.getId());
            a.setResumeId(r.getId());
            a.setKind(kind);
            long hours = ((j * 5L + shift * 2L) % 57) * 24 + (j * 3L + shift) % 20 + 1;
            a.setOccurredAt(now.minus(Duration.ofHours(hours)));
            activity.save(a);
        }
        return n;
    }
}
