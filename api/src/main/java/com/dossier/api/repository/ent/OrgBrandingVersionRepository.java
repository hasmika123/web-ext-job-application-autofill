package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.OrgBrandingVersion;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Published branding snapshots of one organization (append-only; every read names the organization). */
public interface OrgBrandingVersionRepository extends Repository<OrgBrandingVersion, Long> {
    <S extends OrgBrandingVersion> S save(S version);

    @Query("select v from OrgBrandingVersion v where v.orgId = :orgId and v.versionNo = :versionNo")
    Optional<OrgBrandingVersion> findByOrgIdAndVersionNo(@Param("orgId") Long orgId, @Param("versionNo") int versionNo);

    @Query("select v from OrgBrandingVersion v where v.orgId = :orgId order by v.versionNo desc")
    List<OrgBrandingVersion> findAllByOrgIdNewestFirst(@Param("orgId") Long orgId);

    @Query("select coalesce(max(v.versionNo), 0) from OrgBrandingVersion v where v.orgId = :orgId")
    int maxVersionNo(@Param("orgId") Long orgId);
}
