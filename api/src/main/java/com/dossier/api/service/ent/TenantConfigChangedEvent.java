package com.dossier.api.service.ent;

/**
 * Something the host-to-tenant answer depends on changed: an organization's status (closed, suspended) or an admin setting
 * under {@code flag.enterprise*} / {@code enterprise.hosts.*}. Published inside the writing transaction;
 * {@link TenantResolver} evicts its cache after that transaction commits (at once when there is none), so a rolled-back
 * change evicts nothing.
 */
public record TenantConfigChangedEvent(String reason) {}
