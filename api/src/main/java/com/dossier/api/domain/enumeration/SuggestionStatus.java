package com.dossier.api.domain.enumeration;

/**
 * Where a {@link com.dossier.api.domain.ProfileSuggestion} stands (Phase 10.3c). DISMISSED is
 * kept rather than deleted: it is the record that stops the same value being suggested again.
 */
public enum SuggestionStatus {
    PENDING,
    ACCEPTED,
    DISMISSED,
}
