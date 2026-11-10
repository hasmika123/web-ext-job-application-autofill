package com.dossier.api.service.ent.mkt.submissions;

import com.dossier.api.domain.ent.mkt.MktSubmission;
import com.dossier.api.domain.ent.mkt.MktSubmissionEvent;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktSubmissionEventRepository;
import com.dossier.api.repository.ent.mkt.MktSubmissionRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Demo rows for the Marketing Submissions board, consistent with {@code talent_application}: one submission record per application that reached
 * SUBMITTED or later (its status follows the application's stage), plus a draft or an open approval request for each application that is still only
 * ASSIGNED, and a few packages an approver declined. Same switches as {@link TalentDemoSeeder} ({@code DEMO_ENABLED} + {@code ENT_DEMO_SEED}, never prod) and
 * only after it: it runs on {@link ApplicationReadyEvent}, which fires after {@code EnterpriseDemoBootstrap} has seeded the tenants and the talent data.
 *
 * <p>Idempotent: an organization that already has submission rows (or has no applications) is skipped. Dates come from the application, relative to now;
 * the random stream is seeded per application so every database gets the same story. No PII: names stay on the talent rows, nothing is stored here.
 */
@Component
public class MktSubmissionsDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(MktSubmissionsDemoSeeder.class);

    private final EnterpriseDemoSeeder base;
    private final OrganizationRepository orgs;
    private final TalentApplicationRepository applications;
    private final OrgResumeRepository resumes;
    private final MktSubmissionRepository submissions;
    private final MktSubmissionEventRepository events;
    private final TransactionTemplate tx;

    public MktSubmissionsDemoSeeder(
        EnterpriseDemoSeeder base, OrganizationRepository orgs, TalentApplicationRepository applications, OrgResumeRepository resumes,
        MktSubmissionRepository submissions, MktSubmissionEventRepository events, PlatformTransactionManager txManager
    ) {
        this.base = base;
        this.orgs = orgs;
        this.applications = applications;
        this.resumes = resumes;
        this.submissions = submissions;
        this.events = events;
        this.tx = new TransactionTemplate(txManager);
    }

    /** After every runner (so after the tenants and the talent demo data exist). A failure is logged and never stops the API. */
    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        try {
            if (base.refusal() != null) return;
            seed();
        } catch (RuntimeException e) {
            LOG.error("Submissions demo seed failed; the Submissions page has no demo data.", e);
        }
    }

    /** Seeds every demo organization that has applications and no submission rows; returns how many rows were created. */
    public int seed() {
        if (base.refusal() != null) return 0;
        Integer made = tx.execute(status -> {
            int n = 0;
            for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
                Organization org = orgs.findBySlug(slug).orElse(null);
                if (org == null || submissions.countByOrgId(org.getId()) > 0) continue;
                n += seedOrg(org.getId());
            }
            return n;
        });
        return made == null ? 0 : made;
    }

    private int seedOrg(Long orgId) {
        List<TalentApplication> apps = new ArrayList<>(applications.findByOrgId(orgId));
        apps.sort(Comparator.comparing(TalentApplication::getAppliedOn).thenComparing(TalentApplication::getId));
        Instant now = Instant.now();
        int year = LocalDate.ofInstant(now, ZoneOffset.UTC).getYear();
        int seq = 0;
        for (TalentApplication a : apps) {
            Random rnd = new Random(orgId * 1_000_003L + a.getId());
            seq++;
            String code = String.format(Locale.ROOT, "SUB-%d-%03d", year, seq);
            Plan p = plan(a, rnd, now);
            MktSubmission s = new MktSubmission();
            s.setOrgId(orgId);
            s.setCode(code);
            s.setConsultantId(a.getConsultantId());
            s.setRequirementId(a.getRequirementId());
            s.setClientId(a.getClientId());
            if (a.getResumeId() != null) {
                OrgResume r = resumes.findByOrgIdAndId(orgId, a.getResumeId()).orElse(null);
                if (r != null) {
                    s.setResumeId(r.getId());
                    s.setResumeVersion(r.getVersionNo());
                    s.setResumeMinor(rnd.nextInt(10));
                    s.setResumeUpdatedAt(r.getUpdatedAt() != null && r.getUpdatedAt().isBefore(p.createdAt) ? r.getUpdatedAt() : p.createdAt);
                }
            }
            s.setApprovalState(p.approval);
            s.setStatus(p.status);
            s.setSubmittedOn(p.submittedOn);
            s.setPreparedByMemberId(a.getMarketerMemberId());
            s.setCreatedAt(p.createdAt);
            s.setUpdatedAt(p.steps.isEmpty() ? p.createdAt : p.steps.get(p.steps.size() - 1).at);
            s = submissions.save(s);
            events.save(MktSubmissionEvent.of(orgId, s.getId(), MktSubmissionEvent.CREATED, null, null, "DRAFT", a.getMarketerMemberId(), null, p.createdAt));
            for (Step st : p.steps) {
                events.save(MktSubmissionEvent.of(orgId, s.getId(), st.kind, st.field, st.from, st.to, a.getMarketerMemberId(), null, st.at));
            }
        }
        LOG.info("Submissions demo seeded for org {}: {} records", orgId, seq);
        return seq;
    }

    private record Step(String kind, String field, String from, String to, Instant at) {}

    private static final class Plan {
        String approval = MktSubmission.DRAFT;
        String status = MktSubmission.DRAFT;
        Instant createdAt;
        Instant submittedOn;
        final List<Step> steps = new ArrayList<>();
    }

    /** What happened to the package behind one application, as an ordered, never-future list of recorded events. */
    private static Plan plan(TalentApplication a, Random rnd, Instant now) {
        Plan p = new Plan();
        Instant applied = a.getAppliedOn().atStartOfDay().toInstant(ZoneOffset.UTC).plus(Duration.ofHours(9 + rnd.nextInt(8)));
        Instant stage = a.getStageChangedAt() == null ? applied : a.getStageChangedAt();
        String s = a.getStage();
        if ("ASSIGNED".equals(s)) {
            p.createdAt = cap(applied, now, rnd);
            if (rnd.nextBoolean()) {
                p.approval = MktSubmission.AWAITING_APPROVAL;
                p.steps.add(new Step(MktSubmissionEvent.APPROVAL_REQUESTED, "APPROVAL", "DRAFT", "AWAITING_APPROVAL", cap(p.createdAt.plus(Duration.ofHours(3)), now, rnd)));
            }
            return p;
        }
        boolean declined = "CLOSED".equals(s) && "REJECTED".equals(a.getClosedReason()) && rnd.nextInt(4) == 0;
        Instant submitted = cap(applied, now, rnd);
        p.createdAt = submitted.minus(Duration.ofDays(2));
        Instant requested = p.createdAt.plus(Duration.ofHours(3));
        p.steps.add(new Step(MktSubmissionEvent.APPROVAL_REQUESTED, "APPROVAL", "DRAFT", "AWAITING_APPROVAL", requested));
        if (declined) {
            p.approval = MktSubmission.REJECTED;
            p.status = MktSubmission.REJECTED;
            p.steps.add(new Step(MktSubmissionEvent.APPROVAL_DECIDED, "APPROVAL", "AWAITING_APPROVAL", "REJECTED", p.createdAt.plus(Duration.ofDays(1))));
            return p;
        }
        p.approval = MktSubmission.APPROVED;
        p.steps.add(new Step(MktSubmissionEvent.APPROVAL_DECIDED, "APPROVAL", "AWAITING_APPROVAL", "APPROVED", p.createdAt.plus(Duration.ofDays(1))));
        p.submittedOn = submitted;
        p.status = MktSubmission.SUBMITTED;
        p.steps.add(new Step(MktSubmissionEvent.STATUS_RECORDED, "STATUS", "DRAFT", "SUBMITTED", submitted));
        String target = switch (s) {
            case "UNDER_REVIEW" -> MktSubmission.CLIENT_REVIEW;
            case "INTERVIEWING", "OFFER" -> MktSubmission.INTERVIEW_REQUESTED;
            case "CLOSED" -> switch (a.getClosedReason() == null ? "" : a.getClosedReason()) {
                case "HIRED" -> MktSubmission.INTERVIEW_REQUESTED;
                case "REJECTED" -> MktSubmission.REJECTED;
                case "NO_RESPONSE" -> MktSubmission.CLIENT_REVIEW;
                default -> MktSubmission.SUBMITTED;
            };
            default -> MktSubmission.SUBMITTED;
        };
        Instant last = stage.isAfter(submitted) ? cap(stage, now, rnd) : submitted.plus(Duration.ofHours(6));
        if (last.isAfter(now)) last = now.minus(Duration.ofMinutes(5 + rnd.nextInt(50)));
        if (!last.isAfter(submitted)) last = submitted.plusSeconds(60);
        Instant mid = submitted.plus(Duration.between(submitted, last).dividedBy(2));
        if (!target.equals(MktSubmission.SUBMITTED)) {
            if (target.equals(MktSubmission.INTERVIEW_REQUESTED)) {
                p.steps.add(new Step(MktSubmissionEvent.STATUS_RECORDED, "STATUS", "SUBMITTED", "CLIENT_REVIEW", mid));
                p.steps.add(new Step(MktSubmissionEvent.STATUS_RECORDED, "STATUS", "CLIENT_REVIEW", "INTERVIEW_REQUESTED", last));
            } else {
                p.steps.add(new Step(MktSubmissionEvent.STATUS_RECORDED, "STATUS", "SUBMITTED", target, last));
            }
            p.status = target;
        }
        return p;
    }

    /** Never in the future: a proposed time after now becomes a few hours before it. */
    private static Instant cap(Instant t, Instant now, Random rnd) {
        return t.isAfter(now) ? now.minus(Duration.ofMinutes(30 + rnd.nextInt(300))) : t;
    }
}
