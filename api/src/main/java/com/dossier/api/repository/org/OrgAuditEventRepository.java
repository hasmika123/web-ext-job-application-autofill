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

    /** The rows of any of {@code actions} (the Roles page's org-wide history). */
    Page<OrgAuditEvent> findByOrgIdAndActionIn(Long orgId, java.util.Collection<String> actions, Pageable pageable);

    /** The rows about one target (the Roles page's history of one role). */
    Page<OrgAuditEvent> findByOrgIdAndTargetTypeAndTargetId(Long orgId, String targetType, String targetId, Pageable pageable);

    long countByOrgId(Long orgId);

    long countByOrgIdAndActorLogin(Long orgId, String actorLogin);

    /** How many rows of any of {@code actions} the organization wrote since {@code since} (the per-hour cap on direct account creation). */
    long countByOrgIdAndActionInAndCreatedAtAfter(Long orgId, java.util.Collection<String> actions, java.time.Instant since);
}
