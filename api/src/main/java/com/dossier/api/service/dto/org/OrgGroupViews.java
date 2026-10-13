package com.dossier.api.service.dto.org;

import java.util.List;

/** The read models and move bodies of the Departments and Teams pages (X4.5). */
public final class OrgGroupViews {

    private OrgGroupViews() {}

    /** One page of the directory with the KPI numbers of the pages. Every number is counted, none is estimated. */
    public record DirectoryPage(List<OrgGroupDTO> items, int page, int size, long total, Summary summary) {}

    /**
     * {@code employees} the ACTIVE people the viewer can see (everyone for an organization-wide viewer, else the people of the
     * groups they can see); {@code unplaced} the ACTIVE people with no department; {@code departmentLeads} distinct leads of
     * departments; {@code averageTeamSize} the mean ACTIVE size of the teams (null when there are no teams).
     */
    public record Summary(long departments, long teams, long employees, long teamMembers, long unplaced, long departmentLeads, long teamLeads, Double averageTeamSize, long inactive) {}

    /** The organization tree: the organization, its departments with their teams, teams under no department, and cohorts. */
    public record Structure(String organizationName, long employees, List<Node> departments, List<OrgGroupDTO> unassignedTeams, List<OrgGroupDTO> cohorts) {}

    public record Node(OrgGroupDTO group, List<OrgGroupDTO> teams) {}

    /** A group with its people. {@code members} is capped at 200 (the viewer's scope applies); {@code membersTotal} is the real count. */
    public record Detail(OrgGroupDTO group, List<OrgGroupDTO> teams, List<MemberRow> members, long membersTotal) {}

    public record MemberRow(Long memberId, String name, String initials, String status, String roleName, boolean lead, String departmentName, String teamName) {}

    /** Body of {@code POST /groups/{id}/members}: at most 500 ids. */
    public record MoveRequest(List<Long> memberIds) {}

    /** One row per requested id: MOVED, UNCHANGED (already there) or SKIPPED with a code (NOT_FOUND, SEAT_STATE). */
    public record MoveResult(Long groupId, int moved, int unchanged, int skipped, List<Row> results) {}

    public record Row(Long memberId, String status, String code) {}
}
