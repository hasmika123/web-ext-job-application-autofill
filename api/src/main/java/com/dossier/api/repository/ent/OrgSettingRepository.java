package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.OrgSetting;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Per-organization setting overrides (a bare repository: every read names the organization). */
public interface OrgSettingRepository extends Repository<OrgSetting, Long> {
    <S extends OrgSetting> S save(S setting);

    <S extends OrgSetting> S saveAndFlush(S setting);

    @Query("select s from OrgSetting s where s.orgId = :orgId and s.settingKey = :settingKey")
    Optional<OrgSetting> findByOrgIdAndSettingKey(@Param("orgId") Long orgId, @Param("settingKey") String settingKey);

    @Query("select s from OrgSetting s where s.orgId = :orgId order by s.settingKey asc")
    List<OrgSetting> findByOrgIdOrderBySettingKey(@Param("orgId") Long orgId);
}
