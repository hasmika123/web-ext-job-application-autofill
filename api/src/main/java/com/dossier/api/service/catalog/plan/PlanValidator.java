package com.dossier.api.service.catalog.plan;

import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.service.catalog.CatalogException;
import com.dossier.api.service.catalog.CatalogSettings;
import com.dossier.api.service.catalog.DependencyService;
import com.dossier.api.service.catalog.dto.CatalogRulesDTOs.DependencyDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.ComponentRequest;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The invariants of a plan version (docs/subscriptions/02 section 7), one method each so a test can name the rule it breaks. Everything here refuses with a
 * {@link CatalogException} carrying the 09 section 5 code. Prices and the margin are checked by {@code PlanService.publish}, which owns the price book.
 *
 * <ol>
 *   <li>{@link #checkIntervals}: a known recurring interval, ORG never QUARTER (E17), YEAR only while annual billing is on (INTERVAL_NOT_ENABLED), only
 *       intervals the settings offer to the audience.</li>
 *   <li>{@link #checkComponents}: roles fit the audience (ROLE_INVALID_FOR_AUDIENCE), a service appears once (DUPLICATE_COMPONENT, which also covers an
 *       OPTIONAL duplicating an INCLUDED one), every service exists, is active and is offered to the audience, an allowance exists (ALLOWANCE_REQUIRED),
 *       a priced role names a product that is sold to the audience and belongs to the service.</li>
 *   <li>{@link #checkPublishable}: a base product for every individual plan but FREE and a seat base for an organization plan, FREE never charges, and the dependency rules.</li>
 * </ol>
 *
 * Dependency rules (02 section 2.3 with decision B-03): a dependency on a service that is not offered to the plan's audience does not apply (an individual plan never needs
 * {@code base.consultant}). TECHNICAL: the required service must be inside the version (base or included) for every component, optional or not.
 * COMMERCIAL: an included service needs the other included too; an optional service needs the other somewhere in the version (the customer confirms its price in a
 * quote). INTEGRATION and CONSENT are runtime conditions, not composition. The pseudo key {@code any:consumes_ai} (B-08) means at least one AI service in the version.
 */
@Component
public class PlanValidator {

    public static final Set<String> INDIVIDUAL_ROLES = Set.of("BASE", "INCLUDED", "OPTIONAL");
    public static final Set<String> ORG_ROLES = Set.of("SEAT_BASE", "SEAT_INCLUDED", "SEAT_OPTIONAL", "FEE");
    private static final Set<String> INCLUDED_ROLES = Set.of("BASE", "INCLUDED", "SEAT_BASE", "SEAT_INCLUDED");
    private static final Set<String> PRICED_ROLES = Set.of("OPTIONAL", "SEAT_BASE", "SEAT_OPTIONAL", "FEE");
    private static final Set<String> OPTIONAL_ROLES = Set.of("OPTIONAL", "SEAT_OPTIONAL");
    private static final String ANY_AI = "any:consumes_ai";

    private final FeatureDefinitionRepository features;
    private final ProductRepository products;
    private final DependencyService dependencies;
    private final CatalogSettings settings;

    public PlanValidator(FeatureDefinitionRepository features, ProductRepository products, DependencyService dependencies, CatalogSettings settings) {
        this.features = features;
        this.products = products;
        this.dependencies = dependencies;
        this.settings = settings;
    }

    // ---- intervals -------------------------------------------------------------------------------------------------------

    public void checkIntervals(String audience, Iterable<String> intervals) {
        for (String raw : intervals) {
            String i = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
            if (!Set.of("MONTH", "QUARTER", "YEAR").contains(i)) {
                throw CatalogException.unprocessable("INVALID_VALUE", "A plan lists MONTH, QUARTER or YEAR; got '" + raw + "'.", Map.of("field", "intervals", "interval", String.valueOf(raw)));
            }
            if ("ORG".equals(audience) && "QUARTER".equals(i)) {
                throw CatalogException.unprocessable("ORG_QUARTER_REFUSED", "An organization is never billed quarterly (E17).", Map.of("interval", i, "audience", audience));
            }
            if ("YEAR".equals(i) && !settings.annualEnabled()) {
                throw CatalogException.unprocessable("INTERVAL_NOT_ENABLED", "Yearly billing is switched off (billing.annual.enabled).", Map.of("interval", i));
            }
            if (!settings.intervals(audience).contains(i)) {
                throw CatalogException.unprocessable("INTERVAL_NOT_ENABLED", "The " + i + " interval is not offered to " + audience + " (billing.intervals).", Map.of("interval", i, "audience", audience));
            }
        }
    }

    // ---- components ------------------------------------------------------------------------------------------------------

    /** Structure of a full component list (PUT .../components). Dependencies are judged at preview and publish, so a builder can save a half-finished draft. */
    @Transactional(readOnly = true)
    public void checkComponents(Plan plan, List<ComponentRequest> reqs) {
        boolean org = "ORG".equals(plan.getAudience());
        Set<String> roles = org ? ORG_ROLES : INDIVIDUAL_ROLES;
        Set<String> seen = new HashSet<>();
        int seatBases = 0;
        for (ComponentRequest c : reqs) {
            if (c == null || c.featureKey() == null || c.featureKey().isBlank()) {
                throw CatalogException.unprocessable("INVALID_VALUE", "Every component names a service.", Map.of("field", "featureKey"));
            }
            String key = c.featureKey().trim();
            String role = c.role() == null ? "" : c.role().trim().toUpperCase(Locale.ROOT);
            if (!roles.contains(role)) {
                throw CatalogException.unprocessable("ROLE_INVALID_FOR_AUDIENCE", "Role '" + c.role() + "' is not valid in a " + plan.getAudience() + " plan (" + String.join(", ", roles.stream().sorted().toList()) + ").", Map.of("featureKey", key, "role", String.valueOf(c.role()), "audience", plan.getAudience()));
            }
            if (!seen.add(key)) {
                throw CatalogException.unprocessable("DUPLICATE_COMPONENT", "Service " + key + " appears twice in the version.", Map.of("featureKey", key));
            }
            FeatureDefinition f = features.findByFeatureKey(key).orElseThrow(() -> CatalogException.unprocessable("INVALID_VALUE", "Unknown service " + key + ".", Map.of("field", "featureKey", "featureKey", key)));
            if (!Boolean.TRUE.equals(f.getActive())) {
                throw CatalogException.unprocessable("SERVICE_RETIRED", "Service " + key + " is retired.", Map.of("featureKey", key));
            }
            if (!audienceFits(f.getAudience(), plan.getAudience())) {
                throw CatalogException.unprocessable("ROLE_INVALID_FOR_AUDIENCE", "Service " + key + " is not offered to " + plan.getAudience() + " (it is " + f.getAudience() + ").", Map.of("featureKey", key, "audience", plan.getAudience()));
            }
            Long override = c.allowanceOverride();
            if (override != null && (override < 0 || (override == 0 && !"none".equals(f.getUsageUnit())))) {
                throw CatalogException.unprocessable("ALLOWANCE_REQUIRED", "The allowance of " + key + " must be above 0 (0 is only for a service with usageUnit none).", Map.of("featureKey", key, "field", "allowanceOverride"));
            }
            if (override == null && f.getDefaultAllowance() == null) {
                throw CatalogException.unprocessable("ALLOWANCE_REQUIRED", "Service " + key + " has no allowance: nothing is unlimited.", Map.of("featureKey", key, "field", "allowanceOverride"));
            }
            if (c.componentDiscountBp() != null && (c.componentDiscountBp() < 0 || c.componentDiscountBp() > 10_000)) {
                throw CatalogException.unprocessable("INVALID_VALUE", "componentDiscountBp must be between 0 and 10000.", Map.of("featureKey", key, "field", "componentDiscountBp"));
            }
            if (c.defaultQuantity() != null && c.defaultQuantity() < 0) {
                throw CatalogException.unprocessable("INVALID_VALUE", "defaultQuantity must not be negative.", Map.of("featureKey", key, "field", "defaultQuantity"));
            }
            if (c.marketingLabel() != null && c.marketingLabel().length() > 120) {
                throw CatalogException.unprocessable("INVALID_VALUE", "marketingLabel is at most 120 characters.", Map.of("featureKey", key, "field", "marketingLabel"));
            }
            if (PRICED_ROLES.contains(role)) {
                checkProduct(plan, key, role, c, f);
            } else if (c.productId() != null) {
                throw CatalogException.unprocessable("INVALID_VALUE", "An " + role + " service has no price of its own: leave productId empty.", Map.of("featureKey", key, "field", "productId"));
            }
            if ("SEAT_BASE".equals(role)) seatBases++;
            if (OPTIONAL_ROLES.contains(role)) checkQuantity(key, c, f);
        }
        if (seatBases > 1) throw CatalogException.unprocessable("DUPLICATE_COMPONENT", "An organization plan has exactly one seat base.", Map.of("role", "SEAT_BASE"));
    }

    private void checkProduct(Plan plan, String key, String role, ComponentRequest c, FeatureDefinition f) {
        if (c.productId() == null) {
            throw CatalogException.unprocessable("PRODUCT_REQUIRED", "A " + role + " service carries the product whose prices it sells.", Map.of("featureKey", key, "field", "productId"));
        }
        Product p = products.findById(c.productId()).orElseThrow(() -> CatalogException.unprocessable("INVALID_VALUE", "Unknown product " + c.productId() + ".", Map.of("field", "productId", "featureKey", key)));
        if (!Boolean.TRUE.equals(p.getActive())) {
            throw CatalogException.unprocessable("PRODUCT_RETIRED", "Product " + p.getCode() + " is retired.", Map.of("productId", p.getId(), "featureKey", key));
        }
        String soldTo = p.getSoldTo();
        if (soldTo != null && !"BOTH".equals(soldTo) && !soldTo.equals(plan.getAudience())) {
            throw CatalogException.unprocessable("PRODUCT_AUDIENCE_MISMATCH", "Product " + p.getCode() + " is not sold to " + plan.getAudience() + ".", Map.of("productId", p.getId(), "featureKey", key, "soldTo", soldTo));
        }
        if (p.getFeatureKey() != null && !p.getFeatureKey().equals(key)) {
            throw CatalogException.unprocessable("PRODUCT_FEATURE_MISMATCH", "Product " + p.getCode() + " belongs to service " + p.getFeatureKey() + ", not " + key + ".", Map.of("productId", p.getId(), "featureKey", key));
        }
    }

    private static void checkQuantity(String key, ComponentRequest c, FeatureDefinition f) {
        Integer max = c.maxQuantity();
        boolean stackable = Boolean.TRUE.equals(f.getStackable());
        if (max != null && max < 1) {
            throw CatalogException.unprocessable("INVALID_VALUE", "maxQuantity must be at least 1.", Map.of("featureKey", key, "field", "maxQuantity"));
        }
        if (!stackable && max != null && max > 1) {
            throw CatalogException.unprocessable("QUANTITY_LIMIT", "Service " + key + " is not stackable: maxQuantity is 1.", Map.of("featureKey", key, "max", 1));
        }
        if (stackable && max != null && f.getMaxQuantity() != null && max > f.getMaxQuantity()) {
            throw CatalogException.unprocessable("QUANTITY_LIMIT", "Service " + key + " allows at most " + f.getMaxQuantity() + " units.", Map.of("featureKey", key, "max", f.getMaxQuantity()));
        }
        if (c.defaultQuantity() != null && max != null && c.defaultQuantity() > max) {
            throw CatalogException.unprocessable("INVALID_VALUE", "defaultQuantity is above maxQuantity.", Map.of("featureKey", key, "field", "defaultQuantity"));
        }
    }

    static boolean audienceFits(String featureAudience, String planAudience) {
        return featureAudience == null || "BOTH".equals(featureAudience) || featureAudience.equals(planAudience);
    }

    // ---- publishability (everything but prices and margin) ---------------------------------------------------------------------

    /** What makes a version unpublishable regardless of prices: the structure, then the dependency rules. */
    @Transactional(readOnly = true)
    public void checkPublishable(Plan plan, PlanModel m) {
        checkStructure(plan, m);
        checkDependencies(m);
    }

    /** The base product (or seat base), the FREE rules and the interval list. */
    @Transactional(readOnly = true)
    public void checkStructure(Plan plan, PlanModel m) {
        boolean org = m.isOrg();
        if ("FREE".equals(plan.getPlanKey())) {
            if (m.baseProductCode() != null) throw CatalogException.unprocessable("FREE_PLAN_PRICED", "FREE has no base product: it never charges.", Map.of("planKey", "FREE"));
            for (PlanModel.Comp c : m.components()) {
                if (c.productCode() != null) throw CatalogException.unprocessable("FREE_PLAN_PRICED", "FREE has no priced component (" + c.featureKey() + "): a Free user is shown the plan that includes it.", Map.of("planKey", "FREE", "featureKey", c.featureKey()));
            }
        } else if (org) {
            long bases = m.components().stream().filter(c -> PlanModel.SEAT_BASE.equals(c.role())).count();
            if (bases != 1) throw CatalogException.unprocessable("BASE_PRODUCT_REQUIRED", "An organization plan has exactly one seat base (SEAT_BASE component).", Map.of("planKey", m.planKey()));
        } else if (m.baseProductCode() == null) {
            throw CatalogException.unprocessable("BASE_PRODUCT_REQUIRED", "An individual plan other than FREE sells a base product: set baseProductId.", Map.of("planKey", m.planKey()));
        }
        if (m.intervals().isEmpty() && !"FREE".equals(plan.getPlanKey())) {
            throw CatalogException.unprocessable("INVALID_VALUE", "A plan lists at least one interval.", Map.of("field", "intervals"));
        }
    }

    /** The dependency rules over the version's components. Throws the first PLAN_DEPENDENCY_MISSING. */
    public void checkDependencies(PlanModel m) {
        String audience = m.audience().name();
        Map<String, String> roleByKey = new LinkedHashMap<>();
        for (PlanModel.Comp c : m.components()) roleByKey.put(c.featureKey(), c.role());
        Map<String, FeatureDefinition> defs = new HashMap<>();
        for (String k : roleByKey.keySet()) features.findByFeatureKey(k).ifPresent(f -> defs.put(k, f));
        for (Map.Entry<String, String> e : roleByKey.entrySet()) {
            String feature = e.getKey();
            boolean featureIncluded = INCLUDED_ROLES.contains(e.getValue());
            for (DependencyDTO d : dependencies.get(feature)) {
                if (Boolean.FALSE.equals(d.active())) continue;
                String kind = d.kind();
                if (!"TECHNICAL".equals(kind) && !"COMMERCIAL".equals(kind)) continue;
                String req = d.requiresFeatureKey();
                if (ANY_AI.equals(req)) {
                    boolean any = roleByKey.entrySet().stream().anyMatch(x -> INCLUDED_ROLES.contains(x.getValue()) && defs.get(x.getKey()) != null && Boolean.TRUE.equals(defs.get(x.getKey()).getConsumesAi()));
                    if (!any) throw missing(feature, req, kind);
                    continue;
                }
                FeatureDefinition rf = features.findByFeatureKey(req).orElse(null);
                if (rf == null || !audienceFits(rf.getAudience(), audience)) continue; // B-03: the dependency does not apply to this audience
                String reqRole = roleByKey.get(req);
                boolean ok;
                if ("TECHNICAL".equals(kind) || featureIncluded) ok = reqRole != null && INCLUDED_ROLES.contains(reqRole);
                else ok = reqRole != null;
                if (!ok) throw missing(feature, req, kind);
            }
        }
    }

    private static CatalogException missing(String feature, String requires, String kind) {
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("featureKey", feature);
        extra.put("requires", requires);
        extra.put("kind", kind);
        return CatalogException.unprocessable("PLAN_DEPENDENCY_MISSING", "Service " + feature + " requires " + requires + " (" + kind + ") inside the same plan version.", extra);
    }

}
