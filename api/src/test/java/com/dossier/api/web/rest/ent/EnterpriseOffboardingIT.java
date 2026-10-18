package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.RefreshToken;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.RefreshTokenRepository;
import com.dossier.api.service.ent.members.EnterpriseAccountLifecycle;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decision O4, phase S8 (docs/enterprise-v2/19): offboarding or suspending a person of a SEPARATE organization disables their ENTERPRISE account. Real
 * tokens through the real filter chain: the access token (browser and extension) is refused on the next call, the refresh tokens are revoked and
 * refused, sign-in is refused, the mailbox connection is gone (offboard) or no longer read (suspend), and a personal account with the same address keeps
 * working with its own sessions. Reinstating a suspended person brings the account back. Every disable / enable writes an audit row with the actor and
 * the organization and no address or login.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class EnterpriseOffboardingIT extends AbstractEnterpriseWorldIT {

    private static final String REASON = "Left the company after notice";

    @Autowired private RefreshTokenRepository refreshTokens;
    @Autowired private InboxConnectionRepository inbox;
    @Autowired private EnterpriseAccountLifecycle lifecycle;

    @PersistenceContext private EntityManager em;

    private String ownerEmail;
    private OrgMember targetSeat;

    @BeforeEach
    void people() {
        enterprise.setFirstName("Lee");
        enterprise.setLastName("Target");
        users.saveAndFlush(enterprise);
        ownerEmail = "owner" + Long.toString(System.nanoTime(), 36) + "@extw.test";
        String ownerLogin = "ent#" + acme.getId() + "#" + ownerEmail;
        account(ownerLogin, ownerEmail, ENTERPRISE_PW, acme.getId());
        fx.seat(acme, ownerLogin, OrgRole.OWNER, OrgMemberStatus.ACTIVE);
        targetSeat = members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), enterprise.getId(), List.of(OrgMemberStatus.ACTIVE)).get(0);
    }

    private String ownerToken() throws Exception {
        return login(ACME_HOST, ownerEmail, ENTERPRISE_PW).get("accessToken").asText();
    }

    private MvcResult act(String path, String body) throws Exception {
        return mockMvc
            .perform(
                post("/api/orgs/" + acme.getId() + "/members/" + targetSeat.getId() + path)
                    .header(HOST, ACME_HOST)
                    .header("Authorization", "Bearer " + ownerToken())
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body)
            )
            .andReturn();
    }

    private MvcResult offboard() throws Exception {
        return act("/offboard", "{\"reason\":\"" + REASON + "\",\"confirm\":\"Lee Target\"}");
    }

    private MvcResult loginAttempt(String host, String username, String password) throws Exception {
        return mockMvc
            .perform(post("/api/authenticate").header(HOST, host).contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
            .andReturn();
    }

    private List<OrgAuditEvent> auditRows(String action) {
        return em.createQuery("select e from OrgAuditEvent e where e.orgId = :o and e.action = :a order by e.id", OrgAuditEvent.class).setParameter("o", acme.getId()).setParameter("a", action).getResultList();
    }

    private long liveRefreshTokens(Long userId) {
        em.flush();
        em.clear();
        return refreshTokens.findByUserId(userId).stream().filter(t -> !t.isRevoked()).count();
    }

    private void connectMailbox() {
        InboxConnection c = new InboxConnection(enterprise.getId());
        c.setAddress("lee.target@gmail.com");
        c.setPasswordEnc("ciphertext");
        inbox.saveAndFlush(c);
    }

    // ---- offboarding ------------------------------------------------------------------------------------------------------------

    @Test
    void offboardingRefusesEveryTokenOfTheEnterpriseAccountAndLeavesThePersonalOneAlone() throws Exception {
        JsonNode browser = login(ACME_HOST, email, ENTERPRISE_PW);
        JsonNode extension = extensionSession();
        JsonNode personalPair = login(PLATFORM_HOST, email, PERSONAL_PW);
        connectMailbox();

        // before: everything works
        assertThat(call("GET", ACME_HOST, browser.get("accessToken").asText(), "/api/account").getResponse().getStatus()).isEqualTo(200);
        assertThat(call("GET", PLATFORM_HOST, extension.get("accessToken").asText(), "/api/profile/version").getResponse().getStatus()).isEqualTo(200);
        assertThat(liveRefreshTokens(enterprise.getId())).isGreaterThanOrEqualTo(2);

        MvcResult r = offboard();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);

        // access tokens: refused on the very next call, not when they expire
        MvcResult b = call("GET", ACME_HOST, browser.get("accessToken").asText(), "/api/account");
        assertThat(b.getResponse().getStatus()).isEqualTo(401);
        assertThat(b.getResponse().getContentAsString()).contains("TOKEN_ACCOUNT_DISABLED");
        MvcResult x = call("GET", PLATFORM_HOST, extension.get("accessToken").asText(), "/api/profile/version");
        assertThat(x.getResponse().getStatus()).isEqualTo(401);
        assertThat(x.getResponse().getContentAsString()).contains("TOKEN_ACCOUNT_DISABLED");
        assertThat(call("GET", ACME_HOST, browser.get("accessToken").asText(), "/api/orgs/" + acme.getId()).getResponse().getStatus()).as("an organization route is still refused").isNotEqualTo(200);

        // refresh tokens: revoked in the table and refused (browser world and extension world)
        assertThat(liveRefreshTokens(enterprise.getId())).isZero();
        assertThat(refresh(ACME_HOST, browser.get("refreshToken").asText()).getResponse().getStatus()).isEqualTo(401);
        assertThat(refresh(PLATFORM_HOST, extension.get("refreshToken").asText()).getResponse().getStatus()).isEqualTo(401);

        // sign-in is refused (the seat has ended); a fresh connect code can not be minted either
        MvcResult again = loginAttempt(ACME_HOST, email, ENTERPRISE_PW);
        assertThat(again.getResponse().getStatus()).isEqualTo(403);
        assertThat(again.getResponse().getContentAsString()).contains("NOT_A_MEMBER");

        // the mailbox connection of the account is gone
        em.flush();
        em.clear();
        assertThat(inbox.findById(enterprise.getId())).isEmpty();
        assertThat(users.findById(enterprise.getId())).as("the account is kept for the retention window").isPresent();

        // the personal account with the same address is untouched: its sessions and its refresh token keep working
        assertThat(liveRefreshTokens(personal.getId())).isGreaterThanOrEqualTo(1);
        assertThat(call("GET", PLATFORM_HOST, personalPair.get("accessToken").asText(), "/api/account").getResponse().getStatus()).isEqualTo(200);
        assertThat(refresh(PLATFORM_HOST, personalPair.get("refreshToken").asText()).getResponse().getStatus()).isEqualTo(200);
        assertThat(login(PLATFORM_HOST, email, PERSONAL_PW).has("accessToken")).isTrue();
    }

    @Test
    void offboardingWritesAHighAuditRowWithTheActorAndTheOrganizationAndNoAddress() throws Exception {
        assertThat(offboard().getResponse().getStatus()).isEqualTo(200);
        List<OrgAuditEvent> rows = auditRows("ACCOUNT_DISABLED");
        assertThat(rows).hasSize(1);
        OrgAuditEvent e = rows.get(0);
        assertThat(e.getRisk()).isEqualTo("HIGH");
        assertThat(e.getOrgId()).isEqualTo(acme.getId());
        assertThat(e.getActorLogin()).startsWith("ent#" + acme.getId() + "#owner");
        assertThat(e.getTargetId()).isEqualTo(String.valueOf(targetSeat.getId()));
        assertThat(e.getTargetLogin()).isNull();
        assertThat(e.getDetails()).contains("OFFBOARD").doesNotContain("@").doesNotContain("ent#").doesNotContain("password");
        // the seat's own removal row is still there, once
        assertThat(auditRows("MEMBER_REMOVE")).hasSize(1);
    }

    @Test
    void thePreviewTellsWhatWillHappenToTheAccount() throws Exception {
        MvcResult r = mockMvc
            .perform(get("/api/orgs/" + acme.getId() + "/members/" + targetSeat.getId() + "/offboard-preview").header(HOST, ACME_HOST).header("Authorization", "Bearer " + ownerToken()))
            .andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        JsonNode preview = mapper.readTree(r.getResponse().getContentAsString());
        List<String> kinds = new java.util.ArrayList<>();
        preview.get("lines").forEach(l -> kinds.add(l.get("kind").asText()));
        assertThat(kinds).contains("SESSIONS", "ACCOUNT", "ACCOUNT_INBOX", "ACCOUNT_RETENTION");
        JsonNode retention = null;
        for (JsonNode l : preview.get("lines")) if ("ACCOUNT_RETENTION".equals(l.get("kind").asText())) retention = l;
        assertThat(retention.get("data").get("retentionDays").asInt()).isEqualTo(90);
        assertThat(retention.get("data").get("eraseOn").asText()).matches("\\d{4}-\\d{2}-\\d{2}");
        assertThat(retention.get("text").asText()).contains("90 days");
        assertThat(preview.get("recordsKept").toString()).contains("organization account").doesNotContain("everything they own personally");
        // the preview writes nothing and changes nothing
        assertThat(auditRows("ACCOUNT_DISABLED")).isEmpty();
        assertThat(members.findByOrgIdAndId(acme.getId(), targetSeat.getId()).orElseThrow().getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void theRetentionDaysSettingDrivesThePreviewText() throws Exception {
        setting("org.account.retentionDays", "30");
        MvcResult r = mockMvc
            .perform(get("/api/orgs/" + acme.getId() + "/members/" + targetSeat.getId() + "/offboard-preview").header(HOST, ACME_HOST).header("Authorization", "Bearer " + ownerToken()))
            .andReturn();
        assertThat(r.getResponse().getContentAsString()).contains("30 days");
    }

    @Test
    void aSeatOfAPersonalAccountIsNeverDisabledByTheOrganization() {
        // a legacy SHARED organization: the seat points at a personal account; the lifecycle does nothing to it
        var legacyOrg = fx.org("legacy-" + System.nanoTime(), com.dossier.api.domain.enumeration.OrgStatus.ACTIVE);
        OrgMember seat = fx.active(legacyOrg, "legacy-member-" + System.nanoTime(), OrgRole.MEMBER);
        Long userId = seat.getUserId();
        refreshTokens.saveAndFlush(token(userId));
        assertThat(lifecycle.disable(legacyOrg.getId(), seat, "someone", OrgRole.OWNER, "OFFBOARD")).isFalse();
        assertThat(lifecycle.enable(legacyOrg.getId(), seat, "someone", OrgRole.OWNER)).isFalse();
        assertThat(liveRefreshTokens(userId)).isEqualTo(1);
        assertThat(lifecycle.accountOf(legacyOrg.getId(), seat)).isEmpty();
        // and a personal account is not "the enterprise account" of an organization either
        OrgMember wrong = new OrgMember();
        wrong.setUserId(personal.getId());
        assertThat(lifecycle.accountOf(acme.getId(), wrong)).isEmpty();
    }

    private static RefreshToken token(Long userId) {
        RefreshToken t = new RefreshToken();
        t.setJti(UUID.randomUUID().toString());
        t.setFamilyId(UUID.randomUUID().toString());
        t.setUserId(userId);
        t.setExpiresAt(java.time.Instant.now().plusSeconds(3600));
        t.setCreatedAt(java.time.Instant.now());
        t.setRevoked(false);
        return t;
    }

    // ---- suspend and reinstate -------------------------------------------------------------------------------------------------

    @Test
    void suspendingDisablesTheAccountAndReinstatingBringsItBack() throws Exception {
        JsonNode browser = login(ACME_HOST, email, ENTERPRISE_PW);
        JsonNode extension = extensionSession();
        connectMailbox();

        MvcResult s = act("/suspend", "{\"reason\":\"Pending an access review\"}");
        assertThat(s.getResponse().getStatus()).as(s.getResponse().getContentAsString()).isEqualTo(200);

        assertThat(call("GET", ACME_HOST, browser.get("accessToken").asText(), "/api/account").getResponse().getStatus()).isEqualTo(401);
        assertThat(call("GET", PLATFORM_HOST, extension.get("accessToken").asText(), "/api/profile/version").getResponse().getStatus()).isEqualTo(401);
        assertThat(refresh(ACME_HOST, browser.get("refreshToken").asText()).getResponse().getStatus()).isEqualTo(401);
        assertThat(refresh(PLATFORM_HOST, extension.get("refreshToken").asText()).getResponse().getStatus()).isEqualTo(401);
        assertThat(liveRefreshTokens(enterprise.getId())).isZero();
        assertThat(loginAttempt(ACME_HOST, email, ENTERPRISE_PW).getResponse().getStatus()).isEqualTo(403);
        // suspension is reversible: the mailbox connection is kept (it is just not read while suspended)
        em.flush();
        em.clear();
        assertThat(inbox.findById(enterprise.getId())).isPresent();
        OrgAuditEvent disabled = auditRows("ACCOUNT_DISABLED").get(0);
        assertThat(disabled.getRisk()).isEqualTo("HIGH");
        assertThat(disabled.getDetails()).contains("SUSPEND");

        MvcResult back = act("/reinstate", "{\"reason\":\"Review closed with no findings\"}");
        assertThat(back.getResponse().getStatus()).as(back.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode fresh = login(ACME_HOST, email, ENTERPRISE_PW);
        assertThat(call("GET", ACME_HOST, fresh.get("accessToken").asText(), "/api/account").getResponse().getStatus()).isEqualTo(200);
        // the sessions revoked while suspended stay revoked
        assertThat(refresh(ACME_HOST, browser.get("refreshToken").asText()).getResponse().getStatus()).isEqualTo(401);
        List<OrgAuditEvent> enabled = auditRows("ACCOUNT_ENABLED");
        assertThat(enabled).hasSize(1);
        assertThat(enabled.get(0).getRisk()).isEqualTo("MEDIUM");
        assertThat(enabled.get(0).getDetails()).doesNotContain("@").doesNotContain("ent#");
    }
}
