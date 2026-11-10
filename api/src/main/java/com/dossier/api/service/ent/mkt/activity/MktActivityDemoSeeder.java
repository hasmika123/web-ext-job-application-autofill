package com.dossier.api.service.ent.mkt.activity;

import com.dossier.api.domain.ent.mkt.MktActivity;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktActivityRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.mkt.activity.MktActivityTypes.Type;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo MANUAL activity rows for the Marketing Activities page ("Log Activity" entries). Only {@code mkt_activity} is seeded: every other line of the feed is
 * read from the records the other pages seed (resume, opportunity, submission, follow-up and interview events, applications, placements). For every marketer
 * that has assignments it creates, from THAT marketer's consultants, 10 completed entries over the last 20 days and 3 planned ones in the next days (they show
 * under "Upcoming Activities"). Same switches as the other demo seeds ({@code DEMO_ENABLED} + {@code ENT_DEMO_SEED}, never prod) and it runs on
 * {@link ApplicationReadyEvent}, i.e. after the tenants and talent data exist, so no shared class is edited. <b>Idempotent:</b> an organization that already has
 * rows is left alone. No PII: titles are generic work notes.
 */
@Component
public class MktActivityDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(MktActivityDemoSeeder.class);

    public static final int COMPLETED = 10;
    public static final int PLANNED = 3;

    private static final Type[] DONE_TYPES = {
        Type.RESUME_UPDATED, Type.OPPORTUNITY_ASSIGNED, Type.FOLLOWUP_LOGGED, Type.INTERVIEW_SCHEDULED, Type.FEEDBACK_RECEIVED, Type.SUBMISSION_PREPARED, Type.APPLICATION_MOVED,
        Type.OFFER_RECEIVED, Type.FOLLOWUP_LOGGED, Type.RESUME_UPDATED,
    };
    private static final String[] DONE_DETAIL = {
        "Updated work experience and skills", "Assigned to new opportunity", "Spoke with hiring manager", "Technical interview scheduled", "Positive feedback from client",
        "Draft ready for the consultant to review", "Moved to interview stage", "Received written offer from client", "Left a voicemail, will try again", "Refreshed the summary",
    };
    private static final Type[] PLANNED_TYPES = { Type.FOLLOWUP_LOGGED, Type.INTERVIEW_SCHEDULED, Type.RESUME_UPDATED };
    private static final String[] PLANNED_TITLE = { "Client follow-up call", "Prep call before the interview", "Send updated resume" };

    private final TalentDemoSeeder talent;
    private final OrganizationRepository orgs;
    private final MarketerAssignmentRepository assignments;
    private final ClientAccountRepository clients;
    private final MktActivityRepository activities;

    public MktActivityDemoSeeder(
        TalentDemoSeeder talent, OrganizationRepository orgs, MarketerAssignmentRepository assignments, ClientAccountRepository clients, MktActivityRepository activities
    ) {
        this.talent = talent;
        this.orgs = orgs;
        this.assignments = assignments;
        this.clients = clients;
        this.activities = activities;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        try {
            seed();
        } catch (RuntimeException e) {
            LOG.error("Activities demo seed failed; the Activities page has no manual demo rows.", e);
        }
    }

    /** Seeds every demo tenant that has assignments and no manual activities yet; returns the rows created per organization slug. */
    @Transactional
    public Map<String, Integer> seed() {
        Map<String, Integer> done = new LinkedHashMap<>();
        if (talent.refusal() != null) return done;
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null || activities.countByOrgId(org.getId()) > 0) continue; // not there yet, or already seeded
            int n = seedOrg(org.getId(), slug.hashCode());
            if (n > 0) {
                done.put(slug, n);
                LOG.info("Activities demo seeded for {}: {} rows", slug, n);
            }
        }
        return done;
    }

    private int seedOrg(Long orgId, long seed) {
        Map<Long, List<Long>> byMarketer = new LinkedHashMap<>();
        for (MarketerAssignment a : assignments.findByOrgId(orgId)) byMarketer.computeIfAbsent(a.getMarketerMemberId(), k -> new ArrayList<>()).add(a.getConsultantId());
        if (byMarketer.isEmpty()) return 0;
        List<ClientAccount> accounts = clients.findByOrgIdOrderByNameAsc(orgId);
        Random rnd = new Random(seed ^ 0x41_43_54_49L);
        Instant now = Instant.now();
        int total = 0;
        for (Map.Entry<Long, List<Long>> e : byMarketer.entrySet()) {
            Long marketer = e.getKey();
            List<Long> cons = e.getValue();
            for (int i = 0; i < COMPLETED; i++) {
                Instant at = now.minus(1 + rnd.nextInt(20 * 24), ChronoUnit.HOURS).minus(rnd.nextInt(60), ChronoUnit.MINUTES);
                activities.save(row(orgId, marketer, cons, accounts, rnd, DONE_TYPES[i], DONE_DETAIL[i], at, MktActivity.COMPLETED, now));
                total++;
            }
            for (int i = 0; i < PLANNED; i++) {
                Instant at = now.plus(2 + rnd.nextInt(24 * 4), ChronoUnit.HOURS);
                MktActivity a = row(orgId, marketer, cons, accounts, rnd, PLANNED_TYPES[i], null, at, MktActivity.SCHEDULED, now);
                a.setTitle(PLANNED_TITLE[i]);
                activities.save(a);
                total++;
            }
        }
        return total;
    }

    private static MktActivity row(Long orgId, Long marketer, List<Long> cons, List<ClientAccount> accounts, Random rnd, Type type, String detail, Instant at, String status, Instant now) {
        MktActivity a = new MktActivity();
        a.setOrgId(orgId);
        a.setConsultantId(cons.get(rnd.nextInt(cons.size())));
        a.setClientAccountId(accounts.isEmpty() ? null : accounts.get(rnd.nextInt(accounts.size())).getId());
        a.setActivityType(type.name());
        a.setTitle(type.title);
        a.setDetail(detail);
        a.setTags(type.tag);
        a.setStatus(status);
        a.setOccurredAt(at);
        a.setActorMemberId(marketer);
        a.setCreatedAt(at.isAfter(now) ? now : at);
        return a;
    }
}
