package com.dossier.api.service.ent.consultant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.ent.consultant.ConProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ApplicationEventRecorded;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.jobs.UrlKeys;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * The application linker (doc 60 section 5): which opportunities an application of the consultant's own links to, by whose consent, and that nothing it does
 * can ever reach the person who saved the application.
 */
class PipelineApplicationLinkerTest {

    static final Long APP_ID = 55L;

    ConWorld w;
    ConProfileRepository profiles = mock(ConProfileRepository.class);
    EnterpriseFeatureFlag flags = mock(EnterpriseFeatureFlag.class);
    ApplicationRepository applications = mock(ApplicationRepository.class);
    OrgMemberRepository members = mock(OrgMemberRepository.class);
    PipelineApplicationLinkWork work;
    PipelineApplicationLinker linker;

    @BeforeEach
    void setUp() {
        w = new ConWorld();
        when(flags.isEnabled(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, ConWorld.ORG)).thenReturn(true);
        when(profiles.findByOrgIdAndMemberId(ConWorld.ORG, ConWorld.MEMBER)).thenReturn(List.of(profile("ACTIVE")));
        work = new PipelineApplicationLinkWork(profiles, flags, w.shares, w.repo, w.opportunities, w.events, w.links, w.projection, w.audit, w.clock);
        linker = new PipelineApplicationLinker(applications, members, work);
        when(members.findMine(ConWorld.USER)).thenReturn(List.of(seat(ConWorld.ORG, ConWorld.MEMBER, OrgMemberStatus.ACTIVE)));
    }

    static ConsultantProfile profile(String status) {
        ConsultantProfile p = new ConsultantProfile();
        p.setId(ConWorld.CONSULTANT);
        p.setOrgId(ConWorld.ORG);
        p.setMemberId(ConWorld.MEMBER);
        p.setStatus(status);
        return p;
    }

    static OrgMember seat(long orgId, long memberId, OrgMemberStatus status) {
        OrgMember m = new OrgMember();
        m.setId(memberId);
        m.setOrgId(orgId);
        m.setStatus(status);
        return m;
    }

    /** The application as the owner's tracker holds it; the event says what just happened to it. */
    private void applicationEvent(ApplicationStatus status, String company, String title, String url, String ats, String ext) {
        Application a = new Application();
        a.setId(APP_ID);
        a.setStatus(status);
        a.setCompany(company);
        a.setRoleTitle(title);
        a.setJobUrl(url);
        a.setAtsPlatform(ats);
        a.setExternalJobId(ext);
        a.setAppliedAt(Instant.parse("2026-10-12T08:00:00Z"));
        when(applications.findById(APP_ID)).thenReturn(Optional.of(a));
        linker.onApplicationEvent(new ApplicationEventRecorded(ConWorld.USER, APP_ID, "STATUS", ApplicationStatus.DRAFT, status, "EXTENSION"));
    }

    private void applied(String url, String ats, String ext) {
        applicationEvent(ApplicationStatus.APPLIED, "Some Co", "Some Role", url, ats, ext);
    }

    // ---- matching ---------------------------------------------------------------------------------------------------------------

    @Test
    void anAppliedApplicationLinksTheOpportunityOfTheSamePostingByAtsAndExternalId() {
        w.opp(1, "VIEWED");
        applied("https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
        assertThat(w.opps.get(1L).o.getState()).isEqualTo("APPLIED");
        assertThat(w.opps.get(1L).o.getAppliedAt()).isEqualTo(Instant.parse("2026-10-12T08:00:00Z"));
        assertThat(w.linkStore).hasSize(1);
        var l = w.linkStore.get(0);
        assertThat(l.getSource()).isEqualTo("LINKER");
        assertThat(l.getOpportunityId()).isEqualTo(1L);
        assertThat(l.getConsultantId()).isEqualTo(ConWorld.CONSULTANT);
        assertThat(l.getPersonalApplicationId()).isEqualTo(APP_ID);
        assertThat(w.eventKinds()).containsExactly("APPLIED");
        assertThat(w.eventLog.get(0).getActorMemberId()).as("the system, never a marketer").isNull();
        verify(w.audit).record(eq(ConWorld.ORG), eq(OrgAuditService.SYSTEM_ACTOR), eq(null), eq("LINKER_OPPORTUNITY_APPLIED"), eq("OPPORTUNITY"), eq(null), eq("1"), any(), eq(null));
    }

    @Test
    void itFallsBackToTheNormalizedUrlHashWhenThereIsNoExternalId() {
        w.opp(1, "ASSIGNED");
        String url = "https://boards.greenhouse.io/acme/jobs/777?utm_source=newsletter";
        w.opps.get(1L).urlKeyHash = UrlKeys.keyHash("https://boards.greenhouse.io/acme/jobs/777", null);
        applied(url, null, null);
        assertThat(w.opps.get(1L).o.getState()).isEqualTo("APPLIED");
        assertThat(w.linkStore).hasSize(1);
    }

    @Test
    void anApplicationCreatedAlreadyAppliedAlsoLinks() {
        w.opp(1, "INTERESTED");
        Application a = new Application();
        a.setId(APP_ID);
        a.setStatus(ApplicationStatus.APPLIED);
        a.setAtsPlatform("greenhouse");
        a.setExternalJobId("101");
        when(applications.findById(APP_ID)).thenReturn(Optional.of(a));
        linker.onApplicationEvent(new ApplicationEventRecorded(ConWorld.USER, APP_ID, "CREATED", null, ApplicationStatus.APPLIED, "EXTENSION"));
        assertThat(w.opps.get(1L).o.getState()).isEqualTo("APPLIED");
        assertThat(w.opps.get(1L).o.getAppliedAt()).as("no applied date on the application: now").isEqualTo(ConWorld.NOW);
    }

    @Test
    void closedDeclinedAndAlreadyAppliedOpportunitiesAreLeftAlone() {
        for (String state : List.of("DECLINED", "CLOSED", "APPLIED")) {
            w.opps.clear();
            w.linkStore.clear();
            w.opp(1, state);
            applied("https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
            assertThat(w.opps.get(1L).o.getState()).as(state).isEqualTo(state);
            assertThat(w.linkStore).as(state).isEmpty();
        }
    }

    @Test
    void anotherConsultantsOpportunityOfTheSamePostingIsNeverTouched() {
        w.opp(1, "ASSIGNED").consultantId = ConWorld.OTHER_CONSULTANT;
        applied("https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
        assertThat(w.opps.get(1L).o.getState()).isEqualTo("ASSIGNED");
        assertThat(w.linkStore).isEmpty();
    }

    @Test
    void itIsIdempotentOnTheLiveLinkKey() {
        w.opp(1, "ASSIGNED");
        applied("https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
        applied("https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
        assertThat(w.linkStore).hasSize(1);
        assertThat(w.eventKinds()).containsExactly("APPLIED");
        verify(w.audit, times(1)).record(eq(ConWorld.ORG), any(), any(), eq("LINKER_OPPORTUNITY_APPLIED"), any(), any(), any(), any(), any());
    }

    @Test
    void anOpportunityThatAlreadyHasALiveLinkIsNotLinkedAgain() {
        w.opp(1, "INTERESTED");
        w.liveLink(1, 99); // another application of the consultant is linked already (race with the consultant's own click)
        applied("https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
        assertThat(w.linkStore).hasSize(1);
        assertThat(w.linkStore.get(0).getPersonalApplicationId()).isEqualTo(99L);
    }

    @Test
    void aSavedOrDraftOrReviewedApplicationLinksNothing() {
        w.opp(1, "ASSIGNED");
        for (ApplicationStatus s : List.of(ApplicationStatus.SAVED, ApplicationStatus.DRAFT, ApplicationStatus.IN_REVIEW, ApplicationStatus.INTERVIEW, ApplicationStatus.OFFER)) {
            applicationEvent(s, "Some Co", "Some Role", "https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
        }
        assertThat(w.opps.get(1L).o.getState()).isEqualTo("ASSIGNED");
        assertThat(w.linkStore).isEmpty();
    }

    // ---- consent ----------------------------------------------------------------------------------------------------------------

    @Test
    void noneMeansNoLinkNoProjectionNoEventAndNoSuggestion() {
        w.consent = ShareScope.NONE;
        w.opp(1, "ASSIGNED");
        applied("https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
        applicationEvent(ApplicationStatus.APPLIED, "Acme Corp", "Java Developer", "https://elsewhere.example.com/j/1", null, null);
        assertThat(w.opps.get(1L).o.getState()).isEqualTo("ASSIGNED");
        assertThat(w.linkStore).isEmpty();
        assertThat(w.eventLog).isEmpty();
        verifyNoInteractions(w.projection);
        verify(w.audit, never()).record(anyLong(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void summaryLinksTheOpportunityButWritesNoProjection() {
        w.consent = ShareScope.SUMMARY;
        w.opp(1, "ASSIGNED");
        applied("https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
        assertThat(w.opps.get(1L).o.getState()).isEqualTo("APPLIED");
        assertThat(w.linkStore.get(0).getTalentApplicationId()).isNull();
        verifyNoInteractions(w.projection);
    }

    @Test
    void fullAlsoWritesTheSystemOwnedProjection() {
        w.consent = ShareScope.FULL;
        w.opp(1, "ASSIGNED");
        applied("https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
        assertThat(w.linkStore.get(0).getTalentApplicationId()).isEqualTo(900L);
        verify(w.projection).upsert(eq(ConWorld.ORG), eq(1L), eq(101L), eq(ConWorld.CONSULTANT), eq(ConWorld.MARKETER), eq(APP_ID), any());
    }

    // ---- an application that was linked already ------------------------------------------------------------------------------

    @Test
    void aRejectedOrWithdrawnLinkedApplicationClosesTheOpportunity() {
        for (ApplicationStatus ended : List.of(ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN)) {
            w.opps.clear();
            w.linkStore.clear();
            w.eventLog.clear();
            w.opp(1, "APPLIED");
            w.liveLink(1, APP_ID);
            applicationEvent(ended, "Some Co", "Some Role", null, null, null);
            var o = w.opps.get(1L).o;
            assertThat(o.getState()).as(ended.name()).isEqualTo("CLOSED");
            assertThat(o.getClosedReason()).isEqualTo("APPLICATION_TERMINAL");
            assertThat(o.getClosedAt()).isEqualTo(ConWorld.NOW);
            assertThat(w.eventKinds()).containsExactly("CLOSED");
        }
        verify(w.projection, times(2)).mirror(eq(ConWorld.ORG), eq(APP_ID), any(), eq("EXTENSION"));
    }

    @Test
    void aTerminalApplicationUnderSummaryClosesButDoesNotMirrorAndUnderNoneDoesNothing() {
        w.consent = ShareScope.SUMMARY;
        w.opp(1, "APPLIED");
        w.liveLink(1, APP_ID);
        applicationEvent(ApplicationStatus.REJECTED, "Some Co", "Some Role", null, null, null);
        assertThat(w.opps.get(1L).o.getState()).isEqualTo("CLOSED");
        verifyNoInteractions(w.projection);

        w.consent = ShareScope.NONE;
        w.opp(2, "APPLIED");
        w.liveLink(2, 56);
        Application a = new Application();
        a.setId(56L);
        a.setStatus(ApplicationStatus.REJECTED);
        when(applications.findById(56L)).thenReturn(Optional.of(a));
        linker.onApplicationEvent(new ApplicationEventRecorded(ConWorld.USER, 56L, "STATUS", ApplicationStatus.APPLIED, ApplicationStatus.REJECTED, "WEB"));
        assertThat(w.opps.get(2L).o.getState()).isEqualTo("APPLIED");
    }

    @Test
    void anOfferKeepsTheOpportunityAppliedAndFollowsTheStageAtFull() {
        w.opp(1, "APPLIED");
        w.liveLink(1, APP_ID);
        applicationEvent(ApplicationStatus.OFFER, "Some Co", "Some Role", null, null, null);
        assertThat(w.opps.get(1L).o.getState()).isEqualTo("APPLIED");
        verify(w.projection).mirror(ConWorld.ORG, APP_ID, ApplicationStatus.OFFER, "EXTENSION");
    }

    @Test
    void aStageThatAMailMovedIsMirroredWithTheSourceInboxAndNothingElseAboutTheMail() {
        w.opp(1, "APPLIED");
        w.liveLink(1, APP_ID);
        Application a = new Application();
        a.setId(APP_ID);
        a.setStatus(ApplicationStatus.INTERVIEW);
        a.setCompany("Some Co");
        a.setRoleTitle("Some Role");
        when(applications.findById(APP_ID)).thenReturn(Optional.of(a));
        linker.onApplicationEvent(new ApplicationEventRecorded(ConWorld.USER, APP_ID, "STATUS", ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW, "INBOX"));
        // the event's source label is all that travels: the mirror gets the stage and the word INBOX, never a subject, sender or snippet
        verify(w.projection).mirror(ConWorld.ORG, APP_ID, ApplicationStatus.INTERVIEW, "INBOX");
    }

    // ---- company + title is a suggestion only ----------------------------------------------------------------------------------

    @Test
    void companyAndTitleOnlySuggestsOnceAndNeverLinks() {
        w.opp(1, "ASSIGNED"); // Java Developer at Acme Corp
        applicationEvent(ApplicationStatus.APPLIED, "ACME, Inc.", "Java Developer (Remote)", "https://careers.acme.example.com/apply/9", null, null);
        applicationEvent(ApplicationStatus.APPLIED, "ACME, Inc.", "Java Developer (Remote)", "https://careers.acme.example.com/apply/9", null, null);
        assertThat(w.opps.get(1L).o.getState()).isEqualTo("ASSIGNED");
        assertThat(w.linkStore).isEmpty();
        assertThat(w.eventKinds()).containsExactly("LINK_SUGGESTED");
        verifyNoInteractions(w.projection);
    }

    @Test
    void aDifferentCompanyOrTitleSuggestsNothing() {
        w.opp(1, "ASSIGNED");
        applicationEvent(ApplicationStatus.APPLIED, "Globex", "Java Developer", "https://x.example.com/1", null, null);
        applicationEvent(ApplicationStatus.APPLIED, "Acme Corp", "Python Developer", "https://x.example.com/1", null, null);
        applicationEvent(ApplicationStatus.APPLIED, null, null, "https://x.example.com/1", null, null);
        assertThat(w.eventLog).isEmpty();
    }

    // ---- who is a consultant -----------------------------------------------------------------------------------------------------

    @Test
    void nothingHappensWhenTheFlagIsOffOrTheProfileIsMissingInactiveOrDoubled() {
        w.opp(1, "ASSIGNED");
        when(flags.isEnabled(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, ConWorld.ORG)).thenReturn(false);
        applied("https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
        when(flags.isEnabled(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, ConWorld.ORG)).thenReturn(true);
        when(profiles.findByOrgIdAndMemberId(ConWorld.ORG, ConWorld.MEMBER)).thenReturn(List.of());
        applied("https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
        when(profiles.findByOrgIdAndMemberId(ConWorld.ORG, ConWorld.MEMBER)).thenReturn(List.of(profile("INACTIVE")));
        applied("https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
        when(profiles.findByOrgIdAndMemberId(ConWorld.ORG, ConWorld.MEMBER)).thenReturn(List.of(profile("ACTIVE"), profile("ACTIVE")));
        applied("https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
        assertThat(w.opps.get(1L).o.getState()).isEqualTo("ASSIGNED");
        assertThat(w.linkStore).isEmpty();
    }

    @Test
    void onlyActiveSeatsAreFollowedAndAnOrganizationOnce() {
        w.opp(1, "ASSIGNED");
        when(members.findMine(ConWorld.USER)).thenReturn(List.of(
            seat(ConWorld.ORG, 71L, OrgMemberStatus.LEFT), seat(ConWorld.ORG, ConWorld.MEMBER, OrgMemberStatus.ACTIVE), seat(ConWorld.ORG, 72L, OrgMemberStatus.ACTIVE), seat(9L, 90L, OrgMemberStatus.SUSPENDED)
        ));
        applied("https://boards.greenhouse.io/acme/jobs/101", "greenhouse", "101");
        assertThat(w.linkStore).hasSize(1);
        verify(profiles, never()).findByOrgIdAndMemberId(eq(9L), anyLong());
        verify(profiles, never()).findByOrgIdAndMemberId(ConWorld.ORG, 71L);
    }

    // ---- it never fails the user's write ---------------------------------------------------------------------------------------

    @Test
    void anythingThatGoesWrongIsLoggedAndSwallowed() {
        ApplicationEventRecorded event = new ApplicationEventRecorded(ConWorld.USER, APP_ID, "STATUS", null, ApplicationStatus.APPLIED, "EXTENSION");
        when(applications.findById(APP_ID)).thenThrow(new IllegalStateException("db down"));
        assertThatCode(() -> linker.onApplicationEvent(event)).doesNotThrowAnyException();

        Application a = new Application();
        a.setId(APP_ID);
        a.setStatus(ApplicationStatus.APPLIED);
        org.mockito.Mockito.doReturn(Optional.of(a)).when(applications).findById(APP_ID);
        doThrow(new IllegalStateException("db down")).when(members).findMine(ConWorld.USER);
        assertThatCode(() -> linker.onApplicationEvent(event)).doesNotThrowAnyException();
    }

    @Test
    void oneOrganizationFailingDoesNotStopTheNext() {
        PipelineApplicationLinkWork failing = mock(PipelineApplicationLinkWork.class);
        Application a = new Application();
        a.setId(APP_ID);
        a.setStatus(ApplicationStatus.APPLIED);
        when(applications.findById(APP_ID)).thenReturn(Optional.of(a));
        when(members.findMine(ConWorld.USER)).thenReturn(List.of(seat(1L, 10L, OrgMemberStatus.ACTIVE), seat(2L, 20L, OrgMemberStatus.ACTIVE)));
        doThrow(new IllegalStateException("org 1 broke")).when(failing).process(eq(1L), eq(10L), any());
        PipelineApplicationLinker l = new PipelineApplicationLinker(applications, members, failing);
        assertThatCode(() -> l.onApplicationEvent(new ApplicationEventRecorded(ConWorld.USER, APP_ID, "STATUS", null, ApplicationStatus.APPLIED, "EXTENSION"))).doesNotThrowAnyException();
        verify(failing).process(eq(2L), eq(20L), any());
    }

    @Test
    void aMissingApplicationIsIgnored() {
        when(applications.findById(APP_ID)).thenReturn(Optional.empty());
        linker.onApplicationEvent(new ApplicationEventRecorded(ConWorld.USER, APP_ID, "STATUS", null, ApplicationStatus.APPLIED, "EXTENSION"));
        verifyNoInteractions(members);
    }

    // ---- wiring -------------------------------------------------------------------------------------------------------------------

    @Test
    void theListenerRunsAfterCommitOnlyForTheKindsThatMatter() throws Exception {
        TransactionalEventListener l = PipelineApplicationLinker.class.getMethod("onApplicationEvent", ApplicationEventRecorded.class).getAnnotation(TransactionalEventListener.class);
        assertThat(l).isNotNull();
        assertThat(l.phase()).isEqualTo(TransactionPhase.AFTER_COMMIT);
        assertThat(l.condition()).isEqualTo("#event.relevant()");
        assertThat(PipelineApplicationLinkWork.class.getMethod("process", Long.class, Long.class, PipelineApplicationLinkWork.Facts.class)
            .getAnnotation(org.springframework.transaction.annotation.Transactional.class).propagation()).isEqualTo(org.springframework.transaction.annotation.Propagation.REQUIRES_NEW);
    }

    @Test
    void onlyCreationsAndStatusChangesWithAStatusAreRelevant() {
        assertThat(new ApplicationEventRecorded(1L, 2L, "CREATED", null, ApplicationStatus.APPLIED, "WEB").relevant()).isTrue();
        assertThat(new ApplicationEventRecorded(1L, 2L, "STATUS", ApplicationStatus.SAVED, ApplicationStatus.APPLIED, "WEB").relevant()).isTrue();
        assertThat(new ApplicationEventRecorded(1L, 2L, "NOTE", null, null, "WEB").relevant()).isFalse();
        assertThat(new ApplicationEventRecorded(1L, 2L, "INTERVIEW", null, null, "WEB").relevant()).isFalse();
        assertThat(new ApplicationEventRecorded(1L, 2L, "STATUS", null, null, "WEB").relevant()).isFalse();
        assertThat(new ApplicationEventRecorded(null, 2L, "STATUS", null, ApplicationStatus.APPLIED, "WEB").relevant()).isFalse();
    }
}
