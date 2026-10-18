package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.OrgPolicy;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** The working copy of an organization's policies (a bare repository: every read names the organization). */
public interface OrgPolicyRepository extends Repository<OrgPolicy, Long> {
    <S extends OrgPolicy> S save(S policy);

    <S extends OrgPolicy> S saveAndFlush(S policy);

    @Query("select p from OrgPolicy p where p.orgId = :orgId and p.kind = :kind")
    Optional<OrgPolicy> findByOrgIdAndKind(@Param("orgId") Long orgId, @Param("kind") String kind);

    @Query("select p from OrgPolicy p where p.orgId = :orgId")
    List<OrgPolicy> findAllByOrgId(@Param("orgId") Long orgId);
}
