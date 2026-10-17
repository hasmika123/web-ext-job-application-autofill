package com.dossier.api.service.entitlement;

import com.dossier.api.service.catalog.seed.CatalogSeedData;
import com.dossier.api.service.catalog.seed.PlanSeedData;
import com.dossier.api.service.entitlement.PlanData.Component;
import com.dossier.api.service.entitlement.PlanData.FeatureDef;
import com.dossier.api.service.entitlement.PlanData.PlanVersionData;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Builds the resolver's plain inputs from the SAME seed data the Liquibase seed writes, so a test fixture can never drift from the database. */
public final class ResolverFixtures {

    public static final Instant NOW = Instant.parse("2026-10-15T12:00:00Z");
    private static final ObjectMapper JSON = new ObjectMapper();

    private ResolverFixtures() {}

    public static Map<String, FeatureDef> features() {
        Map<String, FeatureDef> out = new LinkedHashMap<>();
        for (CatalogSeedData.Svc s : CatalogSeedData.SERVICES) {
            out.put(s.key(), new FeatureDef(s.key(), s.allowance(), s.additive(), s.consumesAi(), s.aiBudgetCents(), s.entitlementKeys(), s.limitKey(), s.period()));
        }
        return out;
    }

    /** Plan {@code key} version 1 exactly as the seed defines it; ids are 1..4 in seed order. */
    public static PlanVersionData plan(String key) {
        long id = 1;
        for (PlanSeedData.PlanSpec spec : PlanSeedData.PLANS) {
            if (spec.planKey().equals(key)) {
                List<Component> comps = new ArrayList<>();
                for (PlanSeedData.Comp c : spec.components()) {
                    comps.add(new Component(c.feature(), c.role(), c.allowanceOverride(), limits(c.limitOverridesJson()), c.defaultQuantity()));
                }
                return new PlanVersionData(id, key, 1, spec.versionStatus(), spec.aiBudgetCapCents(), comps);
            }
            id++;
        }
        throw new IllegalArgumentException(key);
    }

    private static Map<String, Long> limits(String json) {
        if (json == null) return Map.of();
        try {
            Map<String, Number> raw = JSON.readValue(json, new TypeReference<Map<String, Number>>() {});
            Map<String, Long> out = new HashMap<>();
            raw.forEach((k, v) -> out.put(k, v.longValue()));
            return out;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** A personal account on {@code version} with the given Stripe status, ending {@code periodEnd}. */
    public static PlanResolverCore.PersonalInputs personal(String status, Instant periodStart, Instant periodEnd, String interval, PlanVersionData version) {
        return new PlanResolverCore.PersonalInputs("user", false, status, periodStart, periodEnd, false, interval, version, plan("FREE"), List.of(), List.of(), features(), null);
    }

    public static PlanResolverCore.PersonalInputs withAddons(PlanResolverCore.PersonalInputs in, List<PersonalAddonSource.Addon> addons) {
        return new PlanResolverCore.PersonalInputs(in.login(), in.enterpriseAccount(), in.status(), in.periodStart(), in.periodEnd(), in.cancelAtPeriodEnd(), in.interval(), in.subscriptionVersion(), in.freeVersion(), addons, in.comps(), in.features(), in.quarterlyAiCents());
    }

    public static PlanResolverCore.PersonalInputs withComps(PlanResolverCore.PersonalInputs in, List<PlanData.CompLine> comps) {
        return new PlanResolverCore.PersonalInputs(in.login(), in.enterpriseAccount(), in.status(), in.periodStart(), in.periodEnd(), in.cancelAtPeriodEnd(), in.interval(), in.subscriptionVersion(), in.freeVersion(), in.addons(), comps, in.features(), in.quarterlyAiCents());
    }
}
