package com.dossier.api.repository.org;

import com.dossier.api.domain.org.OrgGroup;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface OrgGroupRepository extends Repository<OrgGroup, Long> {
    <S extends OrgGroup> S save(S group);

    <S extends OrgGroup> S saveAndFlush(S group);

    Optional<OrgGroup> findByOrgIdAndId(Long orgId, Long id);

    List<OrgGroup> findByOrgIdOrderBySortOrderAscNameAsc(Long orgId);

    boolean existsByOrgIdAndName(Long orgId, String name);

    long countByOrgId(Long orgId);

    /** The groups that sit directly under this one (the teams of a department). */
    long countByOrgIdAndParentGroupId(Long orgId, Long parentGroupId);

    List<OrgGroup> findByOrgIdAndParentGroupIdOrderBySortOrderAscNameAsc(Long orgId, Long parentGroupId);

    @Modifying
    @Query("delete from OrgGroup g where g.orgId = :orgId and g.id = :id")
    int deleteByOrgIdAndId(@Param("orgId") Long orgId, @Param("id") Long id);
}
