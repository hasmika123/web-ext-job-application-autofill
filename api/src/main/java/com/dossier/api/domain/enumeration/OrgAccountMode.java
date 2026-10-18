package com.dossier.api.domain.enumeration;

/**
 * Whose accounts an organization's members are (decision O4, docs/enterprise-v2/19). {@code SHARED} is the legacy model: members are the
 * person's ordinary personal accounts. {@code SEPARATE}: members are enterprise accounts that belong to this organization alone
 * ({@code jhi_user.org_id = organization.id}), never connected to a personal account with the same email.
 */
public enum OrgAccountMode {
    SHARED,
    SEPARATE,
}
