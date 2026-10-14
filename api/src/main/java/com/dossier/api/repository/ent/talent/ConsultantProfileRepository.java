package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code consultant_profile}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface ConsultantProfileRepository extends Repository<ConsultantProfile, Long> {
    <S extends ConsultantProfile> S save(S entity);

    <S extends ConsultantProfile> S saveAndFlush(S entity);

    Optional<ConsultantProfile> findByOrgIdAndId(Long orgId, Long id);

    List<ConsultantProfile> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Optional<ConsultantProfile> findByOrgIdAndMemberId(Long orgId, Long memberId);

    long countByOrgIdAndStatus(Long orgId, String status);

    long countByOrgIdAndStatusAndAvailabilityStatus(Long orgId, String status, String availabilityStatus);

    long countByOrgIdAndStatusAndLicenseStatus(Long orgId, String status, String licenseStatus);

    long countByOrgIdAndStatusAndCreatedAtLessThan(Long orgId, String status, Instant before);

    List<ConsultantProfile> findByOrgIdAndStatusOrderByDisplayNameAsc(Long orgId, String status);

}
