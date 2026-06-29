package com.dossier.api.domain.enumeration;

/**
 * Newsletter subscriber lifecycle (Phase 9.A4).
 * PENDING = opted in, awaiting double-opt-in confirmation; CONFIRMED = confirmed (mailable);
 * UNSUBSCRIBED = opted out (suppression list — never mail again unless they re-subscribe).
 */
public enum SubscriberStatus {
    PENDING,
    CONFIRMED,
    UNSUBSCRIBED,
}
