package com.dossier.api.service.ent.mkt.followups;

import com.dossier.api.domain.ent.mkt.MktFollowup;
import com.dossier.api.domain.ent.mkt.MktFollowupEvent;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.ent.mkt.MktConsultantLookupRepository;
import com.dossier.api.repository.ent.mkt.MktFollowupEventRepository;
import com.dossier.api.repository.ent.mkt.MktFollowupRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
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
 * Demo follow-ups for the Marketing workspace (Follow-ups board). For every marketer that has assignments it creates, from THAT marketer's consultants:
 * 12 due later today, 6 overdue, 14 upcoming, 18 completed today, 14 waiting on a reply, plus 24 completed over the last two weeks (so the Insights card has
 * a response time to show). Same switches as the other demo seeds ({@code DEMO_ENABLED} + {@code ENT_DEMO_SEED}, never prod) and it runs on
 * {@link ApplicationReadyEvent}, i.e. after {@link com.dossier.api.config.EnterpriseDemoBootstrap} has seeded the tenants and talent data, so no shared class is
 * edited. <b>Idempotent:</b> an organization that already has follow-ups is left alone. No PII: titles and notes are generic work items.
 */
@Component
public class MktFollowupsDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(MktFollowupsDemoSeeder.class);

    public static final int TODAY = 12;
    public static final int OVERDUE = 6;
    public static final int UPCOMING = 14;
    public static final int COMPLETED_TODAY = 18;
    public static final int WAITING = 14;
    public static final int COMPLETED_EARLIER = 24;

    private static final String[] TITLES = {
        "Interview feedback call", "Send candidate availability", "Confirm next interview", "Share updated resume", "Client debrief meeting", "Check reference status",
        "Send offer update", "Follow up on background check", "Client decision status", "Confirm start date", "Follow up on submitted profiles", "Schedule final interview",
        "Send engagement letter", "Follow up after client meeting", "Check consultant interest", "Share interview prep materials",
    };
    private static final String[] COUNTERPARTS = { "TechCorp", "Global Bank", "AWS", "HealthPlus", "CloudScale", "Deloitte", "FinTech Solutions", "RetailCo", "NextGen Tech", "ACME Internal" };
    private static final String[] CHANNELS = { "PHONE", "EMAIL", "PHONE", "EMAIL", "TEAMS" };
    private static final String[] PRIORITIES = { "HIGH", "MEDIUM", "MEDIUM", "LOW", "HIGH" };
    private static final String[] CALL_NOTES = { "Left a voicemail, will try again.", "Spoke with the recruiter; waiting on the client.", "Confirmed the time with the consultant.", "Client asked for one more day." };

    private final TalentDemoSeeder talent;
    private final OrganizationRepository orgs;
    private final MarketerAssignmentRepository assignments;
    private final ClientAccountRepository clients;
    private final MktConsultantLookupRepository consultants;
    private final MktFollowupRepository followups;
    private final MktFollowupEventRepository events;

    public MktFollowupsDemoSeeder(
        TalentDemoSeeder talent, OrganizationRepository orgs, MarketerAssignmentRepository assignments, ClientAccountRepository clients,
        MktConsultantLookupRepository consultants, MktFollowupRepository followups, MktFollowupEventRepository events
    ) {
        this.talent = talent;
        this.orgs = orgs;
        this.assignments = assignments;
        this.clients = clients;
        this.consultants = consultants;
        this.followups = followups;
        this.events = events;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        try {
            seed();
        } catch (RuntimeException e) {
            LOG.error("Follow-ups demo seed failed; the Follow-ups page has no demo data.", e);
        }
    }

    /** Seeds every demo tenant that has assignments and no follow-ups yet; returns the rows created per organization slug. */
    @Transactional
    public Map<String, Integer> seed() {
        Map<String, Integer> done = new LinkedHashMap<>();
        if (talent.refusal() != null) return done;
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null || followups.countByOrgId(org.getId()) > 0) continue; // not there yet, or already seeded
            int n = seedOrg(org.getId(), slug.hashCode());
            if (n > 0) {
                done.put(slug, n);
                LOG.info("Follow-ups demo seeded for {}: {} rows", slug, n);
            }
        }
        return done;
    }

    private int seedOrg(Long orgId, long seed) {
        Map<Long, List<Long>> byMarketer = new LinkedHashMap<>();
        for (MarketerAssignment a : assignments.findByOrgId(orgId)) byMarketer.computeIfAbsent(a.getMarketerMemberId(), k -> new ArrayList<>()).add(a.getConsultantId());
        if (byMarketer.isEmpty()) return 0;
        Map<String, ClientAccount> clientByName = new LinkedHashMap<>();
        for (ClientAccount c : clients.findByOrgId(orgId)) clientByName.put(c.getName(), c);
        Map<Long, String> detailOf = new LinkedHashMap<>();
        for (ConsultantProfile c : consultants.findByOrgIdAndIdIn(orgId, byMarketer.values().stream().flatMap(List::stream).distinct().toList())) {
            detailOf.put(c.getId(), c.getDisplayName() + (c.getJobTitle() == null ? "" : " - " + c.getJobTitle()));
        }
        Random rnd = new Random(seed ^ 0x46_4F_4C_4CL);
        Instant now = Instant.now();
        Instant start = MktFollowupService.startOfDay(now);
        Instant end = MktFollowupService.endOfDay(now);
        int total = 0;
        for (Map.Entry<Long, List<Long>> e : byMarketer.entrySet()) {
            Long marketer = e.getKey();
            List<Long> cons = e.getValue();
            List<MktFollowup> rows = new ArrayList<>();
            Map<MktFollowup, List<Object[]>> eventsOf = new LinkedHashMap<>();

            long remaining = Math.max(20, ChronoUnit.MINUTES.between(now, end) - 1);
            for (int i = 0; i < TODAY; i++) {
                Instant due = now.plus(Math.max(1, remaining * (i + 1) / (TODAY + 1)), ChronoUnit.MINUTES);
                String[] st = { "PENDING", "IN_PROGRESS", "SCHEDULED", "PENDING" };
                rows.add(row(orgId, marketer, cons, clientByName, rnd, i, due, st[i % st.length], due.minus(3 + rnd.nextInt(4), ChronoUnit.DAYS), null));
            }
            for (int i = 0; i < OVERDUE; i++) {
                Instant due = now.minus(2L + i * 14, ChronoUnit.MINUTES).minus(i / 2, ChronoUnit.DAYS).minus(40, ChronoUnit.MINUTES);
                rows.add(row(orgId, marketer, cons, clientByName, rnd, i + 3, due, i % 2 == 0 ? "PENDING" : "IN_PROGRESS", due.minus(5, ChronoUnit.DAYS), null));
            }
            for (int i = 0; i < UPCOMING; i++) {
                Instant due = end.plus(2 + rnd.nextInt(9), ChronoUnit.HOURS).plus(i / 3, ChronoUnit.DAYS);
                rows.add(row(orgId, marketer, cons, clientByName, rnd, i + 7, due, "NOT_STARTED", now.minus(2, ChronoUnit.DAYS), null));
            }
            long sinceMidnight = Math.max(2, ChronoUnit.MINUTES.between(start, now));
            for (int i = 0; i < COMPLETED_TODAY; i++) {
                Instant done = now.minus(1 + rnd.nextInt((int) Math.min(sinceMidnight, 1_000_000)), ChronoUnit.MINUTES);
                Instant due = done.minus(30 + rnd.nextInt(600), ChronoUnit.MINUTES);
                MktFollowup f = row(orgId, marketer, cons, clientByName, rnd, i + 11, due, "COMPLETED", due.minus(4, ChronoUnit.DAYS), done);
                rows.add(f);
                eventsOf.put(f, outbound(rnd, done, 6 + rnd.nextInt(60)));
            }
            for (int i = 0; i < WAITING; i++) {
                Instant changed = now.minus(1 + rnd.nextInt(6 * 24), ChronoUnit.HOURS);
                Instant due = now.plus(2 + rnd.nextInt(8), ChronoUnit.DAYS);
                MktFollowup f = row(orgId, marketer, cons, clientByName, rnd, i + 5, due, "WAITING", changed.minus(2, ChronoUnit.DAYS), null);
                f.setUpdatedAt(changed);
                rows.add(f);
                List<Object[]> ev = new ArrayList<>();
                ev.add(new Object[] { i % 2 == 0 ? MktFollowupEvent.CALL_LOGGED : MktFollowupEvent.REMINDER_SENT, i % 2 == 0 ? CALL_NOTES[i % CALL_NOTES.length] : "Reminder requested.", changed });
                eventsOf.put(f, ev);
            }
            for (int i = 0; i < COMPLETED_EARLIER; i++) {
                Instant done = start.minus(rnd.nextInt(13 * 24 * 60), ChronoUnit.MINUTES).minus(5, ChronoUnit.MINUTES);
                Instant due = done.minus(2 + rnd.nextInt(30), ChronoUnit.HOURS);
                MktFollowup f = row(orgId, marketer, cons, clientByName, rnd, i + 2, due, "COMPLETED", due.minus(5, ChronoUnit.DAYS), done);
                rows.add(f);
                eventsOf.put(f, outbound(rnd, done, 8 + rnd.nextInt(96)));
            }

            for (MktFollowup f : rows) f.setDetail(detailOf.get(f.getConsultantId()));
            for (MktFollowup row : rows) followups.save(row);
            List<MktFollowupEvent> evs = new ArrayList<>();
            eventsOf.forEach((f, list) -> {
                for (Object[] o : list) {
                    MktFollowupEvent ev = new MktFollowupEvent();
                    ev.setOrgId(orgId);
                    ev.setFollowupId(f.getId());
                    ev.setKind((String) o[0]);
                    ev.setNote((String) o[1]);
                    ev.setOccurredAt((Instant) o[2]);
                    ev.setByMemberId(marketer);
                    evs.add(ev);
                }
            });
            for (MktFollowupEvent ev : evs) events.save(ev);
            total += rows.size();
        }
        return total;
    }

    /** The reminder or call that went out hours before an item was completed (the "response time" of the Insights card). */
    private static List<Object[]> outbound(Random rnd, Instant done, int hoursBefore) {
        Instant at = done.minus(hoursBefore, ChronoUnit.HOURS);
        List<Object[]> ev = new ArrayList<>();
        if (rnd.nextInt(3) == 0) ev.add(new Object[] { MktFollowupEvent.CALL_LOGGED, CALL_NOTES[rnd.nextInt(CALL_NOTES.length)], at });
        else ev.add(new Object[] { MktFollowupEvent.REMINDER_SENT, "Reminder requested.", at });
        ev.add(new Object[] { MktFollowupEvent.STATUS_CHANGED, "IN_PROGRESS -> COMPLETED", done });
        return ev;
    }

    private static MktFollowup row(
        Long orgId, Long marketer, List<Long> cons, Map<String, ClientAccount> clientByName, Random rnd, int k, Instant due, String status, Instant created, Instant completedAt
    ) {
        MktFollowup f = new MktFollowup();
        f.setOrgId(orgId);
        f.setConsultantId(cons.get(rnd.nextInt(cons.size())));
        String counterpart = COUNTERPARTS[rnd.nextInt(COUNTERPARTS.length)];
        ClientAccount client = clientByName.get(counterpart);
        f.setClientAccountId(client == null ? null : client.getId());
        f.setCounterpartLabel(counterpart);
        f.setTitle(TITLES[(k * 5 + rnd.nextInt(3)) % TITLES.length]);
        f.setDetail(null);
        f.setChannel(CHANNELS[(k + rnd.nextInt(2)) % CHANNELS.length]);
        f.setPriority(PRIORITIES[rnd.nextInt(PRIORITIES.length)]);
        f.setStatus(status);
        f.setDueAt(due);
        f.setCompletedAt(completedAt);
        f.setOwnerMemberId(marketer);
        f.setCreatedAt(created);
        f.setUpdatedAt(completedAt != null ? completedAt : created.isAfter(Instant.now()) ? Instant.now() : created.plus(1, ChronoUnit.HOURS));
        return f;
    }
}
