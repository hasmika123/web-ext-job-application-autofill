package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.OrgPolicyVersion;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Submitted policy bodies. Every tenant-side read names the organization; the two platform reads ({@link #findByStatusOldestFirst},
 * {@link #findOneById}) exist for the Kiwiply reviewer and are reachable only through the {@code ROLE_ADMIN} resource.
 */
public interface OrgPolicyVersionRepository extends Repository<OrgPolicyVersion, Long> {
    <S extends OrgPolicyVersion> S save(S version);

    <S extends OrgPolicyVersion> S saveAndFlush(S version);

    @Query("select v from OrgPolicyVersion v where v.orgId = :orgId and v.kind = :kind and v.versionNo = :versionNo")
    Optional<OrgPolicyVersion> findByOrgIdAndKindAndVersionNo(@Param("orgId") Long orgId, @Param("kind") String kind, @Param("versionNo") int versionNo);

    @Query("select v from OrgPolicyVersion v where v.orgId = :orgId and v.kind = :kind order by v.versionNo desc")
    List<OrgPolicyVersion> findAllByOrgIdAndKindNewestFirst(@Param("orgId") Long orgId, @Param("kind") String kind);

    @Query("select v from OrgPolicyVersion v where v.orgId = :orgId and v.kind = :kind and v.status = 'PUBLISHED'")
    Optional<OrgPolicyVersion> findPublished(@Param("orgId") Long orgId, @Param("kind") String kind);

    @Query("select v from OrgPolicyVersion v where v.orgId = :orgId and v.kind = :kind and v.status = 'IN_REVIEW'")
    Optional<OrgPolicyVersion> findInReview(@Param("orgId") Long orgId, @Param("kind") String kind);

    @Query("select coalesce(max(v.versionNo), 0) from OrgPolicyVersion v where v.orgId = :orgId and v.kind = :kind")
    int maxVersionNo(@Param("orgId") Long orgId, @Param("kind") String kind);

    /** PLATFORM REVIEW ONLY: submissions in one status across organizations, oldest first. */
    @Query("select v from OrgPolicyVersion v where v.status = :status order by v.submittedAt asc")
    List<OrgPolicyVersion> findByStatusOldestFirst(@Param("status") String status);

    /** PLATFORM REVIEW ONLY: a submission by its id, any organization. */
    @Query("select v from OrgPolicyVersion v where v.id = :id")
    Optional<OrgPolicyVersion> findOneById(@Param("id") Long id);
}
