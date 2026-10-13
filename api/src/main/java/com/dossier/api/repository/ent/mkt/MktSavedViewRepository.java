package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktSavedView;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code mkt_saved_view}: every method takes the organization id first, then the member (a view is the caller's own). */
public interface MktSavedViewRepository extends JpaRepository<MktSavedView, Long> {
    List<MktSavedView> findByOrgIdAndMemberIdAndPageKeyOrderByNameAsc(Long orgId, Long memberId, String pageKey);

    Optional<MktSavedView> findByOrgIdAndMemberIdAndId(Long orgId, Long memberId, Long id);

    Optional<MktSavedView> findByOrgIdAndMemberIdAndPageKeyAndName(Long orgId, Long memberId, String pageKey, String name);

    long countByOrgIdAndMemberIdAndPageKey(Long orgId, Long memberId, String pageKey);

    long countByOrgId(Long orgId);
}
