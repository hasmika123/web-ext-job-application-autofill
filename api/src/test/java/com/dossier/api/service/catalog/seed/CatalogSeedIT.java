package com.dossier.api.service.catalog.seed;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.service.catalog.DependencyGraph;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * K1.4 on MySQL: the Liquibase seed ran when the schema was built, every seeded row is there, a second run inserts nothing, no price row exists, and
 * the stored dependency graph is acyclic. (CatalogSeedTest of the story.)
 */
@IntegrationTest
@Transactional
class CatalogSeedIT {

    @Autowired private JdbcTemplate jdbc;

    private long count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Long.class);
    }

    @Test
    void theMigrationSeededEveryServiceProductLimitDependencyAndPreset() {
        for (CatalogSeedData.Svc s : CatalogSeedData.SERVICES) {
            Map<String, Object> row = jdbc.queryForMap("select * from feature_definition where feature_key = ?", s.key());
            assertThat(row.get("audience")).as(s.key()).isEqualTo(s.audience());
            assertThat(row.get("default_allowance")).as("allowance of %s", s.key()).isEqualTo(s.allowance());
            assertThat(row.get("ai_budget_cents")).isEqualTo(s.aiBudgetCents());
            assertThat(row.get("visibility")).isEqualTo(s.visibility());
            assertThat(row.get("demo_data")).as("seeded rows are not demo data").isIn(false, 0);
        }
        for (CatalogSeedData.Prod p : CatalogSeedData.PRODUCTS) {
            Map<String, Object> row = jdbc.queryForMap("select * from product where code = ?", p.code());
            assertThat(row.get("kind")).isEqualTo(p.kind());
            assertThat(row.get("sold_to")).isEqualTo(p.soldTo());
        }
        assertThat(jdbc.queryForObject("select count(*) from feature_definition_limit where feature_key = 'automation.approved_apply' and limit_key = 'operations.per_day' and limit_value = 30", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select count(*) from feature_dependency where feature_key = 'ai.credits_extra' and requires_feature_key = 'any:consumes_ai' and kind = 'COMMERCIAL'", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select count(*) from license_preset where active = true", Long.class)).as("presets are seeded inactive").isZero();
        assertThat(jdbc.queryForObject("select count(*) from license_preset", Long.class)).isGreaterThanOrEqualTo((long) CatalogSeedData.PRESETS.size());
        assertThat(jdbc.queryForObject("select mirrors_product_code from license_preset where `key` = 'FULL_CAREER_SUPPORT'", String.class)).isEqualTo("AUTOPILOT");
    }

    @Test
    void aSecondRunInsertsNothing() {
        long services = count("feature_definition");
        long products = count("product");
        long limits = count("feature_definition_limit");
        long deps = count("feature_dependency");
        long presets = count("license_preset");
        Integer inserted = jdbc.execute((ConnectionCallback<Integer>) c -> CatalogSeedChange.seed(c));
        assertThat(inserted).isZero();
        assertThat(count("feature_definition")).isEqualTo(services);
        assertThat(count("product")).isEqualTo(products);
        assertThat(count("feature_definition_limit")).isEqualTo(limits);
        assertThat(count("feature_dependency")).isEqualTo(deps);
        assertThat(count("license_preset")).isEqualTo(presets);
    }

    @Test
    void aSeededRowAnAdminEditedIsNeverOverwritten() {
        jdbc.update("update feature_definition set default_allowance = 77, name = 'Edited by admin' where feature_key = 'ai.job_matching'");
        jdbc.execute((ConnectionCallback<Integer>) c -> CatalogSeedChange.seed(c));
        assertThat(jdbc.queryForObject("select default_allowance from feature_definition where feature_key = 'ai.job_matching'", Long.class)).isEqualTo(77L);
        assertThat(jdbc.queryForObject("select name from feature_definition where feature_key = 'ai.job_matching'", String.class)).isEqualTo("Edited by admin");
    }

    @Test
    void theSeedCreatesNoPrice() {
        assertThat(jdbc.queryForObject("select count(*) from product_price pp join product p on p.id = pp.product_id where p.demo_data = false", Long.class))
            .as("the catalog ships without prices")
            .isZero();
        assertThat(jdbc.queryForObject("select count(*) from catalog_publish where published_by <> 'seed'", Long.class)).as("no admin has published anything").isZero();
    }

    @Test
    void theStoredDependencyGraphHasNoCycle() {
        DependencyGraph g = new DependencyGraph();
        List<Map<String, Object>> rows = jdbc.queryForList("select feature_key, requires_feature_key from feature_dependency where active = true");
        for (Map<String, Object> r : rows) g.add((String) r.get("feature_key"), (String) r.get("requires_feature_key"));
        assertThat(rows).isNotEmpty();
        assertThat(g.findCycle()).isEmpty();
    }
}
