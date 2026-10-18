package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ClientAccount;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** The Activities page's own read of client accounts (names for the feed, the Client filter and the Log Activity picker). Org id first. */
public interface MktActivityClientRepository extends Repository<ClientAccount, Long> {

    Optional<ClientAccount> findByOrgIdAndId(Long orgId, Long id);

    @Query("select c from ClientAccount c where c.orgId = :orgId and c.id in :ids")
    List<ClientAccount> findByOrgIdAndIdIn(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    @Query("select c from ClientAccount c where c.orgId = :orgId order by c.name asc, c.id asc")
    List<ClientAccount> findAllByName(@Param("orgId") Long orgId, Pageable page);
}
