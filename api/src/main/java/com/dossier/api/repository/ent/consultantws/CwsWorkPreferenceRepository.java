package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsWorkPreference;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_work_preference}: every method takes the organization id first. */
public interface CwsWorkPreferenceRepository extends JpaRepository<CwsWorkPreference, Long> {
    Optional<CwsWorkPreference> findByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
