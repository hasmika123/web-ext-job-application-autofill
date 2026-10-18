package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeAccess;
import com.dossier.api.domain.ResumeViewEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.repository.ResumeAccessRepository;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.ResumeViewEventRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ResumeAccessService.Via;
import com.dossier.api.service.dto.ResumeAccessDTOs.SharedResumeDTO;
import com.dossier.api.service.dto.ResumeDocDTO;
import com.dossier.api.service.ent.resumes.ConsultantShareLinkPause;
import com.dossier.api.service.resume.OrgResumeSharing;
import com.dossier.api.service.storage.FileStorage;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who can read a resume (R3.11, DESIGN 8.7): the owner, a person with a live USER grant, a paired marketer under the
 * member's FULL consent, and nobody else. Pure logic over mocked repositories.
 */
class ResumeAccessServiceTest {

    private static final Long RESUME = 11L;
    private static final Instant NOW = Instant.now();

    private ResumeRepository resumes;
    private ResumeAccessRepository grants;
    private ResumeViewEventRepository views;
    private ResumeDocService docs;
    private UserRepository users;
    private ObjectProvider<OrgResumeSharing> orgProvider;
    private OrgResumeSharing org;
    private ResumeAccessService service;
    private Resume resume;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        resumes = mock(ResumeRepository.class);
        grants = mock(ResumeAccessRepository.class);
        views = mock(ResumeViewEventRepository.class);
        docs = mock(ResumeDocService.class);
        users = mock(UserRepository.class);
        orgProvider = mock(ObjectProvider.class);
        org = mock(OrgResumeSharing.class);
        when(views.saveAndFlush(any(ResumeViewEvent.class))).thenAnswer(inv -> inv.getArgument(0));
        service = new ResumeAccessService(
            resumes,
            mock(ResumeDocRepository.class),
            grants,
            views,
            users,
            mock(ResumeBuilderSettings.class),
            mock(ResumeActors.class),
            mock(FileStorage.class),
            docs,
            orgProvider,
            "https://kiwiply.com/"
        );
        User owner = user(1L, "owner");
        resume = new Resume();
        resume.setId(RESUME);
        resume.setLabel("Backend");
        resume.setKind(ResumeKind.BUILT);
        resume.setUser(owner);
        when(resumes.findById(RESUME)).thenReturn(Optional.of(resume));
    }

    @AfterEach
    void clearSecurity() {
        SecurityContextHolder.clearContext();
    }

    private static User user(Long id, String login) {
        User u = new User();
        u.setId(id);
        u.setLogin(login);
        return u;
    }

    private static ResumeAccess grant(Long id, String login, Instant expiresAt, Instant revokedAt) {
        ResumeAccess a = new ResumeAccess();
        a.setId(id);
        a.setResumeId(RESUME);
        a.setSubjectType(ResumeAccess.SUBJECT_USER);
        a.setSubjectLogin(login);
        a.setExpiresAt(expiresAt);
        a.setRevokedAt(revokedAt);
        return a;
    }

    private void grantsReturn(ResumeAccess... rows) {
        when(grants.findByResumeIdAndSubjectTypeAndSubjectLoginAndRevokedAtIsNull(eq(RESUME), eq("USER"), any())).thenReturn(List.of(rows));
    }

    private void signedInAs(String login) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(login, "n/a", List.of()));
    }

    // ---- owner and strangers --------------------------------------------------------------------

    @Test
    void theOwnerCanAlwaysRead() {
        assertThat(service.access(RESUME, "owner")).contains(new ResumeAccessService.Access(Via.OWNER, null));
        assertThat(service.canRead(RESUME, "owner")).isTrue();
    }

    @Test
    void aStrangerCannotReadAndAnUnknownResumeIsTheSameAnswer() {
        grantsReturn();
        assertThat(service.canRead(RESUME, "stranger")).isFalse();
        assertThat(service.canRead(999L, "stranger")).isFalse();
        assertThat(service.canRead(null, "stranger")).isFalse();
        assertThat(service.canRead(RESUME, null)).isFalse();
        assertThat(service.canRead(RESUME, " ")).isFalse();
    }

    // ---- grants: active, expired, revoked ---------------------------------------------------------

    @Test
    void anActiveUserGrantCanRead() {
        grantsReturn(grant(5L, "friend", NOW.plus(1, ChronoUnit.DAYS), null));
        assertThat(service.access(RESUME, "friend")).contains(new ResumeAccessService.Access(Via.USER, 5L));
    }

    @Test
    void aGrantWithNoExpiryNeverLapses() {
        grantsReturn(grant(5L, "friend", null, null));
        assertThat(service.canRead(RESUME, "friend")).isTrue();
    }

    @Test
    void anExpiredGrantCannotRead() {
        grantsReturn(grant(5L, "friend", NOW.minus(1, ChronoUnit.SECONDS), null));
        assertThat(service.canRead(RESUME, "friend")).isFalse();
    }

    @Test
    void aRevokedGrantCannotRead() {
        // the repository already filters revoked rows out; a row that slips through is still refused by isActive
        grantsReturn(grant(5L, "friend", null, NOW.minus(1, ChronoUnit.MINUTES)));
        assertThat(service.canRead(RESUME, "friend")).isFalse();
    }

    @Test
    void oneLiveGrantAmongDeadOnesIsEnough() {
        grantsReturn(grant(4L, "friend", NOW.minus(1, ChronoUnit.DAYS), null), grant(6L, "friend", null, null));
        assertThat(service.access(RESUME, "friend")).contains(new ResumeAccessService.Access(Via.USER, 6L));
    }

    // ---- paused by the organization (consultant sharing off): kept, but opens nothing ---------------

    private ConsultantShareLinkPause pausedBy(boolean paused) {
        ConsultantShareLinkPause pause = mock(ConsultantShareLinkPause.class);
        when(pause.isPaused(RESUME)).thenReturn(paused);
        ReflectionTestUtils.setField(service, "sharePause", pause);
        return pause;
    }

    @Test
    void aPausedUserGrantCannotReadAndComesBackWhenTheOrganizationAllowsSharingAgain() {
        grantsReturn(grant(5L, "friend", null, null));
        ConsultantShareLinkPause pause = pausedBy(true);
        assertThat(service.canRead(RESUME, "friend")).isFalse();
        assertThat(service.canRead(RESUME, "owner")).as("the owner is never paused").isTrue();
        when(pause.isPaused(RESUME)).thenReturn(false);
        assertThat(service.access(RESUME, "friend")).contains(new ResumeAccessService.Access(Via.USER, 5L));
    }

    @Test
    void aPausedLinkIsExactlyAnUnknownLinkAndWritesNoViewEvent() {
        String token = "T".repeat(32);
        ResumeBuilderSettings settings = mock(ResumeBuilderSettings.class);
        when(settings.getBool(ResumeBuilderSettingKeys.FEATURE_SHARE_LINKS)).thenReturn(true);
        ReflectionTestUtils.setField(service, "settings", settings);
        ResumeAccess link = new ResumeAccess();
        link.setId(8L);
        link.setResumeId(RESUME);
        link.setSubjectType(ResumeAccess.SUBJECT_LINK);
        link.setToken(token);
        link.setAllowDownload(true);
        when(grants.findByToken(token)).thenReturn(Optional.of(link));
        ConsultantShareLinkPause pause = pausedBy(true);

        assertThat(service.linkExists(token)).isFalse();
        assertThatThrownBy(() -> service.publicView(token)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
        assertThatThrownBy(() -> service.publicPdf(token)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
        verify(views, never()).saveAndFlush(any(ResumeViewEvent.class));

        when(pause.isPaused(RESUME)).thenReturn(false);
        assertThat(service.linkExists(token)).as("restored").isTrue();
    }

    // ---- the organisation: only under FULL consent, only with the flag ------------------------------

    @Test
    void withoutTheOrgAreaNoOrgEverReads() {
        grantsReturn();
        when(orgProvider.getIfAvailable()).thenReturn(null);
        assertThat(service.canRead(RESUME, "marketer")).isFalse();
        assertThat(service.summary(resume).orgScope()).isNull();
    }

    @Test
    void aPairedMarketerReadsOnlyUnderFullConsentAndTheResumeFlag() {
        grantsReturn();
        when(orgProvider.getIfAvailable()).thenReturn(org);

        when(org.isFullPairedViewer("owner", "marketer")).thenReturn(true);
        resume.setShareWithOrg(true);
        assertThat(service.access(RESUME, "marketer")).contains(new ResumeAccessService.Access(Via.ORG, null));

        // the member excluded this resume
        resume.setShareWithOrg(false);
        assertThat(service.canRead(RESUME, "marketer")).isFalse();

        // the member withdrew FULL (scope NONE or SUMMARY): the seam says this viewer is not full-paired
        resume.setShareWithOrg(true);
        when(org.isFullPairedViewer("owner", "marketer")).thenReturn(false);
        assertThat(service.canRead(RESUME, "marketer")).isFalse();

        // a different org member is not the paired marketer
        when(org.isFullPairedViewer("owner", "colleague")).thenReturn(false);
        assertThat(service.canRead(RESUME, "colleague")).isFalse();
    }

    @Test
    void summaryReportsTheOrgScopeAndPairedPerson() {
        when(orgProvider.getIfAvailable()).thenReturn(org);
        when(org.pairingOf("owner")).thenReturn(Optional.of(new OrgResumeSharing.Pairing("SUMMARY", "Rahul")));
        when(grants.findByResumeIdAndRevokedAtIsNullOrderByCreatedAtAscIdAsc(RESUME)).thenReturn(List.of());
        var s = service.summary(resume);
        assertThat(s.orgScope()).isEqualTo("SUMMARY");
        assertThat(s.orgPaired()).isEqualTo("Rahul");
        assertThat(s.people()).isZero();
    }

    @Test
    void summaryCountsOnlyLiveGrantsAndLinkViews() {
        ResumeAccess live = grant(1L, "friend", null, null);
        ResumeAccess expired = grant(2L, "late", NOW.minus(1, ChronoUnit.DAYS), null);
        ResumeAccess link = grant(3L, null, null, null);
        link.setSubjectType(ResumeAccess.SUBJECT_LINK);
        link.setViewCount(7);
        ResumeAccess deadLink = grant(4L, null, NOW.minus(1, ChronoUnit.HOURS), null);
        deadLink.setSubjectType(ResumeAccess.SUBJECT_LINK);
        deadLink.setViewCount(100);
        when(grants.findByResumeIdAndRevokedAtIsNullOrderByCreatedAtAscIdAsc(RESUME)).thenReturn(List.of(live, expired, link, deadLink));
        var s = service.summary(resume);
        assertThat(s.people()).isEqualTo(1);
        assertThat(s.links()).isEqualTo(1);
        assertThat(s.linkViews()).isEqualTo(7);
    }

    @Test
    void sharedWithMeListsOrgResumesOnlyWhenBuiltIncludedAndNotArchived() {
        signedInAs("marketer");
        when(grants.findBySubjectTypeAndSubjectLoginAndRevokedAtIsNull("USER", "marketer")).thenReturn(List.of());
        when(orgProvider.getIfAvailable()).thenReturn(org);
        when(org.ownersSharingFullWith("marketer")).thenReturn(List.of("owner"));
        User owner = user(1L, "owner");
        when(users.findOneByLogin("owner")).thenReturn(Optional.of(owner));
        Resume included = built(21L, "Included", owner);
        Resume excluded = built(22L, "Excluded", owner);
        excluded.setShareWithOrg(false);
        Resume archived = built(23L, "Archived", owner);
        archived.setArchived(true);
        Resume uploaded = built(24L, "A file", owner);
        uploaded.setKind(ResumeKind.UPLOADED);
        when(resumes.findByUserId(1L)).thenReturn(List.of(included, excluded, archived, uploaded));

        List<SharedResumeDTO> shared = service.sharedWithMe();
        assertThat(shared).extracting(SharedResumeDTO::resumeId).containsExactly(21L);
        assertThat(shared.get(0).via()).isEqualTo("ORG");
    }

    private static Resume built(Long id, String label, User owner) {
        Resume r = new Resume();
        r.setId(id);
        r.setLabel(label);
        r.setKind(ResumeKind.BUILT);
        r.setUser(owner);
        return r;
    }

    // ---- reading writes the audit -----------------------------------------------------------------------

    @Test
    void anOrgReadIsAuditedInTheViewLogAndTheOrgAudit() {
        signedInAs("marketer");
        grantsReturn();
        when(orgProvider.getIfAvailable()).thenReturn(org);
        when(org.isFullPairedViewer("owner", "marketer")).thenReturn(true);
        ResumeDocDTO dto = new ResumeDocDTO();
        dto.setDoc(new ObjectMapper().createObjectNode());
        when(docs.getForViewer(RESUME)).thenReturn(dto);

        service.sharedDoc(RESUME);

        ArgumentCaptor<ResumeViewEvent> event = ArgumentCaptor.forClass(ResumeViewEvent.class);
        verify(views).saveAndFlush(event.capture());
        assertThat(event.getValue().getViewerKind()).isEqualTo("ORG");
        assertThat(event.getValue().getViewerLogin()).isEqualTo("marketer");
        assertThat(event.getValue().getWhat()).isEqualTo("PAGE");
        assertThat(event.getValue().getOwnerUserId()).isEqualTo(1L);
        verify(org).auditFullRead("owner", "marketer", RESUME);
    }

    @Test
    void aStrangerReadingIsRefusedWithA404AndNothingIsWritten() {
        signedInAs("stranger");
        grantsReturn();
        when(orgProvider.getIfAvailable()).thenReturn(null);
        try {
            service.sharedDoc(RESUME);
            throw new AssertionError("expected a 404");
        } catch (ResponseStatusException e) {
            assertThat(e.getStatusCode().value()).isEqualTo(404);
        }
        verify(views, never()).saveAndFlush(any());
        verify(docs, never()).getForViewer(anyLong());
    }

    @Test
    void aLinkViewIsAnonymousAndCountsOnTheGrant() {
        // recordView is the one writer for every kind: a LINK event drops any login it was handed
        ResumeAccess link = grant(9L, null, null, null);
        link.setSubjectType(ResumeAccess.SUBJECT_LINK);
        service.recordView(resume, ResumeViewEvent.KIND_LINK, "should-be-dropped", link.getId(), ResumeViewEvent.WHAT_PAGE);
        ArgumentCaptor<ResumeViewEvent> event = ArgumentCaptor.forClass(ResumeViewEvent.class);
        verify(views).saveAndFlush(event.capture());
        assertThat(event.getValue().getViewerLogin()).isNull();
        verify(grants).countView(eq(9L), any());
        // a PDF fetch is a view event too, but not another "view" on the counter
        service.recordView(resume, ResumeViewEvent.KIND_LINK, null, 9L, ResumeViewEvent.WHAT_PDF);
        verify(grants).countView(eq(9L), any()); // still exactly once
    }
}
