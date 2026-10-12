package com.dossier.api.repository.org;

import com.dossier.api.domain.org.OrgInviteBatch;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

public interface OrgInviteBatchRepository extends Repository<OrgInviteBatch, Long> {
    <S extends OrgInviteBatch> S save(S batch);

    Optional<OrgInviteBatch> findByOrgIdAndId(Long orgId, Long id);

    List<OrgInviteBatch> findByOrgIdOrderByCreatedAtDesc(Long orgId);
}
