package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsCertification;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_certification}: every method takes the organization id first. */
public interface CwsCertificationRepository extends Repository<CwsCertification, Long> {
    <S extends CwsCertification> S save(S entity);

    <S extends CwsCertification> S saveAndFlush(S entity);

    void flush();

    <S extends CwsCertification> List<S> saveAll(Iterable<S> entities);

    void delete(CwsCertification entity);

    Optional<CwsCertification> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);

    List<CwsCertification> findByOrgIdAndConsultantIdOrderByIssuedOnDescIdDesc(Long orgId, Long consultantId);
}
