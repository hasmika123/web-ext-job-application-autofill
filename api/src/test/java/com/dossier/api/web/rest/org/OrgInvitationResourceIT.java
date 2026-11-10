package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.domain.enumeration.InviteStatus;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.service.org.OrgInviteExpiryJob;
import com.dossier.api.service.ent.TenantContextHolder;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

/**
 * X1.15 through the real filter chain, MySQL and the interceptor: inviting with several roles, a department, a team, a manager and a
 * note; the ceiling at invite time; one result per row and no account enumeration; the Invitations page (list, filters, paging,
 * counters, activity); resend, revoke and their bulk forms; the expiry job (per organization, inside a tenant scope).
 */
@Timeout(60) // the default is 15 s; the list test makes dozens of calls and the build machine is shared
class OrgInvitationResourceIT extends AbstractInviteIT {

    @Autowired private OrgInviteExpiryJob expiryJob;

    private String hr;
    private OrgMember hrSeat;
    private OrgGroup dept;
    private OrgGroup team;

    private void world() {
        hr = "hr-" + sfx;
        hrSeat = seatWithRoles(acme, hr, OrgRole.STAFF, "HR_SPECIALIST"); // mirrors STAFF, holds members.invite at ORG scope through its role data
        dept = group(acme, "Operations", OrgGroupKind.DEPARTMENT);
        team = group(acme, "Boston", OrgGroupKind.TEAM);
    }

    // ---- inviting ---------------------------------------------------------------------------------------------------------

    @Test
    void anOwnerInvitesWithTwoRolesDepartmentTeamManagerAndANote() throws Exception {
        world();
        Long mkt = roleId("MARKETING_SPECIALIST");
        Long consultant = roleId("CONSULTANT");
        org.mockito.Mockito.clearInvocations(mail);
        ResultActions r = invite(
            owner, acme,
            "{\"emails\":[\"newhire@example.org\"],\"fullName\":\"New Hire\",\"roleIds\":[" + mkt + "," + consultant + "],\"departmentGroupId\":" + dept.getId() + ",\"teamGroupId\":" + team.getId() + ",\"managerMemberId\":" + hrSeat.getId() + ",\"message\":\"Welcome aboard!\"}"
        );
        r.andExpect(status().isOk()).andExpect(jsonPath("$.rows[0].status").value("INVITED")).andExpect(jsonPath("$.invited[0].roleIds.length()").value(2));
        String token = lastToken();
        assertNoToken(r, token);

        OrgMember seat = seatOfInvite(acme.getId(), "newhire@example.org");
        assertThat(seat.getStatus()).isEqualTo(OrgMemberStatus.INVITED);
        assertThat(seat.getRole()).as("the legacy enum mirrors the primary role").isEqualTo(OrgRole.MARKETER);
        assertThat(seat.getInviteName()).isEqualTo("New Hire");
        assertThat(seat.getDepartmentGroupId()).isEqualTo(dept.getId());
        assertThat(seat.getTeamGroupId()).isEqualTo(team.getId());
        assertThat(seat.getManagerMemberId()).isEqualTo(hrSeat.getId());
        assertThat(seat.getGroupId()).as("the scope code still reads one group: the team").isEqualTo(team.getId());
        assertThat(seat.getInviteMessage()).isEqualTo("Welcome aboard!");
        assertThat(seat.getInviteRoleIdsJson()).isEqualTo("[" + mkt + "," + consultant + "]");
        assertThat(seat.getPrimaryRoleId()).isEqualTo(mkt);
        var rows = liveRoles(acme.getId(), seat.getId());
        assertThat(rows).extracting(x -> x.getRoleId()).containsExactly(mkt, consultant);
        assertThat(rows).extracting(x -> x.isPrimary()).containsExactly(true, false);
        assertThat(auditCount(acme.getId(), "MEMBER_INVITE")).isEqualTo(1);
        assertThat(auditDetails(acme.getId(), "MEMBER_INVITE")).contains("MARKETING_SPECIALIST,CONSULTANT").doesNotContain("newhire");

        ArgumentCaptor<String> roleWord = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> message = ArgumentCaptor.forClass(String.class);
        verify(mail, atLeastOnce()).sendOrgInviteEmail(any(), any(), any(), any(), roleWord.capture(), any(), any(), any(), message.capture(), any());
        assertThat(roleWord.getValue()).isEqualTo("a Marketing Specialist (and 1 more)");
        assertThat(message.getValue()).isEqualTo("Welcome aboard!");
    }

    @Test
    void anHrSpecialistInvitesConsultantsButNotRolesWiderThanTheirOwn() throws Exception {
        world();
        invite(hr, acme, "{\"emails\":[\"mk1@example.org\"],\"roleIds\":[" + roleId("MARKETING_SPECIALIST") + "]}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ROLE_CEILING"))
            .andExpect(jsonPath("$.roleIds[0]").value(roleId("MARKETING_SPECIALIST").intValue()));
        invite(hr, acme, "{\"emails\":[\"ad1@example.org\"],\"roleIds\":[" + roleId("ORG_ADMIN") + "]}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("ROLE_CEILING"));
        assertThat(members.findByOrgIdAndInviteEmailAndStatusIn(acme.getId(), "mk1@example.org", OrgMemberStatus.LIVE)).as("a refused invitation writes nothing").isEmpty();
        assertThat(auditCount(acme.getId(), "MEMBER_INVITE")).isZero();

        invite(hr, acme, "{\"emails\":[\"c1@example.org\"],\"roleIds\":[" + roleId("CONSULTANT") + "]}").andExpect(status().isOk()).andExpect(jsonPath("$.rows[0].status").value("INVITED"));
        invite(hr, acme, "{\"emails\":[\"mix@example.org\"],\"roleIds\":[" + roleId("CONSULTANT") + "," + roleId("MARKETING_SPECIALIST") + "]}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.roleIds.length()").value(1));
    }

    @Test
    void anOrgAdminInvitesMarketingButOnlyAnOwnerInvitesAnotherAdmin() throws Exception {
        world();
        String admin = "adm-" + sfx;
        OrgMember adminSeat = fx.active(acme, admin, OrgRole.ADMIN);
        roleService.syncFromLegacy(adminSeat);
        invite(admin, acme, "{\"emails\":[\"m2@example.org\"],\"roleIds\":[" + roleId("MARKETING_SPECIALIST") + "]}").andExpect(status().isOk());
        invite(admin, acme, "{\"emails\":[\"a2@example.org\"],\"roleIds\":[" + roleId("ORG_ADMIN") + "]}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("ROLE_CEILING"));
        invite(owner, acme, "{\"emails\":[\"a2@example.org\"],\"roleIds\":[" + roleId("ORG_ADMIN") + "]}").andExpect(status().isOk());
        invite(owner, acme, "{\"emails\":[\"o2@example.org\"],\"roleIds\":[" + roleId("OWNER") + "]}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("ORG_INVALID"));
    }

    @Test
    void aRoleOfAnotherOrganizationIsA404AndAForeignGroupOrManagerToo() throws Exception {
        world();
        Organization beta = fx.org("inv-beta-" + sfx, com.dossier.api.domain.enumeration.OrgStatus.ACTIVE);
        OrgRoleDefinition clone = new OrgRoleDefinition();
        clone.setOrgId(beta.getId());
        clone.setRoleKey("BETA_ONLY_" + sfx);
        clone.setName("Beta only");
        clone.setTemplateKey("MEMBER");
        clone.setSystem(false);
        clone = roles.saveAndFlush(clone);
        invite(owner, acme, "{\"emails\":[\"x1@example.org\"],\"roleIds\":[" + clone.getId() + "]}").andExpect(status().isNotFound());
        OrgGroup betaDept = group(beta, "Beta dept", OrgGroupKind.DEPARTMENT);
        invite(owner, acme, "{\"emails\":[\"x1@example.org\"],\"departmentGroupId\":" + betaDept.getId() + "}").andExpect(status().isNotFound());
        OrgMember betaMember = fx.active(beta, "bm-" + sfx, OrgRole.MEMBER);
        invite(owner, acme, "{\"emails\":[\"x1@example.org\"],\"managerMemberId\":" + betaMember.getId() + "}").andExpect(status().isNotFound());
        assertThat(members.findByOrgIdAndInviteEmailAndStatusIn(acme.getId(), "x1@example.org", OrgMemberStatus.LIVE)).isEmpty();
    }

    @Test
    void placementMustBeTheRightKindAndAnActiveManager() throws Exception {
        world();
        invite(owner, acme, "{\"emails\":[\"p1@example.org\"],\"departmentGroupId\":" + team.getId() + "}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("departmentGroupId"));
        invite(owner, acme, "{\"emails\":[\"p1@example.org\"],\"teamGroupId\":" + dept.getId() + "}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("teamGroupId"));
        OrgMember suspended = fx.seat(acme, "susp-" + sfx, OrgRole.MEMBER, OrgMemberStatus.SUSPENDED);
        invite(owner, acme, "{\"emails\":[\"p1@example.org\"],\"managerMemberId\":" + suspended.getId() + "}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("managerMemberId"));
        // HR holds members.group.set / members.manager.set through its role data
        invite(hr, acme, "{\"emails\":[\"p2@example.org\"],\"roleIds\":[" + roleId("CONSULTANT") + "],\"departmentGroupId\":" + dept.getId() + ",\"managerMemberId\":" + hrSeat.getId() + "}").andExpect(status().isOk());
    }

    @Test
    void aNoteIsCappedAndRefusedWhenItCarriesAnIdentityNumber() throws Exception {
        world();
        invite(owner, acme, "{\"emails\":[\"n1@example.org\"],\"message\":\"" + "x".repeat(501) + "\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("message"));
        invite(owner, acme, "{\"emails\":[\"n1@example.org\"],\"message\":\"my SSN is 123-45-6789\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("message"));
        invite(owner, acme, "{\"emails\":[\"n1@example.org\"],\"roleIds\":[1,2,3,4,5,6]}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("roleIds"));
    }

    @Test
    void aConsultancyDefaultsToConsultantAndAnyOtherOrganizationToMember() throws Exception {
        Organization firm = consultancy("inv-firm-" + sfx);
        String firmOwner = "fo-" + sfx;
        roleService.syncFromLegacy(fx.active(firm, firmOwner, OrgRole.OWNER));
        invite(firmOwner, firm, "{\"emails\":[\"c9@example.org\"]}").andExpect(status().isOk());
        OrgMember c = seatOfInvite(firm.getId(), "c9@example.org");
        assertThat(c.getPrimaryRoleId()).isEqualTo(roleId("CONSULTANT"));
        assertThat(c.getRole()).isEqualTo(OrgRole.MEMBER);

        invite(owner, acme, "{\"emails\":[\"m9@example.org\"]}").andExpect(status().isOk());
        assertThat(seatOfInvite(acme.getId(), "m9@example.org").getPrimaryRoleId()).isEqualTo(roleId("MEMBER"));
    }

    @Test
    void theOldRoleFieldStillWorksAndMapsToTheMatchingTemplate() throws Exception {
        invite(owner, acme, "{\"emails\":[\"legacy@example.org\"],\"role\":\"MARKETER\"}").andExpect(status().isOk());
        OrgMember s = seatOfInvite(acme.getId(), "legacy@example.org");
        assertThat(s.getRole()).isEqualTo(OrgRole.MARKETER);
        assertThat(s.getPrimaryRoleId()).isEqualTo(roleId("MARKETING_SPECIALIST"));
        assertThat(s.getInviteRoleIdsJson()).isNotNull();
    }

    @Test
    void aBulkInviteReturnsOneRowPerEntryAndNeverRevealsWhoHasAnAccount() throws Exception {
        world();
        String existing = "mem-" + sfx;
        fx.active(acme, existing, OrgRole.MEMBER);
        String hasAccount = "acct-" + sfx; // a Kiwiply account that holds no seat here
        fx.user(hasAccount);
        JsonNode r = json(
            invite(
                owner, acme,
                "{\"emails\":[\"ok1@example.org\",\"not-an-email\",\"ok1@example.org\",\"" + existing + "@example.com\",\"" + hasAccount + "@example.com\",\"brandnew-" + sfx + "@example.org\"]}"
            ).andExpect(status().isOk())
        );
        List<String> statuses = new ArrayList<>();
        r.get("rows").forEach(row -> statuses.add(row.get("status").asText()));
        assertThat(statuses).containsExactly("INVITED", "INVALID", "DUPLICATE", "ALREADY_MEMBER", "INVITED", "INVITED");
        JsonNode withAccount = r.get("rows").get(4);
        JsonNode withoutAccount = r.get("rows").get(5);
        assertThat(withAccount.get("status")).as("an address that has a Kiwiply account is answered like one that has not").isEqualTo(withoutAccount.get("status"));
        assertThat(withAccount.get("reason")).isEqualTo(withoutAccount.get("reason"));
        assertThat(withAccount.fieldNames().next()).isEqualTo(withoutAccount.fieldNames().next());
        assertThat(r.get("invited")).hasSize(3);
        assertThat(r.get("invalid")).hasSize(2);
        assertThat(r.get("alreadyMember")).hasSize(1);
    }

    // ---- the Invitations page ---------------------------------------------------------------------------------------------

    @Test
    void theListFiltersPagesAndCountsEveryStatus() throws Exception {
        world();
        String a = "alice" + sfx;
        String b = "bob" + sfx;
        fx.user(a);
        Long mkt = roleId("MARKETING_SPECIALIST");
        for (String who : List.of(a, b, "carol" + sfx, "dave" + sfx, "erin" + sfx)) {
            String extra = who.startsWith("alice") || who.startsWith("bob") ? "\"roleIds\":[" + mkt + "],\"departmentGroupId\":" + dept.getId() : "\"roleIds\":[" + roleId("CONSULTANT") + "]";
            invite(owner, acme, "{\"emails\":[\"" + who + "@example.com\"]," + extra + "}").andExpect(status().isOk());
        }
        // accepted: alice, through the real endpoint (her account address is the invited one)
        org.mockito.Mockito.clearInvocations(mail);
        invite(owner, acme, "{\"emails\":[\"alice-extra" + sfx + "@example.com\"]}").andReturn(); // keeps lastToken() independent of the loop above
        OrgMember aliceSeat = seatOfInvite(acme.getId(), a + "@example.com");
        // revoke bob through the API
        postAs(owner, "/api/orgs/" + acme.getId() + "/invitations/" + seatOfInvite(acme.getId(), b + "@example.com").getId() + "/revoke", null).andExpect(status().isNoContent());
        // expire carol (the clock, not the job)
        OrgMember carol = seatOfInvite(acme.getId(), "carol" + sfx + "@example.com");
        carol.setInviteExpiresAt(Instant.now().minus(Duration.ofHours(1)));
        members.saveAndFlush(carol);
        // accept alice: she needs her token; resend rotates it so the mail carries a fresh one
        org.mockito.Mockito.clearInvocations(mail);
        postAs(owner, "/api/orgs/" + acme.getId() + "/invitations/" + aliceSeat.getId() + "/resend", null).andExpect(status().isOk());
        accept(a, lastToken(), "SUMMARY").andExpect(status().isOk());

        String base = "/api/orgs/" + acme.getId() + "/invitations";
        JsonNode all = json(getAs(owner, base + "?size=100").andExpect(status().isOk()));
        assertThat(all.get("total").asInt()).isEqualTo(6);
        assertThat(all.get("items")).hasSize(6);
        JsonNode first = all.get("items").get(0);
        assertThat(first.has("token") || first.has("inviteTokenHash") || first.has("link")).as("never the token, its hash or the link").isFalse();
        List<Long> ids = new ArrayList<>();
        all.get("items").forEach(i -> ids.add(i.get("id").asLong()));
        List<Instant> sent = new ArrayList<>();
        all.get("items").forEach(i -> sent.add(Instant.parse(i.get("invitedAt").asText())));
        assertThat(sent).as("newest first (a resend counts as sent again)").isSortedAccordingTo(java.util.Comparator.reverseOrder());

        assertThat(json(getAs(owner, base + "?status=PENDING")).get("total").asInt()).isEqualTo(3); // dave, erin, alice-extra
        assertThat(json(getAs(owner, base + "?status=ACCEPTED")).get("total").asInt()).isEqualTo(1);
        assertThat(json(getAs(owner, base + "?status=EXPIRED")).get("total").asInt()).isEqualTo(1);
        assertThat(json(getAs(owner, base + "?status=REVOKED")).get("total").asInt()).isEqualTo(1);
        assertThat(json(getAs(owner, base + "?q=ALICE" + sfx)).get("total").asInt()).as("case-insensitive search by address").isEqualTo(1);
        assertThat(json(getAs(owner, base + "?q=" + "%25")).get("total").asInt()).as("a percent sign is literal, not a wildcard").isZero();
        assertThat(json(getAs(owner, base + "?departmentGroupId=" + dept.getId())).get("total").asInt()).isEqualTo(2);
        assertThat(json(getAs(owner, base + "?roleId=" + mkt)).get("total").asInt()).isEqualTo(2);
        assertThat(json(getAs(owner, base + "?status=PENDING&roleId=" + mkt)).get("total").asInt()).as("alice accepted, bob revoked").isZero();
        String future = Instant.now().plus(Duration.ofHours(2)).toString();
        assertThat(json(getAs(owner, base + "?from=" + future)).get("total").asInt()).isZero();
        assertThat(json(getAs(owner, base + "?to=" + future)).get("total").asInt()).isEqualTo(6);

        JsonNode page2 = json(getAs(owner, base + "?size=4&page=1"));
        assertThat(page2.get("items")).hasSize(2);
        assertThat(page2.get("total").asInt()).isEqualTo(6);
        assertThat(page2.get("page").asInt()).isEqualTo(1);
        assertThat(json(getAs(owner, base + "?size=500")).get("size").asInt()).as("the page size is capped").isEqualTo(100);
        assertThat(json(getAs(owner, base + "?sort=invitedAt,asc&size=100")).get("items").get(0).get("id").asLong()).isEqualTo(ids.get(ids.size() - 1));

        JsonNode aliceRow = null;
        for (JsonNode i : all.get("items")) if (i.get("email").asText().startsWith("alice" + sfx)) aliceRow = i;
        assertThat(aliceRow.get("status").asText()).isEqualTo("ACCEPTED");
        assertThat(aliceRow.get("roles").get(0).get("name").asText()).isEqualTo("Marketing Specialist");
        assertThat(aliceRow.get("department").get("name").asText()).isEqualTo("Operations");
        assertThat(aliceRow.get("invitedBy").get("memberId").asLong()).isEqualTo(ownerSeat.getId());
        assertThat(aliceRow.get("acceptedAt").isNull()).isFalse();

        JsonNode counts = json(getAs(owner, base + "/counts").andExpect(status().isOk()));
        assertThat(counts.get("total").asInt()).isEqualTo(6);
        for (JsonNode c : counts.get("counts")) {
            int expected = switch (c.get("status").asText()) {
                case "PENDING" -> 3;
                default -> 1;
            };
            assertThat(c.get("count").asInt()).as(c.get("status").asText()).isEqualTo(expected);
            assertThat(c.get("deltaLastMonth").asInt()).as("everything was sent this month and nothing the month before").isEqualTo(expected);
        }
        assertThat(counts.get("counts")).extracting(c -> c.get("status").asText()).containsExactly("PENDING", "ACCEPTED", "EXPIRED", "REVOKED");
    }

    @Test
    void theActivityFeedListsTheLatestEventsNewestFirstWithWhoDidIt() throws Exception {
        world();
        fx.user("feed" + sfx);
        invite(owner, acme, "{\"emails\":[\"feed" + sfx + "@example.com\",\"feed2" + sfx + "@example.com\"]}").andExpect(status().isOk());
        org.mockito.Mockito.clearInvocations(mail);
        postAs(owner, "/api/orgs/" + acme.getId() + "/invitations/" + seatOfInvite(acme.getId(), "feed2" + sfx + "@example.com").getId() + "/revoke", null).andExpect(status().isNoContent());
        postAs(owner, "/api/orgs/" + acme.getId() + "/invitations/" + seatOfInvite(acme.getId(), "feed" + sfx + "@example.com").getId() + "/resend", null).andExpect(status().isOk());
        accept("feed" + sfx, lastToken(), "NONE").andExpect(status().isOk());

        JsonNode feed = json(getAs(owner, "/api/orgs/" + acme.getId() + "/invitations/activity?limit=10").andExpect(status().isOk()));
        List<String> kinds = new ArrayList<>();
        List<Instant> times = new ArrayList<>();
        feed.forEach(e -> {
            kinds.add(e.get("kind").asText());
            times.add(Instant.parse(e.get("at").asText()));
        });
        assertThat(kinds).contains("INVITED", "ACCEPTED", "REVOKED");
        assertThat(times).isSortedAccordingTo(java.util.Comparator.reverseOrder());
        assertThat(feed.get(0).get("invitationId").asLong()).isPositive();
        assertThat(feed.get(0).get("actor").get("memberId").asLong()).isEqualTo(ownerSeat.getId());
        assertThat(json(getAs(owner, "/api/orgs/" + acme.getId() + "/invitations/activity?limit=2"))).hasSize(2);
    }

    @Test
    void onlyThoseWhoMayInviteSeeThePage() throws Exception {
        world();
        String member = "mem-" + sfx;
        fx.active(acme, member, OrgRole.MEMBER);
        getAs(member, "/api/orgs/" + acme.getId() + "/invitations").andExpect(status().isNotFound());
        getAs(member, "/api/orgs/" + acme.getId() + "/invitations/counts").andExpect(status().isNotFound());
        getAs(member, "/api/orgs/" + acme.getId() + "/invitations/activity").andExpect(status().isNotFound());
        getAs(hr, "/api/orgs/" + acme.getId() + "/invitations").andExpect(status().isOk());
    }

    // ---- resend, revoke, bulk --------------------------------------------------------------------------------------------------

    @Test
    void resendRotatesTheLinkSoTheOldOneDiesAndTheNewOneWorks() throws Exception {
        String t1 = inviteOne(owner, acme, "r1" + sfx + "@example.org", null);
        OrgMember seat = seatOfInvite(acme.getId(), "r1" + sfx + "@example.org");
        org.mockito.Mockito.clearInvocations(mail);
        postAs(owner, "/api/orgs/" + acme.getId() + "/invitations/" + seat.getId() + "/resend", null).andExpect(status().isOk());
        String t2 = lastToken();
        assertThat(t2).isNotEqualTo(t1);
        preview(t1).andExpect(status().isNotFound());
        preview(t2).andExpect(status().isOk()).andExpect(jsonPath("$.orgName").value(acme.getName()));
        assertThat(auditCount(acme.getId(), "MEMBER_INVITE_RESEND")).isEqualTo(1);
    }

    @Test
    void revokeKillsTheLinkWithTheSameAnswerAsALinkThatNeverExistedAndFreesTheAddress() throws Exception {
        String token = inviteOne(owner, acme, "rv" + sfx + "@example.org", null);
        OrgMember seat = seatOfInvite(acme.getId(), "rv" + sfx + "@example.org");
        postAs(owner, "/api/orgs/" + acme.getId() + "/invitations/" + seat.getId() + "/revoke", null).andExpect(status().isNoContent());

        OrgMember after = members.findByOrgIdAndId(acme.getId(), seat.getId()).orElseThrow();
        assertThat(after.getStatus()).isEqualTo(OrgMemberStatus.REMOVED);
        assertThat(after.getInviteEndedReason()).isEqualTo("REVOKED");
        assertThat(after.getInviteTokenHash()).as("the token is gone").isNull();
        assertThat(auditCount(acme.getId(), "MEMBER_INVITE_REVOKE")).isEqualTo(1);

        var revoked = preview(token).andReturn().getResponse();
        var never = preview("Z".repeat(32)).andReturn().getResponse();
        assertThat(revoked.getStatus()).isEqualTo(404);
        assertThat(never.getStatus()).isEqualTo(404);
        assertThat(mapper.readTree(revoked.getContentAsString()).get("code")).as("no enumeration: a revoked link and an unknown one look alike").isEqualTo(mapper.readTree(never.getContentAsString()).get("code"));
        fx.user("whoever" + sfx);
        accept("whoever" + sfx, token, "NONE").andExpect(status().isNotFound());

        postAs(owner, "/api/orgs/" + acme.getId() + "/invitations/" + seat.getId() + "/revoke", null).andExpect(status().isNotFound());
        postAs(owner, "/api/orgs/" + acme.getId() + "/invitations/" + seat.getId() + "/resend", null).andExpect(status().isNotFound());
        invite(owner, acme, "{\"emails\":[\"rv" + sfx + "@example.org\"]}").andExpect(status().isOk()).andExpect(jsonPath("$.rows[0].status").value("INVITED"));
        assertThat(json(getAs(owner, "/api/orgs/" + acme.getId() + "/invitations?status=REVOKED")).get("total").asInt()).isEqualTo(1);
    }

    @Test
    void anAcceptedInvitationCannotBeRevokedOrResent() throws Exception {
        fx.user("acc" + sfx);
        String token = inviteOne(owner, acme, "acc" + sfx + "@example.com", null);
        accept("acc" + sfx, token, "SUMMARY").andExpect(status().isOk());
        Long id = seatOfInvite(acme.getId(), "acc" + sfx + "@example.com").getId();
        postAs(owner, "/api/orgs/" + acme.getId() + "/invitations/" + id + "/revoke", null).andExpect(status().isNotFound());
        postAs(owner, "/api/orgs/" + acme.getId() + "/invitations/" + id + "/resend", null).andExpect(status().isNotFound());
        assertThat(members.findByOrgIdAndId(acme.getId(), id).orElseThrow().getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void bulkResendAndRevokeAnswerOneResultPerIdAndFailAlone() throws Exception {
        inviteOne(owner, acme, "b1" + sfx + "@example.org", null);
        inviteOne(owner, acme, "b2" + sfx + "@example.org", null);
        Long b1 = seatOfInvite(acme.getId(), "b1" + sfx + "@example.org").getId();
        Long b2 = seatOfInvite(acme.getId(), "b2" + sfx + "@example.org").getId();
        String base = "/api/orgs/" + acme.getId() + "/invitations/bulk/";

        JsonNode resent = json(postAs(owner, base + "resend", "{\"ids\":[" + b1 + "," + b2 + ",999999999," + b1 + "]}").andExpect(status().isOk()));
        assertThat(resent.get("results")).hasSize(3); // the repeated id is answered once
        assertThat(resent.get("results").get(0).get("status").asText()).isEqualTo("OK");
        assertThat(resent.get("results").get(1).get("status").asText()).isEqualTo("OK");
        assertThat(resent.get("results").get(2).get("status").asText()).isEqualTo("FAILED");
        assertThat(resent.get("results").get(2).get("code").asText()).isEqualTo("NOT_FOUND");

        JsonNode revoked = json(postAs(owner, base + "revoke", "{\"ids\":[" + b1 + "," + b1 + "," + b2 + "]}").andExpect(status().isOk()));
        assertThat(revoked.get("results")).hasSize(2);
        assertThat(revoked.get("results").get(0).get("status").asText()).isEqualTo("OK");
        JsonNode again = json(postAs(owner, base + "revoke", "{\"ids\":[" + b1 + "]}").andExpect(status().isOk()));
        assertThat(again.get("results").get(0).get("code").asText()).as("already revoked").isEqualTo("NOT_FOUND");

        postAs(owner, base + "resend", "{\"ids\":[]}").andExpect(status().isUnprocessableEntity());
        postAs(owner, base + "resend", "{\"ids\":" + java.util.stream.LongStream.rangeClosed(1, 101).boxed().toList() + "}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("ORG_LIMIT_REACHED"));
        assertThat(auditCount(acme.getId(), "MEMBER_INVITE_RESEND")).isEqualTo(2);
        assertThat(auditCount(acme.getId(), "MEMBER_INVITE_REVOKE")).isEqualTo(2);
    }

    @Test
    void aFailedResendInABulkWritesNothingForThatRow() throws Exception {
        inviteOne(owner, acme, "w1" + sfx + "@example.org", null);
        Long id = seatOfInvite(acme.getId(), "w1" + sfx + "@example.org").getId();
        store("org.invite.resendsPerWeek", "1");
        String base = "/api/orgs/" + acme.getId() + "/invitations/bulk/resend";
        assertThat(json(postAs(owner, base, "{\"ids\":[" + id + "]}")).get("results").get(0).get("status").asText()).isEqualTo("OK");
        JsonNode second = json(postAs(owner, base, "{\"ids\":[" + id + "]}")).get("results").get(0);
        assertThat(second.get("status").asText()).isEqualTo("FAILED");
        assertThat(second.get("code").asText()).isEqualTo("ORG_LIMIT_REACHED");
        assertThat(members.findByOrgIdAndId(acme.getId(), id).orElseThrow().getInviteResendCount()).isEqualTo(1);
    }

    // ---- the expiry job ------------------------------------------------------------------------------------------------------

    @Test
    void theExpiryJobEndsOnlyExpiredInvitationsOrganizationByOrganizationInsideATenantScope() throws Exception {
        Organization firm = consultancy("inv-firm2-" + sfx);
        String firmOwner = "fo2-" + sfx;
        roleService.syncFromLegacy(fx.active(firm, firmOwner, OrgRole.OWNER));
        String tOld = inviteOne(owner, acme, "old" + sfx + "@example.org", null);
        inviteOne(owner, acme, "live" + sfx + "@example.org", null);
        inviteOne(firmOwner, firm, "firmold" + sfx + "@example.org", null);
        OrgMember old = seatOfInvite(acme.getId(), "old" + sfx + "@example.org");
        OrgMember firmOld = seatOfInvite(firm.getId(), "firmold" + sfx + "@example.org");
        for (OrgMember m : List.of(old, firmOld)) {
            m.setInviteExpiresAt(Instant.now().minus(Duration.ofDays(1)));
            members.saveAndFlush(m);
        }
        long acmeAuditBefore = auditCount(acme.getId(), "MEMBER_INVITE_EXPIRED");

        int ended = expiryJob.runOnce(Instant.now());
        assertThat(ended).isGreaterThanOrEqualTo(2);
        assertThat(TenantContextHolder.current()).as("the job left no tenant behind").isEmpty();

        OrgMember swept = members.findByOrgIdAndId(acme.getId(), old.getId()).orElseThrow();
        assertThat(swept.getStatus()).isEqualTo(OrgMemberStatus.REMOVED);
        assertThat(swept.getInviteEndedReason()).isEqualTo("EXPIRED");
        assertThat(swept.getInviteEndedAt()).isNotNull();
        assertThat(members.findByOrgIdAndId(firm.getId(), firmOld.getId()).orElseThrow().getStatus()).as("the other organization's was swept in its own scope").isEqualTo(OrgMemberStatus.REMOVED);
        assertThat(seatOfInvite(acme.getId(), "live" + sfx + "@example.org").getStatus()).as("a live invitation is untouched").isEqualTo(OrgMemberStatus.INVITED);
        assertThat(auditCount(acme.getId(), "MEMBER_INVITE_EXPIRED")).isEqualTo(acmeAuditBefore + 1);
        assertThat(auditActor(acme.getId(), "MEMBER_INVITE_EXPIRED")).isEqualTo("system");
        assertThat(expiryJob.runOnce(Instant.now())).as("nothing left to do for these two").isGreaterThanOrEqualTo(0);
        assertThat(members.findByOrgIdAndId(acme.getId(), old.getId()).orElseThrow().getInviteEndedAt()).isEqualTo(swept.getInviteEndedAt());

        preview(tOld).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVITE_EXPIRED"));
        fx.user("whoever" + sfx);
        accept("whoever" + sfx, tOld, "NONE").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVITE_EXPIRED"));
        assertThat(json(getAs(owner, "/api/orgs/" + acme.getId() + "/invitations?status=EXPIRED")).get("total").asInt()).isEqualTo(1);

        // the address is free again; resend revives the same invitation with a new link
        org.mockito.Mockito.clearInvocations(mail);
        postAs(owner, "/api/orgs/" + acme.getId() + "/invitations/" + old.getId() + "/resend", null).andExpect(status().isOk());
        String fresh = lastToken();
        assertThat(members.findByOrgIdAndId(acme.getId(), old.getId()).orElseThrow().getStatus()).isEqualTo(OrgMemberStatus.INVITED);
        preview(fresh).andExpect(status().isOk());
        preview(tOld).andExpect(status().isNotFound());
        assertThat(json(getAs(owner, "/api/orgs/" + acme.getId() + "/invitations?status=PENDING")).get("total").asInt()).isEqualTo(2);
    }

    @Test
    void anExpiredAddressCanBeInvitedAgainAsANewInvitationWhileTheOldOneStaysAsHistory() throws Exception {
        inviteOne(owner, acme, "again" + sfx + "@example.org", null);
        OrgMember old = seatOfInvite(acme.getId(), "again" + sfx + "@example.org");
        old.setInviteExpiresAt(Instant.now().minus(Duration.ofDays(1)));
        members.saveAndFlush(old);
        expiryJob.runOnce(Instant.now());
        invite(owner, acme, "{\"emails\":[\"again" + sfx + "@example.org\"]}").andExpect(status().isOk()).andExpect(jsonPath("$.rows[0].status").value("INVITED"));
        OrgMember fresh = seatOfInvite(acme.getId(), "again" + sfx + "@example.org");
        assertThat(fresh.getId()).isNotEqualTo(old.getId());
        // the old row can no longer be revived over the new one
        postAs(owner, "/api/orgs/" + acme.getId() + "/invitations/" + old.getId() + "/resend", null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_MEMBER"));
        assertThat(json(getAs(owner, "/api/orgs/" + acme.getId() + "/invitations?q=again" + sfx)).get("total").asInt()).isEqualTo(2);
        assertThat(InviteStatus.of(members.findByOrgIdAndId(acme.getId(), old.getId()).orElseThrow(), Instant.now())).isEqualTo(InviteStatus.EXPIRED);
    }
}
