package com.dossier.api.security;

/** Supplies the {@link LoginWorld} of the current request; implemented by the service layer (the security layer may not depend on it). */
public interface LoginWorldProvider {
    LoginWorld loginWorld();
}
