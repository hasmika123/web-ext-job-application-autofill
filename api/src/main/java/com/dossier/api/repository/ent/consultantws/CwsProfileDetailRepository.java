package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsProfileDetail;
import java.util.Optional;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_profile_detail} (one row per consultant): every method takes the organization id first. */
public interface CwsProfileDetailRepository extends Repository<CwsProfileDetail, Long> {
    <S extends CwsProfileDetail> S save(S entity);

    <S extends CwsProfileDetail> S saveAndFlush(S entity);

    void flush();

    <S extends CwsProfileDetail> List<S> saveAll(Iterable<S> entities);

    void delete(CwsProfileDetail entity);

    Optional<CwsProfileDetail> findByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
