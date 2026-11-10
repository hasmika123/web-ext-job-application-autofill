package com.dossier.api.service.org;

import java.util.Map;

/**
 * "There is nothing here": an organization (or a row inside one) that does not exist, or exists but is not the
 * caller's to know about. One class, one generic message, so a foreign org id is indistinguishable from a missing
 * one and the response never says "forbidden" (tenant-model.md decision 4).
 */
public class OrgNotFoundException extends OrgException {

    private static final long serialVersionUID = 1L;

    public OrgNotFoundException() {
        super(404, CODE_NOT_FOUND, "Not found", Map.of());
    }
}
