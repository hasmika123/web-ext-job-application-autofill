package com.dossier.api.domain.enumeration;

/** How ownership of a custom hostname is proven (ADR-002, threat T4): a TXT record holding the token, or the CNAME target check. */
public enum HostnameVerificationMethod {
    DNS_TXT,
    DNS_CNAME,
}
