package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Subscription;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.entitlement.EntitlementSet;
import com.dossier.api.service.entitlement.EntitlementSet.SubscriptionState;
import com.dossier.api.service.entitlement.FeatureKeys;
import com.dossier.api.service.entitlement.PlanResolver;
import com.dossier.api.service.entitlement.ShadowComparator;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The shadow wiring of EntitlementService (K7.1/K7.3): legacy answers while shadowed, the resolver once flipped, bodies identical to requirePro. */
class EntitlementServiceShadowTest {

    private SubscriptionRepository repo;
    private ShadowComparator shadow;
    private PlanResolver resolver;
    private EntitlementService service;

    @BeforeEach
    void setUp() {
        repo = mock(SubscriptionRepository.class);
        shadow = mock(ShadowComparator.class);
        resolver = mock(PlanResolver.class);
        service = new EntitlementService(repo, mock(StripeGateway.class));
        service.setPlanResolver(resolver);
        service.setShadowComparator(shadow);
        when(shadow.shadowOn()).thenReturn(true);
    }

    private void proUser(String login) {
        Subscription s = new Subscription();
        s.setStatus("active");
        s.setCurrentPeriodEnd(Instant.now().plusSeconds(86_400));
        when(repo.findOneByUserLogin(login)).thenReturn(Optional.of(s));
    }

    private static EntitlementSet set(boolean ai, boolean entitled) {
        return new EntitlementSet("PRO", 1L, "MONTH", null, null, Map.of(), ai ? Set.of("ai.server") : Set.of(), Map.of("resumes.max", 25L), null, entitled ? SubscriptionState.ACTIVE : SubscriptionState.NONE);
    }

    @Test
    void whileShadowedTheLegacyRuleAnswersAndTheResolverIsOnlyCompared() {
        proUser("anika");
        assertThat(service.isPro("anika")).isTrue();
        verify(shadow).compareHas("anika", "ai.server", true);
        assertThat(service.has("anika", FeatureKeys.AI_RESUME_TAILORING)).isTrue();
        verify(shadow).compareHas("anika", FeatureKeys.AI_RESUME_TAILORING, true);
        assertThat(service.has("free", FeatureKeys.RESUME_LIBRARY)).as("an open key is true for everyone").isTrue();
    }

    @Test
    void aFreeUserIsRefusedWithTheByteIdenticalProRequiredBody() {
        when(repo.findOneByUserLogin("free")).thenReturn(Optional.empty());
        Throwable viaKey = org.assertj.core.api.Assertions.catchThrowable(() -> service.require("free", FeatureKeys.AI_JOB_MATCHING));
        Throwable viaLegacy = org.assertj.core.api.Assertions.catchThrowable(() -> service.requirePro("free"));
        assertThat(viaKey).isInstanceOf(ProRequiredException.class);
        ProRequiredException a = (ProRequiredException) viaKey;
        ProRequiredException b = (ProRequiredException) viaLegacy;
        assertThat(a.getCode()).isEqualTo(b.getCode()).isEqualTo("PRO_REQUIRED");
        assertThat(a.getMessage()).isEqualTo(b.getMessage());
        assertThat(a.getExtra()).isEqualTo(b.getExtra()).isEmpty();
    }

    @Test
    void aKeyWithNoLegacyGateAsksTheResolverAndRefusesWithPlanRequired() {
        when(shadow.resolve("free")).thenReturn(Optional.of(set(false, false)));
        assertThatThrownBy(() -> service.require("free", FeatureKeys.SUPPORT_PRIORITY))
            .isInstanceOfSatisfying(ProRequiredException.class, e -> {
                assertThat(e.getCode()).isEqualTo("PLAN_REQUIRED");
                assertThat(e.getExtra()).containsEntry("feature", FeatureKeys.SUPPORT_PRIORITY);
            });
    }

    @Test
    void onceTheShadowIsOffTheResolverDecides() {
        when(shadow.shadowOn()).thenReturn(false);
        when(repo.findOneByUserLogin("anika")).thenReturn(Optional.empty());
        when(shadow.resolve("anika")).thenReturn(Optional.of(set(true, true)));
        assertThat(service.isPro("anika")).as("no legacy row, but the resolver says paid").isTrue();
        assertThat(service.hasPaidPlan("anika")).isTrue();
        assertThat(service.limitFor("anika", "resumes.max", 3)).contains(25L);
        verify(shadow, never()).compareHas(anyString(), anyString(), anyBoolean());
    }

    @Test
    void aResolverFailureNeverBreaksAGate() {
        when(shadow.shadowOn()).thenReturn(false);
        proUser("anika");
        when(shadow.resolve("anika")).thenReturn(Optional.empty());
        assertThat(service.isPro("anika")).as("falls back to the legacy answer").isTrue();
        assertThat(service.limitFor("anika", "resumes.max", 25)).isEmpty();
    }

    @Test
    void limitForIsEmptyAndComparedWhileShadowed() {
        assertThat(service.limitFor("anika", "resumes.max", 25)).isEmpty();
        verify(shadow).compareLimit("anika", "resumes.max", 25);
    }

    @Test
    void anEnterpriseAccountNeverHasAPersonalService() {
        String login = "ent#7#anika";
        assertThat(service.has(login, FeatureKeys.AI_AUTOFILL)).isFalse();
        assertThat(service.hasPaidPlan(login)).isFalse();
        assertThat(service.limitFor(login, "resumes.max", 3)).isEmpty();
        assertThat(service.entitlementsOf(login)).isEmpty();
        verify(shadow, never()).resolve(login);
    }

    @Test
    void withoutAResolverTheServiceIsTheLegacyOne() {
        EntitlementService plain = new EntitlementService(repo, mock(StripeGateway.class));
        proUser("anika");
        assertThat(plain.isPro("anika")).isTrue();
        assertThat(plain.has("anika", FeatureKeys.AI_AUTOFILL)).isTrue();
        assertThat(plain.has("anika", FeatureKeys.SUPPORT_PRIORITY)).isFalse();
        assertThat(plain.limitFor("anika", "resumes.max", 25)).isEmpty();
    }
}
