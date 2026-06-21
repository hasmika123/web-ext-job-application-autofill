package com.dossier.api.web.rest.vm;

import jakarta.validation.constraints.NotNull;

/**
 * View Model for the {@code POST /api/refresh} request body: the refresh token
 * the client received from {@code /api/authenticate}.
 */
public class RefreshVM {

    @NotNull
    private String refreshToken;

    public String getRefreshToken() {
        return refreshToken;
    }

    public void setRefreshToken(String refreshToken) {
        this.refreshToken = refreshToken;
    }
}
