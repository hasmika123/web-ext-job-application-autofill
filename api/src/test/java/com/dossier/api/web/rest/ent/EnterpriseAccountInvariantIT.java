package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Authority;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgAccountMode;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.UserService;
import com.dossier.api.service.dto.AdminAccountDTOs.AccountHealth;
import com.dossier.api.service.dto.AdminAccountDTOs.Invariant;
import com.dossier.api.service.ent.EnterpriseAccountInvariants;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.HashSet;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decision O4, doc 19 section 1.3 (deferred from S4): the invariants of the separate-accounts model as a health query. Each invariant is a count of rows
 * that break it. A well-formed world changes no count; each broken row raises exactly its own count by one (measured as a delta, so rows another test left
 * behind never matter); the admin route answers counts only and refuses anyone but a platform admin.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class EnterpriseAccountInvariantIT {

    @Autowired private EnterpriseAccountInvariants health;
    @Autowired private UserService userService;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private AuthorityRepository authorities;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;

    @PersistenceContext private EntityManager em;

    private OrgFixtures fx;
    private String sfx;
    private Organization acme;
    private Organization other;

    @BeforeEach
    void world() {
        fx = new OrgFixtures(users, orgs, members);
        sfx = UUID.randomUUID().toString().substring(0, 8);
        acme = separate("acme-inv-" + sfx);
        other = separate("other-inv-" + sfx);
    }

    private Organization separate(String slug) {
        Organization o = fx.org(slug, OrgStatus.ACTIVE);
        o.setAccountMode(OrgAccountMode.SEPARATE);
        return orgs.saveAndFlush(o);
    }

    private User account(Organization org, String local) {
        User u = userService.createEnterpriseAccount(org.getId(), local + "." + sfx + "@inv.test", "Ina", "Variant", "Password-1!", null).user();
        fx.seat(org, u.getLogin(), OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        return u;
    }

    private long count(AccountHealth h, String key) {
        return h.invariants().stream().filter(i -> i.key().equals(key)).findFirst().map(Invariant::violations).orElseThrow();
    }

    private AccountHealth now() {
        em.flush();
        em.clear();
        return health.check();
    }

    /** Asserts that exactly {@code key} rose by one between the two readings and every other invariant stayed put. */
    private void onlyRose(AccountHealth before, AccountHealth after, String key) {
        for (Invariant i : after.invariants()) {
            long expected = count(before, i.key()) + (i.key().equals(key) ? 1 : 0);
            assertThat(i.violations()).as(i.key()).isEqualTo(expected);
        }
        assertThat(after.totalViolations()).isEqualTo(before.totalViolations() + 1);
    }

    @Test
    void aWellFormedWorldBreaksNothing() {
        AccountHealth before = now();
        account(acme, "a");
        account(acme, "b");
        account(other, "a"); // the same local part in another organization is fine
        User personal = fx.user("personal-inv-" + sfx); // a personal account is not an enterprise account
        assertThat(personal.getOrgId()).isNull();
        AccountHealth after = now();
        assertThat(after.invariants()).extracting(Invariant::key).containsExactlyElementsOf(before.invariants().stream().map(Invariant::key).toList());
        assertThat(after.totalViolations()).isEqualTo(before.totalViolations());
        for (Invariant i : after.invariants()) assertThat(i.violations()).as(i.key()).isEqualTo(count(before, i.key()));
    }

    @Test
    void anEnterpriseAccountWithoutAnySeatIsCounted() {
        AccountHealth before = now();
        userService.createEnterpriseAccount(acme.getId(), "lonely." + sfx + "@inv.test", "Lo", "Nely", "Password-1!", null);
        onlyRose(before, now(), "ENTERPRISE_ACCOUNT_HAS_SEAT");
    }

    @Test
    void anEndedSeatStillAnchorsTheAccountForTheRetentionWindow() {
        AccountHealth before = now();
        User u = userService.createEnterpriseAccount(acme.getId(), "left." + sfx + "@inv.test", "Le", "Ft", "Password-1!", null).user();
        fx.seat(acme, u.getLogin(), OrgRole.MEMBER, OrgMemberStatus.REMOVED);
        AccountHealth after = now();
        assertThat(after.totalViolations()).isEqualTo(before.totalViolations());
    }

    @Test
    void anEnterpriseAccountWithAPersonalSubscriptionIsCounted() {
        User u = account(acme, "plan");
        AccountHealth before = now();
        Subscription sub = new Subscription();
        sub.setUser(users.findById(u.getId()).orElseThrow());
        sub.setStripeCustomerId("cus_inv_" + sfx);
        sub.setStripeSubscriptionId("sub_inv_" + sfx);
        sub.setPlan(Subscription.PLAN_PRO);
        sub.setStatus("active");
        subscriptions.saveAndFlush(sub);
        onlyRose(before, now(), "ENTERPRISE_ACCOUNT_HAS_NO_PLAN");
    }

    @Test
    void aPersonalAccountInTheEntNamespaceIsCounted() {
        AccountHealth before = now();
        fx.user("ent#" + acme.getId() + "#squatter-" + sfx); // org_id stays null
        onlyRose(before, now(), "PERSONAL_ACCOUNT_HAS_NO_ENT_LOGIN");
    }

    @Test
    void anEnterpriseLoginThatNamesAnotherOrganizationIsCounted() {
        User u = account(acme, "login");
        AccountHealth before = now();
        User loaded = users.findById(u.getId()).orElseThrow();
        loaded.setLogin("ent#" + other.getId() + "#login." + sfx + "@inv.test");
        users.saveAndFlush(loaded);
        onlyRose(before, now(), "ENTERPRISE_LOGIN_NAMES_ITS_ORG");
    }

    @Test
    void aSeatOfASeparateOrganizationOnAPersonalAccountIsCounted() {
        AccountHealth before = now();
        fx.seat(acme, "personal-seat-" + sfx, OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        onlyRose(before, now(), "SEPARATE_ORG_SEATS_ON_ENTERPRISE_ACCOUNTS");
    }

    @Test
    void aSeatOnTheEnterpriseAccountOfAnotherOrganizationIsCounted() {
        User u = account(acme, "foreign");
        AccountHealth before = now();
        fx.seat(other, u.getLogin(), OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        AccountHealth after = now();
        // it is wrong twice over: a SEPARATE organization's seat on a foreign account, and a seat on a foreign enterprise account
        assertThat(count(after, "NO_SEAT_ON_FOREIGN_ENTERPRISE_ACCOUNT")).isEqualTo(count(before, "NO_SEAT_ON_FOREIGN_ENTERPRISE_ACCOUNT") + 1);
        assertThat(count(after, "SEPARATE_ORG_SEATS_ON_ENTERPRISE_ACCOUNTS")).isEqualTo(count(before, "SEPARATE_ORG_SEATS_ON_ENTERPRISE_ACCOUNTS") + 1);
    }

    @Test
    void anEnterpriseAccountWithAPlatformAuthorityIsCounted() {
        User u = account(acme, "admin");
        AccountHealth before = now();
        User loaded = users.findOneWithAuthoritiesByLogin(u.getLogin()).orElseThrow();
        Authority admin = authorities.findById("ROLE_ADMIN").orElseThrow();
        loaded.setAuthorities(new HashSet<>(loaded.getAuthorities()));
        loaded.getAuthorities().add(admin);
        users.saveAndFlush(loaded);
        onlyRose(before, now(), "ENTERPRISE_ACCOUNT_IS_ROLE_USER_ONLY");
    }

    @Test
    void theDatabaseItselfRefusesTwoEnterpriseAccountsWithOneAddressInOneOrganization() {
        userService.createEnterpriseAccount(acme.getId(), "dup." + sfx + "@inv.test", "Du", "Plicate", "Password-1!", null);
        org.junit.jupiter.api.Assertions.assertThrows(
            com.dossier.api.service.EmailAlreadyUsedException.class,
            () -> userService.createEnterpriseAccount(acme.getId(), "DUP." + sfx + "@inv.test", "Du", "Plicate", "Password-1!", null)
        );
    }

    // ---- the admin route ----------------------------------------------------------------------------------------------------------

    @Test
    void theAdminRouteAnswersCountsOnlyAndOnlyToAPlatformAdmin() throws Exception {
        account(acme, "route");
        em.flush();
        MvcResult ok = mockMvc.perform(get("/api/admin/enterprise-accounts/health").with(user("admin").roles("ADMIN"))).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        String body = ok.getResponse().getContentAsString();
        JsonNode json = mapper.readTree(body);
        assertThat(json.get("invariants")).hasSize(8);
        for (JsonNode i : json.get("invariants")) {
            assertThat(i.get("violations").isNumber()).isTrue();
            assertThat(i.fieldNames().hasNext()).isTrue();
        }
        assertThat(body).as("counts only: no address and no login").doesNotContain("@inv.test").doesNotContain(sfx);
        assertThat(json.get("totalViolations").asLong()).isEqualTo(health.check().totalViolations());

        assertThat(mockMvc.perform(get("/api/admin/enterprise-accounts/health").with(user("someone").roles("USER"))).andReturn().getResponse().getStatus()).isEqualTo(403);
        assertThat(mockMvc.perform(get("/api/admin/enterprise-accounts/health")).andReturn().getResponse().getStatus()).isEqualTo(401);
    }
}
