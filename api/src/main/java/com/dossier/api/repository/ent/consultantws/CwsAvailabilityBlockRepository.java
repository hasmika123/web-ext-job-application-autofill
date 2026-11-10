package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsAvailabilityBlock;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_availability_block}: every method takes the organization id first. */
public interface CwsAvailabilityBlockRepository extends Repository<CwsAvailabilityBlock, Long> {
    <S extends CwsAvailabilityBlock> S save(S entity);

    <S extends CwsAvailabilityBlock> S saveAndFlush(S entity);

    void flush();

    <S extends CwsAvailabilityBlock> List<S> saveAll(Iterable<S> entities);

    void delete(CwsAvailabilityBlock entity);

    Optional<CwsAvailabilityBlock> findByOrgIdAndId(Long orgId, Long id);

    List<CwsAvailabilityBlock> findByOrgIdAndConsultantIdOrderByStartDateAscIdAsc(Long orgId, Long consultantId);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);

    long countByOrgId(Long orgId);

    List<CwsAvailabilityBlock> findByOrgId(Long orgId);
}
