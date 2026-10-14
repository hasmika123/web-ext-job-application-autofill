package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsSetting;
import java.util.Optional;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_setting}: every method takes the organization id first. */
public interface CwsSettingRepository extends Repository<CwsSetting, Long> {
    <S extends CwsSetting> S save(S entity);

    <S extends CwsSetting> S saveAndFlush(S entity);

    void flush();

    <S extends CwsSetting> List<S> saveAll(Iterable<S> entities);

    void delete(CwsSetting entity);

    Optional<CwsSetting> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    long countByOrgId(Long orgId);
}
