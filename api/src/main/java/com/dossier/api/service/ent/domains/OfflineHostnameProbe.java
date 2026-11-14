package com.dossier.api.service.ent.domains;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** No probing at all ({@code dossier.ent.domains.probe=offline}): tests use it so the certificate probe never touches the network. Never live. */
@Component
@ConditionalOnProperty(name = "dossier.ent.domains.probe", havingValue = "offline")
public class OfflineHostnameProbe implements HostnameProbe {

    @Override
    public Result probe(String host) {
        return new Result(false, null, "OFFLINE");
    }
}
