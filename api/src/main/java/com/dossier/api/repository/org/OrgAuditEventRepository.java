package com.dossier.api.repository.org;

import com.dossier.api.domain.org.OrgAuditEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.Repository;

/**
 * Append-only trail (tenant-model.md section 2.7): {@code save} and reads, nothing else. There is deliberately no
 * delete, no update query and no {@code JpaRepository} to inherit one from; {@code OrgAuditServiceTest} asserts it.
 */
public interface OrgAuditEventRepository extends Repository<OrgAuditEvent, Long> {
    <S extends OrgAuditEvent> S save(S event);

    Page<OrgAuditEvent> findByOrgId(Long orgId, Pageable pageable);

    Page<OrgAuditEvent> findByOrgIdAndAction(Long orgId, String action, Pageable pageable);

    long countByOrgId(Long orgId);

    long countByOrgIdAndActorLogin(Long orgId, String actorLogin);
}
