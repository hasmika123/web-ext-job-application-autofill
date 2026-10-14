package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsWorkPreference;
import java.util.Optional;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_work_preference}: every method takes the organization id first. */
public interface CwsWorkPreferenceRepository extends Repository<CwsWorkPreference, Long> {
    <S extends CwsWorkPreference> S save(S entity);

    <S extends CwsWorkPreference> S saveAndFlush(S entity);

    void flush();

    <S extends CwsWorkPreference> List<S> saveAll(Iterable<S> entities);

    void delete(CwsWorkPreference entity);

    Optional<CwsWorkPreference> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    List<CwsWorkPreference> findByOrgId(Long orgId);
}
