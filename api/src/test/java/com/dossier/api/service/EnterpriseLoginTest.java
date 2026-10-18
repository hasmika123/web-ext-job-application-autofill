package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.config.Constants;
import org.junit.jupiter.api.Test;

/** The login of an enterprise account (decision O4, docs/enterprise-v2/19 section 1.3): {@code ent#<orgId>#<email>} when it fits, else a hash of the address. */
class EnterpriseLoginTest {

    @Test
    void aShortAddressIsPartOfTheLogin() {
        assertThat(UserService.enterpriseLogin(42L, "sam@acme.test")).isEqualTo("ent#42#sam@acme.test");
    }

    @Test
    void aLongAddressIsReplacedByAHashThatStillFitsTheLoginRules() {
        String mail = "a.very.long.person.name.indeed@a-quite-long-company-domain.example.test";
        String login = UserService.enterpriseLogin(42L, mail);
        assertThat(login).startsWith("ent#42#").hasSize("ent#42#".length() + 16).matches(Constants.ENTERPRISE_LOGIN_REGEX);
        assertThat(login.length()).isLessThanOrEqualTo(50);
        assertThat(UserService.enterpriseLogin(42L, mail)).isEqualTo(login); // stable
        assertThat(UserService.enterpriseLogin(43L, mail)).isNotEqualTo(login);
    }

    @Test
    void anAddressWithCharactersThePatternRefusesIsHashedToo() {
        String login = UserService.enterpriseLogin(7L, "o'brien!@acme.test");
        assertThat(login).matches(Constants.ENTERPRISE_LOGIN_REGEX).doesNotContain("'");
    }

    @Test
    void aPersonalRegistrationCanNeverProduceOne() {
        assertThat(Constants.isEnterpriseLogin(UserService.enterpriseLogin(1L, "x@y.test"))).isTrue();
        assertThat(UserService.enterpriseLogin(1L, "x@y.test")).doesNotMatch(Constants.LOGIN_REGEX);
    }
}
