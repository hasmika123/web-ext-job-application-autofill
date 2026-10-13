package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Marketing "My Assigned Talent" reads of {@code consultant_profile}. Every method takes the organization id first. */
public interface MktTalentConsultantRepository extends JpaRepository<ConsultantProfile, Long> {

    @Query("select c from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE' order by c.displayName asc")
    List<ConsultantProfile> findActiveForOrg(@Param("orgId") Long orgId);

    @Query("select c from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE' and c.id in :ids order by c.displayName asc")
    List<ConsultantProfile> findActiveByIds(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    @Query("select c from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE' and c.id = :id")
    Optional<ConsultantProfile> findActiveById(@Param("orgId") Long orgId, @Param("id") Long id);
}
