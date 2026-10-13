package com.dossier.api.domain.enumeration;

/** How a hostname reaches an organization (03-domain-model.md section 2.1): a Kiwiply subdomain or a customer's own domain. */
public enum OrgHostnameKind {
    SUBDOMAIN,
    CUSTOM,
}
