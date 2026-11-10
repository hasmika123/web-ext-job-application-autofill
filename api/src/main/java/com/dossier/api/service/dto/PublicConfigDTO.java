package com.dossier.api.service.dto;

/**
 * What the public config endpoint says, and ALL it may ever say: three on/off switches that are the same for every
 * visitor. Booleans only, on purpose: {@code PublicConfigResourceIT} asserts every component is a {@code boolean} so a
 * per-user value, a string or a secret cannot slip into an unauthenticated, publicly cached response.
 *
 * @param orgs whether organization features are on (the org feature flag)
 * @param demo whether the public demo accounts are on
 */
public record PublicConfigDTO(boolean orgs, boolean demo, boolean enterprise) {}
