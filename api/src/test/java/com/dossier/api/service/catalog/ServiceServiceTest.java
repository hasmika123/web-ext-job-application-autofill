package com.dossier.api.service.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.catalog.dto.ServiceDTO;
import com.dossier.api.service.catalog.dto.ServiceRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** K1.1: the service rules, without a database (key format, allowance, audience, stackable, retire guard, change + audit rows). */
class ServiceServiceTest {

    private final Map<String, FeatureDefinition> store = new HashMap<>();
    private FeatureDefinitionRepository repo;
    private LivePlanLookup livePlans;
    private CatalogChangeRecorder changes;
    private AdminAuditService audit;
    private ServiceService service;

    @BeforeEach
    void setUp() {
        repo = mock(FeatureDefinitionRepository.class);
        livePlans = mock(LivePlanLookup.class);
        changes = mock(CatalogChangeRecorder.class);
        audit = mock(AdminAuditService.class);
        when(repo.findByFeatureKey(anyString())).thenAnswer(i -> Optional.ofNullable(store.get(i.<String>getArgument(0))));
        when(repo.save(any(FeatureDefinition.class))).thenAnswer(i -> {
            FeatureDefinition d = i.getArgument(0);
            store.put(d.getFeatureKey(), d);
            return d;
        });
        when(repo.findAllByOrderBySortOrderAsc()).thenAnswer(i -> List.copyOf(store.values()));
        service = new ServiceService(repo, livePlans, changes, audit, new ObjectMapper());
    }

    private static ServiceRequest req(String key, Long allowance, String unit, String audience) {
        return new ServiceRequest(key, "Resume tailoring", "Tailor a resume to a posting.", null, unit, allowance, "MONTH", audience, "RESUME", null, 125, true, null, false, null, false, null, List.of("ai.server"), null, null, 5, null, null);
    }

    private static void assertRefused(Runnable r, int status, String code) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(CatalogException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(status);
            assertThat(e.getCode()).isEqualTo(code);
        });
    }

    @Test
    void aKeyThatIsNotLowerCaseDottedIsRefused() {
        assertRefused(() -> service.create(req("AI.Tailor", 40L, "tailorings", "BOTH")), 422, "KEY_FORMAT");
        assertRefused(() -> service.create(req("nodots", 40L, "tailorings", "BOTH")), 422, "KEY_FORMAT");
        assertRefused(() -> service.create(req("ai..x", 40L, "tailorings", "BOTH")), 422, "KEY_FORMAT");
        assertRefused(() -> service.create(req(null, 40L, "tailorings", "BOTH")), 422, "KEY_FORMAT");
        verify(repo, never()).save(any());
    }

    @Test
    void anAllowanceIsRequiredAndZeroIsOnlyForPureAccessServices() {
        assertRefused(() -> service.create(req("ai.tailoring", null, "tailorings", "BOTH")), 422, "ALLOWANCE_REQUIRED");
        assertRefused(() -> service.create(req("ai.tailoring", 0L, "tailorings", "BOTH")), 422, "ALLOWANCE_REQUIRED");
        assertRefused(() -> service.create(req("ai.tailoring", -1L, "none", "BOTH")), 422, "ALLOWANCE_REQUIRED");
        ServiceDTO access = service.create(req("base.access", 0L, "none", "INDIVIDUAL"));
        assertThat(access.defaultAllowance()).isZero();
        assertThat(access.usageUnit()).isEqualTo("none");
    }

    @Test
    void aValidServiceIsStoredWithItsAudienceDefaultsAndLeavesAChangeAndAnAuditRow() {
        ServiceDTO s = service.create(req("ai.resume_tailoring", 40L, "tailorings", "both"));
        assertThat(s.key()).isEqualTo("ai.resume_tailoring");
        assertThat(s.audience()).isEqualTo("BOTH");
        assertThat(s.poolMode()).isEqualTo("PER_CONSULTANT");
        assertThat(s.visibility()).isEqualTo("PUBLIC");
        assertThat(s.reserveTtlSeconds()).isEqualTo(900);
        assertThat(s.entitlementKeys()).containsExactly("ai.server");
        assertThat(s.usageType()).isEqualTo("AI_FEATURE");
        assertThat(s.active()).isTrue();
        verify(changes).record(anyString(), anyString(), any(), any(), any());
        verify(audit).record(anyString(), anyString(), anyString(), any(), anyString());
        assertRefused(() -> service.create(req("ai.resume_tailoring", 40L, "tailorings", "BOTH")), 409, "KEY_EXISTS");
    }

    @Test
    void anUnknownAudienceCategoryOrVisibilityIsRefused() {
        assertRefused(() -> service.create(req("a.b", 1L, "x", "NOBODY")), 422, "INVALID_VALUE");
        ServiceRequest badCategory = new ServiceRequest("a.c", "N", null, null, "x", 1L, "MONTH", "ORG", "WIDGETS", null, 0, false, null, false, null, false, null, null, null, null, null, null, null);
        assertRefused(() -> service.create(badCategory), 422, "INVALID_VALUE");
        ServiceRequest badVisibility = new ServiceRequest("a.d", "N", null, null, "x", 1L, "MONTH", "ORG", null, null, 0, false, null, false, null, false, null, null, null, "SECRET", null, null, null);
        assertRefused(() -> service.create(badVisibility), 422, "INVALID_VALUE");
    }

    @Test
    void onlyAStackableServiceMayHaveAMaxQuantityAboveOne() {
        ServiceRequest notStackable = new ServiceRequest("a.e", "N", null, null, "credits", 1L, "MONTH", "BOTH", "AI_CREDITS", null, 75, false, null, false, 4, false, null, null, null, null, null, null, null);
        assertRefused(() -> service.create(notStackable), 422, "INVALID_VALUE");
        ServiceRequest stackable = new ServiceRequest("a.f", "N", null, null, "credits", 1L, "MONTH", "BOTH", "AI_CREDITS", null, 75, false, null, true, 4, false, null, null, null, null, null, null, null);
        assertThat(service.create(stackable).maxQuantity()).isEqualTo(4);
    }

    @Test
    void theKeyIsImmutable() {
        service.create(req("ai.resume_tailoring", 40L, "tailorings", "BOTH"));
        assertRefused(() -> service.update("ai.resume_tailoring", req("ai.other", 40L, "tailorings", "BOTH")), 422, "KEY_IMMUTABLE");
        ServiceDTO changed = service.update("ai.resume_tailoring", req("ai.resume_tailoring", 60L, "tailorings", "ORG"));
        assertThat(changed.defaultAllowance()).isEqualTo(60L);
        assertThat(changed.audience()).isEqualTo("ORG");
        assertRefused(() -> service.update("no.such", req(null, 40L, "x", "ORG")), 404, "NOT_FOUND");
    }

    @Test
    void retiringNeedsAReasonAndIsRefusedWhileAPublishedPlanIncludesTheService() {
        service.create(req("ai.resume_tailoring", 40L, "tailorings", "BOTH"));
        assertRefused(() -> service.retire("ai.resume_tailoring", "short"), 422, "REASON_REQUIRED");

        when(livePlans.planKeysUsingService("ai.resume_tailoring")).thenReturn(List.of("PRO", "AUTOPILOT"));
        assertThatThrownBy(() -> service.retire("ai.resume_tailoring", "Retired in favour of the new tailoring"))
            .isInstanceOfSatisfying(CatalogException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(409);
                assertThat(e.getCode()).isEqualTo("SERVICE_IN_LIVE_PLAN");
                assertThat(e.getExtra().get("planKeys")).isEqualTo(List.of("PRO", "AUTOPILOT"));
            });
        assertThat(store.get("ai.resume_tailoring").getActive()).isTrue();

        when(livePlans.planKeysUsingService("ai.resume_tailoring")).thenReturn(List.of());
        ServiceDTO retired = service.retire("ai.resume_tailoring", "Retired in favour of the new tailoring");
        assertThat(retired.active()).isFalse();
        assertRefused(() -> service.update("ai.resume_tailoring", req(null, 40L, "tailorings", "BOTH")), 409, "SERVICE_RETIRED");
    }

    @Test
    void listFiltersByAudienceWithBothMatchingEither() {
        service.create(req("a.one", 1L, "x", "INDIVIDUAL"));
        service.create(req("a.two", 1L, "x", "ORG"));
        service.create(req("a.three", 1L, "x", "BOTH"));
        assertThat(service.list("INDIVIDUAL", null, null, null)).extracting(ServiceDTO::key).containsExactlyInAnyOrder("a.one", "a.three");
        assertThat(service.list("ORG", null, null, null)).extracting(ServiceDTO::key).containsExactlyInAnyOrder("a.two", "a.three");
        assertThat(service.list(null, "RESUME", true, "TWO")).extracting(ServiceDTO::key).containsExactly("a.two");
    }
}
