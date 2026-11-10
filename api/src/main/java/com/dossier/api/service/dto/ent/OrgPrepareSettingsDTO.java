package com.dossier.api.service.dto.ent;

/**
 * The "Prepare selected openings" section of the Organization Settings page (decision 2026-10-18: the Org Admin controls it). {@code platformEnabled} is the
 * Kiwiply master switch (off = the section is shown disabled); {@code enabled} is the organization's own opt-in (off until the Org Admin turns it on). Each
 * limit carries the value that applies to the organization, the platform maximum it can not exceed and the smallest it can be. {@code licensed} counts the
 * active consultants whose license includes the "Autopilot prepare" add-on (only they can use the feature). No personal data, no prices.
 */
public record OrgPrepareSettingsDTO(boolean platformEnabled, boolean enabled, Limit dailyCap, Limit monthlyCap, Limit maxBatch, Licensed licensed) {
    /** {@code custom} is true when the organization holds its own number; false means it follows the platform maximum. */
    public record Limit(int value, int platformMax, int min, boolean custom) {}

    public record Licensed(int consultants, int total, String featureName) {}
}
