package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.FinanceForecastInput;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code finance_forecast_input}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface FinanceForecastInputRepository extends Repository<FinanceForecastInput, Long> {
    <S extends FinanceForecastInput> S save(S entity);

    <S extends FinanceForecastInput> S saveAndFlush(S entity);

    void flush();

    <S extends FinanceForecastInput> List<S> saveAll(Iterable<S> entities);

    <S extends FinanceForecastInput> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<FinanceForecastInput> findByOrgIdAndId(Long orgId, Long id);

    List<FinanceForecastInput> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<FinanceForecastInput> findByOrgIdAndMonthStartGreaterThanEqualOrderByMonthStartAsc(Long orgId, LocalDate from);
}
