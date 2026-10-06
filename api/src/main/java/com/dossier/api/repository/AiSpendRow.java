package com.dossier.api.repository;

/**
 * One group's AI spend over a period (Phase 13.1c): a login (null = a deleted account, whose spend
 * was kept but unlinked) or a task, how many calls, and what they cost in millionths of a dollar.
 * A JPQL constructor projection, so it lives with the repository (ArchUnit: persistence may not
 * reach into the service layer).
 */
public record AiSpendRow(String key, Long calls, Long costMicros) {}
