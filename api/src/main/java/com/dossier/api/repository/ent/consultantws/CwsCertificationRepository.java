package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsCertification;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_certification}: every method takes the organization id first. */
public interface CwsCertificationRepository extends JpaRepository<CwsCertification, Long> {
    Optional<CwsCertification> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);

    List<CwsCertification> findByOrgIdAndConsultantIdOrderByIssuedOnDescIdDesc(Long orgId, Long consultantId);
}
