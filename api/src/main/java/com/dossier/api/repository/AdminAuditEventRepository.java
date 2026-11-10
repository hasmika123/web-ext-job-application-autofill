package com.dossier.api.repository;

import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import java.util.List;
import java.time.Instant;
import com.dossier.api.domain.AdminAuditEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Spring Data repository for the immutable admin audit trail (Phase 9.A1).
 * Read + append only — never update or delete rows. The one exception is the retention sweep (privacy.retention.admin_audit_months).
 */
@Repository
public interface AdminAuditEventRepository extends JpaRepository<AdminAuditEvent, Long> {
    Page<AdminAuditEvent> findAllByActorLoginContainingIgnoreCase(String actorLogin, Pageable pageable);

    // ---- retention (T1.4): read by the retention sweep only; nothing else deletes these rows in bulk ----

    @Query("select count(a) from AdminAuditEvent a where a.createdDate < :cutoff")
    long countPurgeable(@Param("cutoff") Instant cutoff);

    @Query("select a.id from AdminAuditEvent a where a.createdDate < :cutoff order by a.id")
    List<Long> purgeableIds(@Param("cutoff") Instant cutoff, Pageable page);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from AdminAuditEvent a where a.id in :ids")
    int deleteByIdIn(@Param("ids") List<Long> ids);
}
