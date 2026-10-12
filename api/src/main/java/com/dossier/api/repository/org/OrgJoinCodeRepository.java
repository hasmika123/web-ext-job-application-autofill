package com.dossier.api.repository.org;

import com.dossier.api.domain.org.OrgJoinCode;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

public interface OrgJoinCodeRepository extends Repository<OrgJoinCode, Long> {
    <S extends OrgJoinCode> S save(S code);

    Optional<OrgJoinCode> findByOrgIdAndId(Long orgId, Long id);

    List<OrgJoinCode> findByOrgIdOrderByCreatedAtDesc(Long orgId);
}
