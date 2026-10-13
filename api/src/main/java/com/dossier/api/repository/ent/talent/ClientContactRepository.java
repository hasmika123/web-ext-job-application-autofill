package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.ClientContact;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code client_contact}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface ClientContactRepository extends JpaRepository<ClientContact, Long> {
    Optional<ClientContact> findByOrgIdAndId(Long orgId, Long id);

    List<ClientContact> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<ClientContact> findByOrgIdAndClientId(Long orgId, Long clientId);

}
