package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktSubmissionView;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code mkt_submission_view} (a marketer's saved filter sets): every method takes the organization id first, then the owner. */
public interface MktSubmissionViewRepository extends Repository<MktSubmissionView, Long> {
    List<MktSubmissionView> findByOrgIdAndMemberIdOrderByNameAsc(Long orgId, Long memberId);

    Optional<MktSubmissionView> findByOrgIdAndMemberIdAndId(Long orgId, Long memberId, Long id);

    Optional<MktSubmissionView> findByOrgIdAndMemberIdAndName(Long orgId, Long memberId, String name);

    long countByOrgIdAndMemberId(Long orgId, Long memberId);

    <S extends MktSubmissionView> S save(S entity);

    long deleteByOrgIdAndMemberIdAndId(Long orgId, Long memberId, Long id);
}
