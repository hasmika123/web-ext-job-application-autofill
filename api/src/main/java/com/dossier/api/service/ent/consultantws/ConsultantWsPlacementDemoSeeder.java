package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPlacementActivity;
import com.dossier.api.domain.ent.consultantws.CwsPlacementChecklist;
import com.dossier.api.domain.ent.consultantws.CwsPlacementDetail;
import com.dossier.api.domain.ent.consultantws.CwsPlacementMeeting;
import com.dossier.api.domain.ent.consultantws.CwsPlacementMilestone;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsPlacementActivityRepository;
import com.dossier.api.repository.ent.consultantws.CwsPlacementChecklistRepository;
import com.dossier.api.repository.ent.consultantws.CwsPlacementDetailRepository;
import com.dossier.api.repository.ent.consultantws.CwsPlacementMeetingRepository;
import com.dossier.api.repository.ent.consultantws.CwsPlacementMilestoneRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo STAND-IN rows for the My Placement page, for the consultants who are real seats (Anika, Ben, Sam) and have an ACTIVE placement row (the talent
 * demo seeder wrote those). In the product the employer, ops and marketer sides author the end client, project, manager, schedule, engagement status,
 * onboarding checklist, milestones, meetings and activity; none of those roles is built in this branch, so these rows play that part and every one is
 * flagged {@code sample_data = true}. Dates are relative to the placement's own start date and to now. No rate, email or phone is written. Call it after
 * the talent demo data exists. Idempotent: a placement that already has a detail row is skipped, and it only ever writes its own tables.
 */
@Service
public class ConsultantWsPlacementDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsPlacementDemoSeeder.class);

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final TalentPlacementRepository placements;
    private final ClientAccountRepository clients;
    private final CwsPlacementDetailRepository details;
    private final CwsPlacementChecklistRepository checklist;
    private final CwsPlacementMilestoneRepository milestones;
    private final CwsPlacementMeetingRepository meetings;
    private final CwsPlacementActivityRepository activity;

    public ConsultantWsPlacementDemoSeeder(
        OrganizationRepository orgs, ConsultantProfileRepository consultants, TalentPlacementRepository placements, ClientAccountRepository clients,
        CwsPlacementDetailRepository details, CwsPlacementChecklistRepository checklist, CwsPlacementMilestoneRepository milestones,
        CwsPlacementMeetingRepository meetings, CwsPlacementActivityRepository activity
    ) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.placements = placements;
        this.clients = clients;
        this.details = details;
        this.checklist = checklist;
        this.milestones = milestones;
        this.meetings = meetings;
        this.activity = activity;
    }

    @Transactional
    public int seed() {
        int made = 0;
        Instant now = Instant.now();
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            for (ConsultantProfile c : consultants.findByOrgId(org.getId())) {
                if (c.getMemberId() == null) continue;
                TalentPlacement p = placements.findByOrgIdAndConsultantId(org.getId(), c.getId()).stream().filter(x -> "ACTIVE".equals(x.getStatus()))
                    .max(Comparator.comparing(TalentPlacement::getStartDate).thenComparing(TalentPlacement::getId)).orElse(null);
                if (p == null || details.countByOrgIdAndPlacementId(org.getId(), p.getId()) > 0) continue;
                String clientName = clients.findByOrgIdAndId(org.getId(), p.getClientId()).map(x -> x.getName()).orElse("the client");
                seedOne(org.getId(), p, clientName, now, today);
                made++;
            }
        }
        if (made > 0) LOG.info("Consultant workspace Placement demo placements seeded: {}", made);
        return made;
    }

    private void seedOne(Long org, TalentPlacement p, String clientName, Instant now, LocalDate today) {
        LocalDate start = p.getStartDate();
        CwsPlacementDetail d = new CwsPlacementDetail();
        d.setOrgId(org);
        d.setPlacementId(p.getId());
        d.setEndClientName(clientName + " (end client)");
        d.setProjectName("Digital Platform Programme");
        d.setManagerName("Alex Morgan");
        d.setManagerTitle("Engineering Manager");
        d.setLocationLabel("New York, NY (Hybrid)");
        d.setWorkMode("Hybrid (2 days onsite)");
        d.setHoursPerWeek(40);
        d.setScheduleLabel("Mon - Fri, 9:00 AM - 5:00 PM ET");
        d.setEngagementStatus("ON_TRACK");
        d.setStatusNote("Performance is meeting expectations");
        d.setNextCheckIn(today.plusDays(5));
        d.setSampleData(true);
        details.save(d);

        String[] labels = { "Sign consultant agreement", "Complete client onboarding", "Set up client systems access", "Review project documentation", "Meet the client team", "Complete security training", "Confirm first month goals" };
        for (int i = 0; i < labels.length; i++) {
            CwsPlacementChecklist c = new CwsPlacementChecklist();
            c.setOrgId(org);
            c.setPlacementId(p.getId());
            c.setLabel(labels[i]);
            c.setSortNo(i);
            c.setSampleData(true);
            if (i < 5) c.setCompletedAt(now.minus(Duration.ofDays(Math.max(1, 12 - 2L * i))));
            else c.setDueOn(today.plusDays(i == 5 ? 4 : 8));
            checklist.save(c);
        }

        milestone(org, p, "Placement Start", "Engagement officially started", start, true);
        milestone(org, p, "First Month Review", "30-day check-in with manager", start.plusDays(30), !start.plusDays(30).isAfter(today));
        milestone(org, p, "Mid-Point Review", "Project progress review", start.plusDays(90), !start.plusDays(90).isAfter(today));
        milestone(org, p, "Project Delivery Phase", "Major deliverables target", start.plusDays(150), !start.plusDays(150).isAfter(today));
        if (p.getEndDate() != null) milestone(org, p, "Engagement End", "Current contract end date", p.getEndDate(), false);

        meeting(org, p, "Project Sync", now.plus(Duration.ofDays(2)).plus(Duration.ofHours(1)), 60, "Client Team", "https://meet.example.com/project-sync");
        meeting(org, p, "1:1 with Manager", now.plus(Duration.ofDays(7)), 30, "Alex Morgan", null);
        meeting(org, p, "Client Check-in", now.plus(Duration.ofDays(14)), 60, clientName, "https://meet.example.com/client-check-in");
        meeting(org, p, "First Month Review", now.plus(Duration.ofDays(21)), 60, "Alex Morgan", null);

        act(org, p, "MILESTONE", "Placement started at " + clientName, "System", start.atStartOfDay().toInstant(ZoneOffset.UTC).plus(Duration.ofHours(9)));
        act(org, p, "DOCUMENT", "Consultant agreement signed", "You", start.atStartOfDay().toInstant(ZoneOffset.UTC).plus(Duration.ofHours(16)));
        act(org, p, "UPDATE", "Client systems access confirmed", "Client IT", start.plusDays(3).atStartOfDay().toInstant(ZoneOffset.UTC).plus(Duration.ofHours(11)));
    }

    private void milestone(Long org, TalentPlacement p, String label, String description, LocalDate on, boolean done) {
        CwsPlacementMilestone m = new CwsPlacementMilestone();
        m.setOrgId(org);
        m.setPlacementId(p.getId());
        m.setLabel(label);
        m.setDescription(description);
        m.setOnDate(on);
        m.setCompleted(done);
        m.setSampleData(true);
        milestones.save(m);
    }

    private void meeting(Long org, TalentPlacement p, String label, Instant at, int minutes, String with, String url) {
        CwsPlacementMeeting m = new CwsPlacementMeeting();
        m.setOrgId(org);
        m.setPlacementId(p.getId());
        m.setLabel(label);
        m.setStartsAt(at);
        m.setDurationMinutes(minutes);
        m.setWithLabel(with);
        m.setJoinUrl(url);
        m.setSampleData(true);
        meetings.save(m);
    }

    private void act(Long org, TalentPlacement p, String type, String description, String actor, Instant at) {
        CwsPlacementActivity a = new CwsPlacementActivity();
        a.setOrgId(org);
        a.setPlacementId(p.getId());
        a.setActivityType(type);
        a.setDescription(description);
        a.setActorLabel(actor);
        a.setOccurredAt(at);
        a.setCreatedAt(at);
        a.setSampleData(true);
        activity.save(a);
    }
}
