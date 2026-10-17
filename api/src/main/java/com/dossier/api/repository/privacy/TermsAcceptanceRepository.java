package com.dossier.api.repository.privacy;

import com.dossier.api.domain.privacy.TermsAcceptance;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TermsAcceptanceRepository extends JpaRepository<TermsAcceptance, Long> {
    List<TermsAcceptance> findByUserIdOrderByAcceptedAtDescIdDesc(Long userId);

    boolean existsByUserIdAndDocumentAndVersion(Long userId, String document, String version);
}
