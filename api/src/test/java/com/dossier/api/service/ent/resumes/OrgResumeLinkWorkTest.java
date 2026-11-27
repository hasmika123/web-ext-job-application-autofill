package com.dossier.api.service.ent.resumes;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.resume.ResumeDocEvent;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class OrgResumeLinkWorkTest {

    static final Long ORG = 7L;
    static final Long MEMBER = 11L;
    static final Long USER = 100L;
    static final Long RESUME = 55L;

    DataShareService shares = mock(DataShareService.class);
    OrgMemberRepository members = mock(OrgMemberRepository.class);
    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    ResumeRepository resumes = mock(ResumeRepository.class);
    OrgResumeLinkService linker = mock(OrgResumeLinkService.class);
    OrgResumeLinkWork work;

    @BeforeEach
    void setUp() {
        work = new OrgResumeLinkWork(shares, members, consultants, resumes, linker);
    }

    @Test
    void fullConsentReplaysOnlyLiveResumesThatAreSharedWithTheOrganization() {
        when(members.findByOrgIdAndId(ORG, MEMBER)).thenReturn(Optional.of(seat()));
        when(shares.scopeOf(ORG, MEMBER)).thenReturn(ShareScope.FULL);
        when(consultants.findByOrgIdAndMemberId(ORG, MEMBER)).thenReturn(Optional.of(consultant()));
        Resume shared = resume(RESUME, false, true);
        Resume archived = resume(56L, true, true);
        Resume privateResume = resume(57L, false, false);
        when(resumes.findByUserId(USER)).thenReturn(List.of(shared, archived, privateResume));

        work.replay(ORG, MEMBER, USER);

        verify(linker).link(
            eq(ORG),
            argThat((ResumeDocEvent event) -> event.type() == ResumeDocEvent.Type.CREATED && RESUME.equals(event.resumeId()) && USER.equals(event.ownerUserId()))
        );
        verify(linker, never()).link(eq(ORG), argThat(event -> event.resumeId().equals(56L)));
        verify(linker, never()).link(eq(ORG), argThat(event -> event.resumeId().equals(57L)));
    }

    @Test
    void summaryConsentDoesNotReadOrLinkPersonalResumes() {
        when(members.findByOrgIdAndId(ORG, MEMBER)).thenReturn(Optional.of(seat()));
        when(shares.scopeOf(ORG, MEMBER)).thenReturn(ShareScope.SUMMARY);

        work.replay(ORG, MEMBER, USER);

        verify(resumes, never()).findByUserId(USER);
        verify(linker, never()).link(eq(ORG), org.mockito.ArgumentMatchers.any(ResumeDocEvent.class));
    }

    @Test
    void aNewResumeReplaysAcrossEveryActiveOrganizationSeatWithFullConsent() {
        when(members.findMine(USER)).thenReturn(List.of(seat()));
        when(members.findByOrgIdAndId(ORG, MEMBER)).thenReturn(Optional.of(seat()));
        when(shares.scopeOf(ORG, MEMBER)).thenReturn(ShareScope.FULL);
        when(consultants.findByOrgIdAndMemberId(ORG, MEMBER)).thenReturn(Optional.of(consultant()));
        when(resumes.findByUserId(USER)).thenReturn(List.of(resume(RESUME, false, true)));

        work.replayCreated(new ResumeDocEvent(ResumeDocEvent.Type.CREATED, RESUME, USER, "consultant"));

        verify(linker).link(
            eq(ORG),
            argThat((ResumeDocEvent event) -> RESUME.equals(event.resumeId()) && USER.equals(event.ownerUserId()))
        );
    }

    private static OrgMember seat() {
        OrgMember seat = new OrgMember();
        seat.setId(MEMBER);
        seat.setOrgId(ORG);
        seat.setUserId(USER);
        seat.setStatus(OrgMemberStatus.ACTIVE);
        return seat;
    }

    private static ConsultantProfile consultant() {
        ConsultantProfile consultant = new ConsultantProfile();
        consultant.setId(900L);
        consultant.setOrgId(ORG);
        consultant.setMemberId(MEMBER);
        consultant.setStatus("ACTIVE");
        return consultant;
    }

    private static Resume resume(Long id, boolean archived, boolean shared) {
        User user = new User();
        user.setId(USER);
        user.setLogin("consultant");
        Resume resume = new Resume();
        resume.setId(id);
        resume.setUser(user);
        resume.setArchived(archived);
        resume.setShareWithOrg(shared);
        return resume;
    }
}
