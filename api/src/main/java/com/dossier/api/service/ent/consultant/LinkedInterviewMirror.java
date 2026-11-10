package com.dossier.api.service.ent.consultant;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.InboxInterviewChanged;
import java.util.LinkedHashSet;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Follows an interview that a person's own inbox created into the organizations they are a consultant in (so it shows on the consultant workspace
 * Interviews page like an interview from the application timeline). Runs after the interview's transaction committed, and can never fail it: everything
 * is inside one catch-all, and each organization is handled in a transaction of its own ({@link LinkedInterviewMirrorWork}).
 */
@Component
public class LinkedInterviewMirror {

    private static final Logger LOG = LoggerFactory.getLogger(LinkedInterviewMirror.class);

    private final OrgMemberRepository members;
    private final LinkedInterviewMirrorWork work;

    public LinkedInterviewMirror(OrgMemberRepository members, LinkedInterviewMirrorWork work) {
        this.members = members;
        this.work = work;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onInboxInterview(InboxInterviewChanged event) {
        try {
            if (event.userId() == null) return;
            Set<Long> done = new LinkedHashSet<>();
            for (OrgMember seat : members.findMine(event.userId())) {
                if (seat.getStatus() != OrgMemberStatus.ACTIVE || seat.getOrgId() == null || !done.add(seat.getOrgId())) continue;
                try {
                    work.process(seat.getOrgId(), seat.getId(), event);
                } catch (RuntimeException e) {
                    LOG.warn("Mirroring interview {} into organization {} failed: {}", event.interviewId(), seat.getOrgId(), e.toString());
                }
            }
        } catch (RuntimeException e) {
            LOG.warn("Following interview {} into the organizations failed: {}", event.interviewId(), e.toString());
        }
    }
}
