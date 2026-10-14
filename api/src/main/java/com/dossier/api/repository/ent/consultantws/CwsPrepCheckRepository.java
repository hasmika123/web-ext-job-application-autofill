package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPrepCheck;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_prep_check}: every method takes the organization id first. */
public interface CwsPrepCheckRepository extends JpaRepository<CwsPrepCheck, Long> {
    List<CwsPrepCheck> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsPrepCheck> findByOrgIdAndConsultantIdAndItemKey(Long orgId, Long consultantId, String itemKey);
}
