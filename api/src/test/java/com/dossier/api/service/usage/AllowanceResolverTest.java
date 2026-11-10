package com.dossier.api.service.usage;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.catalog.seed.CatalogSeedData;
import com.dossier.api.service.entitlement.EntitlementSet;
import com.dossier.api.service.entitlement.FeatureKeys;
import com.dossier.api.service.entitlement.PersonalAddonSource;
import com.dossier.api.service.entitlement.PlanData.Component;
import com.dossier.api.service.entitlement.PlanData.FeatureDef;
import com.dossier.api.service.entitlement.PlanData.PlanVersionData;
import com.dossier.api.service.entitlement.PlanResolverCore;
import com.dossier.api.service.usage.AllowanceResolver.PeriodWindow;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Allowance resolution (06 section 5): plan override, add-on quantity, additive packs, and the period keys. */
class AllowanceResolverTest {

    private static final Instant NOW = Instant.parse("2026-10-15T12:00:00Z");
    private static final Instant END = Instant.parse("2026-11-02T00:00:00Z");

    private static Map<String, FeatureDef> defs() {
        Map<String, FeatureDef> out = new LinkedHashMap<>();
        for (CatalogSeedData.Svc s : CatalogSeedData.SERVICES) {
            out.put(s.key(), new FeatureDef(s.key(), s.allowance(), s.additive(), s.consumesAi(), s.aiBudgetCents(), s.entitlementKeys(), s.limitKey(), s.period()));
        }
        return out;
    }

    private static EntitlementSet pro(List<PersonalAddonSource.Addon> addons, String interval) {
        PlanVersionData version = new PlanVersionData(
            2,
            "PRO",
            1,
            "DRAFT",
            300,
            List.of(
                new Component(FeatureKeys.RESUME_LIBRARY, "INCLUDED", 25L, Map.of(), 1),
                new Component(FeatureKeys.AI_RESUME_TAILORING, "INCLUDED", null, Map.of(), 1),
                new Component(FeatureKeys.AI_AUTOFILL, "INCLUDED", null, Map.of(), 1)
            )
        );
        PlanVersionData free = new PlanVersionData(1, "FREE", 1, "PUBLISHED", 20, List.of());
        return PlanResolverCore.resolvePersonal(
            new PlanResolverCore.PersonalInputs("u", false, "active", Instant.parse("2026-10-02T00:00:00Z"), END, false, interval, version, free, addons, List.of(), defs(), null),
            NOW
        );
    }

    @Test
    void theResumeLimitIsThePlansNumberAnAdditivePackAddsAndCreditsDoNotTouchIt() {
        FeatureDef lib = defs().get(FeatureKeys.RESUME_LIBRARY);
        assertThat(AllowanceResolver.allowance(pro(List.of(), "MONTH"), lib, null)).isEqualTo(25);
        var pack = new PersonalAddonSource.Addon(FeatureKeys.RESUME_EXTRA_PACK, 1, NOW.minusSeconds(5), null);
        var credits = new PersonalAddonSource.Addon(FeatureKeys.AI_CREDITS_EXTRA, 2, NOW.minusSeconds(5), null);
        assertThat(AllowanceResolver.allowance(pro(List.of(pack), "MONTH"), lib, null)).as("25 + a pack of 10").isEqualTo(35);
        assertThat(AllowanceResolver.allowance(pro(List.of(credits), "MONTH"), lib, null)).isEqualTo(25);
    }

    @Test
    void aServiceNotInTheSetHasNoAllowance() {
        assertThat(AllowanceResolver.allowance(pro(List.of(), "MONTH"), defs().get(FeatureKeys.AUTOMATION_APPROVED_APPLY), null)).isZero();
    }

    @Test
    void anExplicitLimitKeyReadsTheLimit() {
        assertThat(AllowanceResolver.allowance(pro(List.of(), "MONTH"), defs().get(FeatureKeys.RESUME_LIBRARY), "resumes.max")).isEqualTo(25);
    }

    @Test
    void periodKeys() {
        EntitlementSet monthly = pro(List.of(), "MONTH");
        assertThat(AllowanceResolver.window("DAY", monthly, NOW).key()).isEqualTo("D:2026-10-15");
        assertThat(AllowanceResolver.window("MONTH", monthly, NOW).key()).isEqualTo("M:2026-10");
        PeriodWindow term = AllowanceResolver.window("PERIOD", monthly, NOW);
        assertThat(term.key()).isEqualTo("P:2026-10-02");
        assertThat(term.end()).isEqualTo(END);
        assertThat(AllowanceResolver.window("PERIOD", pro(List.of(), "YEAR"), NOW).key()).as("a yearly term spends monthly (S-10)").isEqualTo("M:2026-10");
        EntitlementSet free = PlanResolverCore.resolvePersonal(
            new PlanResolverCore.PersonalInputs("u", false, null, null, null, false, null, null, new PlanVersionData(1, "FREE", 1, "PUBLISHED", 20, List.of()), List.of(), List.of(), defs(), null),
            NOW
        );
        assertThat(AllowanceResolver.window("PERIOD", free, NOW).key()).as("Free has no term").isEqualTo("M:2026-10");
    }
}
