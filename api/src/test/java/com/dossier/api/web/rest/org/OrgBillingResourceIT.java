package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.org.OrgAuditAsserts;
import com.dossier.api.service.org.OrgAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * E2E-O4.0: the billing skeleton and the billing-off activation path through the real security chain. The suite runs with
 * {@code dossier.orgs.dev-activate=true} and no Stripe key, so the path is open; who may use it and what it writes is asserted
 * here, the "environment says no" cells are in {@code OrgActivationServiceTest}.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgBillingResourceIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgAuditEventRepository audit;

    private OrgFixtures fx;
    private Organization org;

    @BeforeEach
    void world() {
        fx = new OrgFixtures(users, orgs, members);
        org = fx.org("bill-draft", OrgStatus.DRAFT);
        fx.active(org, "bill-owner", OrgRole.OWNER);
        fx.active(org, "bill-admin", OrgRole.ADMIN);
        fx.active(org, "bill-finance", OrgRole.FINANCE);
        fx.active(org, "bill-staff", OrgRole.STAFF);
    }

    private ResultActions as(String login, boolean post, String path) throws Exception {
        return mockMvc.perform((post ? post(path) : get(path)).with(user(login)));
    }

    private String base() {
        return "/api/orgs/" + org.getId();
    }

    @Test
    void theBillingSkeletonSaysThereIsNoMoneyYetAndOffersActivationToTheOwner() throws Exception {
        as("bill-owner", false, base() + "/billing")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("DRAFT"))
            .andExpect(jsonPath("$.billingEnabled").value(false))
            .andExpect(jsonPath("$.devActivation").value(true))
            .andExpect(jsonPath("$.subscription").doesNotExist())
            .andExpect(jsonPath("$.items.length()").value(0))
            .andExpect(jsonPath("$.invoices.length()").value(0));
    }

    @Test
    void financeMayReadBillingButIsNotOfferedActivation() throws Exception {
        as("bill-finance", false, base() + "/billing").andExpect(status().isOk()).andExpect(jsonPath("$.devActivation").value(false));
    }

    @Test
    void aSupportOwnerCannotSeeBillingAtAll() throws Exception {
        as("bill-staff", false, base() + "/billing").andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void theOwnerActivatesADraftWorkspaceAndTheAuditSaysWhy() throws Exception {
        as("bill-owner", true, base() + "/activate")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.org.status").value("ACTIVE"))
            .andExpect(jsonPath("$.status").value("ACTIVE"))
            .andExpect(jsonPath("$.me.role").value("OWNER"));
        assertThat(orgs.findByOrgId(org.getId()).orElseThrow().getStatus()).isEqualTo(OrgStatus.ACTIVE);
        assertThat(OrgAuditAsserts.rows(audit, org.getId())).singleElement().satisfies(e -> {
            assertThat(e.getAction()).isEqualTo(OrgAuditService.BILLING_DEV_ACTIVATED);
            assertThat(e.getActorLogin()).isEqualTo("bill-owner");
        });
        as("bill-owner", false, base() + "/billing").andExpect(jsonPath("$.status").value("ACTIVE")).andExpect(jsonPath("$.devActivation").value(false));
    }

    @Test
    void activatingTwiceChangesNothingAndAuditsOnce() throws Exception {
        as("bill-owner", true, base() + "/activate").andExpect(status().isOk());
        as("bill-owner", true, base() + "/activate").andExpect(status().isOk()).andExpect(jsonPath("$.org.status").value("ACTIVE"));
        assertThat(OrgAuditAsserts.rows(audit, org.getId())).hasSize(1);
    }

    @Test
    void nobodyButTheOwnerCanActivate() throws Exception {
        for (String login : new String[] { "bill-admin", "bill-finance", "bill-staff" }) {
            as(login, true, base() + "/activate").andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
        }
        assertThat(orgs.findByOrgId(org.getId()).orElseThrow().getStatus()).isEqualTo(OrgStatus.DRAFT);
        assertThat(OrgAuditAsserts.rows(audit, org.getId())).isEmpty();
    }

    @Test
    void aClosedOrgCannotBeActivated() throws Exception {
        Organization closed = fx.org("bill-closed", OrgStatus.CLOSED);
        fx.active(closed, "closed-owner", OrgRole.OWNER);
        as("closed-owner", true, "/api/orgs/" + closed.getId() + "/activate").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORG_NOT_EDITABLE"));
    }
}
