package com.dossier.api.repository.ent;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** X1.15: a search for "100%" or "a_b" is literal, never a wildcard. */
class OrgInvitationQueryRepositoryTest {

    @Test
    void likeWildcardsInASearchAreEscaped() {
        assertThat(OrgInvitationQueryRepository.escapeLike("100%")).isEqualTo("100!%");
        assertThat(OrgInvitationQueryRepository.escapeLike("a_b")).isEqualTo("a!_b");
        assertThat(OrgInvitationQueryRepository.escapeLike("!")).isEqualTo("!!");
        assertThat(OrgInvitationQueryRepository.escapeLike("plain")).isEqualTo("plain");
    }
}
