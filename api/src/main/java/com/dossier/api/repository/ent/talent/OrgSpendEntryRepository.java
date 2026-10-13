package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.OrgSpendEntry;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code org_spend_entry}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface OrgSpendEntryRepository extends Repository<OrgSpendEntry, Long> {
    <S extends OrgSpendEntry> S save(S entity);

    <S extends OrgSpendEntry> S saveAndFlush(S entity);

    void flush();

    <S extends OrgSpendEntry> List<S> saveAll(Iterable<S> entities);

    <S extends OrgSpendEntry> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<OrgSpendEntry> findByOrgIdAndId(Long orgId, Long id);

    List<OrgSpendEntry> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<OrgSpendEntry> findByOrgIdAndMonthStartBetweenOrderByMonthStartAsc(Long orgId, LocalDate from, LocalDate to);

}
