package com.dossier.api.repository.org;

import com.dossier.api.domain.org.OrgInviteBatch;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface OrgInviteBatchRepository extends Repository<OrgInviteBatch, Long> {
    <S extends OrgInviteBatch> S save(S batch);

    Optional<OrgInviteBatch> findByOrgIdAndId(Long orgId, Long id);

    List<OrgInviteBatch> findByOrgIdOrderByCreatedAtDesc(Long orgId);

    /** One more person of this batch accepted. */
    @Modifying(flushAutomatically = true)
    @Query("update OrgInviteBatch b set b.acceptedCount = b.acceptedCount + 1 where b.orgId = :orgId and b.id = :batchId")
    int incrementAccepted(@Param("orgId") Long orgId, @Param("batchId") Long batchId);
}
