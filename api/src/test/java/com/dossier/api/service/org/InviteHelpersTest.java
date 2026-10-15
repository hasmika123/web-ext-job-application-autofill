package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.InviteStatus;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.org.OrgMemberRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** X1.15: the small pure pieces of the invitation framework. */
class InviteHelpersTest {

    // ---- InviteStatus -----------------------------------------------------------------------------------------------------

    private static OrgMember seat(OrgMemberStatus status, Instant expires, Instant joined, String endedReason) {
        OrgMember m = new OrgMember();
        m.setStatus(status);
        m.setInviteExpiresAt(expires);
        m.setJoinedAt(joined);
        m.setInviteEndedReason(endedReason);
        return m;
    }

    @Test
    void anInvitationsStatusIsDerivedFromItsSeat() {
        Instant now = Instant.now();
        assertThat(InviteStatus.of(seat(OrgMemberStatus.INVITED, now.plus(Duration.ofDays(1)), null, null), now)).isEqualTo(InviteStatus.PENDING);
        assertThat(InviteStatus.of(seat(OrgMemberStatus.INVITED, null, null, null), now)).as("no expiry recorded: still open").isEqualTo(InviteStatus.PENDING);
        assertThat(InviteStatus.of(seat(OrgMemberStatus.INVITED, now.minusSeconds(1), null, null), now)).as("past its expiry before the job swept it").isEqualTo(InviteStatus.EXPIRED);
        assertThat(InviteStatus.of(seat(OrgMemberStatus.REMOVED, now.minusSeconds(1), null, "EXPIRED"), now)).isEqualTo(InviteStatus.EXPIRED);
        assertThat(InviteStatus.of(seat(OrgMemberStatus.REMOVED, now.plusSeconds(60), null, "REVOKED"), now)).isEqualTo(InviteStatus.REVOKED);
        assertThat(InviteStatus.of(seat(OrgMemberStatus.REMOVED, null, null, null), now)).as("removed and never joined: withdrawn").isEqualTo(InviteStatus.REVOKED);
        assertThat(InviteStatus.of(seat(OrgMemberStatus.ACTIVE, null, now.minusSeconds(5), null), now)).isEqualTo(InviteStatus.ACCEPTED);
        assertThat(InviteStatus.of(seat(OrgMemberStatus.LEFT, null, now.minusSeconds(5), null), now)).as("accepted, then left: still an accepted invitation").isEqualTo(InviteStatus.ACCEPTED);
    }

    // ---- roles as JSON ------------------------------------------------------------------------------------------------------

    @Test
    void roleIdsRoundTripThroughTheirJsonForm() {
        assertThat(OrgInviteService.toJson(List.of(12L, 15L))).isEqualTo("[12,15]");
        assertThat(OrgInviteService.parseIds("[12,15]")).containsExactly(12L, 15L);
        assertThat(OrgInviteService.parseIds(" [ 3 , 4 ] ")).containsExactly(3L, 4L);
    }

    @Test
    void anythingMalformedReadsAsNoRoleIds() {
        for (String junk : new String[] { null, "", "  ", "[]", "12", "[a]", "[1,,2]", "{\"x\":1}", "[1;2]" }) {
            assertThat(OrgInviteService.parseIds(junk)).as(String.valueOf(junk)).isEmpty();
        }
    }

    // ---- the personal note ---------------------------------------------------------------------------------------------------

    @Test
    void aNoteIsPlainTrimmedTextWithoutControlCharacters() {
        assertThat(OrgInviteService.cleanMessage(null)).isNull();
        assertThat(OrgInviteService.cleanMessage("   ")).isNull();
        assertThat(OrgInviteService.cleanMessage("  Welcome aboard\u0007!\nSee you Monday. ")).isEqualTo("Welcome aboard!\nSee you Monday.");
        assertThat(OrgInviteService.cleanMessage("<script>alert(1)</script>")).as("stored as text; the mail template escapes it").isEqualTo("<script>alert(1)</script>");
    }

    @Test
    void aNoteIsCappedAndNeverCarriesIdentityNumbers() {
        assertThatThrownBy(() -> OrgInviteService.cleanMessage("x".repeat(501))).isInstanceOf(OrgException.class).hasMessageContaining("message");
        assertThatThrownBy(() -> OrgInviteService.cleanMessage("my number is 123-45-6789")).isInstanceOf(OrgException.class).hasMessageContaining("message");
        assertThat(OrgInviteService.cleanMessage("x".repeat(500))).hasSize(500);
    }

    @Test
    void roleWordsGetTheRightArticle() {
        assertThat(OrgInviteService.article("Marketing Specialist")).isEqualTo("a Marketing Specialist");
        assertThat(OrgInviteService.article("Organization Admin")).isEqualTo("an Organization Admin");
        assertThat(OrgInviteService.article(null)).isEqualTo("a member");
    }

    // ---- the manager chain ---------------------------------------------------------------------------------------------------

    private static OrgMember withManager(Long id, Long managerId) {
        OrgMember m = new OrgMember();
        m.setId(id);
        m.setManagerMemberId(managerId);
        return m;
    }

    private OrgInviteService serviceOver(OrgMemberRepository members) {
        return new OrgInviteService(null, members, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    @Test
    void aReportingChainThatEndsIsNotALoop() {
        OrgMemberRepository members = mock(OrgMemberRepository.class);
        when(members.findByOrgIdAndId(7L, 1L)).thenReturn(Optional.of(withManager(1L, 2L)));
        when(members.findByOrgIdAndId(7L, 2L)).thenReturn(Optional.of(withManager(2L, 3L)));
        when(members.findByOrgIdAndId(7L, 3L)).thenReturn(Optional.of(withManager(3L, null)));
        assertThat(serviceOver(members).managerChainLoops(7L, 1L)).isFalse();
    }

    @Test
    void aChainThatReturnsToAMemberItAlreadyPassedIsALoop() {
        OrgMemberRepository members = mock(OrgMemberRepository.class);
        when(members.findByOrgIdAndId(7L, 1L)).thenReturn(Optional.of(withManager(1L, 2L)));
        when(members.findByOrgIdAndId(7L, 2L)).thenReturn(Optional.of(withManager(2L, 3L)));
        when(members.findByOrgIdAndId(7L, 3L)).thenReturn(Optional.of(withManager(3L, 1L)));
        assertThat(serviceOver(members).managerChainLoops(7L, 1L)).isTrue();
    }

    @Test
    void aChainLongerThanTheWalkLimitIsRefused() {
        OrgMemberRepository members = mock(OrgMemberRepository.class);
        for (long i = 1; i <= 40; i++) when(members.findByOrgIdAndId(7L, i)).thenReturn(Optional.of(withManager(i, i + 1)));
        assertThat(serviceOver(members).managerChainLoops(7L, 1L)).isTrue();
    }

    // ---- masked addresses ----------------------------------------------------------------------------------------------------

    @Test
    void anInvitedAddressIsShownMaskedToAnyoneHoldingTheLink() {
        assertThat(OrgJoinService.maskEmail("aarav.nair@example.org")).isEqualTo("a***@e***.org");
        assertThat(OrgJoinService.maskEmail("x@y.io")).isEqualTo("x***@y***.io");
        assertThat(OrgJoinService.maskEmail(null)).isNull();
        assertThat(OrgJoinService.maskEmail("no-at-sign")).isEqualTo("***");
        assertThat(OrgJoinService.maskEmail("aarav.nair@example.org")).doesNotContain("aarav").doesNotContain("example");
    }
}
