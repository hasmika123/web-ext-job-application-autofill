package com.dossier.api.service.ent.consultant;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ApplicationEventRecorded;
import com.dossier.api.service.org.ConsultantProfileLinked;
import com.dossier.api.service.org.DataShareScopeChanged;
import java.util.LinkedHashSet;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Follows a person's OWN application tracker into the organizations they are a consultant in (docs/enterprise-v2/60-job-phase1-contract.md section 5; ADR-010).
 * The extension (or the web) saves the consultant's application; once that write has COMMITTED this listener looks at the application and, for each ACTIVE
 * consultant seat of the owner, lets {@link PipelineApplicationLinkWork} link it to the matching assigned opportunity, mirror its progress where the
 * consultant shares it, or close the opportunity when the application ended.
 *
 * <p><b>It can never fail the user's write.</b> It runs after commit and everything, including finding the seats, is inside one catch-all that logs and
 * returns; each organization is processed in a transaction of its own ({@code REQUIRES_NEW}, on the work bean) so one organization's failure neither undoes
 * nor blocks another's. The contract puts {@code @Transactional(REQUIRES_NEW)} on the listener itself; it lives on the work bean instead because a
 * rollback-only transaction on the listener would surface as an exception out of the commit callback, which is exactly what must not happen.
 *
 * <p>It only reads the application and writes org-side rows (the opportunity, its link, its events, the consent-gated projection). It never changes the
 * application and never submits anything (E1). The condition keeps notes, interviews and field edits from opening a transaction at all.
 */
@Component
public class PipelineApplicationLinker {

    private static final Logger LOG = LoggerFactory.getLogger(PipelineApplicationLinker.class);

    private final ApplicationRepository applications;
    private final OrgMemberRepository members;
    private final PipelineApplicationLinkWork work;

    public PipelineApplicationLinker(ApplicationRepository applications, OrgMemberRepository members, PipelineApplicationLinkWork work) {
        this.applications = applications;
        this.members = members;
        this.work = work;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, condition = "#event.relevant()")
    public void onApplicationEvent(ApplicationEventRecorded event) {
        try {
            Application app = applications.findById(event.applicationId()).orElse(null);
            if (app == null) return;
            PipelineApplicationLinkWork.Facts facts = facts(event.userId(), app, event.toStatus(), event.source());
            Set<Long> done = new LinkedHashSet<>();
            for (OrgMember seat : members.findMine(event.userId())) {
                if (seat.getStatus() != OrgMemberStatus.ACTIVE || seat.getOrgId() == null || !isConsultantSeat(seat) || !done.add(seat.getOrgId())) continue;
                try {
                    work.process(seat.getOrgId(), seat.getId(), facts);
                } catch (RuntimeException e) {
                    LOG.warn("Linking application {} to the opportunities of organization {} failed: {}", event.applicationId(), seat.getOrgId(), e.toString());
                }
            }
        } catch (RuntimeException e) {
            LOG.warn("Following application {} into the organizations failed: {}", event.applicationId(), e.toString());
        }
    }

    /**
     * Replays personal applications when a consultant grants SUMMARY or FULL after those applications were created. The
     * application remains private until this event is published after the consent write commits.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, condition = "#event.replaysApplications()")
    public void onShareScopeChanged(DataShareScopeChanged event) {
        if (event == null || !event.replaysApplications()) return;
        try {
            replayForMember(event.orgId(), event.memberId(), event.userId());
        } catch (RuntimeException e) {
            LOG.warn("Replaying applications for user {} into organization {} failed: {}", event.userId(), event.orgId(), e.toString());
        }
    }

    /** Replays a linked consultant's applications when their profile was created after their consent. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onConsultantProfileLinked(ConsultantProfileLinked event) {
        if (event == null || !event.valid()) return;
        try {
            replayForMember(event.orgId(), event.memberId(), null);
        } catch (RuntimeException e) {
            LOG.warn("Replaying applications for linked consultant seat {} in organization {} failed: {}", event.memberId(), event.orgId(), e.toString());
        }
    }

    private void replayForMember(Long orgId, Long memberId, Long expectedUserId) {
        OrgMember seat = members.findByOrgIdAndId(orgId, memberId).orElse(null);
        if (seat == null || seat.getStatus() != OrgMemberStatus.ACTIVE || seat.getUserId() == null) return;
        if (expectedUserId != null && !expectedUserId.equals(seat.getUserId())) return;
        if (!isConsultantSeat(seat) || !work.replayEligible(orgId, memberId)) return;
        Long userId = seat.getUserId();
        for (Application app : applications.findByUserId(userId)) {
            if (app == null || app.getId() == null || app.getStatus() == null) continue;
            try {
                replay(orgId, memberId, userId, app);
            } catch (RuntimeException e) {
                LOG.warn("Replaying application {} into organization {} failed: {}", app.getId(), orgId, e.toString());
            }
        }
    }

    private boolean isConsultantSeat(OrgMember seat) {
        return seat.getId() != null && seat.getOrgId() != null && members.countLiveConsultantRoles(seat.getOrgId(), seat.getId()) > 0;
    }

    private void replay(Long orgId, Long memberId, Long userId, Application app) {
        ApplicationStatus current = app.getStatus();
        if (requiresAppliedReplay(current)) {
            work.process(orgId, memberId, facts(userId, app, ApplicationStatus.APPLIED, ApplicationEvent.SRC_SYSTEM));
            if (current != ApplicationStatus.APPLIED) work.process(orgId, memberId, facts(userId, app, current, ApplicationEvent.SRC_SYSTEM));
            return;
        }
        work.process(orgId, memberId, facts(userId, app, current, ApplicationEvent.SRC_SYSTEM));
    }

    private PipelineApplicationLinkWork.Facts facts(Long userId, Application app, ApplicationStatus status, String source) {
        return new PipelineApplicationLinkWork.Facts(
            userId, app.getId(), status, app.getCompany(), app.getRoleTitle(), app.getJobUrl(), app.getAtsPlatform(), app.getExternalJobId(), app.getAppliedAt(), source
        );
    }

    private boolean requiresAppliedReplay(ApplicationStatus status) {
        return status == ApplicationStatus.IN_REVIEW
            || status == ApplicationStatus.INTERVIEW
            || status == ApplicationStatus.OFFER
            || status == ApplicationStatus.REJECTED
            || status == ApplicationStatus.WITHDRAWN;
    }
}
