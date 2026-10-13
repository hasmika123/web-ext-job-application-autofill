package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsCertification;
import com.dossier.api.domain.ent.consultantws.CwsProfileDetail;
import com.dossier.api.domain.ent.consultantws.CwsProfilePref;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsCertificationRepository;
import com.dossier.api.repository.ent.consultantws.CwsProfileDetailRepository;
import com.dossier.api.repository.ent.consultantws.CwsProfilePrefRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.LocalDate;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo career-profile data (certifications, preferred roles / locations / employment types, work-authorization choice, career goals)
 * for the consultants who are real seats (Anika, Ben, Sam), so My Career Profile is not empty on a fresh demo database. Same org
 * slugs as the talent seed; idempotent: a consultant that already has a profile-detail row is skipped. Not called from the
 * bootstrap by this class; the integrator wires it after {@link ConsultantWsDemoSeeder}.
 */
@Service
public class ConsultantWsProfileDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsProfileDemoSeeder.class);

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final CwsCertificationRepository certs;
    private final CwsProfilePrefRepository prefs;
    private final CwsProfileDetailRepository details;
    private final OrgResumeRepository resumes;

    public ConsultantWsProfileDemoSeeder(
        OrganizationRepository orgs,
        ConsultantProfileRepository consultants,
        CwsCertificationRepository certs,
        CwsProfilePrefRepository prefs,
        CwsProfileDetailRepository details,
        OrgResumeRepository resumes
    ) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.certs = certs;
        this.prefs = prefs;
        this.details = details;
        this.resumes = resumes;
    }

    private record Cert(String name, String issuer, int year, int month) {}

    private static final List<Cert> CERTS = List.of(
        new Cert("AWS Certified Solutions Architect - Associate", "Amazon Web Services", 2023, 3),
        new Cert("Oracle Certified Professional, Java SE 11", "Oracle", 2021, 1),
        new Cert("Certified ScrumMaster (CSM)", "Scrum Alliance", 2020, 8)
    );
    private static final List<String> ROLES = List.of("Senior Java Developer", "Full Stack Developer", "Backend Developer", "Software Engineer");
    private static final List<String> LOCATIONS = List.of("Remote", "Austin, TX", "New York, NY");
    private static final List<String> TYPES = List.of("CONTRACT", "CONTRACT_TO_HIRE");

    /** @return how many consultants were seeded. */
    @Transactional
    public int seed() {
        int made = 0;
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            for (ConsultantProfile c : consultants.findByOrgId(org.getId())) {
                if (c.getMemberId() == null || details.findByOrgIdAndConsultantId(org.getId(), c.getId()).isPresent()) continue;
                Long o = org.getId();
                for (Cert x : CERTS) {
                    CwsCertification row = new CwsCertification();
                    row.setOrgId(o);
                    row.setConsultantId(c.getId());
                    row.setName(x.name());
                    row.setIssuer(x.issuer());
                    row.setIssuedOn(LocalDate.of(x.year(), x.month(), 1));
                    certs.save(row);
                }
                pref(o, c, ConsultantProfileService.ROLE, ROLES);
                pref(o, c, ConsultantProfileService.LOCATION, LOCATIONS);
                pref(o, c, ConsultantProfileService.EMPLOYMENT_TYPE, TYPES);
                CwsProfileDetail d = new CwsProfileDetail();
                d.setOrgId(o);
                d.setConsultantId(c.getId());
                d.setWorkAuthorization("AUTHORIZED_NO_SPONSORSHIP");
                d.setCareerGoals("Looking to take on challenging backend or full-stack development roles in a growth-oriented company where I can lead small teams and keep learning cloud-native architecture.");
                boolean hasResumeSummary = resumes.findByOrgIdAndConsultantId(o, c.getId()).stream().anyMatch(r -> r.getSummaryText() != null && !r.getSummaryText().isBlank());
                if (!hasResumeSummary) d.setSummaryText("Results-driven engineer with hands-on experience designing, building and maintaining scalable enterprise applications. Strong problem-solving skills with a focus on delivering high-quality solutions in fast-paced environments.");
                details.save(d);
                c.setHasCertifications(true);
                c.setHasPreferences(true);
                consultants.save(c);
                made++;
            }
        }
        if (made > 0) LOG.info("Consultant workspace demo career profiles seeded: {}", made);
        return made;
    }

    private void pref(Long org, ConsultantProfile c, String kind, List<String> values) {
        int i = 0;
        for (String v : values) {
            CwsProfilePref row = new CwsProfilePref();
            row.setOrgId(org);
            row.setConsultantId(c.getId());
            row.setKind(kind);
            row.setValue(v);
            row.setSortOrder(i++);
            prefs.save(row);
        }
    }
}
