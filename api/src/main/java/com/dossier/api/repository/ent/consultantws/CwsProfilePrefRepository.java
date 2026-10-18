package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsProfilePref;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_profile_pref}: every method takes the organization id first. */
public interface CwsProfilePrefRepository extends Repository<CwsProfilePref, Long> {
    <S extends CwsProfilePref> S save(S entity);

    <S extends CwsProfilePref> S saveAndFlush(S entity);

    void flush();

    <S extends CwsProfilePref> List<S> saveAll(Iterable<S> entities);

    void delete(CwsProfilePref entity);

    Optional<CwsProfilePref> findByOrgIdAndId(Long orgId, Long id);

    List<CwsProfilePref> findByOrgIdAndConsultantIdOrderByKindAscSortOrderAscIdAsc(Long orgId, Long consultantId);

    List<CwsProfilePref> findByOrgIdAndConsultantIdAndKindOrderBySortOrderAscIdAsc(Long orgId, Long consultantId, String kind);
}
