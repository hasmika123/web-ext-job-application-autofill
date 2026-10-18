package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ClientAccount;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Batch lookup of client accounts by id for the Applications board (org first, always). */
public interface MktApplicationClientRepository extends Repository<ClientAccount, Long> {
    List<ClientAccount> findByOrgIdAndIdIn(Long orgId, Collection<Long> ids);
}
