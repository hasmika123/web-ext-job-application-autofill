package com.dossier.api.service.catalog.seed;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.catalog.seed.PlanSeedData.Comp;
import com.dossier.api.service.catalog.seed.PlanSeedData.PlanSpec;
import com.dossier.api.service.entitlement.FeatureKeys;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** K2.1: the seeded plans are coherent with the catalog seed and with today's locked behaviour numbers, without a database. */
class PlanSeedTest {

    private static PlanSpec plan(String key) {
        return PlanSeedData.PLANS.stream().filter(p -> p.planKey().equals(key)).findFirst().orElseThrow();
    }

    private static Comp comp(PlanSpec p, String feature) {
        return p.components().stream().filter(c -> c.feature().equals(feature)).findFirst().orElseThrow();
    }

    @Test
    void fourPlansExistAndOnlyFreeIsPublishedBecauseTheCatalogHasNoPrices() {
        assertThat(PlanSeedData.PLANS).extracting(PlanSpec::planKey).containsExactly("FREE", "PRO", "AUTOPILOT", "ORG_STANDARD");
        assertThat(plan("FREE").versionStatus()).isEqualTo("PUBLISHED");
        for (String k : List.of("PRO", "AUTOPILOT", "ORG_STANDARD")) {
            assertThat(plan(k).versionStatus()).as(k).isEqualTo("DRAFT");
            assertThat(plan(k).planStatus()).as(k).isEqualTo("DRAFT");
        }
        assertThat(plan("FREE").baseProductCode()).as("Free has no base product and no price").isNull();
        assertThat(plan("PRO").audience()).isEqualTo("INDIVIDUAL");
        assertThat(plan("ORG_STANDARD").audience()).isEqualTo("ORG");
    }

    @Test
    void everyComponentIsASeededServiceAndEveryProductIsASeededProduct() {
        Set<String> services = new HashSet<>(CatalogSeedData.serviceKeys());
        Set<String> products = new HashSet<>();
        CatalogSeedData.PRODUCTS.forEach(p -> products.add(p.code()));
        for (PlanSpec p : PlanSeedData.PLANS) {
            Set<String> seen = new HashSet<>();
            for (Comp c : p.components()) {
                assertThat(services).as("%s component %s", p.planKey(), c.feature()).contains(c.feature());
                assertThat(seen.add(c.feature())).as("%s lists %s once", p.planKey(), c.feature()).isTrue();
                if (c.productCode() != null) assertThat(products).contains(c.productCode());
                assertThat(c.role()).isIn("BASE", "INCLUDED", "OPTIONAL", "SEAT_BASE", "SEAT_INCLUDED", "SEAT_OPTIONAL", "FEE");
            }
            if (p.baseProductCode() != null) assertThat(products).contains(p.baseProductCode());
        }
    }

    @Test
    void roleRulesHold() {
        // individual versions use BASE/INCLUDED/OPTIONAL, organization versions use the SEAT_* roles; Free has no OPTIONAL component (Free never pays)
        for (PlanSpec p : PlanSeedData.PLANS) {
            for (Comp c : p.components()) {
                if ("ORG".equals(p.audience())) assertThat(c.role()).as("%s %s", p.planKey(), c.feature()).startsWith("SEAT_");
                else assertThat(c.role()).as("%s %s", p.planKey(), c.feature()).isIn("BASE", "INCLUDED", "OPTIONAL");
            }
        }
        assertThat(plan("FREE").components()).noneMatch(c -> c.role().equals("OPTIONAL"));
        // an OPTIONAL component never duplicates an INCLUDED one and always names a product (so a price can be published for it)
        for (String key : List.of("PRO", "AUTOPILOT")) {
            for (Comp c : plan(key).components()) if ("OPTIONAL".equals(c.role())) assertThat(c.productCode()).isNotNull();
        }
    }

    @Test
    void todaysLockedNumbersAreTheOverrides() {
        assertThat(comp(plan("FREE"), FeatureKeys.RESUME_LIBRARY).allowanceOverride()).isEqualTo(3L);
        assertThat(comp(plan("PRO"), FeatureKeys.RESUME_LIBRARY).allowanceOverride()).isEqualTo(25L);
        assertThat(comp(plan("AUTOPILOT"), FeatureKeys.RESUME_LIBRARY).allowanceOverride()).isEqualTo(50L);
        assertThat(comp(plan("FREE"), FeatureKeys.RESUME_AI_PARSING).allowanceOverride()).isEqualTo(3L);
        assertThat(comp(plan("PRO"), FeatureKeys.RESUME_AI_PARSING).allowanceOverride()).isEqualTo(25L);
        assertThat(comp(plan("AUTOPILOT"), FeatureKeys.RESUME_AI_PARSING).allowanceOverride()).isEqualTo(50L);
        assertThat(comp(plan("PRO"), FeatureKeys.AI_JOB_MATCHING).limitOverridesJson()).isEqualTo("{\"matches.per_day\":20}");
        Comp autopilot = comp(plan("AUTOPILOT"), FeatureKeys.AUTOMATION_APPROVED_APPLY);
        assertThat(autopilot.allowanceOverride()).isEqualTo(300L);
        assertThat(autopilot.limitOverridesJson()).isEqualTo("{\"operations.per_day\":30}");
        assertThat(plan("PRO").components()).noneMatch(c -> c.feature().equals(FeatureKeys.AUTOMATION_APPROVED_APPLY));
        assertThat(plan("PRO").aiBudgetCapCents()).isEqualTo(300);
        assertThat(plan("AUTOPILOT").aiBudgetCapCents()).isEqualTo(600);
        assertThat(plan("PRO").intervalsJson()).isEqualTo("[\"MONTH\",\"QUARTER\"]");
    }

    @Test
    void autopilotIncludesEverythingProDoesAndTheOptionalAddOnsAreSeededWithoutPrices() {
        Set<String> pro = new HashSet<>();
        plan("PRO").components().forEach(c -> pro.add(c.feature()));
        Set<String> autopilot = new HashSet<>();
        plan("AUTOPILOT").components().forEach(c -> autopilot.add(c.feature()));
        assertThat(autopilot).containsAll(pro);
        for (String f : List.of(FeatureKeys.AI_CREDITS_EXTRA, FeatureKeys.RESUME_EXTRA_PACK, FeatureKeys.SUPPORT_PRIORITY)) {
            assertThat(comp(plan("PRO"), f).role()).isEqualTo("OPTIONAL");
        }
        assertThat(comp(plan("PRO"), FeatureKeys.AI_CREDITS_EXTRA).maxQuantity()).isEqualTo(4);
    }

    @Test
    void theSnapshotOfAVersionIsDeterministicJson() {
        String a = PlanSeedChange.snapshot(plan("FREE"));
        String b = PlanSeedChange.snapshot(plan("FREE"));
        assertThat(a).isEqualTo(b).startsWith("{\"planKey\":\"FREE\",\"version\":1").contains("\"allowanceOverride\":3");
        assertThat(PlanSeedChange.sha256(a)).hasSize(64).isEqualTo(PlanSeedChange.sha256(b));
    }
}
