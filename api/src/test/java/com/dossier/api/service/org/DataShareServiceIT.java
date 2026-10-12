package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.DataShareEvent;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.DataShareEventRepository;
import com.dossier.api.repository.org.DataShareRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.AccountDeletionService;
import com.dossier.api.service.AccountExportService;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.org.DataShareService.ShareContext;
import com.dossier.api.service.resume.OrgResumeSharing;
import com.dossier.api.web.rest.org.OrgFixtures;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

/**
 * O6.1 against MySQL: the member's consent row and history, the effective scope (never wider than reality), immediate
 * revocation, the resume-access seam, and what account erasure and the export do about it.
 */
@IntegrationTest
@Transactional
class DataShareServiceIT {

    private static final String V1 = OrgShareConsent.CURRENT;

    @Autowired private DataShareService service;
    @Autowired private OrgResumeSharing resumeSharing;
    @Autowired private DataShareRepository shares;
    @Autowired private DataShareEventRepository events;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private AccountDeletionService deletion;
    @Autowired private AccountExportService export;
    @Autowired private EntityManager em;

    @MockitoBean private StripeGateway stripeGateway;

    private OrgFixtures fx;
    private Organization org;
    private OrgMember aarav; // MEMBER, the person who shares
    private OrgMember marketer; // MARKETER, may receive FULL
    private OrgMember staff; // STAFF, may not

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        org = fx.org("acme", OrgStatus.ACTIVE);
        fx.active(org, "boss", OrgRole.OWNER);
        aarav = fx.active(org, "aarav", OrgRole.MEMBER);
        marketer = fx.active(org, "rahul", OrgRole.MARKETER);
        staff = fx.active(org, "priya", OrgRole.STAFF);
    }

    private OrgMembership me(Organization o, OrgMember seat, String login) {
        return new OrgMembership(o.getId(), seat.getId(), seat.getUserId(), login, seat.getRole(), seat.getStatus(), o.getStatus());
    }

    private OrgMembership aaravMe() {
        return me(org, aarav, "aarav");
    }

    // ---- grant / revoke -------------------------------------------------------------------------------------------

    @Test
    void grantingSummaryWritesTheRowAnEventAndOneAuditRow() {
        var view = service.grant(aaravMe(), ShareScope.SUMMARY, null, V1, new ShareContext("iphash", "uahash"));

        assertThat(view.scope()).isEqualTo(ShareScope.SUMMARY);
        assertThat(view.consentVersion()).isEqualTo(V1);
        assertThat(service.scopeOf(org.getId(), aarav.getId())).isEqualTo(ShareScope.SUMMARY);
        List<DataShareEvent> history = events.findByOrgIdAndMemberLoginOrderByIdAsc(org.getId(), "aarav");
        assertThat(history).singleElement().satisfies(e -> {
            assertThat(e.getFromScope()).isEqualTo(ShareScope.NONE);
            assertThat(e.getToScope()).isEqualTo(ShareScope.SUMMARY);
            assertThat(e.getActor()).isEqualTo(DataShareEvent.ACTOR_MEMBER);
            assertThat(e.getReason()).isEqualTo(DataShareEvent.REASON_JOIN);
            assertThat(e.getConsentVersion()).isEqualTo(V1);
            assertThat(e.getIpHash()).isEqualTo("iphash");
            assertThat(e.getUserAgentHash()).isEqualTo("uahash");
        });
        assertThat(OrgAuditAsserts.rows(audit, org.getId())).singleElement().satisfies(e -> {
            assertThat(e.getAction()).isEqualTo(OrgAuditService.SHARE_SCOPE_CHANGED);
            assertThat(e.getActorLogin()).isEqualTo("aarav");
            assertThat(e.getTargetLogin()).isEqualTo("aarav");
            assertThat(e.getDetails()).isEqualTo("NONE -> SUMMARY");
        });
    }

    @Test
    void aSecondChangeIsAMemberChangeAndAnIdenticalCallWritesNothing() {
        service.grant(aaravMe(), ShareScope.SUMMARY, null, V1, ShareContext.EMPTY);
        service.grant(aaravMe(), ShareScope.SUMMARY, null, V1, ShareContext.EMPTY); // nothing changed
        assertThat(events.countByOrgId(org.getId())).isEqualTo(1);
        assertThat(audit.countByOrgId(org.getId())).isEqualTo(1);

        service.grant(aaravMe(), ShareScope.NONE, null, null, ShareContext.EMPTY);
        List<DataShareEvent> history = events.findByOrgIdAndMemberLoginOrderByIdAsc(org.getId(), "aarav");
        assertThat(history).hasSize(2);
        assertThat(history.get(1).getReason()).isEqualTo(DataShareEvent.REASON_MEMBER_CHANGE);
        assertThat(history.get(1).getFromScope()).isEqualTo(ShareScope.SUMMARY);
    }

    @Test
    void aScopeOtherThanNoneNeedsAConsentTextThatExists() {
        assertThatThrownBy(() -> service.grant(aaravMe(), ShareScope.SUMMARY, null, null, ShareContext.EMPTY)).isInstanceOf(OrgException.class).hasMessageContaining("consentVersion");
        assertThatThrownBy(() -> service.grant(aaravMe(), ShareScope.SUMMARY, null, "org-share/v99", ShareContext.EMPTY)).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.grant(aaravMe(), ShareScope.SUMMARY, null, "../../etc/passwd", ShareContext.EMPTY)).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.grant(aaravMe(), null, null, V1, ShareContext.EMPTY)).isInstanceOf(OrgException.class).hasMessageContaining("scope");
        assertThat(shares.findByOrgIdAndMemberId(org.getId(), aarav.getId())).isEmpty();
    }

    @Test
    void fullNamesOneActiveMarketerOfTheSameOrgAndNobodyElse() {
        assertThatThrownBy(() -> service.grant(aaravMe(), ShareScope.FULL, null, V1, ShareContext.EMPTY)).isInstanceOf(OrgException.class).hasMessageContaining("fullToMemberId");
        assertThatThrownBy(() -> service.grant(aaravMe(), ShareScope.FULL, staff.getId(), V1, ShareContext.EMPTY)).as("staff may not receive FULL").isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.grant(aaravMe(), ShareScope.FULL, aarav.getId(), V1, ShareContext.EMPTY)).as("not oneself").isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.grant(aaravMe(), ShareScope.SUMMARY, marketer.getId(), V1, ShareContext.EMPTY)).as("only with FULL").isInstanceOf(OrgException.class);

        Organization other = fx.org("globex", OrgStatus.ACTIVE);
        OrgMember foreignMarketer = fx.active(other, "mallory", OrgRole.MARKETER);
        assertThatThrownBy(() -> service.grant(aaravMe(), ShareScope.FULL, foreignMarketer.getId(), V1, ShareContext.EMPTY)).as("a marketer of another org").isInstanceOf(OrgException.class);

        OrgMember suspended = fx.seat(org, "sam", OrgRole.MARKETER, OrgMemberStatus.SUSPENDED);
        assertThatThrownBy(() -> service.grant(aaravMe(), ShareScope.FULL, suspended.getId(), V1, ShareContext.EMPTY)).as("a suspended marketer").isInstanceOf(OrgException.class);

        assertThat(shares.findByOrgIdAndMemberId(org.getId(), aarav.getId())).isEmpty();
        assertThat(events.countByOrgId(org.getId())).isZero();

        var view = service.grant(aaravMe(), ShareScope.FULL, marketer.getId(), V1, ShareContext.EMPTY);
        assertThat(view.scope()).isEqualTo(ShareScope.FULL);
        assertThat(view.fullToMemberId()).isEqualTo(marketer.getId());
        assertThat(events.findByOrgIdAndMemberLoginOrderByIdAsc(org.getId(), "aarav")).singleElement().satisfies(e -> assertThat(e.getFullToLogin()).isEqualTo("rahul"));
    }

    @Test
    void aClosedOrgRefusesMoreSharingButNeverRefusesWithdrawal() {
        service.grant(aaravMe(), ShareScope.SUMMARY, null, V1, ShareContext.EMPTY);
        org.setStatus(OrgStatus.CLOSED);
        orgs.saveAndFlush(org);
        OrgMembership closed = me(org, aarav, "aarav");

        assertThatThrownBy(() -> service.grant(closed, ShareScope.FULL, marketer.getId(), V1, ShareContext.EMPTY)).isInstanceOf(OrgException.class).hasMessageContaining("closed");
        assertThat(service.scopeOf(org.getId(), aarav.getId())).as("a closed org sees nothing").isEqualTo(ShareScope.NONE);
        assertThat(service.revoke(closed, ShareContext.EMPTY).scope()).isEqualTo(ShareScope.NONE);
    }

    // ---- RevocationIsImmediate ------------------------------------------------------------------------------------

    @Test
    void revocationIsImmediate_grantFullReadOkRevokeReadRefusedInTheSameInstant() {
        service.grant(aaravMe(), ShareScope.FULL, marketer.getId(), V1, ShareContext.EMPTY);

        assertThat(resumeSharing.isFullPairedViewer("aarav", "rahul")).isTrue();
        assertThat(resumeSharing.ownersSharingFullWith("rahul")).containsExactly("aarav");
        assertThat(resumeSharing.pairingOf("aarav")).contains(new OrgResumeSharing.Pairing("FULL", "rahul"));

        service.revoke(aaravMe(), ShareContext.EMPTY);

        assertThat(resumeSharing.isFullPairedViewer("aarav", "rahul")).isFalse();
        assertThat(resumeSharing.ownersSharingFullWith("rahul")).isEmpty();
        assertThat(resumeSharing.pairingOf("aarav")).contains(new OrgResumeSharing.Pairing("NONE", null));
        assertThat(service.scopeOf(org.getId(), aarav.getId())).isEqualTo(ShareScope.NONE);
    }

    @Test
    void onlyTheNamedPersonIsAFullViewer() {
        service.grant(aaravMe(), ShareScope.FULL, marketer.getId(), V1, ShareContext.EMPTY);
        OrgMember second = fx.active(org, "tara", OrgRole.MARKETER);

        assertThat(resumeSharing.isFullPairedViewer("aarav", "tara")).as("another marketer of the same org").isFalse();
        assertThat(resumeSharing.isFullPairedViewer("aarav", "priya")).as("staff").isFalse();
        assertThat(resumeSharing.isFullPairedViewer("aarav", "boss")).as("the owner").isFalse();
        assertThat(resumeSharing.isFullPairedViewer("aarav", "aarav")).as("oneself").isFalse();
        assertThat(resumeSharing.isFullPairedViewer("rahul", "aarav")).as("the other way round").isFalse();
        assertThat(resumeSharing.isFullPairedViewer("ghost", "rahul")).isFalse();
        assertThat(resumeSharing.ownersSharingFullWith("tara")).isEmpty();
        assertThat(second.getId()).isNotEqualTo(marketer.getId());
    }

    @Test
    void summaryNeverMakesAnyoneAFullViewer() {
        service.grant(aaravMe(), ShareScope.SUMMARY, null, V1, ShareContext.EMPTY);
        assertThat(resumeSharing.isFullPairedViewer("aarav", "rahul")).isFalse();
        assertThat(resumeSharing.pairingOf("aarav")).contains(new OrgResumeSharing.Pairing("SUMMARY", null));
        assertThat(resumeSharing.pairingOf("nobody-at-all")).isEmpty();
    }

    // ---- the effective scope is never wider than reality ----------------------------------------------------------

    @Test
    void theEffectiveScopeFollowsTheSeatTheOrgAndThePairedPerson() {
        service.grant(aaravMe(), ShareScope.FULL, marketer.getId(), V1, ShareContext.EMPTY);
        assertThat(service.scopeOf(org.getId(), aarav.getId())).isEqualTo(ShareScope.FULL);

        marketer.setStatus(OrgMemberStatus.SUSPENDED);
        members.saveAndFlush(marketer);
        assertThat(service.scopeOf(org.getId(), aarav.getId())).as("the named person lost the seat").isEqualTo(ShareScope.SUMMARY);
        assertThat(resumeSharing.isFullPairedViewer("aarav", "rahul")).isFalse();

        marketer.setStatus(OrgMemberStatus.ACTIVE);
        members.saveAndFlush(marketer);
        assertThat(service.scopeOf(org.getId(), aarav.getId())).isEqualTo(ShareScope.FULL);

        aarav.setStatus(OrgMemberStatus.LEFT);
        members.saveAndFlush(aarav);
        assertThat(service.scopeOf(org.getId(), aarav.getId())).as("a seat that left shares nothing").isEqualTo(ShareScope.NONE);
        assertThat(resumeSharing.pairingOf("aarav")).isEmpty();
    }

    @Test
    void aSuspendedOrClosedOrgSeesNothingAndAMemberIdFromAnotherOrgIsNone() {
        service.grant(aaravMe(), ShareScope.SUMMARY, null, V1, ShareContext.EMPTY);
        Organization other = fx.org("globex", OrgStatus.ACTIVE);
        fx.active(other, "boss2", OrgRole.OWNER);

        assertThat(service.scopeOf(other.getId(), aarav.getId())).as("org B asking about A's member").isEqualTo(ShareScope.NONE);
        assertThat(service.viewOf(other.getId(), aarav.getId())).isEmpty();
        assertThat(service.scopeOf(null, aarav.getId())).isEqualTo(ShareScope.NONE);
        assertThat(service.scopeOf(org.getId(), null)).isEqualTo(ShareScope.NONE);

        org.setStatus(OrgStatus.SUSPENDED);
        orgs.saveAndFlush(org);
        assertThat(service.scopeOf(org.getId(), aarav.getId())).isEqualTo(ShareScope.NONE);
    }

    @Test
    void endingASeatDropsItsSharingAtOnce() {
        service.grant(aaravMe(), ShareScope.FULL, marketer.getId(), V1, ShareContext.EMPTY);
        service.endFor(org.getId(), aarav.getId(), "aarav", DataShareEvent.REASON_MEMBER_LEFT, DataShareEvent.ACTOR_MEMBER);

        assertThat(shares.findByOrgIdAndMemberId(org.getId(), aarav.getId())).get().satisfies(s -> {
            assertThat(s.getScope()).isEqualTo(ShareScope.NONE);
            assertThat(s.getFullToMemberId()).isNull();
        });
        List<DataShareEvent> history = events.findByOrgIdAndMemberLoginOrderByIdAsc(org.getId(), "aarav");
        assertThat(history).hasSize(2);
        assertThat(history.get(1).getReason()).isEqualTo(DataShareEvent.REASON_MEMBER_LEFT);
        assertThat(history.get(1).getFullToLogin()).isEqualTo("rahul");
        service.endFor(org.getId(), aarav.getId(), "aarav", DataShareEvent.REASON_MEMBER_LEFT, DataShareEvent.ACTOR_MEMBER); // already none: no new event
        assertThat(events.countByOrgId(org.getId())).isEqualTo(2);
    }

    @Test
    void endingAPairingDropsEveryFullShareThatNamedThePersonToSummary() {
        OrgMember bela = fx.active(org, "bela", OrgRole.MEMBER);
        service.grant(aaravMe(), ShareScope.FULL, marketer.getId(), V1, ShareContext.EMPTY);
        service.grant(me(org, bela, "bela"), ShareScope.FULL, marketer.getId(), V1, ShareContext.EMPTY);

        assertThat(service.endPairingsTo(org.getId(), marketer.getId(), "rahul")).isEqualTo(2);

        assertThat(service.scopeOf(org.getId(), aarav.getId())).isEqualTo(ShareScope.SUMMARY);
        assertThat(service.scopeOf(org.getId(), bela.getId())).isEqualTo(ShareScope.SUMMARY);
        assertThat(events.findByOrgIdAndMemberLoginOrderByIdAsc(org.getId(), "bela")).last().satisfies(e -> {
            assertThat(e.getReason()).isEqualTo(DataShareEvent.REASON_PAIRING_ENDED);
            assertThat(e.getActor()).isEqualTo(DataShareEvent.ACTOR_SYSTEM);
        });
        assertThat(service.endPairingsTo(org.getId(), marketer.getId(), "rahul")).isZero();
    }

    // ---- audit of FULL reads --------------------------------------------------------------------------------------

    @Test
    void everyFullReadIsAuditedAndAnUnpairedReadIsNot() {
        service.grant(aaravMe(), ShareScope.FULL, marketer.getId(), V1, ShareContext.EMPTY);
        long before = audit.countByOrgId(org.getId());

        resumeSharing.auditFullRead("aarav", "rahul", 42L);
        resumeSharing.auditFullRead("aarav", "priya", 42L); // not paired: nothing to record

        List<OrgAuditEvent> rows = OrgAuditAsserts.rows(audit, org.getId());
        assertThat(rows).hasSize((int) before + 1);
        assertThat(rows).anySatisfy(e -> {
            assertThat(e.getAction()).isEqualTo(OrgAuditService.SHARE_READ_FULL);
            assertThat(e.getActorLogin()).isEqualTo("rahul");
            assertThat(e.getActorRole()).isEqualTo("MARKETER");
            assertThat(e.getTargetLogin()).isEqualTo("aarav");
            assertThat(e.getDetails()).isEqualTo("resume:42");
        });
    }

    // ---- erasure and export ---------------------------------------------------------------------------------------

    @Test
    @WithMockUser(username = "aarav")
    void erasingAMemberDeletesTheirConsentRowAndKeepsTheHistory() {
        service.grant(aaravMe(), ShareScope.FULL, marketer.getId(), V1, ShareContext.EMPTY);
        Long orgId = org.getId();
        Long aaravSeat = aarav.getId();

        deletion.deleteCurrentUserAccount();

        em.flush();
        em.clear();
        assertThat(shares.findByOrgIdAndMemberId(orgId, aaravSeat)).as("the consent row is deleted").isEmpty();
        List<DataShareEvent> history = events.findByOrgIdAndMemberLoginOrderByIdAsc(orgId, "aarav");
        assertThat(history).hasSize(2);
        assertThat(history.get(1)).satisfies(e -> {
            assertThat(e.getReason()).isEqualTo(DataShareEvent.REASON_ERASED);
            assertThat(e.getToScope()).isEqualTo(ShareScope.NONE);
        });
        assertThat(resumeSharing.ownersSharingFullWith("rahul")).isEmpty();
    }

    @Test
    @WithMockUser(username = "rahul")
    void erasingTheNamedMarketerDropsTheMembersWhoSharedWithThemToSummary() {
        service.grant(aaravMe(), ShareScope.FULL, marketer.getId(), V1, ShareContext.EMPTY);
        Long orgId = org.getId();
        Long aaravSeat = aarav.getId();

        deletion.deleteCurrentUserAccount();

        em.flush();
        em.clear();
        assertThat(service.scopeOf(orgId, aaravSeat)).isEqualTo(ShareScope.SUMMARY);
        assertThat(shares.findByOrgIdAndMemberId(orgId, aaravSeat)).get().satisfies(s -> assertThat(s.getFullToMemberId()).isNull());
        assertThat(events.findByOrgIdAndMemberLoginOrderByIdAsc(orgId, "aarav")).last().satisfies(e -> {
            assertThat(e.getReason()).isEqualTo(DataShareEvent.REASON_PAIRING_ENDED);
            assertThat(e.getFullToLogin()).isEqualTo("rahul");
        });
    }

    @Test
    @WithMockUser(username = "aarav")
    @SuppressWarnings("unchecked")
    void theExportListsWhatTheMemberSharesAndEveryChangeWithoutHashes() {
        service.grant(aaravMe(), ShareScope.SUMMARY, null, V1, new ShareContext("iphash", "uahash"));
        service.grant(aaravMe(), ShareScope.FULL, marketer.getId(), V1, ShareContext.EMPTY);

        Map<String, Object> out = export.exportCurrentUser();

        List<Map<String, Object>> orgsOut = (List<Map<String, Object>>) out.get("organizations");
        assertThat(orgsOut).singleElement().satisfies(row -> {
            Map<String, Object> share = (Map<String, Object>) row.get("dataShare");
            assertThat(share).containsEntry("scope", ShareScope.FULL).containsEntry("sharedWith", "rahul").containsEntry("consentVersion", V1);
            List<Map<String, Object>> history = (List<Map<String, Object>>) share.get("history");
            assertThat(history).hasSize(2);
            assertThat(history.get(0)).containsEntry("from", ShareScope.NONE).containsEntry("to", ShareScope.SUMMARY).containsEntry("by", "MEMBER");
            assertThat(history.toString()).doesNotContain("iphash").doesNotContain("uahash");
        });
    }

    @Test
    void aMemberWhoNeverChoseExportsNone() {
        Optional<Map<String, Object>> row = Optional.of(service.exportFor(org.getId(), aarav.getId(), "aarav"));
        assertThat(row.get()).containsEntry("scope", ShareScope.NONE).containsEntry("sharedWith", null);
        assertThat((List<?>) row.get().get("history")).isEmpty();
    }
}
