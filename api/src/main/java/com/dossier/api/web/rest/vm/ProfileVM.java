package com.dossier.api.web.rest.vm;

import jakarta.validation.constraints.NotNull;

/**
 * Request body for {@code PUT /api/profile}: the current user's bio as a JSON
 * payload string (the extension's canonical bio profile). {@code updatedAt} is
 * set server-side, so clients don't send it.
 */
public class ProfileVM {

    @NotNull
    private String payload;

    public String getPayload() {
        return payload;
    }

    public void setPayload(String payload) {
        this.payload = payload;
    }
}
