package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsSetting;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_setting}: every method takes the organization id first. */
public interface CwsSettingRepository extends JpaRepository<CwsSetting, Long> {
    Optional<CwsSetting> findByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
