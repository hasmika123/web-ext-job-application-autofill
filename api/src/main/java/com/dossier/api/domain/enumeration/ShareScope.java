package com.dossier.api.domain.enumeration;

/**
 * How much of themselves a member lets their organization see (docs/design/org/consent-data-sharing.md decision 2).
 * Exactly three, as locked in ROADMAP 21.1: {@link #NONE} (only that they joined), {@link #SUMMARY} (counts and states,
 * never employer names or documents) and {@link #FULL} (granted to one named person, never to "the org").
 *
 * <p>Declaration order is the order of trust: a later value shows everything an earlier one does.
 */
public enum ShareScope {
    NONE,
    SUMMARY,
    FULL;

    /** True when this scope is at least as open as {@code other}. */
    public boolean atLeast(ShareScope other) {
        return compareTo(other) >= 0;
    }
}
