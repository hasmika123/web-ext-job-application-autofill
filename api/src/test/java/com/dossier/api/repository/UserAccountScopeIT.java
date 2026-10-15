package com.dossier.api.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.config.Constants;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgAccountMode;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.DomainUserDetailsService;
import com.dossier.api.service.AccountScopes;
import com.dossier.api.service.UserService;
import com.dossier.api.service.dto.AdminUserDTO;
import com.dossier.api.service.EmailAlreadyUsedException;
import com.dossier.api.service.UsernameAlreadyUsedException;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.util.Collections;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decision O4, phases S1 and S2 (docs/enterprise-v2/19): the schema lets the same email be a personal account and one enterprise account per
 * organization, every email lookup is scoped, and while every account is personal nothing behaves differently.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class UserAccountScopeIT {

    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private UserService userService;
    @Autowired private DomainUserDetailsService userDetails;
    @Autowired private AccountScopes accountScopes;
    @Autowired private EntityManager em;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;

    private static String sfx() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    private Organization org(String slug, OrgAccountMode mode) {
        Organization o = new OrgFixtures(users, orgs, null).org(slug, OrgStatus.ACTIVE);
        o.setAccountMode(mode);
        return orgs.saveAndFlush(o);
    }

    private User account(String login, String email, Long orgId) {
        User u = new User();
        u.setLogin(login);
        u.setPassword("x".repeat(60));
        u.setActivated(true);
        u.setEmail(email);
        u.setLangKey("en");
        u.setOrgId(orgId);
        return users.saveAndFlush(u);
    }

    @Test
    void theSameEmailCoexistsAsAPersonalAccountAndOnePerOrganization() {
        String s = sfx();
        String mail = "same." + s + "@example.test";
        Organization acme = org("sc-acme-" + s, OrgAccountMode.SEPARATE);
        Organization beta = org("sc-beta-" + s, OrgAccountMode.SEPARATE);

        User personal = account("sc-p-" + s, mail, null);
        User inAcme = account("ent#" + acme.getId() + "#" + s, mail, acme.getId());
        User inBeta = account("ent#" + beta.getId() + "#" + s, mail, beta.getId());

        assertThat(users.findOneByOrgIdIsNullAndEmailIgnoreCase(mail.toUpperCase())).map(User::getId).contains(personal.getId());
        assertThat(users.findOneByOrgIdAndEmailIgnoreCase(acme.getId(), mail)).map(User::getId).contains(inAcme.getId());
        assertThat(users.findOneByOrgIdAndEmailIgnoreCase(beta.getId(), mail)).map(User::getId).contains(inBeta.getId());
        assertThat(users.findOneByScopeAndEmail(null, mail)).map(User::getId).contains(personal.getId());
        assertThat(users.findOneByScopeAndEmail(acme.getId(), mail)).map(User::getId).contains(inAcme.getId());
        assertThat(users.findOneWithAuthoritiesByOrgIdIsNullAndEmailIgnoreCase(mail)).map(User::getId).contains(personal.getId());
        assertThat(users.findOneWithAuthoritiesByOrgIdAndEmailIgnoreCase(beta.getId(), mail)).map(User::getId).contains(inBeta.getId());
    }

    @Test
    void aPersonalLookupNeverReturnsAnEnterpriseRowAndTheOtherWayRound() {
        String s = sfx();
        Organization acme = org("sc-only-" + s, OrgAccountMode.SEPARATE);
        Organization beta = org("sc-other-" + s, OrgAccountMode.SEPARATE);
        String onlyEnterprise = "ent.only." + s + "@example.test";
        String onlyPersonal = "pers.only." + s + "@example.test";
        account("ent#" + acme.getId() + "#o" + s, onlyEnterprise, acme.getId());
        account("sc-po-" + s, onlyPersonal, null);

        assertThat(users.findOneByOrgIdIsNullAndEmailIgnoreCase(onlyEnterprise)).isEmpty();
        assertThat(users.findOneWithAuthoritiesByOrgIdIsNullAndEmailIgnoreCase(onlyEnterprise)).isEmpty();
        assertThat(users.findOneByOrgIdAndEmailIgnoreCase(acme.getId(), onlyPersonal)).isEmpty();
        assertThat(users.findOneByOrgIdAndEmailIgnoreCase(beta.getId(), onlyEnterprise)).as("another organization's scope").isEmpty();
        assertThat(users.findOneByOrgIdAndEmailIgnoreCase(null, onlyPersonal)).as("a null organization is not the personal scope").isEmpty();
    }

    @Test
    void theSameEmailTwiceInOneScopeIsRejected() {
        String s = sfx();
        String mail = "dup." + s + "@example.test";
        Organization acme = org("sc-dup-" + s, OrgAccountMode.SEPARATE);
        account("sc-d1-" + s, mail, null);
        account("ent#" + acme.getId() + "#d1" + s, mail, acme.getId());

        assertThatThrownBy(() -> account("sc-d2-" + s, mail.toUpperCase(), null)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void theSameEmailTwiceInOneOrganizationIsRejected() {
        String s = sfx();
        String mail = "dup2." + s + "@example.test";
        Organization acme = org("sc-dup2-" + s, OrgAccountMode.SEPARATE);
        account("ent#" + acme.getId() + "#a" + s, mail, acme.getId());

        assertThatThrownBy(() -> account("ent#" + acme.getId() + "#b" + s, mail, acme.getId())).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void accountsWithoutAnEmailNeverCollide() {
        String s = sfx();
        Organization acme = org("sc-null-" + s, OrgAccountMode.SEPARATE);
        account("sc-n1-" + s, null, null);
        account("sc-n2-" + s, null, null);
        account("ent#" + acme.getId() + "#n1" + s, null, acme.getId());
        account("ent#" + acme.getId() + "#n2" + s, null, acme.getId());
    }

    @Test
    void theScopeKeyIsGeneratedAndTheOldGlobalEmailIndexIsGone() {
        String s = sfx();
        Organization acme = org("sc-key-" + s, OrgAccountMode.SEPARATE);
        User personal = account("sc-k1-" + s, "key1." + s + "@example.test", null);
        User enterprise = account("ent#" + acme.getId() + "#k" + s, "key2." + s + "@example.test", acme.getId());
        em.clear();

        assertThat(scopeKey(personal.getId())).isEqualTo(0L);
        assertThat(scopeKey(enterprise.getId())).isEqualTo(acme.getId());
        assertThat(indexCount("ux_user_email")).isZero();
        assertThat(indexCount("ux_user_scope_email")).isPositive();
        assertThat(indexCount("ux_user_login")).as("login stays globally unique").isPositive();
    }

    @Test
    void anOrganizationDefaultsToSharedAccounts() {
        String s = sfx();
        Organization plain = new OrgFixtures(users, orgs, null).org("sc-mode-" + s, OrgStatus.ACTIVE);
        em.clear();
        assertThat(orgs.findByOrgId(plain.getId()).orElseThrow().getAccountMode()).isEqualTo(OrgAccountMode.SHARED);
        assertThat(accountScopes.scopeOf(plain.getId())).as("the switch is off by default").isNull();
    }

    @Test
    void signingInByEmailOnThePlatformFindsOnlyThePersonalAccount() {
        String s = sfx();
        String mail = "login." + s + "@example.test";
        Organization acme = org("sc-login-" + s, OrgAccountMode.SEPARATE);
        User personal = account("sc-l-" + s, mail, null);
        User enterprise = account("ent#" + acme.getId() + "#l" + s, mail, acme.getId());

        assertThat(((DomainUserDetailsService.UserWithId) userDetails.loadUserByUsername(mail)).getId()).isEqualTo(personal.getId());
        assertThat(((DomainUserDetailsService.UserWithId) userDetails.loadUserByUsername(mail.toUpperCase())).getId()).isNotEqualTo(enterprise.getId());
    }

    @Test
    void anAddressOnlyAnEnterpriseAccountHoldsDoesNotSignInOnThePlatform() {
        String s = sfx();
        Organization acme = org("sc-solo-" + s, OrgAccountMode.SEPARATE);
        String mail = "solo." + s + "@example.test";
        account("ent#" + acme.getId() + "#s" + s, mail, acme.getId());

        assertThatThrownBy(() -> userDetails.loadUserByUsername(mail)).isInstanceOf(org.springframework.security.core.userdetails.UsernameNotFoundException.class);
    }

    @Test
    void registrationStillRejectsADuplicatePersonalEmailButIgnoresEnterpriseRows() {
        String s = sfx();
        String mail = "reg." + s + "@example.test";
        Organization acme = org("sc-reg-" + s, OrgAccountMode.SEPARATE);
        account("ent#" + acme.getId() + "#r" + s, mail, acme.getId());

        AdminUserDTO first = dto("sc-reg1-" + s, mail);
        User created = userService.registerUser(first, "password");
        assertThat(created.getOrgId()).as("a registration is always a personal account").isNull();
        created.setActivated(true);
        users.saveAndFlush(created);

        assertThatThrownBy(() -> userService.registerUser(dto("sc-reg2-" + s, mail), "password")).isInstanceOf(EmailAlreadyUsedException.class);
    }

    @Test
    void personalRegistrationAndGoogleCreationRejectTheReservedEnterpriseLoginPrefix() {
        String s = sfx();
        assertThatThrownBy(() -> userService.registerUser(dto("ent#1#x" + s, "ent1." + s + "@example.test"), "password")).isInstanceOf(UsernameAlreadyUsedException.class);
        assertThatThrownBy(() -> userService.registerUser(dto("ENT#1#x" + s, "ent2." + s + "@example.test"), "password")).isInstanceOf(UsernameAlreadyUsedException.class);
        assertThatThrownBy(() -> userService.findOrCreateGoogleUser("ent#1#" + s + "@example.test", "A", "B")).isInstanceOf(UsernameAlreadyUsedException.class);
        assertThat(Constants.isEnterpriseLogin("ent#7#a@b.c")).isTrue();
        assertThat(Constants.isEnterpriseLogin("entity")).isFalse();
        assertThat(Constants.isEnterpriseLogin(null)).isFalse();
    }

    @Test
    void googleSignInResolvesThePersonalAccountEvenWhenAnEnterpriseAccountSharesTheEmail() {
        String s = sfx();
        String mail = "goog." + s + "@example.test";
        Organization acme = org("sc-goog-" + s, OrgAccountMode.SEPARATE);
        User personal = account("sc-g-" + s, mail, null);
        account("ent#" + acme.getId() + "#g" + s, mail, acme.getId());

        assertThat(userService.findOrCreateGoogleUser(mail, "A", "B").getId()).isEqualTo(personal.getId());
    }

    @Test
    void adminUserListsAndCountsAreThePersonalAccountsOnly() {
        String s = sfx();
        Organization acme = org("sc-list-" + s, OrgAccountMode.SEPARATE);
        long personalBefore = users.countByOrgIdIsNull();
        long activatedBefore = users.countByOrgIdIsNullAndActivatedIsTrue();
        account("sc-li-" + s, "li." + s + "@example.test", null);
        account("ent#" + acme.getId() + "#li" + s, "li2." + s + "@example.test", acme.getId());

        assertThat(users.countByOrgIdIsNull()).isEqualTo(personalBefore + 1);
        assertThat(users.countByOrgIdIsNullAndActivatedIsTrue()).isEqualTo(activatedBefore + 1);
        assertThat(users.findAllByOrgIdIsNull(org.springframework.data.domain.PageRequest.of(0, 1000)).getContent()).noneMatch(u -> u.getOrgId() != null);
        assertThat(users.findAllByOrgIdIsNullAndActivatedIsTrue(org.springframework.data.domain.PageRequest.of(0, 1000)).getContent()).noneMatch(u -> u.getOrgId() != null);
    }

    @Test
    @WithMockUser("sc-save-ent")
    void changingYourEmailIsCheckedInsideYourOwnScopeOnly() throws Exception {
        Organization acme = org("sc-save-" + sfx(), OrgAccountMode.SEPARATE);
        account("sc-save-p", "taken.personal@example.test", null);
        account("sc-save-ent", "me.ent@example.test", acme.getId());
        account("sc-save-colleague", "taken.ent@example.test", acme.getId());

        // the address of a PERSONAL account is free for an enterprise account
        mockMvc.perform(post("/api/account").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(accountBody("taken.personal@example.test")))).andExpect(status().isOk());
        // the address of a colleague in the same organization is not
        mockMvc.perform(post("/api/account").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(accountBody("taken.ent@example.test")))).andExpect(status().isBadRequest());
    }

    private static AdminUserDTO accountBody(String email) {
        AdminUserDTO d = new AdminUserDTO();
        d.setLogin("not-used");
        d.setFirstName("First");
        d.setLastName("Last");
        d.setEmail(email);
        d.setLangKey(Constants.DEFAULT_LANGUAGE);
        d.setAuthorities(Collections.singleton("ROLE_USER"));
        return d;
    }

    private static AdminUserDTO dto(String login, String email) {
        AdminUserDTO d = new AdminUserDTO();
        d.setLogin(login);
        d.setFirstName("Reg");
        d.setLastName("Test");
        d.setEmail(email);
        d.setLangKey(Constants.DEFAULT_LANGUAGE);
        return d;
    }

    private long scopeKey(Long userId) {
        return ((Number) em.createNativeQuery("select account_scope_key from jhi_user where id = :id").setParameter("id", userId).getSingleResult()).longValue();
    }

    private long indexCount(String name) {
        return ((Number) em
            .createNativeQuery("select count(*) from information_schema.statistics where table_schema = database() and table_name = 'jhi_user' and index_name = :n")
            .setParameter("n", name)
            .getSingleResult()).longValue();
    }
}
