package com.dossier.api.service.catalog;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Which published plans include a service (or sell a product). A service cannot be retired, and a price cannot be retired when it is the last
 * active price of a product, while a PUBLISHED plan version still uses it. The plan tables come with story K2.1; until they exist this answers
 * "no plan", and once they do it reads them with no change here.
 */
@Component
public class LivePlanLookup {

    private final JdbcTemplate jdbc;

    public LivePlanLookup(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The plan keys (sorted) whose PUBLISHED version holds a component for {@code featureKey}. */
    @Transactional(readOnly = true)
    public List<String> planKeysUsingService(String featureKey) {
        if (!planTablesExist()) return List.of();
        return jdbc.queryForList(
            "SELECT DISTINCT p.plan_key FROM plan_component c JOIN plan_version v ON v.id = c.plan_version_id JOIN plan p ON p.id = v.plan_id "
                + "WHERE v.status = 'PUBLISHED' AND c.feature_key = ? ORDER BY p.plan_key",
            String.class,
            featureKey
        );
    }

    /** The plan keys (sorted) whose PUBLISHED version is based on, or sells a component through, {@code productId}. */
    @Transactional(readOnly = true)
    public List<String> planKeysUsingProduct(Long productId) {
        if (!planTablesExist()) return List.of();
        return jdbc.queryForList(
            "SELECT DISTINCT p.plan_key FROM plan_version v JOIN plan p ON p.id = v.plan_id "
                + "LEFT JOIN plan_component c ON c.plan_version_id = v.id "
                + "WHERE v.status = 'PUBLISHED' AND (v.base_product_id = ? OR c.product_id = ?) ORDER BY p.plan_key",
            String.class,
            productId,
            productId
        );
    }

    /**
     * The plan keys (sorted) whose PUBLISHED version sells {@code productId} at {@code interval}: the version offers that interval (or the price is
     * ONE_TIME and the product is a component). Retiring the only active price of that key would leave the plan unsellable.
     */
    @Transactional(readOnly = true)
    public List<String> planKeysNeedingPrice(Long productId, String interval) {
        if (!planTablesExist()) return List.of();
        return jdbc.queryForList(
            "SELECT DISTINCT p.plan_key FROM plan_version v JOIN plan p ON p.id = v.plan_id "
                + "LEFT JOIN plan_component c ON c.plan_version_id = v.id "
                + "WHERE v.status = 'PUBLISHED' AND (v.base_product_id = ? OR c.product_id = ?) "
                + "AND (? = 'ONE_TIME' OR JSON_CONTAINS(v.intervals_json, JSON_QUOTE(?))) ORDER BY p.plan_key",
            String.class,
            productId,
            productId,
            interval,
            interval
        );
    }

    private boolean planTablesExist() {
        Integer n = jdbc.queryForObject(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('plan', 'plan_version', 'plan_component')",
            Integer.class
        );
        return n != null && n == 3;
    }
}
