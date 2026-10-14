package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ClientAccount;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Marketing "My Assigned Talent" drawer: client names by id. Every method takes the organization id first. */
public interface MktTalentClientRepository extends Repository<ClientAccount, Long> {

    @Query("select c from ClientAccount c where c.orgId = :orgId and c.id in :ids")
    List<ClientAccount> findByIds(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
