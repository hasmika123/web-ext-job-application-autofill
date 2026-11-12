package com.dossier.api.service.ent.domains;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * No DNS at all ({@code dossier.ent.domains.dns=offline}): every question answers "no such record". Tests use it so the custom-domain checks never touch
 * the network; a test that needs answers scripts its own {@link DnsLookup}. A domain can never pass its checks with it.
 */
@Component
@ConditionalOnProperty(name = "dossier.ent.domains.dns", havingValue = "offline")
public class OfflineDnsLookup implements DnsLookup {

    @Override
    public Answer txt(String name) {
        return Answer.of(Outcome.NODATA);
    }

    @Override
    public Answer cname(String name) {
        return Answer.of(Outcome.NODATA);
    }

    @Override
    public Answer a(String name) {
        return Answer.of(Outcome.NODATA);
    }
}
