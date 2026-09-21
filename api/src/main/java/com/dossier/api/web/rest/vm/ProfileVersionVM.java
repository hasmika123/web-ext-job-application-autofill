package com.dossier.api.web.rest.vm;

/** Response body of {@code GET /api/profile/version}: {@code {"version": "<16 hex>"}}. */
public class ProfileVersionVM {

    private String version;

    public ProfileVersionVM() {}

    public ProfileVersionVM(String version) {
        this.version = version;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }
}
