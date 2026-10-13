package com.dossier.api.repository.org;

import com.dossier.api.domain.org.DataShare;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * The current consent of each seat (consent-data-sharing.md section 2). Every finder names the organization first, like
 * the rest of {@code repository.org}: a member id from another org finds nothing. Reads are never cached, so a
 * withdrawal is visible on the next request.
 */
public interface DataShareRepository extends Repository<DataShare, Long> {
    <S extends DataShare> S save(S share);

    <S extends DataShare> S saveAndFlush(S share);

    Optional<DataShare> findByOrgIdAndMemberId(Long orgId, Long memberId);

    /** The shares whose FULL scope is granted to this one person. */
    List<DataShare> findByOrgIdAndFullToMemberId(Long orgId, Long fullToMemberId);

    long countByOrgIdAndScope(Long orgId, com.dossier.api.domain.enumeration.ShareScope scope);

    @Modifying
    @Query("delete from DataShare s where s.orgId = :orgId and s.memberId = :memberId")
    int deleteByOrgIdAndMemberId(@Param("orgId") Long orgId, @Param("memberId") Long memberId);
}
