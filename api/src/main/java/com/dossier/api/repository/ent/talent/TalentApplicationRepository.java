package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.TalentApplication;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code talent_application}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface TalentApplicationRepository extends Repository<TalentApplication, Long> {
    <S extends TalentApplication> S save(S entity);

    <S extends TalentApplication> S saveAndFlush(S entity);

    void flush();

    <S extends TalentApplication> List<S> saveAll(Iterable<S> entities);

    <S extends TalentApplication> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<TalentApplication> findByOrgIdAndId(Long orgId, Long id);

    List<TalentApplication> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Optional<TalentApplication> findByOrgIdAndCode(Long orgId, String code);

    List<TalentApplication> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    long countByOrgIdAndStage(Long orgId, String stage);

    long countByOrgIdAndStageIn(Long orgId, Collection<String> stages);

    long countByOrgIdAndAppliedOnBetween(Long orgId, LocalDate from, LocalDate to);

    long countByOrgIdAndCreatedAtLessThan(Long orgId, Instant before);

    long countByOrgIdAndMarketerMemberId(Long orgId, Long marketerMemberId);

    long countByOrgIdAndConsultantIdAndStageNot(Long orgId, Long consultantId, String stage);

}
