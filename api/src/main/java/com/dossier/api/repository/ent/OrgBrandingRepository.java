package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.OrgBranding;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Branding of one organization (a bare repository: every read names the organization). */
public interface OrgBrandingRepository extends Repository<OrgBranding, Long> {
    <S extends OrgBranding> S save(S branding);

    <S extends OrgBranding> S saveAndFlush(S branding);

    @Query("select b from OrgBranding b where b.orgId = :orgId")
    Optional<OrgBranding> findByOrgId(@Param("orgId") Long orgId);
}
