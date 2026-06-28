package com.dossier.api.web.rest.vm;

/** View model for {@code POST /api/auth/google}: the Google ID token (credential). */
public class GoogleLoginVM {

    private String credential;

    public String getCredential() {
        return credential;
    }

    public void setCredential(String credential) {
        this.credential = credential;
    }
}
