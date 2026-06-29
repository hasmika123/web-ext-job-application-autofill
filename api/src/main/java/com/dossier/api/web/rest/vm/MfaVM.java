package com.dossier.api.web.rest.vm;

import jakarta.validation.constraints.NotNull;

/**
 * View Model for {@code POST /api/authenticate/mfa}: the opaque mfaToken from the first step
 * plus the 6-digit code the user received by email (Phase 9.X.3).
 */
public class MfaVM {

    @NotNull
    private String mfaToken;

    @NotNull
    private String code;

    public String getMfaToken() {
        return mfaToken;
    }

    public void setMfaToken(String mfaToken) {
        this.mfaToken = mfaToken;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }
}
