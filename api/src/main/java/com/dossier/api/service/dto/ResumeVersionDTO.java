package com.dossier.api.service.dto;

import java.time.Instant;

/**
 * One row of a built resume's version history (R3.9, DESIGN 9.11): who wrote it ({@code by}) and what
 * kind of row it is ({@code kind}: {@code auto} | {@code named} | {@code checkpoint} | {@code system}).
 */
public record ResumeVersionDTO(int versionNo, String reason, String name, Instant createdAt, String contentHash, ResumeActorDTO by, String kind) {}
