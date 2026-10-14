package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.ClientAccount;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code client_account}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface ClientAccountRepository extends Repository<ClientAccount, Long> {
    <S extends ClientAccount> S save(S entity);

    <S extends ClientAccount> S saveAndFlush(S entity);

    Optional<ClientAccount> findByOrgIdAndId(Long orgId, Long id);

    List<ClientAccount> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<ClientAccount> findByOrgIdOrderByNameAsc(Long orgId);

    Optional<ClientAccount> findByOrgIdAndNameIgnoreCase(Long orgId, String name);

    /** Same rule as the unique key {@code uk_client_account_name (org_id, name_key = lower(name))}; pass the name lower-cased. */
    @Query("select a from ClientAccount a where a.orgId = :orgId and lower(a.name) = :nameKey")
    Optional<ClientAccount> findByOrgIdAndNameKey(@Param("orgId") Long orgId, @Param("nameKey") String nameKey);

}
