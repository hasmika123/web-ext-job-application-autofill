package com.dossier.api.service.catalog.seed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.service.catalog.seed.PlanSeedData.PlanSpec;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/** K2.1 on MySQL: the plans are seeded as behaviour-identical compositions, one PUBLISHED version per plan, a rerun inserts nothing, and no price exists. */
@IntegrationTest
@Transactional
class PlanSeedIT {

    @Autowired private JdbcTemplate jdbc;

    private long count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Long.class, args);
    }

    @Test
    void theFourPlansAreSeededWithTheirStatusesAndVersionOne() {
        for (PlanSpec s : PlanSeedData.PLANS) {
            Map<String, Object> plan = jdbc.queryForMap("select * from plan where plan_key = ?", s.planKey());
            assertThat(plan.get("audience")).isEqualTo(s.audience());
            assertThat(plan.get("status")).isEqualTo(s.planStatus());
            Map<String, Object> v = jdbc.queryForMap("select * from plan_version where plan_id = ? and version = 1", plan.get("id"));
            assertThat(v.get("status")).isEqualTo(s.versionStatus());
            assertThat(v.get("ai_budget_cap_cents")).isEqualTo(s.aiBudgetCapCents());
            assertThat(count("select count(*) from plan_component where plan_version_id = ?", v.get("id"))).isEqualTo((long) s.components().size());
        }
        assertThat(jdbc.queryForObject("select base_product_id is not null from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'PRO'", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("select base_product_id is null from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'FREE'", Boolean.class)).isTrue();
    }

    @Test
    void onlyFreeIsPublishedAndItIsRecordedAsCatalogVersionOne() {
        List<String> published = jdbc.queryForList("select p.plan_key from plan_version v join plan p on p.id = v.plan_id where v.status = 'PUBLISHED' order by p.plan_key", String.class);
        assertThat(published).containsExactly("FREE");
        Map<String, Object> free = jdbc.queryForMap("select * from plan_version v where v.plan_id = (select id from plan where plan_key = 'FREE')");
        assertThat(free.get("catalog_version")).isEqualTo(1);
        assertThat(free.get("snapshot_hash")).isNotNull();
        assertThat(free.get("live_key")).as("generated live_key marks the one PUBLISHED version").isNotNull();
        assertThat(count("select count(*) from catalog_publish where id = 1 and published_by = 'seed'")).isEqualTo(1L);
    }

    @Test
    void oneLiveVersionPerPlanIsEnforcedByTheDatabase() {
        Long planId = jdbc.queryForObject("select id from plan where plan_key = 'FREE'", Long.class);
        assertThatThrownBy(() ->
            jdbc.update(
                "insert into plan_version (plan_id, version, status, intervals_json, ai_budget_cap_cents, created_at, created_by, updated_at) values (?, 2, 'PUBLISHED', '[]', 0, now(6), 'it', now(6))",
                planId
            )
        ).isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void todaysNumbersSurviveAsComponentOverrides() {
        assertThat(allowance("FREE", "resume.library")).isEqualTo(3L);
        assertThat(allowance("PRO", "resume.library")).isEqualTo(25L);
        assertThat(allowance("AUTOPILOT", "resume.library")).isEqualTo(50L);
        assertThat(allowance("AUTOPILOT", "automation.approved_apply")).isEqualTo(300L);
        assertThat(jdbc.queryForObject("select count(*) from plan_component c join plan_version v on v.id = c.plan_version_id join plan p on p.id = v.plan_id where p.plan_key = 'PRO' and c.role = 'OPTIONAL' and c.product_id is not null", Long.class)).isEqualTo(3L);
        String rules = jdbc.queryForObject("select seat_rules_json from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'ORG_STANDARD'", String.class);
        assertThat(rules).contains("seatBaseProductId").contains("setupFeeProductId").contains("enterprise.license.max_seats");
    }

    private Long allowance(String planKey, String feature) {
        return jdbc.queryForObject(
            "select c.allowance_override from plan_component c join plan_version v on v.id = c.plan_version_id join plan p on p.id = v.plan_id where p.plan_key = ? and c.feature_key = ?",
            Long.class, planKey, feature
        );
    }

    @Test
    void aSecondRunInsertsNothingAndNoPriceExists() {
        long plans = count("select count(*) from plan");
        long versions = count("select count(*) from plan_version");
        long components = count("select count(*) from plan_component");
        long publishes = count("select count(*) from catalog_publish");
        Integer inserted = jdbc.execute((ConnectionCallback<Integer>) c -> PlanSeedChange.seed(c));
        assertThat(inserted).isZero();
        assertThat(count("select count(*) from plan")).isEqualTo(plans);
        assertThat(count("select count(*) from plan_version")).isEqualTo(versions);
        assertThat(count("select count(*) from plan_component")).isEqualTo(components);
        assertThat(count("select count(*) from catalog_publish")).isEqualTo(publishes);
        assertThat(count("select count(*) from product_price pp join product p on p.id = pp.product_id where p.demo_data = false")).as("the plans seed creates no price").isZero();
    }

    @Test
    void aSeededPlanAnAdminEditedIsNeverOverwritten() {
        jdbc.update("update plan set name = 'Pro (edited)' where plan_key = 'PRO'");
        jdbc.execute((ConnectionCallback<Integer>) c -> PlanSeedChange.seed(c));
        assertThat(jdbc.queryForObject("select name from plan where plan_key = 'PRO'", String.class)).isEqualTo("Pro (edited)");
    }
}
