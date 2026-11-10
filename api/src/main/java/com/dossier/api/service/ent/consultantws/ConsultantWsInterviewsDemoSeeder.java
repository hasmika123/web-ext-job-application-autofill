package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsInterviewDetail;
import com.dossier.api.domain.ent.consultantws.CwsInterviewFeedback;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsInterviewDetailRepository;
import com.dossier.api.repository.ent.consultantws.CwsInterviewFeedbackRepository;
import com.dossier.api.repository.ent.consultantws.CwsInterviewRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo rows for the Interviews page for the consultants who are real seats (Anika, Ben, Sam): join details (mode, an example.org meeting link,
 * interviewer title, one prep note) on their upcoming interviews, up to three past COMPLETED interviews (a marketer would have booked those, so
 * they are demo data, topped up from the consultant's own applications only when they have fewer than three), and feedback on the two newest so
 * the page shows both "Recent Interview Feedback" and "Feedback Pending". Call it after {@link ConsultantWsDemoSeeder} (it books their upcoming
 * interviews). Idempotent: a consultant who already has any detail or feedback row is skipped.
 */
@Service
public class ConsultantWsInterviewsDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsInterviewsDemoSeeder.class);
    private static final String[] INTERVIEWERS = { "Jordan Lee", "Priya Nair", "Marcus Hale" };
    private static final String[] TITLES = { "Engineering Manager", "Director of Engineering", "Senior Data Engineer" };
    private static final String[] ROUNDS = { "Technical Interview", "Hiring Manager Chat", "Phone Screen" };

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final CwsInterviewRepository interviews;
    private final TalentApplicationRepository applications;
    private final CwsInterviewDetailRepository details;
    private final CwsInterviewFeedbackRepository feedback;

    public ConsultantWsInterviewsDemoSeeder(
        OrganizationRepository orgs, ConsultantProfileRepository consultants, CwsInterviewRepository interviews, TalentApplicationRepository applications,
        CwsInterviewDetailRepository details, CwsInterviewFeedbackRepository feedback
    ) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.interviews = interviews;
        this.applications = applications;
        this.details = details;
        this.feedback = feedback;
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
                if (!details.findByOrgIdAndConsultantId(org.getId(), c.getId()).isEmpty() || !feedback.findByOrgIdAndConsultantId(org.getId(), c.getId()).isEmpty()) continue;

                List<TalentInterview> mine = interviews.findByOrgIdAndConsultantIdOrderByScheduledAtAsc(org.getId(), c.getId());
                List<TalentApplication> apps = applications.findByOrgIdAndConsultantId(org.getId(), c.getId());
                long completed = mine.stream().filter(i -> "COMPLETED".equals(i.getStatus())).count();
                for (int k = (int) completed; k < 3 && k < apps.size(); k++) {
                    TalentApplication a = apps.get(k);
                    TalentInterview iv = new TalentInterview();
                    iv.setOrgId(org.getId());
                    iv.setApplicationId(a.getId());
                    iv.setConsultantId(c.getId());
                    iv.setClientId(a.getClientId());
                    iv.setScheduledAt(now.minus(Duration.ofDays(4L + 7L * k)).minus(Duration.ofHours(2L * k)));
                    iv.setDurationMinutes(45);
                    iv.setStatus("COMPLETED");
                    iv.setRoundLabel(ROUNDS[k % ROUNDS.length]);
                    iv.setInterviewerName(INTERVIEWERS[k % INTERVIEWERS.length]);
                    iv.setCreatedAt(iv.getScheduledAt().minus(Duration.ofDays(3)));
                    iv.setUpdatedAt(iv.getScheduledAt());
                    interviews.save(iv);
                    made++;
                }

                List<TalentInterview> all = interviews.findByOrgIdAndConsultantIdOrderByScheduledAtAsc(org.getId(), c.getId());
                int n = 0;
                for (TalentInterview iv : all) {
                    if (!"SCHEDULED".equals(iv.getStatus()) || !iv.getScheduledAt().isAfter(now)) continue;
                    CwsInterviewDetail d = new CwsInterviewDetail();
                    d.setOrgId(org.getId());
                    d.setInterviewId(iv.getId());
                    d.setConsultantId(c.getId());
                    boolean onsite = n % 3 == 2;
                    d.setMode(onsite ? "ONSITE" : "VIDEO");
                    if (!onsite) d.setMeetingUrl("https://meet.example.org/demo/interview-" + iv.getId());
                    d.setInterviewerTitle(TITLES[n % TITLES.length]);
                    if (n == 0) d.setPrepNote("Review the role requirements and prepare two project stories.");
                    details.save(d);
                    made++;
                    n++;
                }

                List<TalentInterview> done = all.stream().filter(i -> "COMPLETED".equals(i.getStatus())).sorted(Comparator.comparing(TalentInterview::getScheduledAt).reversed()).toList();
                for (int k = 0; k < done.size() && k < 2; k++) {
                    CwsInterviewFeedback f = new CwsInterviewFeedback();
                    f.setOrgId(org.getId());
                    f.setInterviewId(done.get(k).getId());
                    f.setConsultantId(c.getId());
                    f.setOutcome(k == 0 ? "POSITIVE" : "NEUTRAL");
                    f.setSummary(k == 0 ? "Strong technical discussion and good problem-solving. They would like a next round." : "Went fine overall, but they wanted deeper experience in one area. Keep me in mind for future roles.");
                    f.setCreatedAt(done.get(k).getScheduledAt().plus(Duration.ofDays(1)));
                    f.setUpdatedAt(f.getCreatedAt());
                    feedback.save(f);
                    made++;
                }
            }
        }
        if (made > 0) LOG.info("Consultant workspace Interviews demo rows seeded: {}", made);
        return made;
    }
}
