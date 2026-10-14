package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsAvailabilityBlock;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_availability_block}: every method takes the organization id first. */
public interface CwsAvailabilityBlockRepository extends JpaRepository<CwsAvailabilityBlock, Long> {
    Optional<CwsAvailabilityBlock> findByOrgIdAndId(Long orgId, Long id);

    List<CwsAvailabilityBlock> findByOrgIdAndConsultantIdOrderByStartDateAscIdAsc(Long orgId, Long consultantId);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
