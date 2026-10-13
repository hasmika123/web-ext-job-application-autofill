package com.dossier.api.service.ent.interviews;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.ent.talent.TalentInterviewEvent;
import com.dossier.api.domain.ent.talent.TalentInterviewFeedback;
import com.dossier.api.domain.ent.talent.TalentInterviewInterviewer;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientContactRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewEventRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewFeedbackRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewInterviewerRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Demo data only (same switches as the talent demo seed, never under the prod profile): after the demo tenants and their talent rows exist,
 * gives each seeded interview the details the Interviews board shows (round number, mode, meeting link or location, interviewers, notes,
 * next step, a recorded history and some feedback) and records the most recent finished interviews as "In Progress" (held, feedback still
 * to complete). Idempotent: an interview that already has a history is left alone. Runs after every startup runner, so the talent seed has
 * finished. A failure is logged and never stops the API.
 */
@Component
public class InterviewDemoEnricher {

    private static final Logger LOG = LoggerFactory.getLogger(InterviewDemoEnricher.class);

    private static final String[] NOTES = {
        "Focus on React, TypeScript and system design. Candidate has a strong portfolio; assess problem solving and communication.",
        "Walk through the architecture of a recent project and how it was tested.",
        "Cover stakeholder management and how scope changes were handled.",
        "Explore hands-on experience with the cloud stack listed in the job description.",
        "Behavioural round: ownership, conflict handling and mentoring.",
        "Short screen: availability, rate expectations in range and notice period."
    };
    private static final String[] FEEDBACK = {
        "Clear communicator, solid fundamentals. Would move forward.",
        "Good depth on the core stack; a little light on system design.",
        "Strong portfolio and calm under questions. Team liked the examples.",
        "Needs more hands-on experience with the stated tools.",
        "Excellent culture fit and well prepared."
    };
    private static final String[] EXTRA_NAMES = { "Priya Raman", "Noah Whitfield", "Elena Sorensen", "Marcus Bell", "Hiro Tanaka", "Laila Mansour" };
    private static final String[] EXTRA_TITLES = { "Engineering Manager", "Design Lead", "Product Director", "Head of Talent", "Staff Engineer", "Delivery Lead" };
    private static final String[] PLACES = { "Main lobby", "Floor 3", "Room 4B", "Floor 12", "Conference room A" };
    private static final String[] SCHEDULED_STEPS = { "Send prep materials", "Send calendar invite", "Confirm interviewers" };

    private final TalentDemoSeeder talent;
    private final OrganizationRepository orgs;
    private final TalentInterviewRepository interviews;
    private final TalentInterviewInterviewerRepository interviewers;
    private final TalentInterviewEventRepository events;
    private final TalentInterviewFeedbackRepository feedback;
    private final TalentApplicationRepository applications;
    private final ClientAccountRepository clients;
    private final ClientContactRepository contacts;
    private final EntityManager em;
    private final TransactionTemplate tx;

    public InterviewDemoEnricher(
        TalentDemoSeeder talent,
        OrganizationRepository orgs,
        TalentInterviewRepository interviews,
        TalentInterviewInterviewerRepository interviewers,
        TalentInterviewEventRepository events,
        TalentInterviewFeedbackRepository feedback,
        TalentApplicationRepository applications,
        ClientAccountRepository clients,
        ClientContactRepository contacts,
        EntityManager em,
        TransactionTemplate tx
    ) {
        this.talent = talent;
        this.orgs = orgs;
        this.interviews = interviews;
        this.interviewers = interviewers;
        this.events = events;
        this.feedback = feedback;
        this.applications = applications;
        this.clients = clients;
        this.contacts = contacts;
        this.em = em;
        this.tx = tx;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        try {
            if (talent.refusal() != null) return;
            for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
                orgs.findBySlug(slug).ifPresent(org -> {
                    Integer n = tx.execute(status -> enrich(org.getId()));
                    if (n != null && n > 0) LOG.info("Interview demo data: {} interviews of {} enriched", n, slug);
                });
            }
        } catch (RuntimeException e) {
            LOG.error("Interview demo enrichment failed; the Interviews page shows the plain seeded interviews.", e);
        }
    }

    /** Enriches the interviews of one organization that have no history yet; returns how many. */
    public int enrich(Long orgId) {
        // an interview cannot have been created in the future (the foundation's seed backdates by days from the interview, which for an upcoming one lands ahead of now)
        Instant stamp = Instant.now();
        em.createQuery("update TalentInterview i set i.createdAt = :now, i.updatedAt = i.updatedAt where i.orgId = :o and i.createdAt > :now").setParameter("now", stamp).setParameter("o", orgId).executeUpdate();
        em.createQuery("update TalentInterviewEvent e set e.occurredAt = :now where e.orgId = :o and e.eventType = 'CREATED' and e.occurredAt > :now").setParameter("now", stamp).setParameter("o", orgId).executeUpdate();
        em.clear();
        List<TalentInterview> all = interviews.findByOrgId(orgId);
        if (all.isEmpty()) return 0;
        Map<Long, TalentApplication> apps = new HashMap<>();
        for (TalentApplication a : applications.findByOrgId(orgId)) apps.put(a.getId(), a);
        Map<Long, ClientAccount> clientById = new HashMap<>();
        for (ClientAccount c : clients.findByOrgId(orgId)) clientById.put(c.getId(), c);
        Map<Long, List<ClientContact>> contactsOf = new HashMap<>();
        for (ClientContact c : contacts.findByOrgId(orgId)) contactsOf.computeIfAbsent(c.getClientId(), k -> new ArrayList<>()).add(c);

        Map<Long, List<TalentInterview>> byApp = new HashMap<>();
        for (TalentInterview i : all) if (i.getApplicationId() != null) byApp.computeIfAbsent(i.getApplicationId(), k -> new ArrayList<>()).add(i);
        for (List<TalentInterview> l : byApp.values()) l.sort(Comparator.comparing(TalentInterview::getScheduledAt).thenComparing(TalentInterview::getId));

        Instant now = Instant.now();
        int done = 0;
        for (TalentInterview i : all) {
            if (events.existsByOrgIdAndInterviewId(orgId, i.getId())) continue;
            Random rnd = new Random(orgId * 7919L + i.getId());
            TalentApplication app = i.getApplicationId() == null ? null : apps.get(i.getApplicationId());
            Long actor = app == null ? null : app.getMarketerMemberId();
            ClientAccount client = clientById.get(i.getClientId());
            Duration length = Duration.ofMinutes(i.getDurationMinutes() == null ? 45 : i.getDurationMinutes());

            int roundNo = app == null ? 1 : byApp.get(app.getId()).indexOf(i) + 1;
            double m = rnd.nextDouble();
            String mode = m < 0.68 ? "VIDEO" : m < 0.93 ? "ONSITE" : "PHONE";
            String link = "VIDEO".equals(mode) ? "https://meet.example.com/interview/" + (1000 + i.getId()) : null;
            String location = "ONSITE".equals(mode) ? (client == null ? "Client office" : client.getName() + " office") + ", " + PLACES[rnd.nextInt(PLACES.length)] : null;

            String status = i.getStatus();
            boolean recent = InterviewStatuses.COMPLETED.equals(status) && i.getScheduledAt().isAfter(now.minus(Duration.ofDays(8)));
            if (recent && rnd.nextDouble() < 0.7) status = InterviewStatuses.IN_PROGRESS;

            String note = rnd.nextDouble() < 0.55 ? NOTES[rnd.nextInt(NOTES.length)] : null;
            boolean fb = InterviewStatuses.COMPLETED.equals(status) && rnd.nextDouble() < 0.65;
            String nextStep = switch (status) {
                case InterviewStatuses.SCHEDULED -> SCHEDULED_STEPS[rnd.nextInt(SCHEDULED_STEPS.length)];
                case InterviewStatuses.IN_PROGRESS -> "Complete feedback";
                case InterviewStatuses.COMPLETED -> fb ? (rnd.nextBoolean() ? "Share results" : "Send offer package") : null;
                default -> "Reschedule";
            };

            em.createQuery(
                "update TalentInterview i set i.roundNo = :rn, i.mode = :mode, i.meetingLink = :link, i.location = :loc, i.notes = :notes, i.nextStep = :next, i.status = :st, i.updatedAt = :upd where i.orgId = :o and i.id = :id"
            ).setParameter("rn", roundNo).setParameter("mode", mode).setParameter("link", link).setParameter("loc", location).setParameter("notes", note).setParameter("next", nextStep)
                .setParameter("st", status).setParameter("upd", InterviewStatuses.SCHEDULED.equals(status) ? i.getUpdatedAt() : i.getScheduledAt().plus(length)).setParameter("o", orgId).setParameter("id", i.getId()).executeUpdate();

            writeInterviewers(orgId, i, contactsOf.getOrDefault(i.getClientId(), List.of()), rnd);
            event(orgId, i.getId(), "CREATED", null, InterviewStatuses.SCHEDULED, actor, "Scheduled", i.getCreatedAt());
            switch (status) {
                case InterviewStatuses.COMPLETED -> event(orgId, i.getId(), "STATUS", InterviewStatuses.SCHEDULED, InterviewStatuses.COMPLETED, actor, null, i.getScheduledAt().plus(length));
                case InterviewStatuses.IN_PROGRESS -> event(orgId, i.getId(), "STATUS", InterviewStatuses.SCHEDULED, InterviewStatuses.IN_PROGRESS, actor, null, i.getScheduledAt());
                case InterviewStatuses.CANCELLED -> event(orgId, i.getId(), "STATUS", InterviewStatuses.SCHEDULED, InterviewStatuses.CANCELLED, actor, "Cancelled", i.getCreatedAt().plus(Duration.between(i.getCreatedAt(), i.getScheduledAt()).dividedBy(2)));
                default -> { }
            }
            if (fb) {
                Instant at = i.getScheduledAt().plus(length).plus(Duration.ofHours(1 + rnd.nextInt(20)));
                int rating = 3 + rnd.nextInt(3);
                String rec = rating >= 4 ? "ADVANCE" : rnd.nextBoolean() ? "HOLD" : "DECLINE";
                TalentInterviewFeedback f = new TalentInterviewFeedback();
                f.setOrgId(orgId);
                f.setInterviewId(i.getId());
                f.setAuthorMemberId(actor);
                f.setRating(rating);
                f.setRecommendation(rec);
                f.setNote(FEEDBACK[rnd.nextInt(FEEDBACK.length)]);
                f.setCreatedAt(at);
                feedback.save(f);
                event(orgId, i.getId(), "FEEDBACK", null, null, actor, "Feedback added: " + rating + " of 5, " + rec.toLowerCase(), at);
            }
            done++;
        }
        em.flush();
        return done;
    }

    private void writeInterviewers(Long orgId, TalentInterview i, List<ClientContact> contacts, Random rnd) {
        List<TalentInterviewInterviewer> people = new ArrayList<>();
        ClientContact primary = null;
        for (ClientContact c : contacts) if (c.getName().equals(i.getInterviewerName())) primary = c;
        if (primary == null && !contacts.isEmpty()) primary = contacts.get(0);
        if (primary != null) people.add(person(orgId, i.getId(), primary.getName(), primary.getTitle(), true, 0));
        for (ClientContact c : contacts) if (primary != null && !c.getId().equals(primary.getId()) && people.size() < 2) people.add(person(orgId, i.getId(), c.getName(), c.getTitle(), false, people.size()));
        if (rnd.nextDouble() < 0.4) {
            int k = rnd.nextInt(EXTRA_NAMES.length);
            people.add(person(orgId, i.getId(), EXTRA_NAMES[k], EXTRA_TITLES[k], false, people.size()));
        }
        interviewers.saveAll(people);
    }

    private static TalentInterviewInterviewer person(Long orgId, Long interviewId, String name, String title, boolean primary, int order) {
        TalentInterviewInterviewer v = new TalentInterviewInterviewer();
        v.setOrgId(orgId);
        v.setInterviewId(interviewId);
        v.setName(name);
        v.setTitle(title);
        v.setPrimary(primary);
        v.setSortOrder(order);
        return v;
    }

    private void event(Long orgId, Long interviewId, String type, String from, String to, Long actor, String detail, Instant at) {
        TalentInterviewEvent e = new TalentInterviewEvent();
        e.setOrgId(orgId);
        e.setInterviewId(interviewId);
        e.setEventType(type);
        e.setFromStatus(from);
        e.setToStatus(to);
        e.setActorMemberId(actor);
        e.setDetail(detail);
        e.setOccurredAt(at);
        events.save(e);
    }
}
