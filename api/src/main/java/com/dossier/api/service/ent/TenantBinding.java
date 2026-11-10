package com.dossier.api.service.ent;

/** The tenant a freshly minted session is bound to (X1.5): the {@code tid} and {@code hid} claims. {@code hid} may be null (subdomain without a hostname row). */
public record TenantBinding(Long orgId, Long hostnameId) {}
