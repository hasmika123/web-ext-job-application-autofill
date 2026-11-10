package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ClientAccount;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Marketing workspace (Job Matches) read access to {@code client_account}: every method takes the organization id first. */
public interface MktMatchClientRepository extends Repository<ClientAccount, Long> {
    List<ClientAccount> findByOrgIdAndIdIn(Long orgId, Collection<Long> ids);
}
