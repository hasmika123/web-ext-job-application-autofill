package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.org.Organization;
import com.dossier.api.domain.ent.consultantws.CwsTask;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.repository.ent.consultantws.CwsTaskRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationEventRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import java.time.Duration;
import java.util.List;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo tasks for the consultants who are real seats (Anika, Ben), so the Consultant workspace Home has a Tasks card on a fresh demo
 * database. Same switches as the talent seed (it is called right after it); idempotent per consultant; never touches other rows.
 */
@Service
public class ConsultantWsDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsDemoSeeder.class);

    private record Spec(String title, int dueInDays, String priority, String status) {}

    private static final Spec[] TASKS = {
        new Spec("Complete interview preparation", 0, "HIGH", "IN_PROGRESS"),
        new Spec("Respond to marketer message", 0, "HIGH", "PENDING"),
        new Spec("Update resume with latest project", 2, "MEDIUM", "NOT_STARTED"),
        new Spec("Follow up on pending application", 3, "MEDIUM", "NOT_STARTED"),
        new Spec("Set availability for next month", 4, "LOW", "NOT_STARTED"),
    };

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final CwsTaskRepository tasks;

    private final RequirementMatchRepository matches;
    private final ClientRequirementRepository requirements;
    private final TalentApplicationRepository applications;
    private final TalentApplicationEventRepository events;
    private final TalentInterviewRepository interviews;

    public ConsultantWsDemoSeeder(
        OrganizationRepository orgs, ConsultantProfileRepository consultants, CwsTaskRepository tasks, RequirementMatchRepository matches,
        ClientRequirementRepository requirements, TalentApplicationRepository applications, TalentApplicationEventRepository events,
        TalentInterviewRepository interviews
    ) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.tasks = tasks;
        this.matches = matches;
        this.requirements = requirements;
        this.applications = applications;
        this.events = events;
        this.interviews = interviews;
    }

    private static final int[] SCORES = { 94, 92, 88, 85, 82, 78, 76, 74 };
    private static final String[] APP_STAGES = { "ASSIGNED", "SUBMITTED", "UNDER_REVIEW", "INTERVIEWING", "UNDER_REVIEW", "CLOSED" };

    /**
     * Gives a consultant who is a real seat a believable pipeline of their own (matches, three assigned jobs, applications at several
     * stages, three upcoming interviews) so the workspace is not empty on a fresh demo database. Only runs for a consultant with no
     * tasks yet (the same one-time guard), and skips any job that consultant is already matched to.
     */
    private void pipeline(ConsultantProfile c) {
        Long org = c.getOrgId();
        Instant now = Instant.now();
        List<ClientRequirement> jobs = requirements.findByOrgIdAndStatusOrderByPostedAtDesc(org, "OPEN");
        java.util.Set<Long> taken = new java.util.HashSet<>();
        matches.findByOrgIdAndConsultantIdOrderByScoreDesc(org, c.getId()).forEach(m -> taken.add(m.getRequirementId()));
        applications.findByOrgIdAndConsultantId(org, c.getId()).forEach(a -> taken.add(a.getRequirementId()));
        int i = 0;
        int appIdx = 0;
        List<TalentApplication> made = new java.util.ArrayList<>();
        for (ClientRequirement job : jobs) {
            if (i >= SCORES.length) break;
            if (taken.contains(job.getId())) continue;
            RequirementMatch m = new RequirementMatch();
            m.setOrgId(org);
            m.setRequirementId(job.getId());
            m.setConsultantId(c.getId());
            m.setScore(SCORES[i]);
            m.setReason("Skills and experience align with this role.");
            m.setCreatedAt(now.minus(Duration.ofDays(i < 4 ? 1 + i : 9 + i)));
            boolean assignedJob = i < 3;
            boolean applied = i >= 2 && appIdx < APP_STAGES.length;
            if (assignedJob || applied) {
                m.setStatus("ASSIGNED");
                m.setAssignedAt(now.minus(Duration.ofDays(2 + i)));
            }
            matches.save(m);
            if (applied) {
                TalentApplication a = new TalentApplication();
                a.setOrgId(org);
                a.setCode("APP-CWS-" + c.getId() + "-" + (appIdx + 1));
                a.setRequirementId(job.getId());
                a.setConsultantId(c.getId());
                a.setClientId(job.getClientId());
                a.setStage(APP_STAGES[appIdx]);
                if ("CLOSED".equals(a.getStage())) a.setClosedReason("REJECTED");
                a.setAppliedOn(LocalDate.now(ZoneOffset.UTC).minusDays(2L + appIdx * 2L));
                a.setSourceLabel("Marketer");
                a.setStageChangedAt(now.minus(Duration.ofDays(1L + appIdx)));
                a = applications.save(a);
                TalentApplicationEvent e = new TalentApplicationEvent();
                e.setOrgId(org);
                e.setApplicationId(a.getId());
                e.setEventType("CREATED");
                e.setToStage("ASSIGNED");
                e.setOccurredAt(now.minus(Duration.ofDays(3L + appIdx)));
                events.save(e);
                made.add(a);
                appIdx++;
            }
            i++;
        }
        // three upcoming interviews: the first on the INTERVIEWING application when there is one
        TalentApplication interviewing = made.stream().filter(a -> "INTERVIEWING".equals(a.getStage())).findFirst().orElse(null);
        int[] days = { 2, 4, 8 };
        String[] rounds = { "Technical round", "Hiring manager", "Client round" };
        for (int k = 0; k < 3 && !jobs.isEmpty(); k++) {
            TalentInterview iv = new TalentInterview();
            iv.setOrgId(org);
            iv.setConsultantId(c.getId());
            TalentApplication a = k == 0 ? interviewing : (made.size() > k ? made.get(k) : null);
            iv.setApplicationId(a == null ? null : a.getId());
            iv.setClientId(a != null ? a.getClientId() : jobs.get(0).getClientId());
            iv.setScheduledAt(now.plus(Duration.ofDays(days[k])).truncatedTo(java.time.temporal.ChronoUnit.HOURS).plus(Duration.ofHours(1)));
            iv.setDurationMinutes(60);
            iv.setRoundLabel(rounds[k]);
            iv.setInterviewerName(null);
            interviews.save(iv);
        }
    }

    @Transactional
    public int seed() {
        int made = 0;
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            for (ConsultantProfile c : consultants.findByOrgId(org.getId())) {
                if (c.getMemberId() == null || tasks.countByOrgIdAndConsultantId(org.getId(), c.getId()) > 0) continue;
                pipeline(c);
                for (Spec t : TASKS) {
                    CwsTask row = new CwsTask();
                    row.setOrgId(org.getId());
                    row.setConsultantId(c.getId());
                    row.setTitle(t.title());
                    row.setDueOn(today.plusDays(t.dueInDays()));
                    row.setPriority(t.priority());
                    row.setStatus(t.status());
                    row.setCreatedAt(Instant.now());
                    row.setUpdatedAt(Instant.now());
                    tasks.save(row);
                    made++;
                }
            }
        }
        if (made > 0) LOG.info("Consultant workspace demo tasks seeded: {}", made);
        return made;
    }
}
