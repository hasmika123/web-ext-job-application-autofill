package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ExtConnectCodeRepository;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.RefreshTokenRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.service.AccountDeletionService;
import com.dossier.api.service.AccountExportService;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.ent.members.EnterpriseAccountRetention;
import com.dossier.api.service.org.OrgMembership;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Decision O4, phase S8 (docs/enterprise-v2/19 section 3.8): erasing an ENTERPRISE account removes only that account's data, deleting a PERSONAL account
 * never touches the seats or accounts of a SEPARATE organization (even with the same address), the export of an account holds only that account's data
 * (never a mailbox secret), an administrator reaches only ended seats of an enterprise account of their own organization, and the retention job erases an
 * offboarded account only once the window has passed. Three accounts share one address: a personal one, one in {@code acme} and one in {@code other}.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AccountDeletionSeparateIT extends AbstractEnterpriseWorldIT {

    @Autowired private AccountDeletionService deletion;
    @Autowired private AccountExportService exports;
    @Autowired private EnterpriseAccountRetention retention;
    @Autowired private ResumeRepository resumes;
    @Autowired private RefreshTokenRepository refreshTokens;
    @Autowired private ExtConnectCodeRepository codes;
    @Autowired private InboxConnectionRepository inbox;
    @MockitoBean private StripeGateway stripeGateway;

    @PersistenceContext private EntityManager em;

    private User otherAccount;
    private OrgMember enterpriseSeat;
    private OrgMember otherSeat;
    private String ownerEmail;
    private String ownerLogin;

    @BeforeEach
    void world() {
        enterprise.setFirstName("Lee");
        enterprise.setLastName("Target");
        users.saveAndFlush(enterprise);
        String otherLogin = "ent#" + other.getId() + "#" + email;
        otherAccount = account(otherLogin, email, ENTERPRISE_PW, other.getId());
        otherSeat = fx.seat(other, otherLogin, OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        enterpriseSeat = members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), enterprise.getId(), List.of(OrgMemberStatus.ACTIVE)).get(0);
        ownerEmail = "owner" + Long.toString(System.nanoTime(), 36) + "@extw.test";
        ownerLogin = "ent#" + acme.getId() + "#" + ownerEmail;
        account(ownerLogin, ownerEmail, ENTERPRISE_PW, acme.getId());
        fx.seat(acme, ownerLogin, OrgRole.OWNER, OrgMemberStatus.ACTIVE);
        resume(personal, "Personal CV");
        resume(enterprise, "Acme CV");
        resume(otherAccount, "Other CV");
    }

    private void resume(User owner, String label) {
        Resume r = new Resume().label(label).r2ObjectKey("").status(ResumeStatus.NEEDS_REVIEW).createdAt(Instant.now());
        r.setUser(owner);
        resumes.saveAndFlush(r);
    }

    private List<String> resumeLabels(User owner) {
        em.flush();
        em.clear();
        return resumes.findByUserId(owner.getId()).stream().map(Resume::getLabel).toList();
    }

    private void end(OrgMember seat, Instant leftAt) {
        seat.setStatus(OrgMemberStatus.REMOVED);
        seat.setLeftAt(leftAt);
        members.saveAndFlush(seat);
    }

    private OrgMember reload(OrgMember seat) {
        em.flush();
        em.clear();
        return members.findByOrgIdAndId(seat.getOrgId(), seat.getId()).orElseThrow();
    }

    private List<OrgAuditEvent> audit(String action) {
        return em.createQuery("select e from OrgAuditEvent e where e.orgId = :o and e.action = :a order by e.id", OrgAuditEvent.class).setParameter("o", acme.getId()).setParameter("a", action).getResultList();
    }

    private String ownerToken() throws Exception {
        return login(ACME_HOST, ownerEmail, ENTERPRISE_PW).get("accessToken").asText();
    }

    // ---- erasing the enterprise account ---------------------------------------------------------------------------------------

    @Test
    void erasingTheEnterpriseAccountLeavesThePersonalAndTheOtherOrganizationsAccountWhole() throws Exception {
        extensionSession(); // leaves refresh tokens and a spent connect code on the enterprise account
        login(PLATFORM_HOST, email, PERSONAL_PW);
        login(OTHER_HOST, email, ENTERPRISE_PW);
        InboxConnection mailbox = new InboxConnection(enterprise.getId());
        mailbox.setAddress("lee.target@gmail.com");
        mailbox.setPasswordEnc("ciphertext");
        inbox.saveAndFlush(mailbox);
        String personalHash = personal.getPassword();
        long personalTokens = refreshTokens.findByUserId(personal.getId()).size();
        long otherTokens = refreshTokens.findByUserId(otherAccount.getId()).size();
        assertThat(refreshTokens.findByUserId(enterprise.getId())).isNotEmpty();
        assertThat(codes.findAll().stream().anyMatch(c -> enterprise.getId().equals(c.getUserId()))).isTrue();
        end(enterpriseSeat, Instant.now().minus(Duration.ofDays(1)));

        deletion.deleteEnterpriseAccount(acme.getId(), enterprise.getId());
        em.flush();
        em.clear();

        // the enterprise account and everything of it are gone
        assertThat(users.findById(enterprise.getId())).isEmpty();
        assertThat(resumes.findByUserId(enterprise.getId())).isEmpty();
        assertThat(refreshTokens.findByUserId(enterprise.getId())).isEmpty();
        assertThat(codes.findAll().stream().noneMatch(c -> enterprise.getId().equals(c.getUserId()))).isTrue();
        assertThat(inbox.findById(enterprise.getId())).isEmpty();
        OrgMember seat = members.findByOrgIdAndId(acme.getId(), enterpriseSeat.getId()).orElseThrow();
        assertThat(seat.getStatus()).isEqualTo(OrgMemberStatus.ERASED);
        assertThat(seat.getUserId()).isNull();

        // the personal account with the same address is exactly as it was
        User p = users.findById(personal.getId()).orElseThrow();
        assertThat(p.getPassword()).isEqualTo(personalHash);
        assertThat(p.getOrgId()).isNull();
        assertThat(p.isActivated()).isTrue();
        assertThat(resumes.findByUserId(personal.getId()).stream().map(Resume::getLabel)).containsExactly("Personal CV");
        assertThat(refreshTokens.findByUserId(personal.getId())).hasSize((int) personalTokens);
        assertThat(login(PLATFORM_HOST, email, PERSONAL_PW).has("accessToken")).isTrue();

        // so is the same address's account in the other organization, with its seat
        assertThat(users.findById(otherAccount.getId())).isPresent();
        assertThat(resumes.findByUserId(otherAccount.getId()).stream().map(Resume::getLabel)).containsExactly("Other CV");
        assertThat(refreshTokens.findByUserId(otherAccount.getId()).size()).isGreaterThanOrEqualTo((int) otherTokens);
        OrgMember os = members.findByOrgIdAndId(other.getId(), otherSeat.getId()).orElseThrow();
        assertThat(os.getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(os.getUserId()).isEqualTo(otherAccount.getId());
        assertThat(users.findOneByOrgIdIsNullAndEmailIgnoreCase(email)).isPresent();

        // the erasure row of the seat names the seat, never the address or the synthetic login
        List<OrgAuditEvent> erased = audit("MEMBER_ERASED");
        assertThat(erased).hasSize(1);
        assertThat(erased.get(0).getActorLogin()).isEqualTo("erased-account-" + enterpriseSeat.getId());
        assertThat(erased.get(0).getTargetLogin()).isEqualTo("erased-account-" + enterpriseSeat.getId());
    }

    @Test
    void theErasePathRefusesAPersonalAccountAndAnotherOrganizationsAccount() {
        assertThatThrownBy(() -> deletion.deleteEnterpriseAccount(acme.getId(), personal.getId())).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
        assertThatThrownBy(() -> deletion.deleteEnterpriseAccount(acme.getId(), otherAccount.getId())).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
        assertThatThrownBy(() -> deletion.deleteEnterpriseAccount(null, enterprise.getId())).isInstanceOf(ResponseStatusException.class);
        assertThat(users.findById(personal.getId())).isPresent();
        assertThat(users.findById(otherAccount.getId())).isPresent();
        assertThat(users.findById(enterprise.getId())).isPresent();
    }

    // ---- deleting the personal account ----------------------------------------------------------------------------------------

    @Test
    void deletingThePersonalAccountNeverTouchesTheEnterpriseSeatsOrAccountsOfTheSameAddress() {
        long acmeSeats = members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), enterprise.getId(), List.of(OrgMemberStatus.ACTIVE)).size();
        String enterpriseHash = enterprise.getPassword();
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(personal.getLogin(), null, List.of()));
        try {
            deletion.deleteCurrentUserAccount(); // the self-service path
        } finally {
            SecurityContextHolder.clearContext();
        }
        em.flush();
        em.clear();

        assertThat(users.findById(personal.getId())).isEmpty();
        assertThat(resumes.findByUserId(personal.getId())).isEmpty();
        // the enterprise accounts of the same address, their seats and their data
        User e = users.findById(enterprise.getId()).orElseThrow();
        assertThat(e.getPassword()).isEqualTo(enterpriseHash);
        assertThat(e.getOrgId()).isEqualTo(acme.getId());
        assertThat(members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), enterprise.getId(), List.of(OrgMemberStatus.ACTIVE))).hasSize((int) acmeSeats);
        assertThat(members.findByOrgIdAndUserIdAndStatusIn(other.getId(), otherAccount.getId(), List.of(OrgMemberStatus.ACTIVE))).hasSize(1);
        assertThat(resumes.findByUserId(enterprise.getId()).stream().map(Resume::getLabel)).containsExactly("Acme CV");
        assertThat(resumes.findByUserId(otherAccount.getId()).stream().map(Resume::getLabel)).containsExactly("Other CV");
        assertThat(audit("MEMBER_ERASED")).isEmpty();
        // the other path (an administrator's delete by login) is the same
        deletion.deleteUserAccountByLogin(otherAccount.getLogin());
        em.flush();
        em.clear();
        assertThat(users.findById(enterprise.getId())).isPresent();
        assertThat(members.findByOrgIdAndId(acme.getId(), enterpriseSeat.getId()).orElseThrow().getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void anEnterpriseTokenCanNotDeleteItsAccountThroughTheSelfServiceRoute() throws Exception {
        String access = login(ACME_HOST, email, ENTERPRISE_PW).get("accessToken").asText();
        MvcResult r = mockMvc.perform(delete("/api/account").header(HOST, ACME_HOST).header("Authorization", "Bearer " + access)).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(404);
        assertThat(users.findById(enterprise.getId())).isPresent();
        assertThat(resumeLabels(enterprise)).containsExactly("Acme CV");
    }

    // ---- export ---------------------------------------------------------------------------------------------------------------

    @Test
    void theExportOfTheEnterpriseAccountHoldsOnlyThatAccountAndNoMailboxSecret() throws Exception {
        InboxConnection mailbox = new InboxConnection(enterprise.getId());
        mailbox.setAddress("lee.target@gmail.com");
        mailbox.setPasswordEnc("ciphertext-secret");
        inbox.saveAndFlush(mailbox);
        var before = SecurityContextHolder.getContext().getAuthentication();

        Map<String, Object> out = exports.exportAccount(enterprise.getLogin());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).as("the acting context is restored").isSameAs(before);
        String all = mapper.writeValueAsString(out);
        assertThat(all).contains("Acme CV").doesNotContain("Personal CV").doesNotContain("Other CV");
        assertThat(all).doesNotContain("ciphertext-secret").doesNotContain("passwordEnc");
        assertThat(all).doesNotContain(personal.getLogin()).doesNotContain("ent#");
        JsonNode account = mapper.valueToTree(out.get("account"));
        assertThat(account.get("email").asText()).isEqualTo(email);
        assertThat(account.get("login").isNull()).isTrue();
        // the memberships listed are this account's seat in this organization only
        JsonNode orgsPart = mapper.valueToTree(out.get("organizations"));
        assertThat(orgsPart).hasSize(1);
        assertThat(orgsPart.get(0).get("orgId").asLong()).isEqualTo(acme.getId());
    }

    @Test
    void theOwnExportOfAnActiveEnterpriseAccountIsScopedTheSameWay() throws Exception {
        String access = login(ACME_HOST, email, ENTERPRISE_PW).get("accessToken").asText();
        MvcResult r = call("GET", ACME_HOST, access, "/api/account/export");
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        String body = r.getResponse().getContentAsString();
        assertThat(body).contains("Acme CV").doesNotContain("Personal CV").doesNotContain("Other CV");
    }

    // ---- the administrator routes ---------------------------------------------------------------------------------------------

    @Test
    void anAdministratorExportsAnOffboardedAccountWithinTheWindowAndOnlyThen() throws Exception {
        String token = ownerToken();
        String url = "/api/orgs/" + acme.getId() + "/members/" + enterpriseSeat.getId() + "/account-export";
        // an active person is not exportable this way
        MvcResult active = mockMvc.perform(get(url).header(HOST, ACME_HOST).header("Authorization", "Bearer " + token)).andReturn();
        assertThat(active.getResponse().getStatus()).isEqualTo(409);
        assertThat(active.getResponse().getContentAsString()).contains("NO_ENTERPRISE_ACCOUNT");

        end(enterpriseSeat, Instant.now().minus(Duration.ofDays(3)));
        MvcResult ok = mockMvc.perform(get(url).header(HOST, ACME_HOST).header("Authorization", "Bearer " + token)).andReturn();
        assertThat(ok.getResponse().getStatus()).as(ok.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(ok.getResponse().getHeader("Cache-Control")).contains("no-store");
        assertThat(ok.getResponse().getContentAsString()).contains("Acme CV").doesNotContain("Personal CV").doesNotContain("Other CV");
        List<OrgAuditEvent> rows = audit("ACCOUNT_EXPORTED");
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getRisk()).isEqualTo("HIGH");
        assertThat(rows.get(0).getDetails()).doesNotContain("@").doesNotContain("Acme CV");

        // another organization's owner reaches nothing
        String otherOwnerLogin = "ent#" + other.getId() + "#boss@extw.test";
        account(otherOwnerLogin, "boss@extw.test", ENTERPRISE_PW, other.getId());
        fx.seat(other, otherOwnerLogin, OrgRole.OWNER, OrgMemberStatus.ACTIVE);
        String foreign = login(OTHER_HOST, "boss@extw.test", ENTERPRISE_PW).get("accessToken").asText();
        MvcResult cross = mockMvc.perform(get(url).header(HOST, OTHER_HOST).header("Authorization", "Bearer " + foreign)).andReturn();
        assertThat(cross.getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void anAdministratorCanErasetheOffboardedAccountEarlyButNeverAPersonalOne() throws Exception {
        String token = ownerToken();
        String erase = "/api/orgs/" + acme.getId() + "/members/" + enterpriseSeat.getId() + "/account-erase";
        assertThat(mockMvc.perform(post(erase).header(HOST, ACME_HOST).header("Authorization", "Bearer " + token)).andReturn().getResponse().getStatus()).as("still active").isEqualTo(409);
        assertThat(users.findById(enterprise.getId())).isPresent();

        end(enterpriseSeat, Instant.now().minus(Duration.ofDays(3)));
        MvcResult r = mockMvc.perform(post(erase).header(HOST, ACME_HOST).header("Authorization", "Bearer " + token)).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(204);
        em.flush();
        em.clear();
        assertThat(users.findById(enterprise.getId())).isEmpty();
        assertThat(users.findById(personal.getId())).isPresent();
        assertThat(users.findById(otherAccount.getId())).isPresent();
        List<OrgAuditEvent> rows = audit("ACCOUNT_ERASED");
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getRisk()).isEqualTo("HIGH");
        assertThat(rows.get(0).getActorLogin()).isEqualTo(ownerLogin);
        assertThat(rows.get(0).getDetails()).contains("ADMIN_REQUEST").doesNotContain("@");
        // the seat is now anonymised history: the generic 404
        assertThat(mockMvc.perform(post(erase).header(HOST, ACME_HOST).header("Authorization", "Bearer " + token)).andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void theEraseServiceTouchesNothingForASeatOfAPersonalAccount() {
        var legacy = fx.org("legacy-" + System.nanoTime(), OrgStatus.ACTIVE);
        OrgMember seat = fx.seat(legacy, "legacy-gone-" + System.nanoTime(), OrgRole.MEMBER, OrgMemberStatus.REMOVED);
        seat.setLeftAt(Instant.now().minus(Duration.ofDays(400)));
        members.saveAndFlush(seat);
        Long userId = seat.getUserId();
        OrgMembership me = new OrgMembership(legacy.getId(), 1L, 1L, "boss", OrgRole.OWNER, OrgMemberStatus.ACTIVE, legacy.getStatus());
        assertThat(retention.runDue(Instant.now())).as("the job does not erase a personal account, however old the seat").isZero();
        assertThat(users.findById(userId)).isPresent();
        assertThat(me.orgId()).isEqualTo(legacy.getId());
    }

    // ---- the retention job ----------------------------------------------------------------------------------------------------

    @Test
    void theJobErasesAnOffboardedAccountOnlyAfterTheWindowAndNothingElse() {
        // acme: one account ended 91 days ago (due), one ended 89 days ago (inside the window), one still active
        OrgMember due = newPerson(acme, "due", Duration.ofDays(91));
        OrgMember recent = newPerson(acme, "recent", Duration.ofDays(89));
        // a personal account in a SHARED organization whose seat ended long ago is never erased by the job
        var legacy = fx.org("legacy-job-" + System.nanoTime(), OrgStatus.ACTIVE);
        OrgMember legacySeat = fx.seat(legacy, "legacy-old-" + System.nanoTime(), OrgRole.MEMBER, OrgMemberStatus.REMOVED);
        legacySeat.setLeftAt(Instant.now().minus(Duration.ofDays(900)));
        members.saveAndFlush(legacySeat);
        Long legacyUser = legacySeat.getUserId();
        Long dueUser = due.getUserId();
        Long recentUser = recent.getUserId();

        assertThat(retention.runDue(Instant.now())).isEqualTo(1);
        em.flush();
        em.clear();

        assertThat(users.findById(dueUser)).isEmpty();
        assertThat(members.findByOrgIdAndId(acme.getId(), due.getId()).orElseThrow().getStatus()).isEqualTo(OrgMemberStatus.ERASED);
        assertThat(users.findById(recentUser)).isPresent();
        assertThat(members.findByOrgIdAndId(acme.getId(), recent.getId()).orElseThrow().getStatus()).isEqualTo(OrgMemberStatus.REMOVED);
        assertThat(users.findById(legacyUser)).isPresent();
        assertThat(users.findById(personal.getId())).isPresent();
        assertThat(users.findById(enterprise.getId())).as("an active account is never erased").isPresent();
        List<OrgAuditEvent> rows = audit("ACCOUNT_ERASED");
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getActorLogin()).isEqualTo("system");
        assertThat(rows.get(0).getRisk()).isEqualTo("HIGH");
        assertThat(rows.get(0).getDetails()).contains("RETENTION").contains("90");
        // a second run has nothing left to do
        assertThat(retention.runDue(Instant.now())).isZero();
    }

    @Test
    void theWindowIsTheAdminSettingAndTheClockIsTheLeftAtInstant() {
        OrgMember p = newPerson(acme, "window", Duration.ofDays(40));
        Long userId = p.getUserId();
        assertThat(retention.runDue(Instant.now())).isZero();
        setting("org.account.retentionDays", "30");
        assertThat(retention.runDue(Instant.now())).isEqualTo(1);
        em.flush();
        em.clear();
        assertThat(users.findById(userId)).isEmpty();
        // asking "as of" a later instant moves the cutoff, not the data
        OrgMember q = newPerson(acme, "later", Duration.ofDays(5));
        Long qUser = q.getUserId();
        assertThat(retention.runDue(Instant.now())).isZero();
        assertThat(retention.runDue(Instant.now().plus(Duration.ofDays(30)))).isEqualTo(1);
        em.flush();
        em.clear();
        assertThat(users.findById(qUser)).isEmpty();
    }

    private OrgMember newPerson(com.dossier.api.domain.org.Organization org, String tag, Duration leftAgo) {
        String mail = tag + "." + Long.toString(System.nanoTime(), 36) + "@extw.test";
        String login = "ent#" + org.getId() + "#" + mail;
        account(login, mail, ENTERPRISE_PW, org.getId());
        OrgMember seat = fx.seat(org, login, OrgRole.MEMBER, OrgMemberStatus.REMOVED);
        seat.setLeftAt(Instant.now().minus(leftAgo));
        return members.saveAndFlush(seat);
    }
}
