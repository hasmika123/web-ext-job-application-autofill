package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsProfilePref;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_profile_pref}: every method takes the organization id first. */
public interface CwsProfilePrefRepository extends JpaRepository<CwsProfilePref, Long> {
    Optional<CwsProfilePref> findByOrgIdAndId(Long orgId, Long id);

    List<CwsProfilePref> findByOrgIdAndConsultantIdOrderByKindAscSortOrderAscIdAsc(Long orgId, Long consultantId);

    List<CwsProfilePref> findByOrgIdAndConsultantIdAndKindOrderBySortOrderAscIdAsc(Long orgId, Long consultantId, String kind);
}
