package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPrepCheck;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_prep_check}: every method takes the organization id first. */
public interface CwsPrepCheckRepository extends Repository<CwsPrepCheck, Long> {
    <S extends CwsPrepCheck> S save(S entity);

    <S extends CwsPrepCheck> S saveAndFlush(S entity);

    void flush();

    <S extends CwsPrepCheck> List<S> saveAll(Iterable<S> entities);

    void delete(CwsPrepCheck entity);

    List<CwsPrepCheck> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsPrepCheck> findByOrgIdAndConsultantIdAndItemKey(Long orgId, Long consultantId, String itemKey);
}
