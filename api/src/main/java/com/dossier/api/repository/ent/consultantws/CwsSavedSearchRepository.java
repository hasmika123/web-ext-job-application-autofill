package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsSavedSearch;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_saved_search}: every method takes the organization id first, then the consultant. */
public interface CwsSavedSearchRepository extends JpaRepository<CwsSavedSearch, Long> {
    List<CwsSavedSearch> findByOrgIdAndConsultantIdAndKindOrderByLastUsedAtDescIdDesc(Long orgId, Long consultantId, String kind);

    Optional<CwsSavedSearch> findByOrgIdAndConsultantIdAndIdAndKind(Long orgId, Long consultantId, Long id, String kind);

    long countByOrgIdAndConsultantIdAndKind(Long orgId, Long consultantId, String kind);
}
