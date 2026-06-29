package com.dossier.api.repository;

import com.dossier.api.domain.AdminAuditEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Spring Data repository for the immutable admin audit trail (Phase 9.A1).
 * Read + append only — never update or delete rows.
 */
@Repository
public interface AdminAuditEventRepository extends JpaRepository<AdminAuditEvent, Long> {
    Page<AdminAuditEvent> findAllByActorLoginContainingIgnoreCase(String actorLogin, Pageable pageable);
}
