package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsSavedSearch;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_saved_search}: every method takes the organization id first, then the consultant. */
public interface CwsSavedSearchRepository extends Repository<CwsSavedSearch, Long> {
    <S extends CwsSavedSearch> S save(S entity);

    <S extends CwsSavedSearch> S saveAndFlush(S entity);

    void flush();

    <S extends CwsSavedSearch> List<S> saveAll(Iterable<S> entities);

    void delete(CwsSavedSearch entity);

    List<CwsSavedSearch> findByOrgIdAndConsultantIdAndKindOrderByLastUsedAtDescIdDesc(Long orgId, Long consultantId, String kind);

    Optional<CwsSavedSearch> findByOrgIdAndConsultantIdAndIdAndKind(Long orgId, Long consultantId, Long id, String kind);

    long countByOrgIdAndConsultantIdAndKind(Long orgId, Long consultantId, String kind);

    Optional<CwsSavedSearch> findByOrgIdAndId(Long orgId, Long id);
}
