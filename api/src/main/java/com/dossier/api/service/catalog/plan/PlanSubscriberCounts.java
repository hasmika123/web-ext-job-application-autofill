package com.dossier.api.service.catalog.plan;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Who holds which version of a plan (stories K2.3 and K2.4): counts for the plans list, the preview impact and the retire guard, and the admin-only roster.
 * Reads {@code subscription.plan_version_id} (and {@code scheduled_plan_version_id}); the organization side ({@code org_subscription.plan_version_id}) and the
 * grant table are read once those columns and tables exist, so this class needs no change when the enterprise stories land. Platform data: no org scoping,
 * counts only, logins only for the admin roster.
 */
@Component
public class PlanSubscriberCounts {

    private final JdbcTemplate jdbc;

    public PlanSubscriberCounts(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private boolean column(String table, String column) {
        Integer n = jdbc.queryForObject(
            "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
            Integer.class,
            table,
            column
        );
        return n != null && n > 0;
    }

    /** Subscribers per version number of {@code planId} (personal subscriptions in a live-ish state plus organization subscriptions when the column exists). */
    @Transactional(readOnly = true)
    public Map<Integer, Long> byVersion(Long planId) {
        Map<Integer, Long> out = new LinkedHashMap<>();
        jdbc.query(
            "SELECT v.version AS version, COUNT(*) AS n FROM subscription s JOIN plan_version v ON v.id = s.plan_version_id WHERE v.plan_id = ? GROUP BY v.version ORDER BY v.version",
            rs -> {
                out.merge(rs.getInt("version"), rs.getLong("n"), Long::sum);
            },
            planId
        );
        if (column("org_subscription", "plan_version_id")) {
            jdbc.query(
                "SELECT v.version AS version, COUNT(*) AS n FROM org_subscription s JOIN plan_version v ON v.id = s.plan_version_id WHERE v.plan_id = ? GROUP BY v.version ORDER BY v.version",
                rs -> {
                    out.merge(rs.getInt("version"), rs.getLong("n"), Long::sum);
                },
                planId
            );
        }
        return out;
    }

    /**
     * Every reference to any version of the plan: current and scheduled personal subscriptions, organization subscriptions and grants. The retire guard
     * refuses while this is above 0.
     */
    @Transactional(readOnly = true)
    public long references(Long planId) {
        long n = count("SELECT COUNT(*) FROM subscription s JOIN plan_version v ON v.id = s.plan_version_id WHERE v.plan_id = ?", planId);
        if (column("subscription", "scheduled_plan_version_id")) {
            n += count("SELECT COUNT(*) FROM subscription s JOIN plan_version v ON v.id = s.scheduled_plan_version_id WHERE v.plan_id = ?", planId);
        }
        if (column("org_subscription", "plan_version_id")) {
            n += count("SELECT COUNT(*) FROM org_subscription s JOIN plan_version v ON v.id = s.plan_version_id WHERE v.plan_id = ?", planId);
        }
        if (column("entitlement_grant", "plan_version_id")) {
            n += count("SELECT COUNT(*) FROM entitlement_grant g JOIN plan_version v ON v.id = g.plan_version_id WHERE v.plan_id = ?", planId);
        }
        return n;
    }

    private long count(String sql, Long planId) {
        Long n = jdbc.queryForObject(sql, Long.class, planId);
        return n == null ? 0 : n;
    }

    /** One roster row; the login is the admin's to see and nobody else's. */
    public record Row(String login, Instant since, String interval, String state) {}

    /** The personal subscribers of one version (admin only), newest first. */
    @Transactional(readOnly = true)
    public List<Row> roster(Long planVersionId, int limit, int offset) {
        List<Row> out = new ArrayList<>();
        jdbc.query(
            "SELECT u.login AS login, s.created_at AS since, s.billing_interval AS bi, s.status AS st FROM subscription s JOIN jhi_user u ON u.id = s.user_id "
                + "WHERE s.plan_version_id = ? ORDER BY s.id DESC LIMIT ? OFFSET ?",
            rs -> {
                java.sql.Timestamp t = rs.getTimestamp("since");
                out.add(new Row(rs.getString("login"), t == null ? null : t.toInstant(), rs.getString("bi"), rs.getString("st")));
            },
            planVersionId,
            limit,
            offset
        );
        return out;
    }
}
