package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.dto.org.OrgBillingDTO;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** E2E-O4.0: the billing-off activation path, over every cell of the flag matrix (dev-activate x Stripe x role x state). */
class OrgActivationServiceTest {

    private final OrganizationRepository orgs = mock(OrganizationRepository.class);
    private final OrgAuditService audit = mock(OrgAuditService.class);
    private final OrgService orgService = mock(OrgService.class);
    private final StripeGateway stripe = mock(StripeGateway.class);

    private OrgActivationService service(boolean devActivate, boolean stripeOn) {
        when(stripe.isEnabled()).thenReturn(stripeOn);
        return new OrgActivationService(orgs, audit, orgService, stripe, devActivate);
    }

    private Organization org(OrgStatus status) {
        Organization o = new Organization();
        o.setId(7L);
        o.setStatus(status);
        when(orgs.findByOrgId(7L)).thenReturn(Optional.of(o));
        when(orgs.saveAndFlush(any(Organization.class))).thenAnswer(i -> i.getArgument(0));
        return o;
    }

    private static OrgMembership as(OrgRole role) {
        return new OrgMembership(7L, 11L, 21L, "someone", role, OrgMemberStatus.ACTIVE, OrgStatus.DRAFT);
    }

    @Test
    void availableOnlyWhenTheFlagIsOnAndStripeIsOff() {
        assertThat(service(true, false).available()).isTrue();
        assertThat(service(true, true).available()).as("Stripe connected: the real path is the only path").isFalse();
        assertThat(service(false, false).available()).as("production never sets the flag").isFalse();
        assertThat(service(false, true).available()).isFalse();
    }

    @Test
    void theOwnerActivatesADraftOrgAndOneAuditRowIsWritten() {
        Organization o = org(OrgStatus.DRAFT);
        service(true, false).activate(as(OrgRole.OWNER));
        assertThat(o.getStatus()).isEqualTo(OrgStatus.ACTIVE);
        verify(audit).record(any(OrgMembership.class), eq(OrgAuditService.BILLING_DEV_ACTIVATED), eq(OrgAuditService.TARGET_ORG), any(), eq("7"), anyString());
        assertThat(o.getSetupFeePaidAt()).as("no fee was paid, so no paid-at is claimed").isNull();
    }

    @Test
    void pendingSetupFeeAlsoActivates() {
        Organization o = org(OrgStatus.PENDING_SETUP_FEE);
        service(true, false).activate(as(OrgRole.OWNER));
        assertThat(o.getStatus()).isEqualTo(OrgStatus.ACTIVE);
    }

    @Test
    void anAlreadyActiveOrgIsLeftAloneAndNothingIsAudited() {
        Organization o = org(OrgStatus.ACTIVE);
        service(true, false).activate(as(OrgRole.OWNER));
        assertThat(o.getStatus()).isEqualTo(OrgStatus.ACTIVE);
        verify(orgs, never()).saveAndFlush(any(Organization.class));
        verify(audit, never()).record(any(OrgMembership.class), anyString(), anyString(), any(), any(), any());
    }

    @Test
    void otherStatesAreAConflictNotAnActivation() {
        for (OrgStatus s : new OrgStatus[] { OrgStatus.CLOSED, OrgStatus.SUSPENDED, OrgStatus.PAST_DUE }) {
            Organization o = org(s);
            assertThatThrownBy(() -> service(true, false).activate(as(OrgRole.OWNER)))
                .isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo(OrgException.CODE_ORG_NOT_EDITABLE));
            assertThat(o.getStatus()).isEqualTo(s);
        }
    }

    @Test
    void whereTheEnvironmentForbidsItTheAnswerIsTheGenericNotFound() {
        org(OrgStatus.DRAFT);
        for (boolean[] cell : new boolean[][] { { false, false }, { false, true }, { true, true } }) {
            assertThatThrownBy(() -> service(cell[0], cell[1]).activate(as(OrgRole.OWNER))).isInstanceOf(OrgNotFoundException.class);
        }
    }

    @Test
    void onlyTheOwnerMayActivate() {
        org(OrgStatus.DRAFT);
        for (OrgRole role : new OrgRole[] { OrgRole.ADMIN, OrgRole.STAFF, OrgRole.MEMBER, OrgRole.MARKETER, OrgRole.FINANCE }) {
            assertThatThrownBy(() -> service(true, false).activate(as(role))).as(role.name()).isInstanceOf(OrgNotFoundException.class);
        }
    }

    @Test
    void theBillingSkeletonHasNoMoneyInIt() {
        org(OrgStatus.DRAFT);
        OrgBillingDTO off = service(true, false).billing(as(OrgRole.OWNER));
        assertThat(off.status()).isEqualTo(OrgStatus.DRAFT);
        assertThat(off.billingEnabled()).isFalse();
        assertThat(off.devActivation()).as("the owner of a draft org, billing off, flag on").isTrue();
        assertThat(off.subscription()).isNull();
        assertThat(off.items()).isEmpty();
        assertThat(off.invoices()).isEmpty();

        assertThat(service(true, false).billing(as(OrgRole.FINANCE)).devActivation()).as("only the owner is offered it").isFalse();
        assertThat(service(false, false).billing(as(OrgRole.OWNER)).devActivation()).isFalse();
        OrgBillingDTO on = service(true, true).billing(as(OrgRole.OWNER));
        assertThat(on.billingEnabled()).isTrue();
        assertThat(on.devActivation()).isFalse();
    }

    @Test
    void anActiveOrgIsNotOfferedActivationAgain() {
        org(OrgStatus.ACTIVE);
        assertThat(service(true, false).billing(as(OrgRole.OWNER)).devActivation()).isFalse();
    }
}
