package com.dossier.api.service.retirement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.EntitlementService.Access;
import com.dossier.api.service.ProRequiredException;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * K10.6 on MySQL (docs/subscriptions/11 section 7): after the Free fallback a held service is LOCKED, not anonymously DENIED. A write or consume call is refused
 * {@code 402 FEATURE_LOCKED} with the way out, a read is allowed, a service that was never part of the plan stays DENIED with today's body, and unlocking after an upgrade
 * is instant: the next call is ALLOWED with no job in between. The lock is an overlay, never a source of entitlement, and it never crosses between accounts.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
@Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
class ServiceLockEvaluationIT extends RetirementItSupport {

    @Autowired private MockMvc mockMvc;

    /** A subscriber who did nothing, after the date: Free, locked, the mirror as Stripe's webhook leaves it (canceled, period ended). */
    private Subscription fellBack() {
        Subscription s = monthly(40);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem item = item(r, s);
        job.run(after(item, 1));
        stripeEnded(s);
        return s;
    }

    @Test
    void aHeldServiceIsLockedAWriteIsRefusedWithTheWayOutAndAReadIsAllowed() {
        Subscription s = fellBack();
        String login = s.getUser().getLogin();

        assertThat(entitlements.has(login, "ai.resume_tailoring")).isFalse();
        assertThat(entitlements.access(login, "ai.resume_tailoring")).isEqualTo(Access.LOCKED);
        assertThatThrownBy(() -> entitlements.require(login, "ai.resume_tailoring")).isInstanceOfSatisfying(ProRequiredException.class, e -> {
            assertThat(e.getCode()).isEqualTo("FEATURE_LOCKED");
            assertThat(e.getExtra()).containsEntry("featureKey", "ai.resume_tailoring");
            assertThat(e.getExtra()).containsKeys("name", "lockedSince", "upgrade").containsEntry("lockedFrom", "TQ");
            assertThat(e.getExtra().get("upgrade")).isEqualTo(java.util.Map.of("path", "/settings/plan"));
        });
        entitlements.requireRead(login, "ai.resume_tailoring"); // a read passes: the data is still theirs to open
    }

    @Test
    void aServiceThatWasNeverPartOfThePlanIsStillDeniedWithTodaysBody() {
        Subscription s = fellBack();
        String login = s.getUser().getLogin();
        assertThat(entitlements.access(login, "automation.approved_apply")).isEqualTo(Access.DENIED);
        assertThatThrownBy(() -> entitlements.require(login, "automation.approved_apply")).isInstanceOfSatisfying(ProRequiredException.class, e -> assertThat(e.getCode()).isIn("PLAN_REQUIRED", "PRO_REQUIRED"));
        assertThatThrownBy(() -> entitlements.requireRead(login, "automation.approved_apply")).isInstanceOf(ProRequiredException.class);
    }

    @Test
    void whatFreeIncludesIsAllowedAndNeverLocked() {
        Subscription s = fellBack();
        String login = s.getUser().getLogin();
        assertThat(locks.live(s.getUser().getId())).extracting(l -> l.featureKey()).doesNotContain("resume.library", "matches.basic");
        assertThat(entitlements.access(login, "matches.basic")).isEqualTo(Access.ALLOWED);
    }

    @Test
    void unlockingAfterAnUpgradeIsInstantWithNoJob() {
        Subscription s = fellBack();
        String login = s.getUser().getLogin();
        assertThat(entitlements.access(login, "ai.resume_tailoring")).isEqualTo(Access.LOCKED);

        // they pick a plan that includes it again: the subscription is paid and linked to it
        s.setStatus("active");
        s.setCancelAtPeriodEnd(false);
        s.setCurrentPeriodEnd(Instant.now().plus(30, ChronoUnit.DAYS));
        s.setPlanVersionId(plan.versionId());
        s.setBillingInterval("MONTH");
        subscriptions.saveAndFlush(s);

        assertThat(entitlements.access(login, "ai.resume_tailoring")).as("the very next call, no job ran").isEqualTo(Access.ALLOWED);
        entitlements.require(login, "ai.resume_tailoring");
        assertThat(locks.live(s.getUser().getId())).as("the row is still there until the housekeeping closes it").isNotEmpty();
        assertThat(locks.reconcile(s.getUser().getId(), login)).isPositive();
        assertThat(locks.live(s.getUser().getId())).isEmpty();
    }

    @Test
    void aLockOfOneAccountNeverAppliesToAnother() {
        Subscription s = fellBack();
        Subscription other = monthly(40);
        assertThat(entitlements.access(other.getUser().getLogin(), "ai.resume_tailoring")).isEqualTo(Access.ALLOWED);
        assertThat(locks.live(other.getUser().getId())).isEmpty();
        assertThat(locks.live(s.getUser().getId())).isNotEmpty();
    }

    @Test
    void overCapDataStaysWholeAndOnlyTheCapOnCreateApplies() {
        Subscription s = monthly(40);
        RetirementFixtures.resumes(jdbc, s.getUser().getId(), 12);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem item = item(r, s);
        job.run(after(item, 1));
        stripeEnded(s);
        assertThat(db().queryForObject("select count(*) from resume where user_id = ?", Integer.class, s.getUser().getId())).as("nothing archived, nothing deleted").isEqualTo(12);
        assertThat(entitlements.limitFor(s.getUser().getLogin(), "resumes.max", 3)).isEmpty(); // the legacy constant (3 on Free) answers while the resolver is shadowed; create is refused at the cap, reads are not
        assertThat(resolver.resolvePersonal(s.getUser().getLogin()).limit("resumes.max")).isEqualTo(3);
    }

    @Test
    @WithMockUser(username = "user")
    void theLockedServicesAreListedOnTheEntitlementsRoutesForTheSignedInAccount() throws Exception {
        User me = users.findOneByLogin("user").orElseThrow();
        Subscription s = RetirementFixtures.subscriberFor(me, subscriptions, plan.versionId(), "MONTH", "active", 40, false, true);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem item = item(r, s);
        job.run(after(item, 1));
        stripeEnded(s);
        db();
        mockMvc
            .perform(get("/api/entitlements/me"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.locked").isArray())
            .andExpect(jsonPath("$.locked[0].lockedFrom").value("TQ"))
            .andExpect(jsonPath("$.locked[0].lockedSince").isNotEmpty());
        mockMvc
            .perform(get("/api/entitlements/check").param("feature", "ai.resume_tailoring"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.allowed").value(false))
            .andExpect(jsonPath("$.access").value("LOCKED"))
            .andExpect(jsonPath("$.reasonCode").value("FEATURE_LOCKED"))
            .andExpect(jsonPath("$.upgrade.path").value("/settings/plan"));
        mockMvc
            .perform(get("/api/entitlements/check").param("feature", "matches.basic"))
            .andExpect(jsonPath("$.access").value("ALLOWED"));
        mockMvc
            .perform(get("/api/billing/me"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan").value("FREE"))
            .andExpect(jsonPath("$.sunset").doesNotExist());
    }
}
