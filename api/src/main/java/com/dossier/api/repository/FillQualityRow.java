package com.dossier.api.repository;

/**
 * Raw per-ATS sums for the admin fill-quality panel (Phase 10.1). Lives beside the repository
 * rather than in {@code service.dto} because the persistence layer may not reach into the
 * service layer (TechnicalStructureTest); the service turns these sums into rates.
 */
public record FillQualityRow(
    String ats,
    Long fills,
    Long fieldsFound,
    Long fieldsFilled,
    Long fieldsFailed,
    Long userCorrected,
    Long fillsWithRequiredGaps,
    Long fillsOnGenericAdapter
) {}
