package com.dossier.api.service.dto;

import java.time.Instant;
import java.util.List;

/**
 * A resume's family (R3.9, DESIGN 9.11): its master (itself for a master), the tailored children of that
 * master, and which role the resume itself plays. {@code job} stays null until job targets exist (R5.6).
 */
public record ResumeLineageDTO(Master master, List<Child> children, String self) {
    public record Master(Long id, String name, Instant updatedAt) {}

    public record Child(Long id, String name, ResumeMetaDTO.Job job, Instant updatedAt, boolean masterChanged) {}
}
