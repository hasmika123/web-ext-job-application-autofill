package com.dossier.api.service.ent.domains;

/**
 * Whether a custom domain answers over HTTPS with a valid certificate (docs/enterprise-v2/10-domain-routing.md s5.4). An interface so tests never touch the
 * network: {@link HttpsHostnameProbe} asks for real, {@link OfflineHostnameProbe} never succeeds.
 */
public interface HostnameProbe {
    /** {@code live}: the TLS handshake passed (a trusted certificate for the name) and the server answered; {@code error} says why not. */
    record Result(boolean live, Integer status, String error) {}

    Result probe(String host);
}
