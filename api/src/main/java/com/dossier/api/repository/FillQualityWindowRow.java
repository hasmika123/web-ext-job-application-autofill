package com.dossier.api.repository;

/** Count-only fill-quality sums for one ATS/adapter/version window. */
public record FillQualityWindowRow(
    String ats,
    String adapter,
    String extVersion,
    Long fills,
    Long fieldsFound,
    Long fieldsFilled,
    Long fillsWithRequiredGaps
) {}
