package com.dossier.api.service.ent.resumes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.ent.mkt.MktResumeEventRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeExperienceRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.NotificationService;
import com.dossier.api.service.ResumeDocVersionService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.resume.ResumeActAs;
import com.dossier.api.service.resume.ResumeDocEvent;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** X7.4: the approved text is pinned; a change by anyone but the consultant reopens approval (audited, notified); the consultant's own edit moves the pin. */
class OrgResumeApprovalPinTest {

    static final Long ORG = 7L;
    static final Long CONSULTANT_USER = 100L;
    static final Long MARKETER_USER = 200L;

    OrgResumeRepository resumes = mock(OrgResumeRepository.class);
    MktResumeEventRepository events = mock(MktResumeEventRepository.class);
    ResumeRepository resumeRepository = mock(ResumeRepository.class);
    ResumeDocRepository docRepository = mock(ResumeDocRepository.class);
    ResumeDocVersionService versions = mock(ResumeDocVersionService.class);
    OrgMemberRepository members = mock(OrgMemberRepository.class);
    OrgAuditService audit = mock(OrgAuditService.class);
    NotificationService notifications = mock(NotificationService.class);
    OrgResumeLinkService service;
    OrgResume row;
    ResumeDoc doc;
    Resume resume;

    @BeforeEach
    void wire() {
        service = new OrgResumeLinkService(
            resumes, mock(OrgResumeExperienceRepository.class), mock(ConsultantProfileRepository.class), members, events, resumeRepository, docRepository, versions, Clock.systemUTC()
        );
        ReflectionTestUtils.setField(service, "audit", audit);
        ReflectionTestUtils.setField(service, "notifications", notifications);

        User owner = new User();
        owner.setId(CONSULTANT_USER);
        owner.setLogin("cons");
        resume = new Resume();
        resume.setId(55L);
        resume.setLabel("Cons resume");
        resume.setUser(owner);
        resume.setParsedJson("{}");
        doc = new ResumeDoc();
        doc.setDocJson("{}");
        doc.setContentHash("hash-new");
        row = new OrgResume();
        row.setId(9L);
        row.setOrgId(ORG);
        row.setMemberId(11L);
        row.setResumeId(55L);
        row.setKind("PERSONAL_SHARED");
        row.setVersionNo(3);
        row.setApprovalStatus("APPROVED");
        OrgResumeApproval.pin(row, "hash-approved");
        when(resumeRepository.findById(55L)).thenReturn(Optional.of(resume));
        when(docRepository.findByResumeIdAndUserId(55L, CONSULTANT_USER)).thenReturn(Optional.of(doc));
        when(resumes.findFirstByOrgIdAndResumeIdOrderByIdAsc(ORG, 55L)).thenReturn(Optional.of(row));
        when(resumes.saveAndFlush(any(OrgResume.class))).thenAnswer(i -> i.getArgument(0));
        when(versions.latest(anyLong(), anyLong())).thenReturn(Optional.empty());
        when(events.forResumes(eq(ORG), anyCollection())).thenReturn(List.of());
        OrgMember consultantSeat = new OrgMember();
        consultantSeat.setId(11L);
        OrgMember marketerSeat = new OrgMember();
        marketerSeat.setId(22L);
        when(members.findByOrgIdAndUserIdAndStatusIn(eq(ORG), eq(CONSULTANT_USER), any())).thenReturn(List.of(consultantSeat));
        when(members.findByOrgIdAndUserIdAndStatusIn(eq(ORG), eq(MARKETER_USER), any())).thenReturn(List.of(marketerSeat));
        OrgMember mine = new OrgMember();
        mine.setId(11L);
        mine.setOrgId(ORG);
        mine.setStatus(com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE);
        when(members.findMine(CONSULTANT_USER)).thenReturn(List.of(mine));
    }

    @AfterEach
    void clean() {
        ResumeActAs.clearThread();
    }

    private ResumeDocEvent changed() {
        return new ResumeDocEvent(ResumeDocEvent.Type.CONTENT_CHANGED, 55L, CONSULTANT_USER, "someone");
    }

    @Test
    void aMarketersEditAfterApprovalReopensItAuditsItAndNotifiesTheConsultant() {
        User owner = resume.getUser();
        ResumeActAs.run(owner, new ResumeActAs.Scope(ORG, "marketer", MARKETER_USER), () -> {
            service.on(changed());
            return null;
        });
        assertThat(row.getApprovalStatus()).isEqualTo("PENDING");
        assertThat(row.getApprovedAt()).isNull();
        assertThat(row.getKind()).isEqualTo("ORG_MANAGED");
        assertThat(row.getApprovedContentHash()).as("the pin stays as the reference for the consultant's diff").isEqualTo("hash-approved");
        verify(audit).record(eq(ORG), eq("marketer"), any(), eq(OrgResumeLinkService.AUDIT_STALE), eq(OrgAuditService.TARGET_RESUME), any(), eq("9"), any(), any(), any(), any(), eq("MEDIUM"));
        verify(notifications).publish(eq(NotificationKind.SYSTEM), eq(CONSULTANT_USER), any(NotificationService.Payload.class));
    }

    @Test
    void theConsultantsOwnEditKeepsItApprovedAndMovesThePin() {
        service.on(changed()); // no acting window: the owner is editing; the org comes from their ACTIVE seat
        assertThat(row.getApprovalStatus()).isEqualTo("APPROVED");
        assertThat(row.getApprovedContentHash()).isEqualTo("hash-new");
        verify(audit, never()).record(any(), any(), any(), eq(OrgResumeLinkService.AUDIT_STALE), any(), any(), any(), any(), any(), any(), any(), any());
        verify(notifications, never()).publish(any(), any(), any());
    }

    @Test
    void aTextChangeBehindAnApprovedStatusReadsAsStaleAndAnUnpinnedRowNever() {
        assertThat(OrgResumeApproval.isStale(row, "hash-new")).isTrue();
        assertThat(OrgResumeApproval.isStale(row, "hash-approved")).isFalse();
        OrgResume legacy = new OrgResume();
        legacy.setApprovalStatus("APPROVED");
        assertThat(OrgResumeApproval.isStale(legacy, "anything")).as("approved before pinning: nothing to compare").isFalse();
        row.setApprovalStatus("PENDING");
        assertThat(OrgResumeApproval.isStale(row, "hash-new")).as("only an APPROVED status can be stale").isFalse();
    }

    @Test
    void aSubmissionUsesTheApprovedVersionOnlyWhileItIsApprovedFreshAndTheSameVersion() {
        ResumeDocRepository docs = mock(ResumeDocRepository.class);
        when(docs.findContentHashByResumeId(55L)).thenReturn(Optional.of("hash-approved"));
        OrgResumeApproval approval = new OrgResumeApproval(docs);
        assertThat(approval.usesApprovedVersion(row, 3)).isTrue();
        assertThat(approval.usesApprovedVersion(row, 2)).as("prepared with an older version").isFalse();
        when(docs.findContentHashByResumeId(55L)).thenReturn(Optional.of("hash-new"));
        assertThat(approval.usesApprovedVersion(row, 3)).as("the document moved on: stale").isFalse();
        assertThat(approval.isUsable(row)).isFalse();
    }
}
