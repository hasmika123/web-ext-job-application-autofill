package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.MailService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The temporary-password / must-change flag is set only by the platform admin's Create organization (the owner) and, in the
 * employee story, by an Org Admin's direct creation. The existing invitation API never creates an account and never touches the
 * flag of an existing one.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class InviteNeverSetsTempPasswordIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @MockitoBean private MailService mail;

    @Test
    void invitingAnEmployeeCreatesNoAccountAndSetsNoFlag() throws Exception {
        String sfx = UUID.randomUUID().toString().substring(0, 8);
        OrgFixtures fx = new OrgFixtures(users, orgs, members);
        Organization acme = fx.org("inv-flag-" + sfx, OrgStatus.ACTIVE);
        fx.active(acme, "own-" + sfx, OrgRole.OWNER);
        User existing = fx.user("existing-" + sfx);
        String newcomer = "newcomer." + sfx + "@example.test";

        mockMvc
            .perform(
                post("/api/orgs/" + acme.getId() + "/members/invite")
                    .with(user("own-" + sfx))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"emails\":[\"" + newcomer + "\",\"" + existing.getEmail() + "\"],\"role\":\"MEMBER\"}")
            )
            .andExpect(status().isOk());

        assertThat(users.findOneByEmailIgnoreCase(newcomer)).as("an invitation creates no account").isEmpty();
        assertThat(users.findOneByLogin(existing.getLogin()).orElseThrow().isPasswordChangeRequired()).isFalse();
        assertThat(users.findOneByLogin(existing.getLogin()).orElseThrow().getPasswordTempExpiresAt()).isNull();
    }
}
