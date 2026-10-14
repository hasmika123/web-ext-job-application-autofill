package com.dossier.api.service.ent.consultant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ent.mkt.MktPipelineApplicationLink;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContentException;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageRequest;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

/** The lifecycle matrix of doc 60 section 3 from the consultant's side, against an in-memory world ({@link ConWorld}). */
class ConOpportunityServiceTest {

    ConWorld w;
    ConOpportunityService service;

    @BeforeEach
    void setUp() {
        w = new ConWorld();
        service = w.service();
    }

    private static String code(Throwable t) {
        return ((OrgException) t).getCode();
    }

    // ---- read ---------------------------------------------------------------------------------------------------------------

    @Test
    void getBuildsTheDtoFromTheRowTheJobFactoryAndTheComputedActions() {
        w.opp(1, "ASSIGNED");
        var skill = new com.dossier.api.domain.ent.talent.RequirementSkill();
        skill.setId(1L);
        skill.setRequirementId(101L);
        skill.setSkill("Java");
        skill.setSortOrder(0);
        w.skillRows = List.of(skill);
        ConOpportunityDTO dto = service.get(w.me, 1L);
        assertThat(dto.id()).isEqualTo(1L);
        assertThat(dto.state()).isEqualTo("ASSIGNED");
        assertThat(dto.marketerNote()).isEqualTo("Strong fit for Anika");
        assertThat(dto.job().title()).isEqualTo("Java Developer");
        assertThat(dto.job().company()).isEqualTo("Acme Corp");
        assertThat(dto.job().payLabel()).isEqualTo("$70-80/hr");
        assertThat(dto.job().employmentType()).isEqualTo("CONTRACT");
        assertThat(dto.job().skills()).containsExactly("Java");
        assertThat(dto.allowedActions()).containsExactly("VIEWED", "INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED", "LINK");
        assertThat(dto.linkedApplicationId()).isNull();
        assertThat(dto.assignedBy().memberId()).isEqualTo(ConWorld.MARKETER);
    }

    @Test
    void anotherConsultantsOpportunityIsA404ForEveryRead() {
        w.opp(2, "ASSIGNED").consultantId = ConWorld.OTHER_CONSULTANT;
        assertThatThrownBy(() -> service.get(w.me, 2L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.get(w.me, 999L)).isInstanceOf(OrgNotFoundException.class);
        assertThat(service.list(w.me, null, null, null, null, null, null).items()).isEmpty();
    }

    @Test
    void listPagesFiltersByStateAndCapsTheSize() {
        for (long i = 1; i <= 5; i++) w.opp(i, i % 2 == 0 ? "DECLINED" : "ASSIGNED");
        ConOpportunityDTO.ListResponse all = service.list(w.me, null, null, null, null, null, null);
        assertThat(all.total()).isEqualTo(5);
        assertThat(all.items()).extracting(ConOpportunityDTO::id).containsExactly(5L, 4L, 3L, 2L, 1L); // newest first
        ConOpportunityDTO.ListResponse open = service.list(w.me, "assigned, viewed", null, null, null, null, null);
        assertThat(open.total()).isEqualTo(3);
        assertThat(open.items()).extracting(ConOpportunityDTO::id).containsExactly(5L, 3L, 1L);
        ConOpportunityDTO.ListResponse second = service.list(w.me, null, 1, 2, null, null, null);
        assertThat(second.items()).extracting(ConOpportunityDTO::id).containsExactly(3L, 2L);
        assertThat(second.total()).isEqualTo(5);
    }

    @Test
    void theSizeDefaultsTo20AndIsCappedAt100() {
        service.list(w.me, null, null, null, null, null, null);
        service.list(w.me, null, 0, 5000, null, null, null);
        service.list(w.me, null, -4, 0, null, null, null);
        ArgumentCaptor<org.springframework.data.domain.Pageable> page = ArgumentCaptor.forClass(org.springframework.data.domain.Pageable.class);
        verify(w.repo, org.mockito.Mockito.times(3)).findRows(eq(ConWorld.ORG), eq(ConWorld.CONSULTANT), any(), page.capture());
        assertThat(page.getAllValues()).containsExactly(PageRequest.of(0, 20), PageRequest.of(0, 100), PageRequest.of(0, 1));
    }

    @Test
    void anUnknownStateIsA400() {
        assertThatThrownBy(() -> service.list(w.me, "ASSIGNED,BOGUS", null, null, null, null, null)).isInstanceOf(OrgException.class).satisfies(e -> assertThat(code(e)).isEqualTo("VALIDATION"));
    }

    @Test
    void matchFindsTheOpportunitiesOfThePostingByUrlHashOrByAtsAndExternalId() {
        w.opp(1, "ASSIGNED");
        w.opp(2, "ASSIGNED");
        w.opp(3, "CLOSED");
        String url = "https://boards.greenhouse.io/acme/jobs/102?utm_source=x";
        w.opps.get(2L).urlKeyHash = com.dossier.api.service.ent.jobs.UrlKeys.keyHash(url, null);
        assertThat(service.list(w.me, null, null, null, url, null, null).items()).extracting(ConOpportunityDTO::id).containsExactly(2L);
        assertThat(service.list(w.me, null, null, null, null, "greenhouse", "101").items()).extracting(ConOpportunityDTO::id).containsExactly(1L);
        assertThat(service.list(w.me, "CLOSED", null, null, null, "greenhouse", "103").items()).extracting(ConOpportunityDTO::id).containsExactly(3L);
        assertThat(service.list(w.me, null, null, null, null, "greenhouse", "103").items()).as("the state filter applies to a match too").hasSize(1);
        assertThat(service.list(w.me, "ASSIGNED", null, null, null, "greenhouse", "103").items()).isEmpty();
        assertThat(service.list(w.me, null, null, null, "https://other.example.com/jobs/1", null, null).items()).isEmpty();
    }

    // ---- allowed actions ----------------------------------------------------------------------------------------------------

    @Test
    void allowedActionsFollowTheStateAndTheLink() {
        assertThat(ConOpportunityService.allowedActions("ASSIGNED", false, true)).containsExactly("VIEWED", "INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED", "LINK");
        assertThat(ConOpportunityService.allowedActions("VIEWED", false, true)).containsExactly("INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED", "LINK");
        assertThat(ConOpportunityService.allowedActions("INTERESTED", false, true)).containsExactly("DECLINE", "REQUEST_INFO", "APPLIED", "LINK");
        assertThat(ConOpportunityService.allowedActions("NEEDS_INFO", false, true)).containsExactly("INTEREST", "DECLINE", "APPLIED", "LINK");
        assertThat(ConOpportunityService.allowedActions("DECLINED", false, true)).containsExactly("INTEREST");
        assertThat(ConOpportunityService.allowedActions("DECLINED", false, false)).isEmpty();
        assertThat(ConOpportunityService.allowedActions("APPLIED", false, true)).containsExactly("LINK");
        assertThat(ConOpportunityService.allowedActions("APPLIED", true, true)).containsExactly("UNLINK");
        assertThat(ConOpportunityService.allowedActions("CLOSED", false, true)).isEmpty();
        assertThat(ConOpportunityService.allowedActions(null, false, true)).isEmpty();
    }

    @Test
    void whenTheJobIsNotOpenOnlyViewedAndDeclineStayInTheActions() {
        assertThat(ConOpportunityService.allowedActions("ASSIGNED", false, false)).containsExactly("VIEWED", "DECLINE");
        assertThat(ConOpportunityService.allowedActions("VIEWED", false, false)).containsExactly("DECLINE");
        assertThat(ConOpportunityService.allowedActions("INTERESTED", false, false)).containsExactly("DECLINE");
        assertThat(ConOpportunityService.allowedActions("NEEDS_INFO", false, false)).containsExactly("DECLINE");
        assertThat(ConOpportunityService.allowedActions("APPLIED", true, false)).as("an applied fact stays unlinkable").containsExactly("UNLINK");
        for (String closed : new String[] { "CLOSED", "FILLED", "ON_HOLD" }) {
            var x = w.opp(7, "ASSIGNED");
            x.jobStatus = closed;
            assertThat(service.get(w.me, 7L).allowedActions()).as(closed).containsExactly("VIEWED", "DECLINE");
        }
    }

    @Test
    void interestRequestInfoAndAppliedAreRefusedWhileTheJobIsNotOpenButViewedAndDeclineWork() {
        for (String from : new String[] { "ASSIGNED", "VIEWED", "INTERESTED", "NEEDS_INFO" }) {
            var x = w.opp(20, from);
            x.jobStatus = "CLOSED";
            if (!"INTERESTED".equals(from)) {
                assertThatThrownBy(() -> service.interest(w.me, 20L, null)).as("interest from " + from).isInstanceOf(OrgException.class).satisfies(t -> {
                    assertThat(code(t)).isEqualTo("JOB_NOT_OPEN");
                    assertThat(((OrgException) t).getStatus()).isEqualTo(409);
                });
            }
            if (!"NEEDS_INFO".equals(from)) {
                assertThatThrownBy(() -> service.requestInfo(w.me, 20L, "Is it remote?", null)).as("request-info from " + from).satisfies(t -> assertThat(code(t)).isEqualTo("JOB_NOT_OPEN"));
            }
            assertThatThrownBy(() -> service.applied(w.me, 20L, null, null)).as("applied from " + from).satisfies(t -> assertThat(code(t)).isEqualTo("JOB_NOT_OPEN"));
            assertThat(x.o.getState()).as("nothing changed").isEqualTo(from);
        }
        assertThat(w.eventKinds()).isEmpty();
        // viewed and decline stay possible
        var seen = w.opp(21, "ASSIGNED");
        seen.jobStatus = "FILLED";
        assertThat(service.viewed(w.me, 21L, null).state()).isEqualTo("VIEWED");
        assertThat(service.decline(w.me, 21L, "NOT_INTERESTED", null, null).state()).isEqualTo("DECLINED");
        // recording a link on an already applied opportunity is not an action on the open posting
        var done = w.opp(22, "APPLIED");
        done.jobStatus = "CLOSED";
        w.application(55, ConWorld.USER);
        assertThat(service.link(w.me, 22L, 55L, null).state()).isEqualTo("APPLIED");
    }

    @Test
    void aLinkedAppliedOpportunityOffersUnlinkAndShowsTheApplication() {
        w.opp(1, "APPLIED");
        w.liveLink(1, 55);
        ConOpportunityDTO dto = service.get(w.me, 1L);
        assertThat(dto.allowedActions()).containsExactly("UNLINK");
        assertThat(dto.linkedApplicationId()).isEqualTo(55L);
    }

    // ---- viewed -------------------------------------------------------------------------------------------------------------

    @Test
    void viewedMovesAssignedToViewedWithOneEventOneAuditRowAndAVersionBump() {
        w.opp(1, "ASSIGNED");
        ConOpportunityDTO dto = service.viewed(w.me, 1L, null);
        assertThat(dto.state()).isEqualTo("VIEWED");
        assertThat(dto.version()).isEqualTo(1);
        assertThat(w.opps.get(1L).o.getViewedAt()).isEqualTo(ConWorld.NOW);
        assertThat(w.eventKinds()).containsExactly("VIEWED");
        assertThat(w.eventLog.get(0).getActorMemberId()).isEqualTo(ConWorld.MEMBER);
        verify(w.audit).record(w.me, "CONSULTANT_OPPORTUNITY_VIEWED", "OPPORTUNITY", null, "1", "VIEWED");
    }

    @Test
    void viewedTwiceIsA200NoOpThatWritesNothing() {
        w.opp(1, "VIEWED");
        ConOpportunityDTO dto = service.viewed(w.me, 1L, null);
        assertThat(dto.state()).isEqualTo("VIEWED");
        assertThat(w.eventLog).isEmpty();
        verify(w.opportunities, never()).save(any());
        verifyNoInteractions(w.audit);
    }

    @Test
    void viewedFromAnyLaterStateIsIllegal() {
        for (String state : List.of("INTERESTED", "NEEDS_INFO", "DECLINED", "APPLIED", "CLOSED")) {
            w.opp(1, state);
            assertThatThrownBy(() -> service.viewed(w.me, 1L, null)).as(state).isInstanceOf(OrgException.class).satisfies(e -> assertThat(code(e)).isEqualTo("ILLEGAL_TRANSITION"));
        }
        assertThat(w.eventLog).isEmpty();
    }

    // ---- interest -----------------------------------------------------------------------------------------------------------

    @Test
    void interestFromAssignedViewedAndNeedsInfoMovesToInterestedAndFillsTheLegacyColumn() {
        for (String from : List.of("ASSIGNED", "VIEWED", "NEEDS_INFO")) {
            w.eventLog.clear();
            w.opp(1, from);
            ConOpportunityDTO dto = service.interest(w.me, 1L, null);
            assertThat(dto.state()).as(from).isEqualTo("INTERESTED");
            assertThat(w.opps.get(1L).o.getInterest()).isEqualTo("INTERESTED");
            assertThat(w.opps.get(1L).o.getLastResponseAt()).isEqualTo(ConWorld.NOW);
            assertThat(w.eventKinds()).containsExactly("INTERESTED");
        }
    }

    @Test
    void interestWhileInterestedIsANoOp() {
        w.opp(1, "INTERESTED");
        assertThat(service.interest(w.me, 1L, null).state()).isEqualTo("INTERESTED");
        assertThat(w.eventLog).isEmpty();
    }

    @Test
    void aDeclinedOpportunityCanBeReopenedByInterestOnlyWhileTheJobIsOpen() {
        ConWorld.Opp x = w.opp(1, "DECLINED");
        x.o.setDeclineReason("RATE");
        assertThat(service.interest(w.me, 1L, null).state()).isEqualTo("INTERESTED");
        assertThat(x.o.getDeclineReason()).isNull();

        ConWorld.Opp closed = w.opp(2, "DECLINED");
        closed.jobStatus = "CLOSED";
        assertThatThrownBy(() -> service.interest(w.me, 2L, null)).satisfies(e -> {
            assertThat(code(e)).isEqualTo("JOB_NOT_OPEN");
            assertThat(((OrgException) e).getStatus()).isEqualTo(409);
        });
        assertThat(closed.o.getState()).isEqualTo("DECLINED");
    }

    @Test
    void interestFromAppliedOrClosedIsIllegal() {
        for (String state : List.of("APPLIED", "CLOSED")) {
            w.opp(1, state);
            assertThatThrownBy(() -> service.interest(w.me, 1L, null)).as(state).satisfies(e -> assertThat(code(e)).isEqualTo("ILLEGAL_TRANSITION"));
        }
    }

    // ---- request-info -------------------------------------------------------------------------------------------------------

    @Test
    void requestInfoStoresTheQuestionAndMovesToNeedsInfo() {
        for (String from : List.of("ASSIGNED", "VIEWED", "INTERESTED")) {
            w.eventLog.clear();
            ConWorld.Opp x = w.opp(1, from);
            x.o.setInfoAnswer("old answer");
            ConOpportunityDTO dto = service.requestInfo(w.me, 1L, "  Is a W2 option available?  ", null);
            assertThat(dto.state()).as(from).isEqualTo("NEEDS_INFO");
            assertThat(dto.infoRequest()).isEqualTo("Is a W2 option available?");
            assertThat(dto.infoAnswer()).isNull();
            assertThat(w.eventKinds()).containsExactly("INFO_REQUESTED");
        }
    }

    @Test
    void requestInfoWhileNeedsInfoIsANoOpAndFromDeclinedOrAppliedIsIllegal() {
        w.opp(1, "NEEDS_INFO").o.setInfoRequest("first");
        assertThat(service.requestInfo(w.me, 1L, "second", null).infoRequest()).isEqualTo("first");
        assertThat(w.eventLog).isEmpty();
        for (String state : List.of("DECLINED", "APPLIED", "CLOSED")) {
            w.opp(2, state);
            assertThatThrownBy(() -> service.requestInfo(w.me, 2L, "q", null)).as(state).satisfies(e -> assertThat(code(e)).isEqualTo("ILLEGAL_TRANSITION"));
        }
    }

    @Test
    void requestInfoValidatesTheQuestionAndRefusesSensitiveContent() {
        w.opp(1, "ASSIGNED");
        assertThatThrownBy(() -> service.requestInfo(w.me, 1L, "   ", null)).satisfies(e -> assertThat(code(e)).isEqualTo("VALIDATION"));
        assertThatThrownBy(() -> service.requestInfo(w.me, 1L, null, null)).satisfies(e -> assertThat(code(e)).isEqualTo("VALIDATION"));
        assertThatThrownBy(() -> service.requestInfo(w.me, 1L, "x".repeat(501), null)).satisfies(e -> assertThat(code(e)).isEqualTo("VALIDATION"));
        assertThatThrownBy(() -> service.requestInfo(w.me, 1L, "my ssn is 123-45-6789", null)).isInstanceOf(SensitiveContentException.class);
        assertThat(w.opps.get(1L).o.getState()).isEqualTo("ASSIGNED");
        assertThat(w.eventLog).isEmpty();
    }

    // ---- decline ------------------------------------------------------------------------------------------------------------

    @Test
    void declineIsSovereignFromEveryStateBeforeApplyingAndRecordsReasonAndNote() {
        for (String from : List.of("ASSIGNED", "VIEWED", "INTERESTED", "NEEDS_INFO")) {
            w.eventLog.clear();
            w.opp(1, from);
            ConOpportunityDTO dto = service.decline(w.me, 1L, "rate", "Below my floor", null);
            assertThat(dto.state()).as(from).isEqualTo("DECLINED");
            assertThat(w.opps.get(1L).o.getDeclineReason()).isEqualTo("RATE");
            assertThat(w.opps.get(1L).o.getInterest()).isEqualTo("NOT_INTERESTED");
            assertThat(w.eventKinds()).containsExactly("DECLINED");
            assertThat(w.eventLog.get(0).getText()).isEqualTo("declined (RATE): Below my floor");
        }
        verify(w.audit, org.mockito.Mockito.times(4)).record(eq(w.me), eq("CONSULTANT_OPPORTUNITY_DECLINED"), eq("OPPORTUNITY"), eq(null), eq("1"), eq("RATE"));
    }

    @Test
    void declineTwiceIsANoOpAndFromAppliedOrClosedIsIllegal() {
        w.opp(1, "DECLINED");
        assertThat(service.decline(w.me, 1L, "OTHER", null, null).state()).isEqualTo("DECLINED");
        assertThat(w.eventLog).isEmpty();
        for (String state : List.of("APPLIED", "CLOSED")) {
            w.opp(2, state);
            assertThatThrownBy(() -> service.decline(w.me, 2L, "OTHER", null, null)).as(state).satisfies(e -> assertThat(code(e)).isEqualTo("ILLEGAL_TRANSITION"));
        }
    }

    @Test
    void declineValidatesTheReasonAndTheNote() {
        w.opp(1, "ASSIGNED");
        assertThatThrownBy(() -> service.decline(w.me, 1L, "BORING", null, null)).satisfies(e -> assertThat(code(e)).isEqualTo("VALIDATION"));
        assertThatThrownBy(() -> service.decline(w.me, 1L, null, null, null)).satisfies(e -> assertThat(code(e)).isEqualTo("VALIDATION"));
        assertThatThrownBy(() -> service.decline(w.me, 1L, "OTHER", "x".repeat(201), null)).satisfies(e -> assertThat(code(e)).isEqualTo("VALIDATION"));
        assertThatThrownBy(() -> service.decline(w.me, 1L, "OTHER", "call me, my ssn is 123-45-6789", null)).isInstanceOf(SensitiveContentException.class);
        for (String reason : ConOpportunityService.DECLINE_REASONS) {
            w.opp(1, "ASSIGNED");
            assertThat(service.decline(w.me, 1L, reason, null, null).state()).isEqualTo("DECLINED");
        }
    }

    // ---- applied ------------------------------------------------------------------------------------------------------------

    @Test
    void appliedWithoutAnApplicationFlipsTheStateAndRecordsAnUnlinkedEventButNoLinkRow() {
        w.opp(1, "INTERESTED");
        ConOpportunityDTO dto = service.applied(w.me, 1L, null, null);
        assertThat(dto.state()).isEqualTo("APPLIED");
        assertThat(dto.appliedAt()).isEqualTo(ConWorld.NOW);
        assertThat(dto.linkedApplicationId()).isNull();
        assertThat(dto.allowedActions()).containsExactly("LINK");
        assertThat(w.eventKinds()).containsExactly("APPLIED_UNLINKED");
        assertThat(w.linkStore).isEmpty();
        verify(w.links, never()).save(any());
        verifyNoInteractions(w.projection);
    }

    @Test
    void appliedTwiceIsANoOp() {
        w.opp(1, "APPLIED").o.setAppliedAt(Instant.parse("2026-10-01T00:00:00Z"));
        ConOpportunityDTO dto = service.applied(w.me, 1L, null, null);
        assertThat(dto.appliedAt()).isEqualTo(Instant.parse("2026-10-01T00:00:00Z"));
        assertThat(w.eventLog).isEmpty();
    }

    @Test
    void appliedFromDeclinedOrClosedIsIllegal() {
        for (String state : List.of("DECLINED", "CLOSED")) {
            w.opp(1, state);
            assertThatThrownBy(() -> service.applied(w.me, 1L, null, null)).as(state).satisfies(e -> assertThat(code(e)).isEqualTo("ILLEGAL_TRANSITION"));
        }
    }

    @Test
    void appliedWithMyApplicationCreatesTheConsultantLinkAndTheFullProjection() {
        Application app = w.application(55, ConWorld.USER);
        app.setAppliedAt(Instant.parse("2026-10-12T08:00:00Z"));
        w.opp(1, "VIEWED");
        ConOpportunityDTO dto = service.applied(w.me, 1L, 55L, null);
        assertThat(dto.state()).isEqualTo("APPLIED");
        assertThat(dto.appliedAt()).isEqualTo(Instant.parse("2026-10-12T08:00:00Z"));
        assertThat(dto.linkedApplicationId()).isEqualTo(55L);
        assertThat(dto.allowedActions()).containsExactly("UNLINK");
        assertThat(w.linkStore).hasSize(1);
        MktPipelineApplicationLink l = w.linkStore.get(0);
        assertThat(l.getSource()).isEqualTo("CONSULTANT");
        assertThat(l.getConsultantId()).isEqualTo(ConWorld.CONSULTANT);
        assertThat(l.getOpportunityId()).isEqualTo(1L);
        assertThat(l.getPersonalApplicationId()).isEqualTo(55L);
        assertThat(l.getTalentApplicationId()).isEqualTo(900L);
        assertThat(w.eventKinds()).containsExactly("APPLIED");
        verify(w.projection).upsert(eq(ConWorld.ORG), eq(1L), eq(101L), eq(ConWorld.CONSULTANT), eq(ConWorld.MARKETER), eq(55L), any());
    }

    @Test
    void theProjectionIsWrittenOnlyAtFullConsent() {
        for (ShareScope scope : List.of(ShareScope.SUMMARY, ShareScope.NONE)) {
            w.linkStore.clear();
            w.consent = scope;
            w.application(55, ConWorld.USER);
            w.opp(1, "ASSIGNED");
            ConOpportunityDTO dto = service.applied(w.me, 1L, 55L, null);
            assertThat(dto.state()).as("an explicit click is itself the share of that one fact (" + scope + ")").isEqualTo("APPLIED");
            assertThat(w.linkStore.get(0).getTalentApplicationId()).as(scope.name()).isNull();
        }
        verifyNoInteractions(w.projection);
    }

    @Test
    void anotherUsersApplicationIsA404AndChangesNothing() {
        w.application(66, 999L); // someone else's
        w.opp(1, "ASSIGNED");
        assertThatThrownBy(() -> service.applied(w.me, 1L, 66L, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.link(w.me, 1L, 66L, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.applied(w.me, 1L, 12345L, null)).isInstanceOf(OrgNotFoundException.class);
        assertThat(w.opps.get(1L).o.getState()).isEqualTo("ASSIGNED");
        assertThat(w.linkStore).isEmpty();
        assertThat(w.eventLog).isEmpty();
    }

    @Test
    void everyWriteOnAnotherConsultantsOpportunityIsA404() {
        w.application(55, ConWorld.USER);
        w.opp(7, "ASSIGNED").consultantId = ConWorld.OTHER_CONSULTANT;
        assertThatThrownBy(() -> service.viewed(w.me, 7L, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.interest(w.me, 7L, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.decline(w.me, 7L, "OTHER", null, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.requestInfo(w.me, 7L, "q", null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.applied(w.me, 7L, null, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.applied(w.me, 7L, 55L, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.link(w.me, 7L, 55L, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.unlink(w.me, 7L, null)).isInstanceOf(OrgNotFoundException.class);
        assertThat(w.opps.get(7L).o.getState()).isEqualTo("ASSIGNED");
        assertThat(w.eventLog).isEmpty();
    }

    // ---- link / unlink ------------------------------------------------------------------------------------------------------

    @Test
    void linkRequiresAnApplicationId() {
        w.opp(1, "ASSIGNED");
        assertThatThrownBy(() -> service.link(w.me, 1L, null, null)).satisfies(e -> assertThat(code(e)).isEqualTo("VALIDATION"));
    }

    @Test
    void linkAttachesAnApplicationToAnAppliedUnlinkedOpportunityWithoutChangingTheState() {
        w.application(55, ConWorld.USER);
        w.opp(1, "APPLIED").o.setAppliedAt(Instant.parse("2026-10-01T00:00:00Z"));
        ConOpportunityDTO dto = service.link(w.me, 1L, 55L, null);
        assertThat(dto.state()).isEqualTo("APPLIED");
        assertThat(dto.linkedApplicationId()).isEqualTo(55L);
        assertThat(w.opps.get(1L).o.getAppliedAt()).isEqualTo(Instant.parse("2026-10-01T00:00:00Z"));
        assertThat(w.eventKinds()).containsExactly("APPLIED");
        verify(w.audit).record(w.me, "CONSULTANT_OPPORTUNITY_LINKED", "OPPORTUNITY", null, "1", "from APPLIED, application 55");
    }

    @Test
    void linkingTheSameApplicationAgainIsANoOpAndAnotherOneIsRefused() {
        w.application(55, ConWorld.USER);
        w.application(56, ConWorld.USER);
        w.opp(1, "APPLIED");
        w.liveLink(1, 55);
        assertThat(service.link(w.me, 1L, 55L, null).linkedApplicationId()).isEqualTo(55L);
        assertThat(w.eventLog).isEmpty();
        assertThatThrownBy(() -> service.link(w.me, 1L, 56L, null)).satisfies(e -> {
            assertThat(code(e)).isEqualTo("ALREADY_LINKED");
            assertThat(((OrgException) e).getStatus()).isEqualTo(409);
        });
        assertThat(w.linkStore).hasSize(1);
    }

    @Test
    void unlinkEndsTheLiveLinkDetachesTheProjectionAndKeepsTheOpportunityApplied() {
        w.opp(1, "APPLIED");
        MktPipelineApplicationLink live = w.liveLink(1, 55);
        live.setTalentApplicationId(900L);
        ConOpportunityDTO dto = service.unlink(w.me, 1L, null);
        assertThat(dto.state()).isEqualTo("APPLIED");
        assertThat(dto.linkedApplicationId()).isNull();
        assertThat(dto.allowedActions()).containsExactly("LINK");
        assertThat(live.getUnlinkedAt()).isEqualTo(ConWorld.NOW);
        assertThat(w.eventKinds()).containsExactly("UNLINKED");
        verify(w.projection).detach(ConWorld.ORG, 900L);
    }

    @Test
    void unlinkWithoutALinkIsANoOp() {
        w.opp(1, "APPLIED");
        assertThat(service.unlink(w.me, 1L, null).state()).isEqualTo("APPLIED");
        assertThat(w.eventLog).isEmpty();
        verifyNoInteractions(w.projection);
    }

    // ---- versions -----------------------------------------------------------------------------------------------------------

    @Test
    void ifMatchMustEqualTheCurrentVersionOtherwise409VersionConflict() {
        w.opp(1, "ASSIGNED").o.setVersion(3);
        assertThatThrownBy(() -> service.viewed(w.me, 1L, "2")).satisfies(e -> {
            assertThat(code(e)).isEqualTo("VERSION_CONFLICT");
            assertThat(((OrgException) e).getStatus()).isEqualTo(409);
        });
        assertThat(w.opps.get(1L).o.getState()).isEqualTo("ASSIGNED");
        assertThat(service.viewed(w.me, 1L, "\"3\"").state()).isEqualTo("VIEWED");
        assertThat(w.opps.get(1L).o.getVersion()).isEqualTo(4);
        // a stale precondition fails even for a call that would have been a no-op
        assertThatThrownBy(() -> service.viewed(w.me, 1L, "W/\"3\"")).satisfies(e -> assertThat(code(e)).isEqualTo("VERSION_CONFLICT"));
        assertThat(service.viewed(w.me, 1L, "W/\"4\"").state()).isEqualTo("VIEWED");
    }

    @Test
    void aGarbageIfMatchIsA400() {
        w.opp(1, "ASSIGNED");
        assertThatThrownBy(() -> service.viewed(w.me, 1L, "latest")).satisfies(e -> assertThat(code(e)).isEqualTo("VALIDATION"));
    }

    @Test
    void aConcurrentWriteSurfacesAsTheOptimisticLockFailureTheConflictAdviceMaps() {
        w.opp(1, "ASSIGNED");
        when(w.opportunities.save(any(com.dossier.api.domain.ent.mkt.MktOpportunity.class))).thenThrow(new ObjectOptimisticLockingFailureException(com.dossier.api.domain.ent.mkt.MktOpportunity.class, 1L));
        assertThatThrownBy(() -> service.viewed(w.me, 1L, null)).isInstanceOf(ObjectOptimisticLockingFailureException.class);
        assertThat(w.eventLog).isEmpty();
        verifyNoInteractions(w.audit);
    }

    @Test
    void theGateIsAskedFirstOnEveryCall() {
        when(w.scope.read(any())).thenThrow(new OrgNotFoundException());
        when(w.scope.write(any())).thenThrow(new OrgNotFoundException());
        w.opp(1, "ASSIGNED");
        assertThatThrownBy(() -> service.get(w.me, 1L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.list(w.me, null, null, null, null, null, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.viewed(w.me, 1L, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.link(w.me, 1L, null, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.requestInfo(w.me, 1L, "ssn 123-45-6789", null)).isInstanceOf(OrgNotFoundException.class);
        verify(w.repo, never()).findOwned(anyLong(), anyLong(), anyLong());
    }
}
