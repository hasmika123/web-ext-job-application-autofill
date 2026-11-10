package com.dossier.api.service.ent.jobs;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.service.ent.pipeline.DuplicateGuard;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The ONE place that creates or reopens the {@code requirement_match} and {@code mkt_opportunity} of a (job, consultant) pair
 * (docs/enterprise-v2/60-job-phase1-contract.md section 2). Used by the Opportunities, Matches and Jobs assign paths and by
 * {@code from-extension}; E1 holds: it records that a marketer put a job in front of a consultant, it never applies for anyone.
 *
 * <p>Gates, in order: the consultant is inside the caller's scope (else the generic 404); the job and the consultant exist; the job is OPEN or
 * IN_REVIEW (409 {@code JOB_NOT_OPEN}); the consultant's {@code status} and {@code marketing_status} are ACTIVE (otherwise the result carries
 * reason {@code CONSULTANT_INACTIVE} and nothing is written); the consultant has an approved resume unless the job was captured by the extension
 * (409 {@code RESUME_NOT_APPROVED}: a captured job has no resume yet and is applied for by the consultant, so the gate would dead-end the flow).
 *
 * <p>Pair rules: no match yet = create it ASSIGNED; a SUGGESTED or DISMISSED match = assign it (DISMISSED is a reopen, event
 * {@code REASSIGNED}); a match that is already ASSIGNED whose opportunity is DECLINED or CLOSED = reopen it to ASSIGNED (event {@code REASSIGNED},
 * the same rows); anything else already assigned = {@code existing=true}, no error, no change. The unique keys make the create race-safe: the insert
 * runs in its own transaction and, on a lost race, the winner's row is re-read ({@link JobIdentityTx}).
 *
 * <p>Joins the caller's transaction. {@code @Version} conflicts surface as {@code ObjectOptimisticLockingFailureException}, which the
 * conflict advice answers as 409 {@code VERSION_CONFLICT}.
 */
@Service
public class OpportunityAssignmentService {

    public static final Set<String> OPEN_JOB = Set.of("OPEN", "IN_REVIEW");
    public static final String CONSULTANT_INACTIVE = "CONSULTANT_INACTIVE";
    /** An ACTIVE consultant whose marketing is not active (on a project, being prepared, not marketed): in scope, so a clear 409 rather than a stranger-style 404. */
    public static final String CONSULTANT_PAUSED = "CONSULTANT_PAUSED";

    /** The words a picker shows beside a consultant who cannot be assigned right now; null when they can. */
    public static String pausedReason(ConsultantProfile c) {
        if (c == null || !"ACTIVE".equals(c.getStatus()) || "ACTIVE".equals(c.getMarketingStatus())) return null;
        return "PAUSED".equals(c.getMarketingStatus()) ? "On a project — marketing paused" : "Not being marketed right now";
    }
    public static final String EVENT_ASSIGNED = "ASSIGNED";
    public static final String EVENT_REASSIGNED = "REASSIGNED";
    public static final String EVENT_CLOSED = "CLOSED";
    /** {@code mkt_opportunity.closed_reason}: the job was closed or filled / the marketer took the assignment back. */
    public static final String CLOSED_JOB = "JOB_CLOSED";
    public static final String CLOSED_WITHDRAWN = "WITHDRAWN";
    /** The states a close may end: the consultant has neither said no (DECLINED is theirs) nor applied (APPLIED is a fact) nor is it closed already. */
    public static final Set<String> CLOSABLE = Set.of("ASSIGNED", "VIEWED", "INTERESTED", "NEEDS_INFO");
    private static final Duration ASK_FOLLOW_UP = Duration.ofDays(3);

    /** The audit row to write when something changed. {@code targetId} null = the match id; {@code details} null = a short default. */
    public record Audit(String action, String targetType, String targetId, Function<Result, String> details) {}

    /**
     * What a caller wants beyond the pair. Everything is optional: {@code score}/{@code reason}/{@code source} only matter when the match is created,
     * {@code askInterest} also stamps "interest requested" and a 3-day follow-up (the Opportunities board), the note/priority/due date go onto the
     * opportunity when given.
     */
    public record Options(
        Audit audit,
        Supplier<Integer> score,
        String reason,
        String source,
        Long ownerMemberId,
        boolean askInterest,
        String marketerNote,
        String priority,
        LocalDate dueOn,
        DuplicateGuard.Confirm duplicate
    ) {
        public static Options none() {
            return new Options(null, null, null, null, null, false, null, null, null, DuplicateGuard.Confirm.NONE);
        }

        public Options withAudit(Audit a) {
            return new Options(a, score, reason, source, ownerMemberId, askInterest, marketerNote, priority, dueOn, duplicate);
        }

        public Options withNewMatch(Supplier<Integer> s, String why, String src) {
            return new Options(audit, s, why, src, ownerMemberId, askInterest, marketerNote, priority, dueOn, duplicate);
        }

        public Options withOwner(Long member) {
            return new Options(audit, score, reason, source, member, askInterest, marketerNote, priority, dueOn, duplicate);
        }

        public Options askingInterest() {
            return new Options(audit, score, reason, source, ownerMemberId, true, marketerNote, priority, dueOn, duplicate);
        }

        public Options withOpportunity(String note, String prio, LocalDate due) {
            return new Options(audit, score, reason, source, ownerMemberId, askInterest, note, prio, due, duplicate);
        }

        /** The answer to a duplicate warning (Sprint 2 / B1): confirmed, and the reason. */
        public Options confirmingDuplicate(DuplicateGuard.Confirm confirm) {
            return new Options(audit, score, reason, source, ownerMemberId, askInterest, marketerNote, priority, dueOn, confirm == null ? DuplicateGuard.Confirm.NONE : confirm);
        }
    }

    /**
     * The outcome. {@code reason} is non-null when the pair was refused softly ({@link #CONSULTANT_INACTIVE}): nothing was written and the other
     * fields are null/false. {@code existing} = the pair was already assigned and nothing changed. {@code reopened} = a dismissed/declined/closed pair
     * was put back to ASSIGNED.
     */
    public record Result(
        Long matchId,
        Long opportunityId,
        Long jobId,
        Long consultantId,
        Integer score,
        boolean created,
        boolean existing,
        boolean reopened,
        String reason
    ) {
        public boolean refused() {
            return reason != null;
        }

        static Result refused(Long jobId, Long consultantId, String reason) {
            return new Result(null, null, jobId, consultantId, null, false, false, false, reason);
        }
    }

    private final RequirementMatchRepository matches;
    private final MktOpportunityRepository opportunities;
    private final MktOpportunityEventRepository events;
    private final ClientRequirementRepository requirements;
    private final ConsultantProfileRepository consultants;
    private final OrgResumeRepository resumes;

    /** Pin lookup for the stale check (X7.4); absent in hand-wired unit tests. */
    @Autowired(required = false)
    private com.dossier.api.service.ent.resumes.OrgResumeApproval approvals;
    private final JobIdentityTx tx;
    private final OrgAuditService audit;
    private final Clock clock;
    /** The job data ledger (doc 61): every assign path writes its {@code ASSIGNED} row here. Null only in unit tests built with the constructor that has no ledger. */
    private final JobDataLedger ledger;
    /** The duplicate and cap guards (Sprint 2 / B1). Null in unit tests built by hand: then nothing is guarded. */
    private DuplicateGuard guard;

    @Autowired(required = false)
    public void setGuard(DuplicateGuard guard) {
        this.guard = guard;
    }

    @Autowired
    public OpportunityAssignmentService(
        RequirementMatchRepository matches,
        MktOpportunityRepository opportunities,
        MktOpportunityEventRepository events,
        ClientRequirementRepository requirements,
        ConsultantProfileRepository consultants,
        OrgResumeRepository resumes,
        JobIdentityTx tx,
        OrgAuditService audit,
        JobDataLedger ledger
    ) {
        this(matches, opportunities, events, requirements, consultants, resumes, tx, audit, Clock.systemUTC(), ledger);
    }

    /** Without a ledger: for tests of callers that do not look at it. */
    public OpportunityAssignmentService(
        RequirementMatchRepository matches,
        MktOpportunityRepository opportunities,
        MktOpportunityEventRepository events,
        ClientRequirementRepository requirements,
        ConsultantProfileRepository consultants,
        OrgResumeRepository resumes,
        JobIdentityTx tx,
        OrgAuditService audit,
        Clock clock
    ) {
        this(matches, opportunities, events, requirements, consultants, resumes, tx, audit, clock, null);
    }

    public OpportunityAssignmentService(
        RequirementMatchRepository matches,
        MktOpportunityRepository opportunities,
        MktOpportunityEventRepository events,
        ClientRequirementRepository requirements,
        ConsultantProfileRepository consultants,
        OrgResumeRepository resumes,
        JobIdentityTx tx,
        OrgAuditService audit,
        Clock clock,
        JobDataLedger ledger
    ) {
        this.ledger = ledger;
        this.matches = matches;
        this.opportunities = opportunities;
        this.events = events;
        this.requirements = requirements;
        this.consultants = consultants;
        this.resumes = resumes;
        this.tx = tx;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- assign ------------------------------------------------------------------------------------------------------------------

    /**
     * Put the job in front of the consultant: see the class comment for the gates and the pair rules.
     *
     * <p>The job is looked up with a plain read and, when that misses, with a fresh-snapshot read ({@link JobIdentityTx#readRequirement}): a job
     * another transaction committed after this one's snapshot (MySQL REPEATABLE READ) is invisible to the plain read. It is deliberately NOT a
     * locking read: the match insert runs in a transaction of its own and its foreign key to the job would wait on this transaction's lock.
     * A caller that has just created the job passes the entity itself ({@link #assign(AssignmentScope, OrgMembership, ClientRequirement, Long, Options)}).
     */
    /**
     * A board row in a fresh snapshot. The caller's own transaction (MySQL REPEATABLE READ) began before {@link #suggest} / {@link #assign} committed the
     * match in a transaction of its own, so a plain read of the row just created finds nothing: callers re-read here when they need it back.
     */
    public java.util.Optional<com.dossier.api.repository.ent.mkt.MktOpportunityRow> readRowFresh(Long orgId, Long matchId) {
        return tx.readOpportunityRow(orgId, matchId);
    }

    /** The match in a fresh snapshot (same reason as {@link #readRowFresh}): the match this very call inserted in its own transaction. */
    public java.util.Optional<RequirementMatch> readMatchFresh(Long orgId, Long matchId) {
        return tx.readMatch(orgId, matchId);
    }

    @Transactional(noRollbackFor = OrgException.class)
    public Result assign(AssignmentScope scope, OrgMembership me, Long jobId, Long consultantId, Options options) {
        Long orgId = orgOf(scope, me);
        if (jobId == null || consultantId == null) throw OrgException.coded(400, "VALIDATION", "Choose a consultant and a job.", Map.of());
        if (!scope.sees(consultantId)) throw new OrgNotFoundException();
        ClientRequirement job = requirements.findByOrgIdAndId(orgId, jobId).or(() -> tx.readRequirement(orgId, jobId)).orElseThrow(OrgNotFoundException::new);
        return assignChecked(scope, me, job, consultantId, options);
    }

    /**
     * {@link #assign(AssignmentScope, OrgMembership, Long, Long, Options)} for a job the caller already holds (it created or found it in this very
     * request): nothing is re-read, so a job committed by a nested transaction after this one's snapshot is not lost.
     */
    @Transactional(noRollbackFor = OrgException.class)
    public Result assign(AssignmentScope scope, OrgMembership me, ClientRequirement job, Long consultantId, Options options) {
        Long orgId = orgOf(scope, me);
        if (job == null || job.getId() == null || consultantId == null) throw OrgException.coded(400, "VALIDATION", "Choose a consultant and a job.", Map.of());
        if (!scope.sees(consultantId)) throw new OrgNotFoundException();
        if (!orgId.equals(job.getOrgId())) throw new OrgNotFoundException();
        return assignChecked(scope, me, job, consultantId, options);
    }

    /**
     * An APPROVED resume exists and (X7.4) at least one approved resume is not STALE: its text still matches what the consultant approved. Without the
     * pin lookup (hand-wired tests) the status alone decides, as before.
     */
    private boolean hasUsableApprovedResume(Long orgId, Long consultantId) {
        if (!resumes.existsByOrgIdAndConsultantIdAndApprovalStatus(orgId, consultantId, "APPROVED")) return false;
        if (approvals == null) return true;
        List<com.dossier.api.domain.ent.talent.OrgResume> mine = resumes.findByOrgIdAndConsultantId(orgId, consultantId);
        if (mine == null || mine.isEmpty()) return true;
        return mine.stream().anyMatch(approvals::isUsable);
    }

    private Result assignChecked(AssignmentScope scope, OrgMembership me, ClientRequirement job, Long consultantId, Options options) {
        Long orgId = scope.orgId();
        Long jobId = job.getId();
        Options o = options == null ? Options.none() : options;
        ConsultantProfile consultant = consultants.findByOrgIdAndId(orgId, consultantId).orElseThrow(OrgNotFoundException::new);
        if (!OPEN_JOB.contains(job.getStatus())) throw OrgException.coded(409, "JOB_NOT_OPEN", "That job is not open.", Map.of());
        if (!"ACTIVE".equals(consultant.getStatus())) return Result.refused(jobId, consultantId, CONSULTANT_INACTIVE);
        if (!"ACTIVE".equals(consultant.getMarketingStatus())) return Result.refused(jobId, consultantId, CONSULTANT_PAUSED);
        if (!"EXTENSION".equals(job.getCaptureSource()) && !hasUsableApprovedResume(orgId, consultantId)) {
            throw OrgException.coded(409, "RESUME_NOT_APPROVED", "The consultant needs an approved resume before this can be assigned.", Map.of());
        }
        Instant now = clock.instant();
        Long owner = o.ownerMemberId() != null ? o.ownerMemberId() : me.memberId();
        guardNewAssignment(me, orgId, job, consultantId, o);

        // ---- the match
        boolean matchInserted = false;
        boolean promoted = false; // SUGGESTED / DISMISSED -> ASSIGNED by this call
        boolean fromDismissed = false;
        Long matchId;
        RequirementMatch match = matches.findByOrgIdAndRequirementIdAndConsultantId(orgId, jobId, consultantId).orElse(null);
        if (match == null) {
            RequirementMatch fresh = new RequirementMatch();
            fresh.setOrgId(orgId);
            fresh.setRequirementId(jobId);
            fresh.setConsultantId(consultantId);
            fresh.setScore(o.score() == null || o.score().get() == null ? 0 : o.score().get());
            fresh.setReason(o.reason() == null ? "Assigned by a marketer" : o.reason());
            fresh.setSource(o.source() == null ? "MANUAL" : o.source());
            fresh.setStatus("ASSIGNED");
            fresh.setAssignedByMemberId(me.memberId());
            fresh.setAssignedAt(now);
            fresh.setCreatedAt(now);
            try {
                // the ASSIGNED ledger row is written INSIDE the insert's own transaction: a match that exists always has its ledger row
                matchId = tx.insertMatch(fresh, ledger == null ? null : saved -> ledger.assigned(orgId, jobId, me.memberId(), consultantId, false));
                matchInserted = true;
            } catch (DataIntegrityViolationException lost) {
                matchId = tx.readMatchId(orgId, jobId, consultantId).orElseThrow(() -> lost);
            }
        } else {
            matchId = match.getId();
        }

        // ---- the opportunity overlay: inserted BEFORE this transaction updates or locks the match row (the insert's foreign key to the match
        // would otherwise wait on this transaction's own lock, because it runs in a transaction of its own)
        boolean oppInserted = false;
        boolean eventInInsert = false; // the ASSIGNED / REASSIGNED event was written by the overlay's own insert transaction
        MktOpportunity opp = opportunities.findByOrgIdAndMatchId(orgId, matchId).orElse(null);
        Long oppId;
        if (opp == null) {
            // A new overlay for a pair that is being assigned now gets its event in the same transaction as the insert, so an overlay never exists without it.
            boolean assigningNow = matchInserted || (match != null && !"ASSIGNED".equals(match.getStatus()));
            boolean again = match != null && "DISMISSED".equals(match.getStatus());
            try {
                oppId = tx.insertOpportunity(
                    newOpportunity(orgId, matchId, owner, now, o),
                    assigningNow
                        ? saved -> record(saved, again ? EVENT_REASSIGNED : EVENT_ASSIGNED, me.memberId(), again ? "was assigned to this opportunity again" : "was assigned to this opportunity", now)
                        : null
                );
                eventInInsert = assigningNow;
                oppInserted = true;
            } catch (DataIntegrityViolationException lost) {
                oppId = tx.readOpportunityId(orgId, matchId).orElseThrow(() -> lost);
            }
        } else {
            oppId = opp.getId();
        }
        // rows another transaction (or the insert above) committed after this snapshot: read the latest version and attach it
        if (match == null) match = matches.lockByOrgIdAndId(orgId, matchId).orElseThrow(OrgNotFoundException::new);
        if (opp == null) opp = opportunities.lockByOrgIdAndId(orgId, oppId).orElseThrow(OrgNotFoundException::new);

        if (!matchInserted && !"ASSIGNED".equals(match.getStatus())) {
            fromDismissed = "DISMISSED".equals(match.getStatus());
            match.setStatus("ASSIGNED");
            match.setAssignedByMemberId(me.memberId());
            match.setAssignedAt(now);
            match = matches.save(match);
            promoted = true;
        }
        boolean reopened = false;
        if (!oppInserted && ("DECLINED".equals(opp.getState()) || "CLOSED".equals(opp.getState()))) {
            reopen(opp, owner, now, o);
            reopened = true;
        } else if (!oppInserted && promoted) {
            // a SUGGESTED overlay (state is still the default) that is now assigned: take the marketer's note, priority and due date if given
            applyOpportunityFields(opp, o);
            opp.setUpdatedAt(now);
            opp = opportunities.save(opp);
        }

        boolean changed = matchInserted || promoted || reopened;
        boolean created = matchInserted;
        boolean existing = !changed;
        Result result = new Result(match.getId(), opp.getId(), jobId, consultantId, match.getScore(), created, existing, reopened || fromDismissed, null);
        if (existing) return result;

        boolean again = reopened || fromDismissed;
        if (!eventInInsert) record(opp, again ? EVENT_REASSIGNED : EVENT_ASSIGNED, me.memberId(), again ? "was assigned to this opportunity again" : "was assigned to this opportunity", now);
        // The job's data ledger (docs/enterprise-v2/61 section 3): written exactly when the assignment changed. A created match already has its row
        // (written by the match insert); every other change writes it here, in this transaction.
        if (ledger != null && !matchInserted) ledger.assigned(orgId, jobId, me.memberId(), consultantId, again);
        if (o.askInterest()) {
            opp.setInterestRequestedAt(now);
            opp.setNextActionAt(now.plus(ASK_FOLLOW_UP));
            opp.setUpdatedAt(now);
            opp = opportunities.save(opp);
            record(opp, "INTEREST_REQUESTED", me.memberId(), "was asked for their interest", now);
        }
        writeAudit(me, o.audit(), result);
        return result;
    }

    /**
     * The duplicate and open-cap guards (Sprint 2 / B1), asked only when this call would really put the job in front of the consultant: a pair that is
     * already live (assigned and not declined or closed) changes nothing and is never refused. Throws 409 ASSIGNMENT_CAP, DUPLICATE_WARNING or
     * DUPLICATE_BLOCKED before anything is written.
     */
    private void guardNewAssignment(OrgMembership me, Long orgId, ClientRequirement job, Long consultantId, Options o) {
        if (guard == null) return;
        RequirementMatch pair = matches.findByOrgIdAndRequirementIdAndConsultantId(orgId, job.getId(), consultantId).orElse(null);
        if (pair != null && "ASSIGNED".equals(pair.getStatus())) {
            MktOpportunity overlay = opportunities.findByOrgIdAndMatchId(orgId, pair.getId()).orElse(null);
            boolean reopening = overlay != null && ("DECLINED".equals(overlay.getState()) || "CLOSED".equals(overlay.getState()));
            if (!reopening) return;
        }
        guard.assertOpenCap(orgId, consultantId);
        guard.enforce(me, consultantId, job, o.duplicate());
    }

    /**
     * Add a SUGGESTED opportunity (the Opportunities board's "Add opportunity"): a missing match is created SUGGESTED, a DISMISSED one is brought
     * back to SUGGESTED, and the opportunity overlay is ensured. A pair that already has a live match comes back {@code existing=true} untouched.
     * No resume or active-consultant gate: nothing is put in front of the consultant yet.
     */
    @Transactional(noRollbackFor = OrgException.class)
    public Result suggest(AssignmentScope scope, OrgMembership me, Long jobId, Long consultantId, Options options) {
        Long orgId = orgOf(scope, me);
        Options o = options == null ? Options.none() : options;
        if (jobId == null || consultantId == null) throw OrgException.coded(400, "VALIDATION", "Choose a consultant and a job.", Map.of());
        if (!scope.sees(consultantId)) throw new OrgNotFoundException();
        ClientRequirement job = requirements.findByOrgIdAndId(orgId, jobId).orElseThrow(OrgNotFoundException::new);
        consultants.findByOrgIdAndId(orgId, consultantId).orElseThrow(OrgNotFoundException::new);
        if (!OPEN_JOB.contains(job.getStatus())) throw OrgException.coded(409, "JOB_NOT_OPEN", "That job is not open.", Map.of());
        Instant now = clock.instant();
        Long owner = o.ownerMemberId() != null ? o.ownerMemberId() : me.memberId();

        RequirementMatch match = matches.findByOrgIdAndRequirementIdAndConsultantId(orgId, jobId, consultantId).orElse(null);
        if (match != null && !"DISMISSED".equals(match.getStatus())) {
            return new Result(match.getId(), null, jobId, consultantId, match.getScore(), false, true, false, null);
        }
        boolean inserted = false;
        Long matchId;
        if (match == null) {
            RequirementMatch fresh = new RequirementMatch();
            fresh.setOrgId(orgId);
            fresh.setRequirementId(jobId);
            fresh.setConsultantId(consultantId);
            fresh.setScore(o.score() == null || o.score().get() == null ? 0 : o.score().get());
            fresh.setReason(o.reason() == null ? "Added by a marketer" : o.reason());
            fresh.setSource(o.source() == null ? "MANUAL" : o.source());
            fresh.setStatus("SUGGESTED");
            fresh.setCreatedAt(now);
            try {
                matchId = tx.insertMatch(fresh);
                inserted = true;
            } catch (DataIntegrityViolationException lost) {
                // someone else added the pair a moment ago: it is theirs, nothing to do
                matchId = tx.readMatchId(orgId, jobId, consultantId).orElseThrow(() -> lost);
                return new Result(matchId, null, jobId, consultantId, null, false, true, false, null);
            }
        } else {
            matchId = match.getId();
        }
        // the overlay first: its insert runs in its own transaction and needs the match row unlocked (see assign)
        MktOpportunity opp = ensureOpportunityFor(orgId, matchId, owner, now);
        if (match == null) {
            match = matches.lockByOrgIdAndId(orgId, matchId).orElseThrow(OrgNotFoundException::new);
        } else {
            match.setStatus("SUGGESTED");
            match.setAssignedAt(null);
            match.setAssignedByMemberId(null);
            match = matches.save(match);
        }
        record(opp, "CREATED", me.memberId(), "was added as an opportunity", now);
        Result result = new Result(match.getId(), opp.getId(), jobId, consultantId, match.getScore(), inserted, false, !inserted, null);
        writeAudit(me, o.audit(), result);
        return result;
    }

    /**
     * The opportunity overlay of an existing match, created (race-safe) when it is not there yet. For the marketer actions that only annotate an
     * opportunity (review, request interest, next action). The consultant must be inside the scope, else the generic 404.
     */
    @Transactional
    public MktOpportunity ensureOpportunity(AssignmentScope scope, Long matchId, Long ownerMemberId) {
        Long orgId = scope.orgId();
        RequirementMatch match = matches.findByOrgIdAndId(orgId, matchId).orElseThrow(OrgNotFoundException::new);
        if (!scope.sees(match.getConsultantId())) throw new OrgNotFoundException();
        return ensureOpportunityFor(orgId, matchId, ownerMemberId, clock.instant());
    }

    // ---- closing ---------------------------------------------------------------------------------------------------------------

    /**
     * The job was closed or filled: every opportunity of it that is still open for the consultant ({@link #CLOSABLE}) becomes CLOSED with reason
     * {@link #CLOSED_JOB}, one {@code mkt_opportunity_event} and one audit row each, in the caller's transaction. DECLINED and APPLIED opportunities are
     * left as the consultant made them. Call it from the code that sets the job's status to CLOSED or FILLED; today nothing in the application does (there
     * is no job-status editor yet), so this has no caller until that screen exists.
     *
     * @return the number of opportunities closed
     */
    @Transactional(noRollbackFor = OrgException.class)
    public int closeForJob(AssignmentScope scope, OrgMembership me, Long jobId) {
        Long orgId = orgOf(scope, me);
        if (jobId == null) throw OrgException.coded(400, "VALIDATION", "Choose a job.", Map.of());
        Instant now = clock.instant();
        int closed = 0;
        for (MktOpportunity opp : opportunities.lockByRequirementAndStates(orgId, jobId, CLOSABLE)) {
            close(me, opp, CLOSED_JOB, "closed: the job is no longer open", now);
            closed++;
        }
        return closed;
    }

    /**
     * The marketer takes an assignment back: the opportunity becomes CLOSED with reason {@link #CLOSED_WITHDRAWN}. 404 outside the caller's scope;
     * 409 {@code ILLEGAL_TRANSITION} when the consultant already declined or applied or it is closed (nothing to withdraw). The match stays ASSIGNED, so a
     * later assign of the same pair reopens these rows. There is no HTTP route for it yet (the Opportunities board has no withdraw action).
     */
    @Transactional(noRollbackFor = OrgException.class)
    public void withdraw(AssignmentScope scope, OrgMembership me, Long opportunityId) {
        withdraw(scope, me, opportunityId, null);
    }

    /** {@link #withdraw(AssignmentScope, OrgMembership, Long)} with the marketer's reason, kept on the timeline event and the audit row (already validated and PII-scanned by the caller). */
    @Transactional(noRollbackFor = OrgException.class)
    public void withdraw(AssignmentScope scope, OrgMembership me, Long opportunityId, String reasonText) {
        Long orgId = orgOf(scope, me);
        MktOpportunity opp = opportunities.lockByOrgIdAndId(orgId, opportunityId == null ? -1L : opportunityId).orElseThrow(OrgNotFoundException::new);
        RequirementMatch match = matches.findByOrgIdAndId(orgId, opp.getMatchId()).orElseThrow(OrgNotFoundException::new);
        if (!scope.sees(match.getConsultantId())) throw new OrgNotFoundException();
        if (!CLOSABLE.contains(opp.getState())) {
            throw OrgException.coded(409, "ILLEGAL_TRANSITION", "That is not possible from the opportunity's current state.", Map.of("state", opp.getState(), "target", "CLOSED"));
        }
        String why = reasonText == null || reasonText.isBlank() ? null : reasonText.strip();
        String eventText = why == null ? "was withdrawn by the marketer" : "was withdrawn by the marketer: " + (why.length() > 160 ? why.substring(0, 160) : why);
        close(me, opp, CLOSED_WITHDRAWN, eventText, clock.instant(), "MARKETER_OPPORTUNITY_WITHDRAW", why == null ? CLOSED_WITHDRAWN : CLOSED_WITHDRAWN + ": " + why);
    }

    private void close(OrgMembership me, MktOpportunity opp, String reason, String eventText, Instant now) {
        close(me, opp, reason, eventText, now, "OPPORTUNITY_CLOSED", reason);
    }

    private void close(OrgMembership me, MktOpportunity opp, String reason, String eventText, Instant now, String auditAction, String auditDetails) {
        opp.setState("CLOSED");
        opp.setClosedAt(now);
        opp.setClosedReason(reason);
        opp.setUpdatedAt(now);
        opportunities.save(opp);
        record(opp, EVENT_CLOSED, me.memberId(), eventText, now);
        audit.record(me, auditAction, "OPPORTUNITY", null, String.valueOf(opp.getId()), auditDetails);
    }

    // ---- internals ---------------------------------------------------------------------------------------------------------------

    private MktOpportunity ensureOpportunityFor(Long orgId, Long matchId, Long owner, Instant now) {
        MktOpportunity found = opportunities.findByOrgIdAndMatchId(orgId, matchId).orElse(null);
        if (found != null) return found;
        MktOpportunity fresh = newOpportunity(orgId, matchId, owner, now, Options.none());
        Long id;
        try {
            id = tx.insertOpportunity(fresh);
        } catch (DataIntegrityViolationException lost) {
            id = tx.readOpportunityId(orgId, matchId).orElseThrow(() -> lost);
        }
        return opportunities.lockByOrgIdAndId(orgId, id).orElseThrow(OrgNotFoundException::new);
    }

    private static MktOpportunity newOpportunity(Long orgId, Long matchId, Long owner, Instant now, Options o) {
        MktOpportunity n = new MktOpportunity();
        n.setOrgId(orgId);
        n.setMatchId(matchId);
        n.setOwnerMemberId(owner);
        n.setState("ASSIGNED");
        n.setCreatedAt(now);
        n.setUpdatedAt(now);
        applyOpportunityFields(n, o);
        return n;
    }

    private static void applyOpportunityFields(MktOpportunity opp, Options o) {
        if (o.marketerNote() != null) opp.setMarketerNote(o.marketerNote());
        if (o.priority() != null) opp.setPriority(o.priority());
        if (o.dueOn() != null) opp.setDueOn(o.dueOn());
    }

    /** DECLINED / CLOSED back to ASSIGNED on the same rows; what the consultant said before is cleared, the history stays in the events. */
    private void reopen(MktOpportunity opp, Long owner, Instant now, Options o) {
        opp.setState("ASSIGNED");
        opp.setClosedAt(null);
        opp.setClosedReason(null);
        opp.setDeclineReason(null);
        opp.setDeclineNote(null);
        opp.setInfoRequest(null);
        opp.setInfoAnswer(null);
        opp.setInterest("NO_RESPONSE"); // the legacy column follows the state (NOT_INTERESTED was the old DECLINED)
        if (opp.getOwnerMemberId() == null) opp.setOwnerMemberId(owner);
        applyOpportunityFields(opp, o);
        opp.setUpdatedAt(now);
        opportunities.save(opp);
    }

    private void record(MktOpportunity opp, String kind, Long actor, String text, Instant now) {
        MktOpportunityEvent e = new MktOpportunityEvent();
        e.setOrgId(opp.getOrgId());
        e.setOpportunityId(opp.getId());
        e.setKind(kind);
        e.setActorMemberId(actor);
        e.setText(text);
        e.setOccurredAt(now);
        events.save(e);
    }

    private void writeAudit(OrgMembership me, Audit a, Result r) {
        if (a == null) return;
        String target = a.targetId() != null ? a.targetId() : String.valueOf(r.matchId());
        String details = a.details() != null ? a.details().apply(r) : "consultant " + r.consultantId() + ", job " + r.jobId();
        audit.record(me, a.action(), a.targetType(), null, target, details);
    }

    private static Long orgOf(AssignmentScope scope, OrgMembership me) {
        if (scope == null || me == null || scope.orgId() == null || !scope.orgId().equals(me.orgId())) throw new OrgNotFoundException();
        return scope.orgId();
    }
}
