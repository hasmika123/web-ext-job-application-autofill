package com.dossier.api.repository;

import com.dossier.api.domain.InboxConnection;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Users' connected inboxes (Phase 14.1), keyed by user id. */
@Repository
public interface InboxConnectionRepository extends JpaRepository<InboxConnection, Long> {
    /**
     * Connections the poller should have read but did not (platform admin, inbox-safety): waiting for a reconnect, or not read since {@code cutoff}
     * (a connection made after the cutoff has not had its turn yet). Connections stopped for want of an entitlement are not "stuck".
     */
    @Query(
        "select c from InboxConnection c where c.status = 'NEEDS_RECONNECT' or (c.status <> 'NO_ENTITLEMENT' and c.connectedAt < :cutoff and (c.lastCheckedAt is null or c.lastCheckedAt < :cutoff))"
    )
    List<InboxConnection> findStuck(@Param("cutoff") Instant cutoff);
}
