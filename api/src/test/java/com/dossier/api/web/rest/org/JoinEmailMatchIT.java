package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.OrgSettingRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * X1.15, E7 (docs/enterprise-v2/08-decisions-for-user.md, 42-threat-model.md T32): an invitation binds to the invited address by
 * default; {@code org.invite.require_email_match} (platform setting, organization override) turns that off, and then the acceptance
 * is audited with a mismatch flag. A refused acceptance changes nothing and the link keeps working for the right account.
 */
@Timeout(60)
class JoinEmailMatchIT extends AbstractInviteIT {

    @Autowired private OrgSettingRepository orgSettings;


    private void override(String value) {
        OrgSetting s = orgSettings.findByOrgIdAndSettingKey(acme.getId(), "org.invite.require_email_match").orElseGet(OrgSetting::new);
        s.setOrgId(acme.getId());
        s.setSettingKey("org.invite.require_email_match");
        s.setValueJson(value);
        s.setUpdatedBy(WHO);
        orgSettings.saveAndFlush(s);
    }

    @Test
    void aDifferentAccountIsRefusedWithAMaskedAddressAndTheInvitationStaysOpenForTheRightOne() throws Exception {
        String right = "right" + sfx;
        String wrong = "wrong" + sfx;
        fx.user(right);
        fx.user(wrong);
        String token = inviteOne(owner, acme, right + "@example.com", null);
        OrgMember seat = seatOfInvite(acme.getId(), right + "@example.com");

        var refused = accept(wrong, token, "SUMMARY").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVITE_EMAIL_MISMATCH"));
        String body = refused.andReturn().getResponse().getContentAsString();
        assertThat(mapper.readTree(body).get("invitedEmailMasked").asText()).isEqualTo("r***@e***.com");
        assertThat(body).as("the address itself is never in the answer").doesNotContain(right);
        OrgMember still = members.findByOrgIdAndId(acme.getId(), seat.getId()).orElseThrow();
        assertThat(still.getStatus()).as("the seat stays INVITED").isEqualTo(OrgMemberStatus.INVITED);
        assertThat(still.getUserId()).isNull();
        assertThat(auditCount(acme.getId(), "MEMBER_JOIN")).isZero();
        preview(token).andExpect(status().isOk());

        accept(right, token, "SUMMARY").andExpect(status().isOk());
        assertThat(members.findByOrgIdAndId(acme.getId(), seat.getId()).orElseThrow().getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(auditDetails(acme.getId(), "MEMBER_JOIN")).doesNotContain("emailMismatch");
    }

    @Test
    void theComparisonIgnoresCase() throws Exception {
        String login = "casey" + sfx;
        User u = fx.user(login);
        u.setEmail("Casey" + sfx + "@Example.COM");
        users.saveAndFlush(u);
        String token = inviteOne(owner, acme, "casey" + sfx + "@example.com", null);
        accept(login, token, "NONE").andExpect(status().isOk());
    }

    @Test
    void withTheRuleSwitchedOffAnyAccountMayAcceptAndTheAcceptanceIsAuditedWithAFlag() throws Exception {
        store("org.invite.require_email_match", "false");
        String wrong = "wrong2" + sfx;
        fx.user(wrong);
        String token = inviteOne(owner, acme, "someone" + sfx + "@example.org", null);
        accept(wrong, token, "SUMMARY").andExpect(status().isOk());
        assertThat(auditDetails(acme.getId(), "MEMBER_JOIN")).contains("via=invite").contains("emailMismatch=true");
    }

    @Test
    void anOrganizationOverrideBeatsThePlatformSettingInBothDirections() throws Exception {
        String a = "ovr" + sfx;
        fx.user(a);
        // platform on (default), organization off: accepted
        override("false");
        String t1 = inviteOne(owner, acme, "x1" + sfx + "@example.org", null);
        accept(a, t1, "NONE").andExpect(status().isOk());

        // platform off, organization on: refused
        store("org.invite.require_email_match", "false");
        override("true");
        String b = "ovr2" + sfx;
        fx.user(b);
        String t2 = inviteOne(owner, acme, "x2" + sfx + "@example.org", null);
        accept(b, t2, "NONE").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVITE_EMAIL_MISMATCH"));
    }

    @Test
    void aMalformedOverrideFallsBackToThePlatformSettingNeverWider() throws Exception {
        override("\"maybe\"");
        String a = "mal" + sfx;
        fx.user(a);
        String t = inviteOne(owner, acme, "x3" + sfx + "@example.org", null);
        accept(a, t, "NONE").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVITE_EMAIL_MISMATCH"));
    }

    @Test
    void thePreviewTellsTheJoinCardWhichAddressIsExpectedWithoutRevealingIt() throws Exception {
        String token = inviteOne(owner, acme, "Priya.Rao" + sfx + "@Example.org", "\"fullName\":\"Priya Rao\",\"message\":\"See you Monday\"");
        var body = preview(token).andExpect(status().isOk()).andExpect(jsonPath("$.emailMatchRequired").value(true)).andExpect(jsonPath("$.message").value("See you Monday")).andReturn().getResponse().getContentAsString();
        assertThat(mapper.readTree(body).get("invitedEmailMasked").asText()).startsWith("p***@e***");
        assertThat(body).doesNotContain("priya.rao").doesNotContain("Priya.Rao").doesNotContain("example.org");
        assertThat(mapper.readTree(body).get("roles")).isNotEmpty();
        store("org.invite.require_email_match", "false");
        preview(token).andExpect(jsonPath("$.emailMatchRequired").value(false));
    }
}
