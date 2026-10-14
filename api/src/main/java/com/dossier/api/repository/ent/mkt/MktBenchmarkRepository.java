package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktBenchmark;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code mkt_benchmark}: every method takes the organization id first. */
public interface MktBenchmarkRepository extends Repository<MktBenchmark, Long> {

    List<MktBenchmark> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    <S extends MktBenchmark> S save(S entity);
}
