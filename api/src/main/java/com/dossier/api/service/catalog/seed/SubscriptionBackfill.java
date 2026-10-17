package com.dossier.api.service.catalog.seed;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Points every personal {@code subscription} row at the plan version it bought (docs/subscriptions/08-data-model.md section 5 step 4; story K2.1). A
 * row with a Pro price becomes PRO v1 with the billing interval of that price (the monthly price id means MONTH, the three-month price id means QUARTER);
 * a row without one becomes FREE v1. The currency is USD. <b>Idempotent</b>: only rows with {@code plan_version_id IS NULL} are touched, so a rerun
 * changes nothing. There are no existing subscribers today (decision S-03), so on a fresh database this is a no-op; it stays as the safety net for rows
 * written later, and for any test or demo database that has some.
 *
 * <p>A Pro row whose price matches neither configured price id is still linked to PRO v1 (it IS a Pro subscriber) with the interval left NULL, and
 * reported in {@link Result#unmapped()}; the caller decides whether that is a warning (the default) or a failure. The {@code plan} label and every Stripe
 * column are never touched: this only fills the new columns. No entitlement read changes.
 */
public final class SubscriptionBackfill {

    private static final Logger LOG = LoggerFactory.getLogger(SubscriptionBackfill.class);

    /** What a run did: rows linked to PRO v1 (with / without an interval) and to FREE v1. */
    public record Result(int pro, int free, List<Long> unmapped, boolean plansPresent) {
        public int total() {
            return pro + free;
        }
    }

    private SubscriptionBackfill() {}

    /**
     * @param intervalByPriceId Stripe price id to billing interval (MONTH or QUARTER); blank ids are ignored
     */
    public static Result run(Connection c, Map<String, String> intervalByPriceId) throws SQLException {
        Long pro = versionId(c, "PRO");
        Long free = versionId(c, "FREE");
        if (pro == null || free == null) return new Result(0, 0, List.of(), false); // the plans are not seeded yet: nothing to point at
        int proCount = 0;
        int freeCount = 0;
        List<Long> unmapped = new ArrayList<>();
        List<long[]> rows = new ArrayList<>();
        List<String[]> info = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT id, plan, price_id FROM subscription WHERE plan_version_id IS NULL");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                rows.add(new long[] { rs.getLong(1) });
                info.add(new String[] { rs.getString(2), rs.getString(3) });
            }
        }
        try (PreparedStatement up = c.prepareStatement("UPDATE subscription SET plan_version_id = ?, billing_interval = ?, currency = 'USD' WHERE id = ? AND plan_version_id IS NULL")) {
            for (int i = 0; i < rows.size(); i++) {
                long id = rows.get(i)[0];
                String plan = info.get(i)[0];
                String priceId = info.get(i)[1];
                String interval = priceId == null || priceId.isBlank() ? null : intervalByPriceId.get(priceId.trim());
                boolean isPro = interval != null || (priceId != null && !priceId.isBlank()) || "PRO".equalsIgnoreCase(plan);
                if (isPro) {
                    if (interval == null) unmapped.add(id);
                    up.setLong(1, pro);
                    proCount++;
                } else {
                    up.setLong(1, free);
                    freeCount++;
                }
                if (isPro && interval != null) up.setString(2, interval);
                else up.setNull(2, java.sql.Types.VARCHAR);
                up.setLong(3, id);
                up.addBatch();
            }
            if (!rows.isEmpty()) up.executeBatch();
        }
        if (!unmapped.isEmpty()) {
            LOG.warn("subscription backfill: {} Pro row(s) match no configured price id and were linked to PRO v1 without an interval: {}", unmapped.size(), unmapped);
        }
        return new Result(proCount, freeCount, List.copyOf(unmapped), true);
    }

    private static Long versionId(Connection c, String planKey) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
            "SELECT v.id FROM plan_version v JOIN plan p ON p.id = v.plan_id WHERE p.plan_key = ? AND v.version = 1"
        )) {
            ps.setString(1, planKey);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getLong(1) : null;
            }
        }
    }
}
