package com.dossier.api.service.ent.mkt.interviews;

import com.dossier.api.domain.ent.mkt.MktInterviewEvent;
import com.dossier.api.domain.ent.mkt.MktInterviewFeedback;
import com.dossier.api.domain.ent.mkt.MktInterviewMeta;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktInterviewEventRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewFeedbackRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewMetaRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo rows for the Marketing Interviews page: fills {@code mkt_interview_meta} (type, recruiter, coordination status, feedback due,
 * reschedules) and some feedback + reschedule events for the interviews {@link com.dossier.api.service.ent.TalentDemoSeeder} already
 * wrote. Same switches as every demo seed ({@code DEMO_ENABLED} + {@code ENT_DEMO_SEED}, never under {@code prod}).
 *
 * <p>Hooked on {@link ApplicationReadyEvent}, which fires after every {@code ApplicationRunner} (so after
 * {@code EnterpriseDemoBootstrap} has created the tenants and the talent data) without editing that shared class.
 * <b>Idempotent:</b> an organization that already has meta rows is skipped. Deterministic per interview (no shared random stream).
 */
@Service
public class MktInterviewsDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(MktInterviewsDemoSeeder.class);

    private static final String[] RECRUITERS = { "Priya Sharma", "Emily Lawson", "David Kim", "Michael Park", "Jessica Davis", "Samantha Lee" };
    private static final String[] NOTES = {
        "Client liked the depth of the technical answers.", "Strong communication, asked good questions about the team.",
        "Client wants one more round before deciding.", "Good fit on skills; rate discussion is next.",
        "Consultant felt well prepared, client was running late.", "Client needs a stronger example of stakeholder management.",
    };

    private final EnterpriseDemoSeeder gate;
    private final OrganizationRepository organizations;
    private final MktInterviewRepository interviews;
    private final MktInterviewMetaRepository metas;
    private final MktInterviewFeedbackRepository feedback;
    private final MktInterviewEventRepository events;
    private final MarketerAssignmentRepository assignments;

    public MktInterviewsDemoSeeder(
        EnterpriseDemoSeeder gate, OrganizationRepository organizations, MktInterviewRepository interviews, MktInterviewMetaRepository metas,
        MktInterviewFeedbackRepository feedback, MktInterviewEventRepository events, MarketerAssignmentRepository assignments
    ) {
        this.gate = gate;
        this.organizations = organizations;
        this.interviews = interviews;
        this.metas = metas;
        this.feedback = feedback;
        this.events = events;
        this.assignments = assignments;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void onReady() {
        try {
            seed();
        } catch (RuntimeException e) {
            LOG.error("Interviews demo seed failed; the Interviews page has no demo meta.", e);
        }
    }

    /** Seeds every demo tenant that has interviews but no meta yet; returns the number of meta rows written. */
    public int seed() {
        if (gate.refusal() != null) return 0;
        int written = 0;
        for (EnterpriseDemoSeeder.Tenant t : EnterpriseDemoSeeder.TENANTS) {
            Organization org = organizations.findBySlug(t.slug()).orElse(null);
            if (org == null) continue;
            written += seedOrg(org.getId(), Instant.now());
        }
        return written;
    }

    /** One organization; package-visible so a test can drive it with a fixed clock. */
    int seedOrg(Long orgId, Instant now) {
        if (metas.countByOrgId(orgId) > 0) return 0; // idempotent
        List<TalentInterview> rows = interviews.findLiveFrom(orgId, Instant.EPOCH);
        if (rows.isEmpty()) return 0;
        Map<Long, Long> marketerOf = new HashMap<>();
        for (MarketerAssignment a : assignments.findByOrgId(orgId)) marketerOf.put(a.getConsultantId(), a.getMarketerMemberId());
        List<MktInterviewMeta> metaRows = new ArrayList<>();
        List<MktInterviewEvent> eventRows = new ArrayList<>();
        List<MktInterviewFeedback> feedbackRows = new ArrayList<>();
        for (TalentInterview i : rows) {
            Random rnd = new Random(orgId * 1_000_003L + i.getId());
            boolean past = !i.getScheduledAt().isAfter(now);
            MktInterviewMeta m = new MktInterviewMeta();
            m.setOrgId(orgId);
            m.setInterviewId(i.getId());
            m.setInterviewType(typeFor(i.getRoundLabel(), rnd));
            m.setRecruiterName(RECRUITERS[rnd.nextInt(RECRUITERS.length)]);
            m.setFeedbackDueAt(i.getScheduledAt().plus(Duration.ofMinutes(i.getDurationMinutes() == null ? 45 : i.getDurationMinutes())).plus(Duration.ofDays(1)));
            double d = rnd.nextDouble();
            if (past) {
                m.setCoordinationStatus(d < 0.92 ? "CONFIRMED" : "SCHEDULED");
                if (d > 0.9) { // a past slot that had been moved once
                    m.setRescheduleCount(1);
                    eventRows.add(event(orgId, i.getId(), MktInterviewEvent.RESCHEDULE_PROPOSED, i.getScheduledAt().minus(Duration.ofDays(3)), marketerOf.get(i.getConsultantId())));
                }
                boolean recent = i.getScheduledAt().isAfter(now.minus(Duration.ofDays(14)));
                boolean hasFeedback = "COMPLETED".equals(i.getStatus()) && rnd.nextDouble() < (recent ? 0.35 : 0.92);
                Long by = marketerOf.get(i.getConsultantId());
                if (hasFeedback && by != null) {
                    MktInterviewFeedback f = new MktInterviewFeedback();
                    f.setOrgId(orgId);
                    f.setInterviewId(i.getId());
                    f.setRecordedByMemberId(by);
                    f.setOutcome(rnd.nextDouble() < 0.7 ? "PASSED" : "REJECTED");
                    f.setNote(NOTES[rnd.nextInt(NOTES.length)]);
                    f.setCreatedAt(i.getScheduledAt().plus(Duration.ofHours(3 + rnd.nextInt(30))));
                    feedbackRows.add(f);
                }
            } else if (d < 0.55) {
                m.setCoordinationStatus("CONFIRMED");
            } else if (d < 0.78) {
                m.setCoordinationStatus("SCHEDULED");
            } else if (d < 0.9) {
                m.setCoordinationStatus("AWAITING_CONFIRMATION");
            } else {
                m.setCoordinationStatus("RESCHEDULED");
                m.setRescheduleCount(1);
                m.setProposedFor(i.getScheduledAt().plus(Duration.ofDays(1 + rnd.nextInt(2))));
                eventRows.add(event(orgId, i.getId(), MktInterviewEvent.RESCHEDULE_PROPOSED, now.minus(Duration.ofHours(6 + rnd.nextInt(24 * 6))), marketerOf.get(i.getConsultantId())));
            }
            metaRows.add(m);
        }
        for (var row : metaRows) metas.save(row);
        for (var row : feedbackRows) feedback.save(row);
        for (var row : eventRows) events.save(row);
        LOG.info("Interviews demo seeded for org {}: {} meta, {} feedback, {} events", orgId, metaRows.size(), feedbackRows.size(), eventRows.size());
        return metaRows.size();
    }

    private static MktInterviewEvent event(Long orgId, Long interviewId, String kind, Instant at, Long actor) {
        MktInterviewEvent e = new MktInterviewEvent();
        e.setOrgId(orgId);
        e.setInterviewId(interviewId);
        e.setKind(kind);
        e.setActorMemberId(actor);
        e.setOccurredAt(at);
        e.setDetail("demo");
        return e;
    }

    static String typeFor(String round, Random rnd) {
        String r = round == null ? "" : round.toLowerCase();
        if (r.contains("technical")) return "TECHNICAL";
        if (r.contains("client")) return rnd.nextBoolean() ? "CLIENT" : "ONSITE";
        if (r.contains("final")) return rnd.nextBoolean() ? "PANEL" : "ONSITE";
        return rnd.nextDouble() < 0.7 ? "VIDEO" : "PANEL";
    }
}
