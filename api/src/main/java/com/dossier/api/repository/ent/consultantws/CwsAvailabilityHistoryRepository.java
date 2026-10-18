package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsAvailabilityHistory;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_availability_history}: every method takes the organization id first. */
public interface CwsAvailabilityHistoryRepository extends Repository<CwsAvailabilityHistory, Long> {
    <S extends CwsAvailabilityHistory> S save(S entity);

    <S extends CwsAvailabilityHistory> S saveAndFlush(S entity);

    void flush();

    <S extends CwsAvailabilityHistory> List<S> saveAll(Iterable<S> entities);

    void delete(CwsAvailabilityHistory entity);

    List<CwsAvailabilityHistory> findByOrgIdAndConsultantIdOrderByEffectiveDateDescIdDesc(Long orgId, Long consultantId);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
