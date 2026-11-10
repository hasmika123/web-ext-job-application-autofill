package com.dossier.api.repository.org;

import com.dossier.api.domain.org.OrgDomain;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

public interface OrgDomainRepository extends Repository<OrgDomain, Long> {
    <S extends OrgDomain> S save(S domain);

    Optional<OrgDomain> findByOrgIdAndId(Long orgId, Long id);

    List<OrgDomain> findByOrgIdOrderByDomain(Long orgId);
}
