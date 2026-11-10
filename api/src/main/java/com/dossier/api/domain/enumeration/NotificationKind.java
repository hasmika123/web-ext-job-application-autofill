package com.dossier.api.domain.enumeration;

import java.util.Optional;

/**
 * What a notification is about (E2E-U7.0). The kind decides which preference switches apply and which are
 * locked. {@code title}/{@code description} are the words the Settings panel shows; {@code lockedWhy} is the
 * one-line reason shown beside a switch the user cannot turn off. Defaults (what is on out of the box) are NOT
 * here: they are the admin-configured setting {@code notifications.defaults}.
 *
 * <p>{@link #APP_STATUS} is the new name of the stored kind {@code STATUS_FROM_MAIL} (14.6); {@link #parse}
 * reads both so old rows keep working. The organisation kinds (ORG_INVITE_ACCEPTED ... ORG_COVERS_YOUR_PLAN) join
 * with O13.3; the notification engine (U7.1) adds the alert and digest kinds.
 */
public enum NotificationKind {
    APP_STATUS("Application updates", "When an email moves one of your applications, like an interview invite or an offer.", false, null),
    INTERVIEW_REMINDER("Interview reminders", "A nudge before an interview you have on your calendar.", false, null),
    PROFILE_SUGGESTION("Profile suggestions", "When we learn something new about you from an application and want your okay.", false, null),
    BILLING("Billing", "Receipts, renewals and card problems.", true, "Needed so you never miss a payment issue."),
    SECURITY("Security", "New sign-ins and password changes.", true, "Needed to keep your account safe."),
    SYSTEM("Kiwiply news", "Product updates and the occasional announcement.", false, null),
    ORG_INVITE_ACCEPTED("People joining your organization", "When someone you invited accepts and joins your organization.", false, null);

    /** The kind's name before E2E-U7.0, still present in older rows. */
    public static final String LEGACY_APP_STATUS = "STATUS_FROM_MAIL";

    private final String title;
    private final String description;
    private final boolean locked;
    private final String lockedWhy;

    NotificationKind(String title, String description, boolean locked, String lockedWhy) {
        this.title = title;
        this.description = description;
        this.locked = locked;
        this.lockedWhy = lockedWhy;
    }

    public String title() {
        return title;
    }

    public String description() {
        return description;
    }

    /** In-app and email are both always on for this kind (billing and security must reach the user). */
    public boolean locked() {
        return locked;
    }

    public String lockedWhy() {
        return lockedWhy;
    }

    /** Quiet hours never hold this kind back. */
    public boolean urgent() {
        return locked;
    }

    /** The kind named by a stored or submitted string ({@code STATUS_FROM_MAIL} is {@link #APP_STATUS}). */
    public static Optional<NotificationKind> parse(String name) {
        if (name == null) return Optional.empty();
        if (LEGACY_APP_STATUS.equals(name)) return Optional.of(APP_STATUS);
        try {
            return Optional.of(valueOf(name));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
