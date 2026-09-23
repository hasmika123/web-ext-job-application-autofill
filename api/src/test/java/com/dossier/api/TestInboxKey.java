package com.dossier.api;

import java.security.SecureRandom;
import java.util.Base64;

/**
 * One inbox encryption key for the whole test run (Phase 14). Generated at class load — never a
 * committed value — and shared, because every integration test context uses the same database, and
 * the startup key check (InboxKeyCheck) would see a second, different key as a mismatch and switch
 * the inbox off for whichever test context boots later.
 */
public final class TestInboxKey {

    public static final String VALUE;

    static {
        byte[] k = new byte[32];
        new SecureRandom().nextBytes(k);
        VALUE = Base64.getEncoder().encodeToString(k);
    }

    private TestInboxKey() {}
}
