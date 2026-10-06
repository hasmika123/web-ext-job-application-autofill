package com.dossier.api.repository;

import com.dossier.api.domain.SecretCanary;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Known values encrypted with a key, read back at startup (Phase 14.2). */
@Repository
public interface SecretCanaryRepository extends JpaRepository<SecretCanary, String> {}
