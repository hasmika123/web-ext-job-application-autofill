package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPrepAnswer;
import com.dossier.api.domain.ent.consultantws.CwsPrepCheck;
import com.dossier.api.domain.ent.consultantws.CwsPrepSession;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsPrepAnswerRepository;
import com.dossier.api.repository.ent.consultantws.CwsPrepCheckRepository;
import com.dossier.api.repository.ent.consultantws.CwsPrepSessionRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.consultantws.InterviewPrepCatalog.ModuleDef;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo practice history and two ticked checklist items for the consultants who are real seats (Anika, Ben, Sam). All rows are in the
 * consultant's own tables (cws_prep_*), so nothing here is another role's data. Idempotent: a consultant who already has any session or
 * ticked item is skipped (guard on this page's own tables only).
 */
@Service
public class ConsultantWsInterviewPrepDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsInterviewPrepDemoSeeder.class);

    private record Spec(String title, String kind, String module, int daysAgo, int minutes, int[] scores, String notes) {}

    private static final List<Spec> SPECS = List.of(
        new Spec("Senior Java Developer - Tech Questions", CwsPrepSession.TECHNICAL, InterviewPrepCatalog.TECHNICAL, 2, 45, new int[] { 90, 85, 80, 90, 80 }, "Strong on service design; revisit the monolith versus microservices trade-offs."),
        new Spec("Behavioral Interview Practice", CwsPrepSession.BEHAVIORAL, InterviewPrepCatalog.BEHAVIORAL, 4, 30, new int[] { 70, 75, 70, 80, 65 }, "Use a clearer Result line in each STAR answer."),
        new Spec("ACME Company Research Review", CwsPrepSession.COMPANY, InterviewPrepCatalog.COMPANY, 6, 25, new int[] {}, null),
        new Spec("System Design Fundamentals", CwsPrepSession.TECHNICAL, InterviewPrepCatalog.TECHNICAL, 8, 40, new int[] { 80, 70, 75, 75, 75 }, null),
        new Spec("Question bank warm-up", CwsPrepSession.QUESTION_BANK, InterviewPrepCatalog.QUESTION_BANK, 45, 20, new int[] { 60, 65, 55, 70, 60 }, null),
        new Spec("Behavioral basics", CwsPrepSession.BEHAVIORAL, InterviewPrepCatalog.BEHAVIORAL, 50, 25, new int[] { 55, 60, 65, 60, 60 }, null)
    );

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final CwsPrepSessionRepository sessions;
    private final CwsPrepAnswerRepository answers;
    private final CwsPrepCheckRepository checks;

    public ConsultantWsInterviewPrepDemoSeeder(
        OrganizationRepository orgs, ConsultantProfileRepository consultants, CwsPrepSessionRepository sessions, CwsPrepAnswerRepository answers, CwsPrepCheckRepository checks
    ) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.sessions = sessions;
        this.answers = answers;
        this.checks = checks;
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
                if (!sessions.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(org.getId(), c.getId()).isEmpty() || !checks.findByOrgIdAndConsultantId(org.getId(), c.getId()).isEmpty()) continue;
                for (Spec spec : SPECS) {
                    CwsPrepSession s = new CwsPrepSession();
                    s.setOrgId(org.getId());
                    s.setConsultantId(c.getId());
                    s.setTitle(spec.title());
                    s.setKind(spec.kind());
                    s.setDurationMinutes(spec.minutes());
                    s.setNotes(spec.notes());
                    s.setOccurredAt(now.minus(Duration.ofDays(spec.daysAgo())).minus(Duration.ofHours(spec.daysAgo() % 5)));
                    s.setCreatedAt(s.getOccurredAt());
                    int[] sc = spec.scores();
                    s.setScore(sc.length == 0 ? 90 : (int) Math.round(java.util.Arrays.stream(sc).average().orElse(0)));
                    s = sessions.save(s);
                    made++;
                    ModuleDef m = InterviewPrepCatalog.module(spec.module()).orElseThrow();
                    for (int i = 0; i < sc.length && i < m.questions().size(); i++) {
                        CwsPrepAnswer a = new CwsPrepAnswer();
                        a.setOrgId(org.getId());
                        a.setSessionId(s.getId());
                        a.setPosition(i + 1);
                        a.setQuestion(m.questions().get(i).text());
                        a.setScore(sc[i]);
                        answers.save(a);
                    }
                }
                for (String key : List.of("review-jd", "research-company")) {
                    CwsPrepCheck ch = new CwsPrepCheck();
                    ch.setOrgId(org.getId());
                    ch.setConsultantId(c.getId());
                    ch.setItemKey(key);
                    ch.setCheckedAt(now.minus(Duration.ofDays(1)));
                    checks.save(ch);
                    made++;
                }
            }
        }
        if (made > 0) LOG.info("Consultant workspace Interview Prep demo rows seeded: {}", made);
        return made;
    }
}
