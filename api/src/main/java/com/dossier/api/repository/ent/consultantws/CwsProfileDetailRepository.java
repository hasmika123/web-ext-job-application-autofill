package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsProfileDetail;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_profile_detail} (one row per consultant): every method takes the organization id first. */
public interface CwsProfileDetailRepository extends JpaRepository<CwsProfileDetail, Long> {
    Optional<CwsProfileDetail> findByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
