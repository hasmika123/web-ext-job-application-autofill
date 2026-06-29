package com.dossier.api.repository;

import com.dossier.api.domain.AiQuotaOverride;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Spring Data repository for per-user AI quota overrides (Phase 9.A2.2). Keyed by login. */
@Repository
public interface AiQuotaOverrideRepository extends JpaRepository<AiQuotaOverride, String> {}
