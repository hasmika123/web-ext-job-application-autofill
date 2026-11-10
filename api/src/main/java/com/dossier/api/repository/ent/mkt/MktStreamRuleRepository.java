package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktStreamRule;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code mkt_stream_rule}: every method takes the organization id first. */
public interface MktStreamRuleRepository extends Repository<MktStreamRule, Long> {
    List<MktStreamRule> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Optional<MktStreamRule> findByOrgIdAndRuleKey(Long orgId, String ruleKey);

    <S extends MktStreamRule> S save(S entity);

    <S extends MktStreamRule> S saveAndFlush(S entity);
}
