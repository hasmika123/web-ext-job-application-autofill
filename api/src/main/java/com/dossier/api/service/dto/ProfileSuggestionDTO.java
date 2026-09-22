package com.dossier.api.service.dto;

import java.time.Instant;

/**
 * A suggested profile value, as the web's review card shows it (Phase 10.3c): the field, the
 * learned value, and what the profile holds now ({@code ""} when the field is blank), so the card
 * can say "add" or "change from … to …".
 */
public record ProfileSuggestionDTO(Long id, String fieldKey, String value, String currentValue, int seenCount, Instant updatedAt) {}
