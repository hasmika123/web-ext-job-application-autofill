package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo data for "My Marketer": gives the open applications of the consultants who are real seats (Anika, Ben, Sam) a next step and a
 * due date, so the Current Focus and Upcoming Follow-ups cards have rows. Writes no new tables. Idempotent: only applications that
 * have no next action yet are touched, and nothing is overwritten. Call it after {@link ConsultantWsDemoSeeder}.
 */
@Service
public class ConsultantWsMarketerDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsMarketerDemoSeeder.class);

    private record Step(String text, int dueInDays) {}

    private static final Step[] STEPS = {
        new Step("Share with client", 2),
        new Step("Client feedback", 5),
        new Step("Follow up with client", 8),
        new Step("Send updated resume", 9),
        new Step("Schedule intro call", 15),
    };

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final TalentApplicationRepository applications;

    public ConsultantWsMarketerDemoSeeder(OrganizationRepository orgs, ConsultantProfileRepository consultants, TalentApplicationRepository applications) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.applications = applications;
    }

    @Transactional
    public int seed() {
        int made = 0;
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            for (ConsultantProfile c : consultants.findByOrgId(org.getId())) {
                if (c.getMemberId() == null) continue;
                List<TalentApplication> open = applications.findByOrgIdAndConsultantId(org.getId(), c.getId()).stream()
                    .filter(a -> !"CLOSED".equals(a.getStage()) && (a.getNextAction() == null || a.getNextAction().isBlank()))
                    .sorted(Comparator.comparing(TalentApplication::getId))
                    .toList();
                for (int i = 0; i < open.size() && i < STEPS.length; i++) {
                    TalentApplication a = open.get(i);
                    a.setNextAction(STEPS[i].text());
                    a.setNextActionDue(today.plusDays(STEPS[i].dueInDays()));
                    applications.save(a);
                    made++;
                }
            }
        }
        if (made > 0) LOG.info("Consultant workspace marketer demo next steps seeded: {}", made);
        return made;
    }
}
