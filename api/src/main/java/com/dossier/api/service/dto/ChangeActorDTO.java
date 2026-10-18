package com.dossier.api.service.dto;

import java.io.Serializable;

/**
 * Who changed a record, ready to show (docs/change-audit/README.md section 2.5), the same shape for the personal tracker and the organization
 * pipeline. {@code label} is already resolved by {@code ChangeActors} (a name, "a member", "a former member", "a deleted account", or "Kiwiply" for a
 * non-person); it is never an enterprise login. {@code userId} lets the web say "you" by comparing it with the session; {@code memberId} is the
 * organization seat (organization records only). {@code kind} is PERSON | EXTENSION | MAIL | ASSISTANT | SYSTEM. {@code relation}
 * (organization context) is marketer | admin | consultant | member | system, computed against the record's consultant; {@code null} when it has none.
 */
public record ChangeActorDTO(Long userId, Long memberId, String label, String relation, String kind) implements Serializable {
    public static final String REL_MARKETER = "marketer";
    public static final String REL_ADMIN = "admin";
    public static final String REL_CONSULTANT = "consultant";
    public static final String REL_MEMBER = "member";
    public static final String REL_SYSTEM = "system";

    /** The label shown for everything that is not a person. */
    public static final String KIWIPLY = "Kiwiply";

    /** A non-person actor: the extension, the inbox, the assistant, or the platform itself. */
    public static ChangeActorDTO nonPerson(String kind) {
        return new ChangeActorDTO(null, null, KIWIPLY, null, kind);
    }

    public ChangeActorDTO withRelation(String newRelation) {
        return new ChangeActorDTO(userId, memberId, label, newRelation, kind);
    }
}
