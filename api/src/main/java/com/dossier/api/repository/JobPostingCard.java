package com.dossier.api.repository;

import java.time.Instant;

/**
 * A posting as search results show it: the small columns only (no description, no search text), so ranking a
 * few hundred of them costs next to nothing. {@code ats} is the board's own name (Greenhouse, Lever, Ashby).
 */
public record JobPostingCard(
    Long id,
    String title,
    String company,
    String location,
    String workplaceType,
    Boolean remote,
    String employmentType,
    Instant publishedAt,
    String ats
) {}
