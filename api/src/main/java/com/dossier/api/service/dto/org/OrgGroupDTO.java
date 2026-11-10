package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgGroupKind;
import java.time.Instant;
import java.util.List;

/**
 * A department, cohort or team. The first five components are the original contract (the legacy org console reads them);
 * {@code memberCount} counts INVITED, ACTIVE and SUSPENDED seats placed in it. The rest is Enterprise V2 (X4.5):
 * {@code activeCount} the ACTIVE people only (what the pages show as "employees"), {@code teamCount} the teams of a department
 * (null for anything else), {@code lead} the group's lead, {@code memberPreview} up to four people for an avatar stack, and
 * {@code version} the weak ETag {@code W/"n"} that updates send back as {@code If-Match}.
 *
 * <p>Nothing here is invented: there is no open-roles count or workload percentage because no recruiting or workload data backs
 * them yet, so those fields do not exist.
 */
public record OrgGroupDTO(
    Long id,
    String name,
    OrgGroupKind kind,
    int sortOrder,
    long memberCount,
    Long parentGroupId,
    String parentName,
    Long leadMemberId,
    Person lead,
    String status,
    String icon,
    String color,
    String version,
    Instant createdAt,
    long activeCount,
    Integer teamCount,
    List<Person> memberPreview
) {
    /** A person as the group pages show them: a display name, initials and the primary role's name. Never an email or login. */
    public record Person(Long memberId, String name, String initials, String roleName) {}
}
