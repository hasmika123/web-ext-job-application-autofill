package com.dossier.api.service.entitlement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.domain.billing.EntitlementGrant;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class GrantWriterGuardTest {

    private final GrantWriterGuard guard = new GrantWriterGuard();
    private final Instant now = Instant.parse("2026-10-15T12:00:00Z");

    @Test
    void aStripeSubscriptionOrAnOrgAssignmentIsNeverAGrant() {
        for (String source : new String[] { "STRIPE_SUBSCRIPTION", "ORG_ASSIGNMENT", "SOMETHING_ELSE", null }) {
            assertThatThrownBy(() -> guard.build(1L, 2L, source, now, null, "admin", "x"))
                .as(String.valueOf(source))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(422));
        }
    }

    @Test
    void theThreeNarrowedSourcesBuild() {
        for (String source : new String[] { EntitlementGrant.ADMIN_COMP, EntitlementGrant.REFERRAL, EntitlementGrant.SERVICE_ORDER }) {
            EntitlementGrant g = guard.build(1L, 2L, source, now, now.plusSeconds(3600), "admin", "thank you");
            assertThat(g.getSource()).isEqualTo(source);
            assertThat(g.getPlanVersionId()).isEqualTo(2L);
        }
    }

    @Test
    void aGrantNeedsAUserAVersionAStartAndAForwardEnd() {
        assertThatThrownBy(() -> guard.build(null, 2L, EntitlementGrant.ADMIN_COMP, now, null, "a", "r")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> guard.build(1L, null, EntitlementGrant.ADMIN_COMP, now, null, "a", "r")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> guard.build(1L, 2L, EntitlementGrant.ADMIN_COMP, null, null, "a", "r")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> guard.build(1L, 2L, EntitlementGrant.ADMIN_COMP, now, now, "a", "r")).isInstanceOf(ResponseStatusException.class);
    }
}
