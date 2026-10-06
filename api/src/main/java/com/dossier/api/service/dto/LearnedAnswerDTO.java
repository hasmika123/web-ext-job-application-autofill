package com.dossier.api.service.dto;

/**
 * One answer the extension saw the user commit on an application (Phase 10.3c): a canonical
 * profile field, the value, and {@code context} — an opaque hash identifying the application,
 * used only to tell "seen on two applications" from "seen twice on one". Never a URL.
 */
public record LearnedAnswerDTO(String fieldKey, String value, String context) {}
