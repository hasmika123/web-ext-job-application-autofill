package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsSettingEvent;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_setting_event}: every method takes the organization id first. */
public interface CwsSettingEventRepository extends Repository<CwsSettingEvent, Long> {
    <S extends CwsSettingEvent> S save(S entity);

    <S extends CwsSettingEvent> S saveAndFlush(S entity);

    void flush();

    <S extends CwsSettingEvent> List<S> saveAll(Iterable<S> entities);

    void delete(CwsSettingEvent entity);

    List<CwsSettingEvent> findTop10ByOrgIdAndConsultantIdOrderByOccurredAtDescIdDesc(Long orgId, Long consultantId);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
