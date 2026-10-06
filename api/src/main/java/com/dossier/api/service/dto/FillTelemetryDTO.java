package com.dossier.api.service.dto;

/**
 * One autofill run as the extension reports it (Phase 10.1). Every field is untrusted input:
 * {@code FillTelemetryService} normalises the ATS and adapter to fixed vocabularies and clamps
 * every count, so nothing but a known family name and small integers is ever stored.
 */
public record FillTelemetryDTO(
    String id,
    String ats,
    String adapter,
    Integer fieldsFound,
    Integer fieldsFilled,
    Integer fieldsFailed,
    Integer requiredLeftEmpty,
    String extVersion
) {}
