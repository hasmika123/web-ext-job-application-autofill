package com.dossier.api.service.inbox;

import jakarta.mail.MessagingException;
import jakarta.mail.Store;

/**
 * The one seam between the inbox and a real mail server (Phase 14.1), so tests can use GreenMail and
 * nothing in CI ever calls Gmail.
 */
public interface ImapGateway {
    /** How a sign-in attempt went, precisely enough to tell the user what to fix. */
    enum Outcome {
        OK,
        /** Wrong address or app password (Gmail: "Invalid credentials"). */
        BAD_CREDENTIALS,
        /** They used their Google password; Gmail wants an app password (2-Step Verification). */
        APP_PASSWORD_REQUIRED,
        /** Google blocked the sign-in until they sign in once in a browser. */
        WEB_LOGIN_REQUIRED,
        /** IMAP is switched off for the account. */
        IMAP_DISABLED,
        /** Couldn't reach the server (network, DNS, timeout). */
        UNREACHABLE,
        /** Anything else. */
        FAILED,
    }

    /**
     * @param sentFolder the account's Sent folder (by its {@code \Sent} flag, else a known Gmail
     *                   name), or null when there isn't one
     */
    record Probe(Outcome outcome, String sentFolder) {}

    /** Sign in, open the inbox read-only, find the Sent folder, sign out. Never throws. */
    Probe probe(String address, String password);

    /**
     * A signed-in session for the poller (14.3) — one per sync, the caller closes it. Throws
     * {@code AuthenticationFailedException} when Gmail refuses the password.
     */
    Store open(String address, String password) throws MessagingException;

    /** The account's Sent folder, by its {@code \Sent} flag, else a known Gmail name; null if none. */
    String sentFolder(Store store) throws MessagingException;
}
