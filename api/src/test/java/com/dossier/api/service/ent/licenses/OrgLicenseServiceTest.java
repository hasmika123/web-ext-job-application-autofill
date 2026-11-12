package com.dossier.api.service.ent.licenses;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.LicenseChange;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.billing.OrgContractPrice;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseChangeRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.billing.OrgContractPriceRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.service.ent.consultants.ConsultantAccess;
import com.dossier.api.service.entitlement.FeatureKeys;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

/** Licences without money (LICENCES-BUILD.md L3): give, set add-ons, suspend, reactivate, end; the history and audit each writes; prices only from a contract. */
class OrgLicenseServiceTest {

    static final Long ORG = 7L;
    static final Long CONSULTANT = 21L;
    static final Instant T0 = Instant.parse("2026-11-10T12:00:00Z");

    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    ConsultantLicenseRepository licenses = mock(ConsultantLicenseRepository.class);
    LicenseFeatureRepository features = mock(LicenseFeatureRepository.class);
    LicenseChangeRepository changes = mock(LicenseChangeRepository.class);
    ProductRepository products = mock(ProductRepository.class);
    FeatureDefinitionRepository definitions = mock(FeatureDefinitionRepository.class);
    OrgContractPriceRepository prices = mock(OrgContractPriceRepository.class);
    ConsultantAccess access = mock(ConsultantAccess.class);
    OrgAuditService audit = mock(OrgAuditService.class);
    com.dossier.api.repository.sub.ProductPriceRepository catalogPrices = mock(com.dossier.api.repository.sub.ProductPriceRepository.class);
    com.dossier.api.repository.ent.billing.OrgBillingAccountRepository billingAccounts = mock(com.dossier.api.repository.ent.billing.OrgBillingAccountRepository.class);
    com.dossier.api.repository.ent.billing.SubscriptionChangeRepository subscriptionChanges = mock(com.dossier.api.repository.ent.billing.SubscriptionChangeRepository.class);
    OrgLicenseService service = new OrgLicenseService(consultants, licenses, features, changes, products, definitions, prices, catalogPrices, billingAccounts, subscriptionChanges, access, audit);

    OrgMembership me = new OrgMembership(ORG, 5L, 2L, "sarah", com.dossier.api.domain.enumeration.OrgRole.ADMIN, com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE, com.dossier.api.domain.enumeration.OrgStatus.ACTIVE);
    List<ConsultantLicense> licenseRows = new ArrayList<>();
    List<LicenseFeature> featureRows = new ArrayList<>();
    List<LicenseChange> changeRows = new ArrayList<>();
    List<OrgContractPrice> priceRows = new ArrayList<>();
    AtomicLong ids = new AtomicLong(100);
    Instant now = T0;

    @BeforeEach
    void ready() {
        service.setClock(Clock.fixed(T0, ZoneOffset.UTC));
        ConsultantProfile c = new ConsultantProfile();
        c.setId(CONSULTANT);
        c.setOrgId(ORG);
        c.setMemberId(9L);
        c.setStatus("ACTIVE");
        c.setDisplayName("Anika Rao");
        when(consultants.findByOrgIdAndId(ORG, CONSULTANT)).thenReturn(Optional.of(c));
        when(consultants.findByOrgIdAndStatusOrderByDisplayNameAsc(ORG, "ACTIVE")).thenReturn(List.of(c));
        when(products.findByCode("ORG_BASE_LICENSE")).thenReturn(Optional.of(product(1L, "BASE_LICENSE", "base.consultant", "Consultant base license", "ORG")));
        when(products.findByKindOrderBySortOrderAsc("FEATURE")).thenReturn(List.of(
            product(2L, "FEATURE", FeatureKeys.INBOX_MONITORING, "Inbox monitoring", "BOTH"),
            product(3L, "FEATURE", FeatureKeys.AI_RESUME_TAILORING, "AI resume tailoring", "BOTH"),
            product(4L, "FEATURE", FeatureKeys.RESUME_EXTRA_PACK, "Extra resume pack", "INDIVIDUAL")
        ));
        when(prices.findByOrgId(ORG)).thenAnswer(inv -> priceRows);
        when(licenses.saveAndFlush(any())).thenAnswer(inv -> store(inv.getArgument(0)));
        when(licenses.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(licenses.findByOrgIdAndConsultantIdOrderByStartsAtDesc(ORG, CONSULTANT)).thenAnswer(inv ->
            licenseRows.stream().sorted(Comparator.comparing(ConsultantLicense::getStartsAt).reversed()).toList()
        );
        when(features.save(any())).thenAnswer(inv -> {
            LicenseFeature f = inv.getArgument(0);
            if (f.getId() == null) {
                f.setId(ids.incrementAndGet());
                featureRows.add(f);
            }
            return f;
        });
        when(features.findByOrgIdAndLicenseIdOrderByIdAsc(eq(ORG), anyLong())).thenAnswer(inv -> featureRows.stream().filter(f -> f.getLicenseId().equals(inv.getArgument(1))).toList());
        when(changes.save(any())).thenAnswer(inv -> {
            changeRows.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        when(changes.findByOrgIdAndLicenseIdOrderByCreatedAtDesc(eq(ORG), anyLong())).thenAnswer(inv -> changeRows.stream().filter(ch -> ch.getLicenseId().equals(inv.getArgument(1))).toList());
    }

    private ConsultantLicense store(ConsultantLicense l) {
        if (l.getId() == null) {
            l.setId(ids.incrementAndGet());
            licenseRows.add(l);
        }
        return l;
    }

    static Product product(Long id, String kind, String key, String name, String soldTo) {
        Product p = new Product();
        p.setId(id);
        p.setKind(kind);
        p.setFeatureKey(key);
        p.setName(name);
        p.setSoldTo(soldTo);
        p.setActive(true);
        return p;
    }

    private List<String> kinds() {
        return changeRows.stream().map(LicenseChange::getKind).toList();
    }

    @Test
    void givingALicenceWorksAtOnceWithItsAddOnsAndBillsNothing() {
        OrgLicenseService.Detail d = service.give(me, CONSULTANT, Set.of(FeatureKeys.INBOX_MONITORING, FeatureKeys.AI_RESUME_TAILORING));
        assertThat(d.row().status()).isEqualTo(OrgLicenseService.Status.ACTIVE);
        assertThat(d.row().features()).containsExactlyInAnyOrder(FeatureKeys.INBOX_MONITORING, FeatureKeys.AI_RESUME_TAILORING);
        assertThat(d.row().priceSet()).isFalse();
        assertThat(d.row().monthlyMinor()).isNull(); // "price not set": nothing is billed
        assertThat(licenseRows).singleElement().satisfies(l -> {
            assertThat(l.getBaseAmountMinor()).isZero();
            assertThat(l.getBaseProductId()).isEqualTo(1L);
            assertThat(l.getMemberId()).isEqualTo(9L);
        });
        assertThat(kinds()).containsExactly("CREATE", "ADD_FEATURE", "ADD_FEATURE");
        assertThat(changeRows).allSatisfy(ch -> assertThat(ch.getStatus()).isEqualTo("APPLIED"));
        verify(audit).record(eq(me), eq("LICENSE_CHANGE"), eq("CONSULTANT"), isNull(), eq("21"), anyString());
    }

    @Test
    void aContractPriceIsUsedWhereOneExists() {
        OrgContractPrice base = new OrgContractPrice();
        base.setId(50L);
        base.setOrgId(ORG);
        base.setProductId(1L);
        base.setOverrideAmountMinor(4900L);
        base.setCurrency("USD");
        OrgContractPrice inbox = new OrgContractPrice();
        inbox.setId(51L);
        inbox.setOrgId(ORG);
        inbox.setProductId(2L);
        inbox.setOverrideAmountMinor(500L);
        priceRows.addAll(List.of(base, inbox));
        OrgLicenseService.Detail d = service.give(me, CONSULTANT, Set.of(FeatureKeys.INBOX_MONITORING));
        assertThat(d.row().priceSet()).isTrue();
        assertThat(d.row().monthlyMinor()).isEqualTo(5400L);
        assertThat(service.catalog(me).basePriceMinor()).isEqualTo(4900L);
    }

    @Test
    void onlyAddOnsSoldToOrganizationsCanBeGiven() {
        assertThat(service.catalog(me).addOns()).extracting(OrgLicenseService.AddOn::key).containsExactly(FeatureKeys.INBOX_MONITORING, FeatureKeys.AI_RESUME_TAILORING);
        assertThatThrownBy(() -> service.give(me, CONSULTANT, Set.of(FeatureKeys.RESUME_EXTRA_PACK))).isInstanceOf(ResponseStatusException.class).hasMessageContaining("Unknown add-on");
        assertThat(licenseRows).isEmpty();
    }

    @Test
    void aSecondLicenceIsRefusedButOneAfterAnEndIsANewRow() {
        service.give(me, CONSULTANT, Set.of());
        assertThatThrownBy(() -> service.give(me, CONSULTANT, Set.of())).hasMessageContaining("ALREADY_LICENSED");
        service.end(me, CONSULTANT, "Left the bench");
        service.setClock(Clock.fixed(T0.plus(Duration.ofDays(1)), ZoneOffset.UTC));
        assertThat(service.give(me, CONSULTANT, Set.of()).row().status()).isEqualTo(OrgLicenseService.Status.ACTIVE);
        assertThat(licenseRows).hasSize(2);
    }

    @Test
    void settingTheAddOnsAddsAndRemovesOnlyWhatChanged() {
        service.give(me, CONSULTANT, Set.of(FeatureKeys.INBOX_MONITORING));
        changeRows.clear();
        OrgLicenseService.Detail d = service.setFeatures(me, CONSULTANT, Set.of(FeatureKeys.AI_RESUME_TAILORING));
        assertThat(d.row().features()).containsExactly(FeatureKeys.AI_RESUME_TAILORING);
        assertThat(kinds()).containsExactly("ADD_FEATURE", "REMOVE_FEATURE");
        assertThat(featureRows.stream().filter(f -> f.getFeatureKey().equals(FeatureKeys.INBOX_MONITORING)).findFirst().orElseThrow().getLive()).isFalse();
        changeRows.clear();
        service.setFeatures(me, CONSULTANT, Set.of(FeatureKeys.AI_RESUME_TAILORING));
        assertThat(changeRows).isEmpty(); // nothing changed, nothing written
        verify(audit, times(2)).record(eq(me), eq("LICENSE_CHANGE"), any(), any(), any(), anyString());
    }

    @Test
    void suspendStopsTheLicenceAndReactivateBringsItsAddOnsBack() {
        service.give(me, CONSULTANT, Set.of(FeatureKeys.INBOX_MONITORING));
        assertThatThrownBy(() -> service.suspend(me, CONSULTANT, " ")).hasMessageContaining("Say why");
        OrgLicenseService.Detail s = service.suspend(me, CONSULTANT, "Paused for the quarter");
        assertThat(s.row().status()).isEqualTo(OrgLicenseService.Status.SUSPENDED);
        assertThat(s.row().suspendReason()).isEqualTo("Paused for the quarter");
        assertThat(s.row().features()).containsExactly(FeatureKeys.INBOX_MONITORING); // kept for the reactivation
        assertThat(OrgLicenseGate.grants(licenseRows.get(0), T0)).isFalse(); // but it grants nothing while suspended
        OrgLicenseService.Detail r = service.reactivate(me, CONSULTANT);
        assertThat(r.row().status()).isEqualTo(OrgLicenseService.Status.ACTIVE);
        assertThat(OrgLicenseGate.grants(licenseRows.get(0), T0)).isTrue();
    }

    @Test
    void endingStopsEveryAddOnNowAndKeepsTheHistory() {
        service.give(me, CONSULTANT, Set.of(FeatureKeys.INBOX_MONITORING));
        OrgLicenseService.Detail d = service.end(me, CONSULTANT, "Contract finished");
        assertThat(d.row().status()).isEqualTo(OrgLicenseService.Status.ENDED);
        assertThat(d.row().features()).isEmpty();
        assertThat(featureRows).allSatisfy(f -> assertThat(f.getLive()).isFalse());
        assertThat(licenseRows.get(0).getEndReason()).isEqualTo("REMOVED");
        assertThat(d.history()).extracting(OrgLicenseService.Change::kind).contains("CREATE", "ADD_FEATURE", "END");
        assertThatThrownBy(() -> service.suspend(me, CONSULTANT, "again")).hasMessageContaining("NO_LICENSE");
    }

    @Test
    void endForSeatEndsALiveLicenceAndIgnoresAMissingOne() {
        assertThat(service.endForSeat(ORG, CONSULTANT, "MEMBER_LEFT", 5L)).isFalse();
        service.give(me, CONSULTANT, Set.of(FeatureKeys.INBOX_MONITORING));
        assertThat(service.endForSeat(ORG, CONSULTANT, "MEMBER_LEFT", 5L)).isTrue();
        assertThat(licenseRows.get(0).getStatus()).isEqualTo("ENDED");
        assertThat(licenseRows.get(0).getEndReason()).isEqualTo("MEMBER_LEFT");
        assertThat(service.endForSeat(ORG, CONSULTANT, "MEMBER_LEFT", 5L)).isFalse();
    }

    @Test
    void withoutThePermissionNothingIsReadOrWritten() {
        doThrow(new OrgNotFoundException()).when(access).require(me, OrgLicenseService.MANAGE);
        assertThatThrownBy(() -> service.give(me, CONSULTANT, Set.of())).isInstanceOf(OrgNotFoundException.class);
        doThrow(new OrgNotFoundException()).when(access).require(me, OrgLicenseService.VIEW);
        assertThatThrownBy(() -> service.list(me)).isInstanceOf(OrgNotFoundException.class);
        assertThat(licenseRows).isEmpty();
        verify(audit, never()).record(any(OrgMembership.class), anyString(), any(), any(), any(), any());
    }

    @Test
    void aConsultantOfAnotherOrganizationOrAnInactiveOneIsA404() {
        when(consultants.findByOrgIdAndId(ORG, 999L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.get(me, 999L)).isInstanceOf(OrgNotFoundException.class);
        ConsultantProfile paused = new ConsultantProfile();
        paused.setId(22L);
        paused.setStatus("INACTIVE");
        when(consultants.findByOrgIdAndId(ORG, 22L)).thenReturn(Optional.of(paused));
        assertThatThrownBy(() -> service.give(me, 22L, Set.of())).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void theListShowsUnlicensedConsultantsToo() {
        assertThat(service.list(me)).singleElement().satisfies(r -> {
            assertThat(r.status()).isEqualTo(OrgLicenseService.Status.NONE);
            assertThat(r.signInLinked()).isTrue();
        });
    }
}
