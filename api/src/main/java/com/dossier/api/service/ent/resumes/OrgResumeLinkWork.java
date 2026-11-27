package com.dossier.api.service.ent.resumes;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.resume.ResumeDocEvent;
import java.util.LinkedHashSet;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Performs one consent-checked, idempotent replay of a consultant's personal resumes into one organization. */
@Component
public class OrgResumeLinkWork {

    private final DataShareService shares;
    private final OrgMemberRepository members;
    private final ConsultantProfileRepository consultants;
    private final ResumeRepository resumes;
    private final OrgResumeLinkService linker;

    @Autowired
    public OrgResumeLinkWork(
        DataShareService shares,
        OrgMemberRepository members,
        ConsultantProfileRepository consultants,
        ResumeRepository resumes,
        OrgResumeLinkService linker
    ) {
        this.shares = shares;
        this.members = members;
        this.consultants = consultants;
        this.resumes = resumes;
        this.linker = linker;
    }

    /** Replays the eligible resumes for one known consultant seat. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void replay(Long orgId, Long memberId, Long expectedUserId) {
        replayInTransaction(orgId, memberId, expectedUserId);
    }

    /** Finds every active organization seat for a newly created personal resume and replays it where FULL is already granted. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void replayCreated(ResumeDocEvent event) {
        if (event == null || event.ownerUserId() == null) return;
        Set<Long> organizations = new LinkedHashSet<>();
        for (OrgMember seat : members.findMine(event.ownerUserId())) {
            if (seat == null || seat.getStatus() != OrgMemberStatus.ACTIVE || seat.getOrgId() == null || seat.getId() == null) continue;
            if (organizations.add(seat.getOrgId())) replayInTransaction(seat.getOrgId(), seat.getId(), event.ownerUserId());
        }
    }

    private void replayInTransaction(Long orgId, Long memberId, Long expectedUserId) {
        if (orgId == null || memberId == null) return;
        OrgMember seat = members.findByOrgIdAndId(orgId, memberId).orElse(null);
        if (seat == null || seat.getStatus() != OrgMemberStatus.ACTIVE || seat.getUserId() == null) return;
        if (expectedUserId != null && !expectedUserId.equals(seat.getUserId())) return;
        if (shares.scopeOf(orgId, memberId) != ShareScope.FULL) return;

        ConsultantProfile consultant = consultants.findByOrgIdAndMemberId(orgId, memberId).orElse(null);
        if (consultant == null || consultant.getId() == null || !"ACTIVE".equals(consultant.getStatus())) return;

        Long userId = seat.getUserId();
        for (Resume resume : resumes.findByUserId(userId)) {
            if (!eligible(resume)) continue;
            linker.link(orgId, new ResumeDocEvent(ResumeDocEvent.Type.CREATED, resume.getId(), userId, loginOf(resume)));
        }
    }

    private boolean eligible(Resume resume) {
        return resume != null
            && resume.getId() != null
            && !Boolean.TRUE.equals(resume.getArchived())
            && !Boolean.FALSE.equals(resume.getShareWithOrg());
    }

    private String loginOf(Resume resume) {
        return resume.getUser() == null ? null : resume.getUser().getLogin();
    }
}
