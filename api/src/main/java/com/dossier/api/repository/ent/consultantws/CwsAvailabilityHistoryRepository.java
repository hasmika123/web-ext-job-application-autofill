package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsAvailabilityHistory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_availability_history}: every method takes the organization id first. */
public interface CwsAvailabilityHistoryRepository extends JpaRepository<CwsAvailabilityHistory, Long> {
    List<CwsAvailabilityHistory> findByOrgIdAndConsultantIdOrderByEffectiveDateDescIdDesc(Long orgId, Long consultantId);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
