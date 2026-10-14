package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.MarketerCapacity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code marketer_capacity}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface MarketerCapacityRepository extends Repository<MarketerCapacity, Long> {
    <S extends MarketerCapacity> S save(S entity);

    <S extends MarketerCapacity> S saveAndFlush(S entity);

    Optional<MarketerCapacity> findByOrgIdAndId(Long orgId, Long id);

    List<MarketerCapacity> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Optional<MarketerCapacity> findByOrgIdAndMemberId(Long orgId, Long memberId);

    List<MarketerCapacity> findByOrgIdAndStatus(Long orgId, String status);

}
