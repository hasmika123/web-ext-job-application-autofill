package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.MailService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * X1.8: invitations on an organization's own host (12-identity.md section 5). An invite for one organization does not exist on
 * another organization's host; the invitee signs in with the invite token (no tid) and accepting returns a tid-bound pair.
 * Not transactional: accepting commits and the mail goes out after commit.
 */
@IntegrationTest
@AutoConfigureMockMvc
class JoinTenantHostIT {

    private static final String HOST = "X-Kiwiply-Host";
    private static final String CONSENT = "org-share/v1";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private TenantResolver resolver;
    @Autowired private PasswordEncoder encoder;
    @MockitoBean private MailService mail;

    private OrgFixtures fx;
    private String sfx;
    private Organization acme;
    private Organization beta;
    private String acmeHost;
    private String betaHost;
    private String owner;
    private String invitee;
    private String outsider;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        sfx = UUID.randomUUID().toString().substring(0, 6);
        acmeHost = "jta" + sfx + ".kiwiply.com";
        betaHost = "jtb" + sfx + ".kiwiply.com";
        owner = "jown" + sfx;
        invitee = "jinv" + sfx;
        outsider = "jout" + sfx;
        acme = fx.org("jt-acme-" + sfx, OrgStatus.ACTIVE);
        beta = fx.org("jt-beta-" + sfx, OrgStatus.ACTIVE);
        acme.setSubdomain("jta" + sfx);
        acme.setSubdomainEnabled(true);
        beta.setSubdomain("jtb" + sfx);
        beta.setSubdomainEnabled(true);
        orgs.saveAndFlush(acme);
        orgs.saveAndFlush(beta);
        fx.active(acme, owner, OrgRole.OWNER);
        createUser(invitee);
        createUser(outsider);
        setting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}");
        setting("org.join.missPerMin", "100");
    }

    @AfterEach
    void forget() {
        for (String key : List.of(EnterpriseSettingKeys.FLAG_ENTERPRISE, "org.join.missPerMin")) rows.findById(key).ifPresent(rows::delete);
        settings.invalidate();
        resolver.invalidate();
    }

    private void setting(String key, String value) {
        rows.saveAndFlush(new AppSetting(key, value, "join-tenant-it", Instant.now()));
        settings.invalidate();
        resolver.invalidate();
    }

    private void createUser(String login) {
        User u = fx.user(login);
        u.setPassword(encoder.encode("test"));
        users.saveAndFlush(u);
    }

    private String inviteTokenFor(Organization org, String email) throws Exception {
        clearInvocations(mail);
        String ownerLogin = org == acme ? owner : "jbown" + sfx;
        if (org == beta && users.findOneByLogin(ownerLogin).isEmpty()) fx.active(beta, ownerLogin, OrgRole.OWNER);
        mockMvc
            .perform(post("/api/orgs/" + org.getId() + "/members/invite").with(user(ownerLogin)).contentType(MediaType.APPLICATION_JSON).content("{\"emails\":[\"" + email + "\"],\"role\":\"MEMBER\"}"))
            .andReturn();
        ArgumentCaptor<String> link = ArgumentCaptor.forClass(String.class);
        verify(mail, atLeastOnce()).sendOrgInviteEmail(any(), any(), any(), any(), any(), any(), link.capture(), any());
        String last = link.getAllValues().get(link.getAllValues().size() - 1);
        return last.substring(last.indexOf("/join/t/") + "/join/t/".length());
    }

    private String linkOf(Organization org, String email) throws Exception {
        inviteTokenFor(org, email);
        ArgumentCaptor<String> link = ArgumentCaptor.forClass(String.class);
        verify(mail, atLeastOnce()).sendOrgInviteEmail(any(), any(), any(), any(), any(), any(), link.capture(), any());
        return link.getAllValues().get(link.getAllValues().size() - 1);
    }

    private MvcResult login(String host, String login, String inviteToken) throws Exception {
        var req = post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"" + login + "\",\"password\":\"test\"}");
        if (host != null) req = req.header(HOST, host);
        if (inviteToken != null) req = req.header("X-Kiwiply-Invite", inviteToken);
        return mockMvc.perform(req).andReturn();
    }

    private JsonNode claims(String jwt) throws Exception {
        return mapper.readTree(Base64.getUrlDecoder().decode(jwt.split("\\.")[1]));
    }

    private MvcResult acceptWithBearer(String host, String bearer, String token) throws Exception {
        var req = post("/api/join/" + token + "/accept")
            .header("Authorization", "Bearer " + bearer)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"shareScope\":\"SUMMARY\",\"consentVersion\":\"" + CONSENT + "\"}");
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn();
    }

    @Test
    void theEmailLinkPointsAtThePlatformUntilTheOrgHasALiveHost() throws Exception {
        // Neither org has a hostname ROW, only a bare subdomain: the interim builder uses rows, so the platform base is right here.
        String link = linkOf(acme, invitee + "@example.org");
        assertThat(link).contains("/join/t/").doesNotContain("evil");
    }

    @Test
    void anInviteForAcmeDoesNotExistOnBetasHost() throws Exception {
        String token = inviteTokenFor(acme, invitee + "@example.org");
        String bearer = mapper.readTree(login(null, invitee, null).getResponse().getContentAsString()).get("accessToken").asText();

        assertThat(mockMvc.perform(get("/api/join/" + token).header(HOST, betaHost)).andReturn().getResponse().getStatus()).as("preview on beta").isEqualTo(404);
        MvcResult wrong = acceptWithBearer(betaHost, bearer, token);
        assertThat(wrong.getResponse().getStatus()).as("accept on beta").isEqualTo(404);
        assertThat(members.findByInviteTokenHash(com.dossier.api.service.org.InviteTokens.hash(token)).orElseThrow().getStatus()).as("the seat is untouched").isEqualTo(OrgMemberStatus.INVITED);
        assertThat(mockMvc.perform(get("/api/join/" + token).header(HOST, acmeHost)).andReturn().getResponse().getStatus()).as("preview on its own host").isEqualTo(200);
    }

    @Test
    void anInviteeSignsInWithTheInviteTokenAndAcceptingReturnsATenantBoundPair() throws Exception {
        String token = inviteTokenFor(acme, invitee + "@example.org");

        assertThat(login(acmeHost, invitee, null).getResponse().getStatus()).as("no seat, no invite token").isEqualTo(403);
        assertThat(login(acmeHost, invitee, "x".repeat(32)).getResponse().getStatus()).as("a made-up invite token").isEqualTo(403);

        MvcResult signIn = login(acmeHost, invitee, token);
        assertThat(signIn.getResponse().getStatus()).isEqualTo(200);
        String bearer = mapper.readTree(signIn.getResponse().getContentAsString()).get("accessToken").asText();
        assertThat(claims(bearer).has("tid")).as("a not-yet-member token carries no tid").isFalse();
        assertThat(audit.findByOrgIdAndAction(acme.getId(), "LOGIN_FOR_INVITE", org.springframework.data.domain.PageRequest.of(0, 5)).getTotalElements()).isEqualTo(1);

        // That token reaches the join endpoints but nothing else of the organization's surface.
        assertThat(mockMvc.perform(get("/api/orgs/" + acme.getId()).header(HOST, acmeHost).header("Authorization", "Bearer " + bearer)).andReturn().getResponse().getStatus())
            .as("org console with a tid-less token")
            .isEqualTo(401);

        MvcResult accepted = acceptWithBearer(acmeHost, bearer, token);
        assertThat(accepted.getResponse().getStatus()).as(accepted.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode session = mapper.readTree(accepted.getResponse().getContentAsString()).get("session");
        assertThat(session).as("a fresh pair").isNotNull();
        for (String key : List.of("accessToken", "refreshToken")) {
            assertThat(claims(session.get(key).asText()).get("tid").asLong()).as(key).isEqualTo(acme.getId());
        }
        assertThat(mockMvc.perform(get("/api/orgs/" + acme.getId()).header(HOST, acmeHost).header("Authorization", "Bearer " + session.get("accessToken").asText())).andReturn().getResponse().getStatus())
            .as("the new pair works on the tenant")
            .isEqualTo(200);
        OrgMember seat = members.findByInviteTokenHash(com.dossier.api.service.org.InviteTokens.hash(token)).orElseThrow();
        assertThat(seat.getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(seat.getPrimaryRoleId()).as("the seat has its primary role row (X1.6 note)").isNotNull();
    }

    @Test
    void acceptingOnThePlatformHostReturnsNoSession() throws Exception {
        String token = inviteTokenFor(acme, invitee + "@example.org");
        String bearer = mapper.readTree(login(null, invitee, null).getResponse().getContentAsString()).get("accessToken").asText();
        MvcResult accepted = acceptWithBearer(null, bearer, token);
        assertThat(accepted.getResponse().getStatus()).isEqualTo(200);
        assertThat(mapper.readTree(accepted.getResponse().getContentAsString()).has("session")).isFalse();
    }

    @Test
    void anInviteTokenOfAnotherOrganizationDoesNotOpenTheLoginOfThisOne() throws Exception {
        String betaToken = inviteTokenFor(beta, invitee + "@example.org");
        assertThat(login(acmeHost, invitee, betaToken).getResponse().getStatus()).as("beta's token on acme's host").isEqualTo(403);
    }

    @Test
    void aSpentInviteTokenNoLongerOpensTheLogin() throws Exception {
        String token = inviteTokenFor(acme, invitee + "@example.org");
        String bearer = mapper.readTree(login(acmeHost, invitee, token).getResponse().getContentAsString()).get("accessToken").asText();
        assertThat(acceptWithBearer(acmeHost, bearer, token).getResponse().getStatus()).isEqualTo(200);
        // The seat is ACTIVE now: the outsider cannot reuse the spent token to get a session either.
        assertThat(login(acmeHost, outsider, token).getResponse().getStatus()).isEqualTo(403);
    }
}
