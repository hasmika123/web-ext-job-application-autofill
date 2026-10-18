package com.dossier.api.repository;

import com.dossier.api.domain.AppSetting;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Runtime switches (phase demo), keyed by setting name. */
@Repository
public interface AppSettingRepository extends JpaRepository<AppSetting, String> {}
