package com.dossier.api.service.privacy;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

/**
 * One kind of row the retention sweep may purge once it is older than an admin-configured window (T1.4). Each target names its table (so the data map
 * can prove every personal table has a retention story or an erasure path), its settings key, the unit of that window, and the three operations the
 * sweep needs: count what qualifies (the dry run), page through the qualifying ids, delete a page by id. Deleting by id keeps a second instance
 * harmless: a row someone else already removed simply is not there.
 */
public interface RetentionTarget {
    /** Stable job name, used in the lease, the run record, the audit row and the admin API (for example {@code ADMIN_AUDIT}). */
    String job();

    /** The table this target purges (checked against the data map). */
    String table();

    /** The registry key holding the window; 0 means keep for ever. */
    String settingKey();

    /** {@code months} or {@code days}. */
    String unit();

    /** What the window means, in one sentence (shown on the admin page). */
    String description();

    long count(Instant cutoff);

    /** The next page (at most {@code limit}) of ids that qualify, oldest first. */
    List<Long> nextIds(Instant cutoff, int limit);

    /** Deletes exactly these rows; returns how many were still there. */
    int delete(List<Long> ids);

    /** The instant before which a row qualifies, for a window of {@code window} units counted back from {@code now}. */
    default Instant cutoff(Instant now, int window) {
        return "days".equals(unit()) ? now.minusSeconds(window * 86400L) : now.atZone(ZoneOffset.UTC).minusMonths(window).toInstant();
    }
}
