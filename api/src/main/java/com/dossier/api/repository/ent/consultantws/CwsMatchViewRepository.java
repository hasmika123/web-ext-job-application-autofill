package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsMatchView;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_match_view}: every method takes the organization id first. */
public interface CwsMatchViewRepository extends Repository<CwsMatchView, Long> {
    <S extends CwsMatchView> S save(S entity);

    <S extends CwsMatchView> S saveAndFlush(S entity);

    void flush();

    <S extends CwsMatchView> List<S> saveAll(Iterable<S> entities);

    void delete(CwsMatchView entity);

    List<CwsMatchView> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsMatchView> findByOrgIdAndConsultantIdAndRequirementId(Long orgId, Long consultantId, Long requirementId);
}
