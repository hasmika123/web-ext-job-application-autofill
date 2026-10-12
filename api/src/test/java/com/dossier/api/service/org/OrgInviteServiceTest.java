package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.dto.org.OrgInviteResultDTO;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * O2.2 unit tests: the secrets behind join links (shape, hashing, code spelling) and how an invite entry is parsed. The
 * database-backed rules (caps, seat states, roles, expiry) are in {@code JoinResourceIT}.
 */
class OrgInviteServiceTest {

    private final OrgInviteService service = new OrgInviteService(null, null, null, null, null, null, null, null, null, "http://localhost:3000/");

    // ---- tokens ----------------------------------------------------------------------------------------------------

    @Test
    void aTokenIs32AlphanumericCharactersAndNeverRepeats() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 500; i++) {
            String t = InviteTokens.newToken();
            assertThat(t).hasSize(32).matches("[A-Za-z0-9]{32}");
            assertThat(InviteTokens.looksLikeToken(t)).isTrue();
            seen.add(t);
        }
        assertThat(seen).hasSize(500);
    }

    @Test
    void onlyTheHashIsStoredAndItIsStableAndOneWay() {
        String t = InviteTokens.newToken();
        assertThat(InviteTokens.hash(t)).hasSize(64).matches("[0-9a-f]{64}").isEqualTo(InviteTokens.hash(t)).doesNotContain(t);
        assertThat(InviteTokens.hash(t)).isNotEqualTo(InviteTokens.hash(t + "x"));
        assertThat(InviteTokens.hash("abc")).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"); // SHA-256("abc")
    }

    @Test
    void junkNeverLooksLikeAToken() {
        assertThat(InviteTokens.looksLikeToken(null)).isFalse();
        assertThat(InviteTokens.looksLikeToken("short")).isFalse();
        assertThat(InviteTokens.looksLikeToken("a".repeat(33))).isFalse();
        assertThat(InviteTokens.looksLikeToken("a".repeat(31) + "-")).isFalse();
        assertThat(InviteTokens.looksLikeToken("a/../" + "b".repeat(27))).isFalse();
    }

    @Test
    void aCodeUsesTheCrockfordAlphabetAtTheRequestedLength() {
        for (int len = 6; len <= 8; len++) {
            for (int i = 0; i < 100; i++) assertThat(InviteTokens.newCode(len)).hasSize(len).matches("[0-9A-HJKMNP-TV-Z]+");
        }
    }

    @Test
    void aTypedCodeIsForgivenForCaseSeparatorsAndLookAlikes() {
        assertThat(InviteTokens.normaliseCode("kiwi7f3a")).isEqualTo("K1W17F3A"); // I is 1 in Crockford
        assertThat(InviteTokens.normaliseCode(" kiw1-7f3a ")).isEqualTo("K1W17F3A");
        assertThat(InviteTokens.normaliseCode("0O0O0O")).isEqualTo("000000");
        assertThat(InviteTokens.normaliseCode("ABC")).as("too short").isNull();
        assertThat(InviteTokens.normaliseCode("ABCDEFGHJ")).as("too long").isNull();
        assertThat(InviteTokens.normaliseCode("ABCD!234")).isNull();
        assertThat(InviteTokens.normaliseCode("ABCDU234")).as("U is not in the alphabet").isNull();
        assertThat(InviteTokens.normaliseCode(null)).isNull();
    }

    // ---- entries ---------------------------------------------------------------------------------------------------

    private Optional<OrgInviteService.Entry> parse(String raw, List<OrgInviteResultDTO.Invalid> invalid) {
        return service.parse(raw, invalid);
    }

    @Test
    void anAddressIsLowerCasedAndANameInAngleBracketsIsKept() {
        List<OrgInviteResultDTO.Invalid> invalid = new ArrayList<>();
        assertThat(parse("  Aarav@Example.ORG ", invalid)).get().satisfies(e -> {
            assertThat(e.email()).isEqualTo("aarav@example.org");
            assertThat(e.name()).isNull();
        });
        assertThat(parse("Aarav Mehta <Aarav@Example.org>", invalid)).get().satisfies(e -> {
            assertThat(e.email()).isEqualTo("aarav@example.org");
            assertThat(e.name()).isEqualTo("Aarav Mehta");
        });
        assertThat(parse("\"Mehta, Aarav\" <a@example.org>", invalid)).get().extracting(OrgInviteService.Entry::name).isEqualTo("Mehta, Aarav");
        assertThat(parse("<bare@example.org>", invalid)).get().extracting(OrgInviteService.Entry::email).isEqualTo("bare@example.org");
        assertThat(invalid).isEmpty();
    }

    @Test
    void badEntriesAreReportedWithAReasonAPersonCanRead() {
        List<OrgInviteResultDTO.Invalid> invalid = new ArrayList<>();
        assertThat(parse("no-at-sign", invalid)).isEmpty();
        assertThat(parse("two@@example.org", invalid)).isEmpty();
        assertThat(parse("spaces in@example.org", invalid)).isEmpty();
        assertThat(parse("a@b", invalid)).isEmpty();
        assertThat(parse("x".repeat(250) + "@example.org", invalid)).isEmpty();
        assertThat(parse("N".repeat(81) + " <ok@example.org>", invalid)).isEmpty();
        assertThat(parse("123-45-6789 <ok@example.org>", invalid)).isEmpty();
        assertThat(invalid).extracting(OrgInviteResultDTO.Invalid::reason).containsExactly("malformed", "malformed", "malformed", "malformed", "too_long", "too_long", "sensitive_name");
    }

    @Test
    void roleWordsReadNaturallyInAnEmail() {
        assertThat(OrgInviteService.roleWord(com.dossier.api.domain.enumeration.OrgRole.MEMBER)).isEqualTo("a member");
        assertThat(OrgInviteService.roleWord(com.dossier.api.domain.enumeration.OrgRole.ADMIN)).isEqualTo("an admin");
        assertThat(OrgInviteService.roleWord(com.dossier.api.domain.enumeration.OrgRole.STAFF)).isEqualTo("a support owner");
    }

    @Test
    void whatCanSeatRoleDependsOnTheOrgState() {
        var s = com.dossier.api.domain.enumeration.OrgStatus.values();
        for (var status : s) {
            boolean open = status == com.dossier.api.domain.enumeration.OrgStatus.ACTIVE || status == com.dossier.api.domain.enumeration.OrgStatus.PAST_DUE;
            boolean draft = status == com.dossier.api.domain.enumeration.OrgStatus.DRAFT || status == com.dossier.api.domain.enumeration.OrgStatus.PENDING_SETUP_FEE;
            assertThat(OrgInviteService.canSeat(status, com.dossier.api.domain.enumeration.OrgRole.MEMBER)).as("MEMBER in " + status).isEqualTo(open);
            assertThat(OrgInviteService.canSeat(status, com.dossier.api.domain.enumeration.OrgRole.ADMIN)).as("ADMIN in " + status).isEqualTo(open || draft);
        }
    }
}
