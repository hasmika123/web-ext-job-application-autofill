package com.dossier.api.service.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.catalog.dto.PlanDTOs.NewVersionRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.PlanVersionDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.SubscribersDTO;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K2.4 on MySQL: grandfathering is structural. A subscription keeps its plan version, its row, its prices and its included services across any later publish,
 * a published snapshot never changes (GrandfatherTest), and a plan can be retired only when nothing references any of its versions (PlanRetireGuardTest,
 * PlanSubscribersTest). The opt-in version migration is FUTURE (S-03) and has no route.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
class GrandfatherIT extends PlanItSupport {

    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private UserRepository users;

    private Long subscriberOn(String planKey, int version, String interval) {
        String s = UUID.randomUUID().toString().substring(0, 8);
        User u = new User();
        u.setLogin("gf-" + s);
        u.setPassword("x".repeat(60));
        u.setActivated(true);
        u.setEmail("gf." + s + "@example.test");
        u.setLangKey("en");
        u = users.saveAndFlush(u);
        Subscription sub = new Subscription();
        sub.setUser(u);
        sub.setPlan("PRO");
        sub.setStatus("active");
        sub.setCurrentPeriodEnd(Instant.now().plus(20, ChronoUnit.DAYS));
        Long id = subscriptions.saveAndFlush(sub).getId();
        jdbc.update(
            "update subscription set plan_version_id = (select v.id from plan_version v join plan p on p.id = v.plan_id where p.plan_key = ? and v.version = ?), billing_interval = ? where id = ?",
            planKey, version, interval, id
        );
        return id;
    }

    private Map<String, Object> subscription(Long id) {
        return jdbc.queryForMap("select plan, status, price_id, plan_version_id, billing_interval, current_period_end, updated_at from subscription where id = ?", id);
    }

    private void publishProV1() {
        draft("PRO", "INDIVIDUAL", "MONTH", 1999);
        draft("PRO", "INDIVIDUAL", "QUARTER", 4999);
        withoutOptionals("PRO", 1);
        publish("PRO", 1);
    }

    @Test
    void publishingANewVersionLeavesASubscriberOnTheOldOneByteIdentical() {
        publishProV1();
        Long id = subscriberOn("PRO", 1, "MONTH");
        Map<String, Object> before = subscription(id);
        PlanVersionDTO v1 = plans.getVersion("PRO", 1);

        PlanVersionDTO v2 = plans.newVersion("PRO", new NewVersionRequest(null, REASON));
        draft("PRO", "INDIVIDUAL", "MONTH", 2499);
        draft("PRO", "INDIVIDUAL", "QUARTER", 5999);
        patch("PRO", v2.version(), "{\"aiBudgetCapCents\":350}");
        publish("PRO", v2.version());

        assertThat(subscription(id)).as("the subscription row").isEqualTo(before);
        PlanVersionDTO v1After = plans.getVersion("PRO", 1);
        assertThat(v1After.snapshotHash()).isEqualTo(v1.snapshotHash());
        assertThat(v1After.baseProduct().prices()).isEqualTo(v1.baseProduct().prices());
        assertThat(v1After.components()).isEqualTo(v1.components());
        assertThat(v1After.aiBudgetCapCents()).isEqualTo(300);
        assertThat(v1After.status()).isEqualTo("SUPERSEDED");
        assertThat(plans.getVersion("PRO", 2).baseProduct().prices()).extracting(p -> p.amountMinor()).contains(2499L, 5999L);
    }

    @Test
    void subscribersAreCountedPerVersionAndOnlyTheRosterShowsLogins() {
        publishProV1();
        subscriberOn("PRO", 1, "MONTH");
        subscriberOn("PRO", 1, "QUARTER");
        SubscribersDTO counts = lifecycle.subscribers("PRO", null, 0, 50);
        assertThat(counts.total()).isEqualTo(2);
        assertThat(counts.byVersion()).containsEntry("1", 2L);
        assertThat(counts.rows()).isEmpty();
        SubscribersDTO roster = lifecycle.subscribers("PRO", 1, 0, 50);
        assertThat(roster.rows()).hasSize(2);
        assertThat(roster.rows()).extracting(r -> r.interval()).containsExactlyInAnyOrder("MONTH", "QUARTER");
        assertThat(roster.rows()).allSatisfy(r -> assertThat(r.login()).startsWith("gf-"));
        assertThat(plans.list("INDIVIDUAL", "PUBLISHED")).filteredOn(s -> s.planKey().equals("PRO")).singleElement().satisfies(s -> {
            assertThat(s.subscribersByVersion()).containsEntry("1", 2L);
            assertThat(s.liveVersion().version()).isEqualTo(1);
            assertThat(s.pricesByInterval()).containsEntry("MONTH", 1999L).containsEntry("QUARTER", 4999L);
            assertThat(s.marginWorstBp()).isNotNull().isGreaterThanOrEqualTo(8000);
        });
    }

    @Test
    void aPlanWithOneRemainingSubscriberCannotBeRetired() {
        publishProV1();
        Long id = subscriberOn("PRO", 1, "MONTH");
        assertThatThrownBy(() -> lifecycle.retire("PRO", "Stop selling Pro for the guard test")).isInstanceOfSatisfying(CatalogException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("PLAN_HAS_SUBSCRIBERS");
            assertThat(e.getExtra()).containsEntry("references", 1L);
        });
        assertThat(jdbc.queryForObject("select status from plan where plan_key = 'PRO'", String.class)).isEqualTo("PUBLISHED");

        // a scheduled plan change is a reference too
        jdbc.update("update subscription set plan_version_id = null, scheduled_plan_version_id = (select v.id from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'PRO' and v.version = 1) where id = ?", id);
        assertThatThrownBy(() -> lifecycle.retire("PRO", "Stop selling Pro for the guard test")).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("PLAN_HAS_SUBSCRIBERS"));

        jdbc.update("update subscription set scheduled_plan_version_id = null where id = ?", id);
        lifecycle.retire("PRO", "Stop selling Pro for the guard test");
        assertThat(jdbc.queryForObject("select status from plan where plan_key = 'PRO'", String.class)).isEqualTo("RETIRED");
        assertThat(jdbc.queryForObject("select count(*) from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'PRO' and v.status <> 'RETIRED'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from admin_audit_event where action = 'PLAN_RETIRED' and target_id = 'plan:PRO'", Integer.class)).isEqualTo(1);
    }

    @Test
    void aSupersededVersionNobodyHoldsCanBeArchivedButAHeldOneCannot() {
        publishProV1();
        subscriberOn("PRO", 1, "MONTH");
        PlanVersionDTO v2 = plans.newVersion("PRO", new NewVersionRequest(null, REASON));
        draft("PRO", "INDIVIDUAL", "MONTH", 2499);
        publish("PRO", v2.version());
        assertThatThrownBy(() -> lifecycle.archiveVersion("PRO", 1, "Archive the old Pro version")).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("VERSION_IN_USE"));
        assertThatThrownBy(() -> lifecycle.archiveVersion("PRO", 2, "Archive the live Pro version")).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("VERSION_STATE"));
        jdbc.update("update subscription set plan_version_id = null where plan_version_id is not null and plan = 'PRO'");
        lifecycle.archiveVersion("PRO", 1, "Archive the old Pro version");
        assertThat(plans.getVersion("PRO", 1).status()).isEqualTo("RETIRED");
    }
}
