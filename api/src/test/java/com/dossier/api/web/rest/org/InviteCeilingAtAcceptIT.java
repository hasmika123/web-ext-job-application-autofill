package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

/**
 * SEC-22 / T32 (42-threat-model.md): the roles an invitation grants are checked against the inviter's rights when it is MADE and again
 * when it is ACCEPTED. A person whose rights shrank in between (a role ended, the seat removed or suspended, members.invite gone) cannot
 * have granted what they no longer could: the invitee joins with the roles that remain, or the organization's default role, the
 * trim is audited and the inviter is told.
 */
@Timeout(60)
class InviteCeilingAtAcceptIT extends AbstractInviteIT {

    private String inviter;
    private OrgMember inviterSeat;
    private String invitee;

    /** An inviter who holds HR_SPECIALIST (members.invite) and MARKETING_MANAGER, so they may hand out both; and an invitee account. */
    private void world(Organization org) {
        inviter = "mm-hr-" + sfx;
        inviterSeat = seatWithRoles(org, inviter, OrgRole.STAFF, "HR_SPECIALIST", "MARKETING_MANAGER");
        invitee = "newbie" + sfx;
        fx.user(invitee);
    }

    private String inviteBoth(Organization org) throws Exception {
        invite(inviter, org, "{\"emails\":[\"" + invitee + "@example.com\"],\"roleIds\":[" + roleId("MARKETING_MANAGER") + "," + roleId("CONSULTANT") + "]}").andExpect(status().isOk());
        return lastToken();
    }

    private void endRole(Organization org, OrgMember seat, String templateKey) {
        for (OrgMemberRole r : liveRoles(org.getId(), seat.getId())) {
            if (r.getRoleId().equals(roleId(templateKey))) {
                r.setEndsAt(Instant.now());
                r.setPrimary(false);
                memberRoles.saveAndFlush(r);
            }
        }
    }

    private List<String> liveRoleKeys(Organization org, Long memberId) {
        return liveRoles(org.getId(), memberId).stream().map(r -> roles.findVisibleByOrgIdAndId(org.getId(), r.getRoleId()).orElseThrow().getRoleKey()).toList();
    }

    @Test
    void anInviterWhoStillHoldsTheRolesGrantsThemAllAndNothingIsTrimmed() throws Exception {
        world(acme);
        String token = inviteBoth(acme);
        accept(invitee, token, "SUMMARY").andExpect(status().isOk()).andExpect(jsonPath("$.role").value("MARKETER"));
        OrgMember seat = seatOfInvite(acme.getId(), invitee + "@example.com");
        assertThat(seat.getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(liveRoleKeys(acme, seat.getId())).containsExactly("MARKETING_MANAGER", "CONSULTANT");
        assertThat(auditCount(acme.getId(), "INVITE_ROLES_TRIMMED")).isZero();
        assertThat(auditDetails(acme.getId(), "MEMBER_JOIN")).doesNotContain("rolesTrimmed");
    }

    @Test
    void anInviterWhoLostARoleBeforeAcceptanceGrantsOnlyTheRemainingOnesAndIsNotified() throws Exception {
        world(acme);
        String token = inviteBoth(acme);
        endRole(acme, inviterSeat, "MARKETING_MANAGER"); // the inviter's rights shrink between invite and accept

        accept(invitee, token, "SUMMARY").andExpect(status().isOk()).andExpect(jsonPath("$.role").value("MEMBER"));
        OrgMember seat = seatOfInvite(acme.getId(), invitee + "@example.com");
        assertThat(seat.getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(liveRoleKeys(acme, seat.getId())).as("only the consultant role remains").containsExactly("CONSULTANT");
        assertThat(liveRoles(acme.getId(), seat.getId()).get(0).isPrimary()).isTrue();
        assertThat(seat.getRole()).as("the legacy enum follows the new primary").isEqualTo(OrgRole.MEMBER);
        assertThat(seat.getPrimaryRoleId()).isEqualTo(roleId("CONSULTANT"));
        assertThat(seat.getInviteRoleIdsJson()).isEqualTo("[" + roleId("CONSULTANT") + "]");

        assertThat(auditCount(acme.getId(), "INVITE_ROLES_TRIMMED")).isEqualTo(1);
        assertThat(auditDetails(acme.getId(), "INVITE_ROLES_TRIMMED")).contains("trimmed=MARKETING_MANAGER").contains("kept=CONSULTANT");
        assertThat(auditDetails(acme.getId(), "MEMBER_JOIN")).contains("rolesTrimmed=MARKETING_MANAGER");
        assertThat(notifications.findByUserIdOrderByCreatedAtDesc(inviterSeat.getUserId())).anySatisfy(n -> assertThat(n.getTitle()).contains("adjusted roles"));
    }

    @Test
    void whenNothingRemainsTheInviteeJoinsWithTheOrganizationsDefaultRole() throws Exception {
        world(acme);
        invite(inviter, acme, "{\"emails\":[\"" + invitee + "@example.com\"],\"roleIds\":[" + roleId("MARKETING_MANAGER") + "]}").andExpect(status().isOk());
        String token = lastToken();
        endRole(acme, inviterSeat, "MARKETING_MANAGER");
        accept(invitee, token, "NONE").andExpect(status().isOk()).andExpect(jsonPath("$.role").value("MEMBER"));
        OrgMember seat = seatOfInvite(acme.getId(), invitee + "@example.com");
        assertThat(liveRoleKeys(acme, seat.getId())).as("a bootcamp's default").containsExactly("MEMBER");
        assertThat(seat.getRole()).isEqualTo(OrgRole.MEMBER);
    }

    @Test
    void aConsultancysDefaultAfterATrimIsConsultant() throws Exception {
        Organization firm = consultancy("inv-firm3-" + sfx);
        world(firm);
        invite(inviter, firm, "{\"emails\":[\"" + invitee + "@example.com\"],\"roleIds\":[" + roleId("MARKETING_MANAGER") + "]}").andExpect(status().isOk());
        String token = lastToken();
        endRole(firm, inviterSeat, "MARKETING_MANAGER");
        accept(invitee, token, "NONE").andExpect(status().isOk());
        OrgMember seat = seatOfInvite(firm.getId(), invitee + "@example.com");
        assertThat(liveRoleKeys(firm, seat.getId())).containsExactly("CONSULTANT");
        assertThat(auditCount(firm.getId(), "INVITE_ROLES_TRIMMED")).isEqualTo(1);
    }

    @Test
    void aRemovedInviterGrantsNothingSoTheInviteeGetsTheDefaultRole() throws Exception {
        world(acme);
        String token = inviteBoth(acme);
        inviterSeat.setStatus(OrgMemberStatus.REMOVED);
        members.saveAndFlush(inviterSeat);
        accept(invitee, token, "SUMMARY").andExpect(status().isOk());
        OrgMember seat = seatOfInvite(acme.getId(), invitee + "@example.com");
        assertThat(liveRoleKeys(acme, seat.getId())).containsExactly("MEMBER");
        assertThat(auditDetails(acme.getId(), "INVITE_ROLES_TRIMMED")).contains("MARKETING_MANAGER").contains("CONSULTANT");
    }

    @Test
    void aSuspendedInviterGrantsNothingEither() throws Exception {
        world(acme);
        String token = inviteBoth(acme);
        inviterSeat.setStatus(OrgMemberStatus.SUSPENDED);
        members.saveAndFlush(inviterSeat);
        accept(invitee, token, "SUMMARY").andExpect(status().isOk());
        assertThat(liveRoleKeys(acme, seatOfInvite(acme.getId(), invitee + "@example.com").getId())).containsExactly("MEMBER");
    }

    @Test
    void anInviterWhoLostTheRightToInviteGrantsNothing() throws Exception {
        world(acme);
        String token = inviteBoth(acme);
        endRole(acme, inviterSeat, "HR_SPECIALIST"); // only MARKETING_MANAGER is left: it holds no members.invite
        accept(invitee, token, "SUMMARY").andExpect(status().isOk());
        assertThat(liveRoleKeys(acme, seatOfInvite(acme.getId(), invitee + "@example.com").getId())).containsExactly("MEMBER");
    }

    @Test
    void anOwnerGrantedAdminRoleSurvivesWhileTheyAreStillAnOwner() throws Exception {
        invite(owner, acme, "{\"emails\":[\"" + "adm" + sfx + "@example.com\"],\"roleIds\":[" + roleId("ORG_ADMIN") + "]}").andExpect(status().isOk());
        String token = lastToken();
        fx.user("adm" + sfx);
        accept("adm" + sfx, token, "SUMMARY").andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN"));
        assertThat(auditCount(acme.getId(), "INVITE_ROLES_TRIMMED")).isZero();
    }

    @Test
    void anOwnerWhoHandedOverOwnershipCannotHaveGrantedAnAdminAnymore() throws Exception {
        invite(owner, acme, "{\"emails\":[\"" + "adm2" + sfx + "@example.com\"],\"roleIds\":[" + roleId("ORG_ADMIN") + "]}").andExpect(status().isOk());
        String token = lastToken();
        fx.user("adm2" + sfx);
        // the former owner is only an admin now: an admin cannot invite another admin
        ownerSeat.setRole(OrgRole.ADMIN);
        members.saveAndFlush(ownerSeat);
        endRole(acme, ownerSeat, "OWNER");
        OrgMemberRole adminRow = new OrgMemberRole();
        adminRow.setOrgId(acme.getId());
        adminRow.setMemberId(ownerSeat.getId());
        adminRow.setRoleId(roleId("ORG_ADMIN"));
        adminRow.setPrimary(true);
        memberRoles.saveAndFlush(adminRow);

        accept("adm2" + sfx, token, "SUMMARY").andExpect(status().isOk()).andExpect(jsonPath("$.role").value("MEMBER"));
        assertThat(auditCount(acme.getId(), "INVITE_ROLES_TRIMMED")).isEqualTo(1);
    }

    @Test
    void aManagerWhoLeftBeforeAcceptanceIsDroppedFromTheSeat() throws Exception {
        world(acme);
        OrgMember boss = seatWithRoles(acme, "boss" + sfx, OrgRole.STAFF, "HR_SPECIALIST");
        invite(inviter, acme, "{\"emails\":[\"" + invitee + "@example.com\"],\"roleIds\":[" + roleId("CONSULTANT") + "],\"managerMemberId\":" + boss.getId() + "}").andExpect(status().isOk());
        String token = lastToken();
        boss.setStatus(OrgMemberStatus.LEFT);
        members.saveAndFlush(boss);
        accept(invitee, token, "SUMMARY").andExpect(status().isOk());
        OrgMember seat = seatOfInvite(acme.getId(), invitee + "@example.com");
        assertThat(seat.getManagerMemberId()).isNull();
        assertThat(seat.getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void anAcceptedInvitationKeepsItsDepartmentTeamAndManagerOnTheSeat() throws Exception {
        world(acme);
        var dept = group(acme, "Ops", com.dossier.api.domain.enumeration.OrgGroupKind.DEPARTMENT);
        var team = group(acme, "Boston", com.dossier.api.domain.enumeration.OrgGroupKind.TEAM);
        invite(inviter, acme, "{\"emails\":[\"" + invitee + "@example.com\"],\"roleIds\":[" + roleId("CONSULTANT") + "],\"departmentGroupId\":" + dept.getId() + ",\"teamGroupId\":" + team.getId() + ",\"managerMemberId\":" + inviterSeat.getId() + "}").andExpect(status().isOk());
        accept(invitee, lastToken(), "SUMMARY").andExpect(status().isOk());
        OrgMember seat = seatOfInvite(acme.getId(), invitee + "@example.com");
        assertThat(seat.getDepartmentGroupId()).isEqualTo(dept.getId());
        assertThat(seat.getTeamGroupId()).isEqualTo(team.getId());
        assertThat(seat.getManagerMemberId()).isEqualTo(inviterSeat.getId());
        assertThat(liveRoles(acme.getId(), seat.getId())).hasSize(1).allSatisfy(r -> assertThat(r.isPrimary()).isTrue());
    }
}
