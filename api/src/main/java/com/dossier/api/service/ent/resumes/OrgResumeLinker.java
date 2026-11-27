package com.dossier.api.service.ent.resumes;

import com.dossier.api.service.org.ConsultantProfileLinked;
import com.dossier.api.service.org.DataShareScopeChanged;
import com.dossier.api.service.resume.ResumeDocEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Starts organization-resume replays after the source write commits. The actual work runs in its own transaction so a
 * directory projection can never turn a successful personal resume or consent write into a failed request.
 */
@Component
public class OrgResumeLinker {

    private static final Logger LOG = LoggerFactory.getLogger(OrgResumeLinker.class);

    private final OrgResumeLinkWork work;

    public OrgResumeLinker(OrgResumeLinkWork work) {
        this.work = work;
    }

    /** A consultant's resumes become eligible for the directory only when the named person receives FULL consent. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, condition = "#event.replaysResumes()")
    public void onShareScopeChanged(DataShareScopeChanged event) {
        if (event == null || !event.replaysResumes()) return;
        try {
            work.replay(event.orgId(), event.memberId(), event.userId());
        } catch (RuntimeException e) {
            LOG.warn("Replaying resumes for user {} into organization {} failed: {}", event.userId(), event.orgId(), e.toString());
        }
    }

    /** A profile can be linked after the consultant already granted FULL consent. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onConsultantProfileLinked(ConsultantProfileLinked event) {
        if (event == null || !event.valid()) return;
        try {
            work.replay(event.orgId(), event.memberId(), null);
        } catch (RuntimeException e) {
            LOG.warn("Replaying resumes for linked consultant seat {} in organization {} failed: {}", event.memberId(), event.orgId(), e.toString());
        }
    }

    /** Profile uploads and builder-created documents share the same lifecycle event; replay is idempotent for existing links. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onResumeCreated(ResumeDocEvent event) {
        if (event == null || event.type() != ResumeDocEvent.Type.CREATED || event.resumeId() == null || event.ownerUserId() == null) return;
        try {
            work.replayCreated(event);
        } catch (RuntimeException e) {
            LOG.warn("Replaying newly created resume {} into organization directories failed: {}", event.resumeId(), e.toString());
        }
    }
}
