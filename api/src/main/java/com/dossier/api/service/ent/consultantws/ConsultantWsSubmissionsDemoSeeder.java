package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsSubmission;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsSubmissionRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo STAND-IN rows for the Submissions and Approvals page, for the consultants who are real seats (Anika, Ben, Sam). In the product the
 * marketer creates a submission and the client side later reports back; neither role is built in this branch, so these rows play that part
 * and every one is flagged {@code sample_data = true} (the page shows a Sample mark on them). Per consultant: three submissions waiting for
 * approval (due in a few hours, in about a day, and later) and past ones in several statuses with client updates. Call it after
 * {@link ConsultantWsDemoSeeder} (it uses their matches, jobs and resumes). Idempotent: a consultant who already has any submission row is
 * skipped, and it never touches another table.
 */
@Service
public class ConsultantWsSubmissionsDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsSubmissionsDemoSeeder.class);

    private static final String[] PENDING_NOTES = {
        "Great match for the role. Please review and approve at your earliest convenience.",
        "The client is actively interviewing this week. Your approval will help us move forward quickly.",
        "Strong fit based on your experience. Let me know if you have any questions.",
    };

    private record Past(String status, int submittedDaysAgo, int decidedDaysAgo, String update, int updateDaysAgo, String note, String reason) {}

    private static final Past[] PAST = {
        new Past(CwsSubmission.SUBMITTED, 5, 6, "Under review", 3, "Submitted after your approval.", null),
        new Past(CwsSubmission.INTERVIEW, 12, 13, "Interview scheduled", 8, "The client asked to meet you.", null),
        new Past(CwsSubmission.NOT_SELECTED, 20, 21, "Position filled", 14, "Thanks for approving this one quickly.", null),
        new Past(CwsSubmission.APPROVED, 0, 1, null, 0, "Approved by you; your marketer will take it from here.", null),
        new Past(CwsSubmission.SUBMITTED, 33, 34, "Under review", 30, "Submitted after your approval.", null),
        new Past(CwsSubmission.DECLINED, 0, 25, null, 0, "Marketer suggested this role.", "The rate is below my minimum for this kind of role."),
    };

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final CwsSubmissionRepository submissions;
    private final RequirementMatchRepository matches;
    private final ClientRequirementRepository requirements;
    private final OrgResumeRepository resumes;
    private final MarketerAssignmentRepository assignments;

    public ConsultantWsSubmissionsDemoSeeder(
        OrganizationRepository orgs, ConsultantProfileRepository consultants, CwsSubmissionRepository submissions, RequirementMatchRepository matches,
        ClientRequirementRepository requirements, OrgResumeRepository resumes, MarketerAssignmentRepository assignments
    ) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.submissions = submissions;
        this.matches = matches;
        this.requirements = requirements;
        this.resumes = resumes;
        this.assignments = assignments;
    }

    @Transactional
    public int seed() {
        int made = 0;
        Instant now = Instant.now();
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            List<ClientRequirement> orgJobs = requirements.findByOrgId(org.getId());
            for (ConsultantProfile c : consultants.findByOrgId(org.getId())) {
                if (c.getMemberId() == null) continue;
                if (submissions.countByOrgIdAndConsultantId(org.getId(), c.getId()) > 0) continue;
                List<Long> jobs = jobsFor(org.getId(), c, orgJobs);
                Long marketer = assignments.findByOrgIdAndConsultantId(org.getId(), c.getId()).filter(a -> "ACTIVE".equals(a.getStatus())).map(MarketerAssignment::getMarketerMemberId).orElse(null);
                OrgResume resume = resumes.findByOrgIdAndConsultantId(org.getId(), c.getId()).stream().max(Comparator.comparing(r -> r.getVersionNo() == null ? 0 : r.getVersionNo())).orElse(null);
                int next = 0;
                long[] dueMinutes = { 180, 22 * 60, 4 * 24 * 60 };
                long[] createdDaysAgo = { 9, 3, 1 };
                for (int i = 0; i < 3 && next < jobs.size(); i++) {
                    CwsSubmission s = base(org.getId(), c.getId(), jobs.get(next++), resume, marketer);
                    s.setStatus(CwsSubmission.PENDING);
                    s.setMarketerNote(PENDING_NOTES[i]);
                    s.setDueAt(now.plus(Duration.ofMinutes(dueMinutes[i])));
                    s.setCreatedAt(now.minus(Duration.ofDays(createdDaysAgo[i])));
                    s.setUpdatedAt(s.getCreatedAt());
                    submissions.save(s);
                    made++;
                }
                for (Past p : PAST) {
                    if (next >= jobs.size()) break;
                    CwsSubmission s = base(org.getId(), c.getId(), jobs.get(next++), resume, marketer);
                    s.setStatus(p.status());
                    s.setMarketerNote(p.note());
                    s.setDecidedAt(now.minus(Duration.ofDays(p.decidedDaysAgo())));
                    s.setCreatedAt(s.getDecidedAt().minus(Duration.ofDays(2)));
                    s.setDeclineReason(p.reason());
                    if (p.update() != null || CwsSubmission.SUBMITTED.equals(p.status())) {
                        s.setSubmittedOn(now.minus(Duration.ofDays(p.submittedDaysAgo())).minus(Duration.ofHours(3)));
                    }
                    if (p.update() != null) {
                        s.setClientUpdate(p.update());
                        s.setClientUpdateAt(now.minus(Duration.ofDays(p.updateDaysAgo())));
                    }
                    s.setUpdatedAt(s.getDecidedAt());
                    submissions.save(s);
                    made++;
                }
            }
        }
        if (made > 0) LOG.info("Consultant workspace Submissions demo rows seeded: {}", made);
        return made;
    }

    /** The consultant's matched jobs (best score first), then the organization's other jobs, each once. */
    private List<Long> jobsFor(Long org, ConsultantProfile c, List<ClientRequirement> orgJobs) {
        Set<Long> ids = new LinkedHashSet<>();
        for (RequirementMatch m : matches.findByOrgIdAndConsultantIdOrderByScoreDesc(org, c.getId())) if (!"DISMISSED".equals(m.getStatus())) ids.add(m.getRequirementId());
        List<ClientRequirement> rest = new ArrayList<>(orgJobs);
        rest.sort(Comparator.comparing(ClientRequirement::getId));
        for (ClientRequirement r : rest) ids.add(r.getId());
        Set<Long> valid = new LinkedHashSet<>();
        orgJobs.forEach(r -> valid.add(r.getId()));
        return ids.stream().filter(valid::contains).toList();
    }

    private static CwsSubmission base(Long org, Long consultantId, Long requirementId, OrgResume resume, Long marketer) {
        CwsSubmission s = new CwsSubmission();
        s.setOrgId(org);
        s.setConsultantId(consultantId);
        s.setRequirementId(requirementId);
        s.setSampleData(true);
        s.setMarketerMemberId(marketer);
        if (resume != null) {
            s.setResumeId(resume.getId());
            s.setResumeVersionNo(resume.getVersionNo());
        }
        return s;
    }
}
