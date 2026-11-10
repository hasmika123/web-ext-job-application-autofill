package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.ClientContact;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code client_contact}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface ClientContactRepository extends Repository<ClientContact, Long> {
    <S extends ClientContact> S save(S entity);

    <S extends ClientContact> S saveAndFlush(S entity);

    void flush();

    <S extends ClientContact> List<S> saveAll(Iterable<S> entities);

    <S extends ClientContact> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<ClientContact> findByOrgIdAndId(Long orgId, Long id);

    List<ClientContact> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<ClientContact> findByOrgIdAndClientId(Long orgId, Long clientId);

}
