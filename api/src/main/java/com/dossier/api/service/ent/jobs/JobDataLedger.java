package com.dossier.api.service.ent.jobs;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.JobDataEvent;
import com.dossier.api.repository.ent.talent.JobDataEventRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Writes the append-only job data ledger (docs/enterprise-v2/61 section 3). Every method only INSERTS one row and joins the caller's transaction (no
 * transaction of its own), so a ledger row exists exactly when the change it describes was committed: the callers are the writers of the change.
 *
 * <p>The ledger holds field NAMES, never values, and ids instead of names. {@code fields} and {@code note} are cut to their column sizes so a long
 * list can never fail the change it describes.
 */
@Component
public class JobDataLedger {

    static final int FIELDS_MAX = 300;
    static final int NOTE_MAX = 200;
    static final int SOURCE_REF_MAX = 200;

    private final JobDataEventRepository events;
    private final Clock clock;

    @Autowired
    public JobDataLedger(JobDataEventRepository events) {
        this(events, Clock.systemUTC());
    }

    public JobDataLedger(JobDataEventRepository events, Clock clock) {
        this.events = events;
        this.clock = clock;
    }

    /** The CAPTURED row of a job just created from a browser capture: built here, saved by {@code JobIdentityTx} in the job's own insert transaction. */
    public JobDataEvent capturedEvent(ClientRequirement job, Long actorMemberId, String requestId, Collection<String> fieldNames) {
        JobDataEvent e = base(job.getOrgId(), job.getId(), JobDataEvent.CAPTURED, actorMemberId, JobDataEvent.ACTOR_EXTENSION);
        e.setDetailLevelAfter(job.getDetailLevel());
        e.setFields(join(fieldNames));
        e.setSourceRef(cut(job.getJobUrl(), SOURCE_REF_MAX));
        e.setRequestId(cut(requestId, 64));
        return e;
    }

    /** The CAPTURED row of a job a marketer typed in by hand (the actor is the member, not the extension): saved in the job's own insert transaction. */
    public JobDataEvent enteredByHandEvent(ClientRequirement job, Long actorMemberId, String requestId, Collection<String> fieldNames) {
        JobDataEvent e = base(job.getOrgId(), job.getId(), JobDataEvent.CAPTURED, actorMemberId, JobDataEvent.ACTOR_MEMBER);
        e.setDetailLevelAfter(job.getDetailLevel());
        e.setFields(join(fieldNames));
        e.setSourceRef(cut(job.getJobUrl(), SOURCE_REF_MAX));
        e.setRequestId(cut(requestId, 64));
        return e;
    }

    /** A consultant was put in front of the job (or put back after a decline, a close or a dismissal): {@code consultantId} is an id, not a name. */
    public JobDataEvent assigned(Long orgId, Long jobId, Long actorMemberId, Long consultantId, boolean again) {
        JobDataEvent e = base(orgId, jobId, JobDataEvent.ASSIGNED, actorMemberId, JobDataEvent.ACTOR_MEMBER);
        e.setNote((again ? "reassigned to consultant " : "assigned to consultant ") + consultantId);
        return events.save(e);
    }

    /** An edit of the job's own data: {@code fieldNames} are the fields that changed. */
    public JobDataEvent edited(Long orgId, Long jobId, Long actorMemberId, Collection<String> fieldNames) {
        JobDataEvent e = base(orgId, jobId, JobDataEvent.EDITED, actorMemberId, JobDataEvent.ACTOR_MEMBER);
        e.setFields(join(fieldNames));
        return events.save(e);
    }

    /** The organization's display cap changed from {@code before} to {@code after}: one row per job the cap applies to. */
    public JobDataEvent capChanged(Long orgId, Long jobId, Long actorMemberId, String before, String after) {
        JobDataEvent e = base(orgId, jobId, JobDataEvent.CAP_CHANGED, actorMemberId, JobDataEvent.ACTOR_MEMBER);
        e.setDetailLevelBefore(before);
        e.setDetailLevelAfter(after);
        return events.save(e);
    }

    private JobDataEvent base(Long orgId, Long jobId, String type, Long actorMemberId, String actorKind) {
        JobDataEvent e = new JobDataEvent();
        e.setOrgId(orgId);
        e.setRequirementId(jobId);
        e.setEventType(type);
        e.setActorMemberId(actorMemberId);
        e.setActorKind(actorKind);
        e.setOccurredAt(Instant.now(clock));
        return e;
    }

    static String join(Collection<String> names) {
        return names == null || names.isEmpty() ? null : cut(String.join(",", names), FIELDS_MAX);
    }

    private static String cut(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
