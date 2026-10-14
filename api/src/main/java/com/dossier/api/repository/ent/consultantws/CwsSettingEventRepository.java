package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsSettingEvent;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_setting_event}: every method takes the organization id first. */
public interface CwsSettingEventRepository extends JpaRepository<CwsSettingEvent, Long> {
    List<CwsSettingEvent> findTop10ByOrgIdAndConsultantIdOrderByOccurredAtDescIdDesc(Long orgId, Long consultantId);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
