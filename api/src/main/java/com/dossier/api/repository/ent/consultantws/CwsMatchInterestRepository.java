package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsMatchInterest;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_match_interest}: every method takes the organization id first. */
public interface CwsMatchInterestRepository extends Repository<CwsMatchInterest, Long> {
    <S extends CwsMatchInterest> S save(S entity);

    <S extends CwsMatchInterest> S saveAndFlush(S entity);

    void flush();

    <S extends CwsMatchInterest> List<S> saveAll(Iterable<S> entities);

    void delete(CwsMatchInterest entity);

    List<CwsMatchInterest> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsMatchInterest> findByOrgIdAndConsultantIdAndRequirementId(Long orgId, Long consultantId, Long requirementId);
}
