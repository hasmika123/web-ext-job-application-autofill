package com.dossier.api.service.entitlement;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** The plain data the pure resolver core works on: no entities, no repositories, no clock (a test builds these by hand). */
public final class PlanData {

    /** A catalog service as the resolver needs it. */
    public record FeatureDef(
        String key,
        long defaultAllowance,
        boolean additive,
        boolean consumesAi,
        int aiBudgetCents,
        List<String> capabilities,
        String limitKey,
        String allowancePeriod
    ) {
        public FeatureDef {
            capabilities = capabilities == null ? List.of() : List.copyOf(capabilities);
        }
    }

    /** One service inside a plan version: its role and the plan's own numbers. */
    public record Component(String featureKey, String role, Long allowanceOverride, Map<String, Long> limitOverrides, int defaultQuantity) {
        public Component {
            limitOverrides = limitOverrides == null ? Map.of() : Map.copyOf(limitOverrides);
        }

        /** Roles that are part of the base price: nothing is added on top. */
        public boolean included() {
            return "BASE".equals(role) || "INCLUDED".equals(role);
        }

        /** Seat roles that every holder of the organization license gets. */
        public boolean seatIncluded() {
            return "SEAT_BASE".equals(role) || "SEAT_INCLUDED".equals(role);
        }
    }

    /** A plan version with its components. */
    public record PlanVersionData(long id, String planKey, int version, String status, int aiBudgetCapCents, List<Component> components) {
        public PlanVersionData {
            components = components == null ? List.of() : List.copyOf(components);
        }

        public long includedCount() {
            return components.stream().filter(c -> c.included() || c.seatIncluded()).count();
        }
    }

    /** A comp or referral grant: a plan version for a while. */
    public record CompLine(PlanVersionData version, Instant startsAt, Instant endsAt) {}

    /** A live license feature on an organization seat. */
    public record LicenseFeatureLine(String featureKey, int quantity, Long allowanceOverride, Instant startsAt, Instant endsAt, boolean live) {}

    private PlanData() {}
}
