package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktStreamRule;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code mkt_stream_rule}: every method takes the organization id first. */
public interface MktStreamRuleRepository extends JpaRepository<MktStreamRule, Long> {
    List<MktStreamRule> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Optional<MktStreamRule> findByOrgIdAndRuleKey(Long orgId, String ruleKey);
}
