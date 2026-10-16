package com.dossier.api.service.catalog;

import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.catalog.dto.ServiceDTO;
import com.dossier.api.service.catalog.dto.ServiceRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The catalog's services: one {@code feature_definition} row per thing we can switch on and meter, for individuals and organizations alike
 * (docs/subscriptions/02-unified-product-model.md section 2; story K1.1). Rules, all enforced here and not in the database:
 *
 * <ul>
 *   <li>the key is lower-case dotted ({@code ai.resume_tailoring}), chosen once and immutable;</li>
 *   <li>nothing is unlimited: the allowance is required, and 0 is only for {@code usageUnit = none} (a pure access service);</li>
 *   <li>a stackable service may be bought more than once (up to {@code maxQuantity}); a non-stackable one never has a quantity above 1;</li>
 *   <li>a service cannot be retired while a PUBLISHED plan version still includes it;</li>
 *   <li>every write leaves a {@code catalog_change} row and an {@code admin_audit_event} row; a retirement is HIGH and needs a reason.</li>
 * </ul>
 *
 * Retired services stay in the table with {@code active = false}: plan versions and invoices keep pointing at them. Prices are not here.
 */
@Service
public class ServiceService {

    public static final Pattern KEY = Pattern.compile("[a-z][a-z0-9_]{0,29}(\\.[a-z][a-z0-9_]{0,29}){1,3}");
    public static final Set<String> AUDIENCES = Set.of("INDIVIDUAL", "ORG", "BOTH");
    public static final Set<String> CATEGORIES = Set.of(
        "BASE", "AUTOFILL", "RESUME", "MATCHING", "EMAIL", "MARKETING", "INTERVIEW", "ALERTS", "ANALYTICS", "AUTOMATION", "AI_CREDITS", "SYNC", "SUPPORT", "MODULE", "FEE"
    );
    public static final Set<String> PERIODS = Set.of("PERIOD", "MONTH", "DAY");
    public static final Set<String> POOL_MODES = Set.of("PER_CONSULTANT", "ORG_POOL");
    public static final Set<String> VISIBILITIES = Set.of("PUBLIC", "ADMIN_ONLY", "HIDDEN");
    private static final Pattern ENTITLEMENT_KEY = Pattern.compile("[a-z][a-z0-9_]{0,39}(\\.[a-z][a-z0-9_]{0,39}){0,2}");
    private static final Pattern LIMIT_KEY = Pattern.compile("[a-z][a-z0-9_]{0,19}(\\.[a-z][a-z0-9_]{0,19}){0,2}");
    private static final Pattern UNIT = Pattern.compile("[a-z][a-z_]{0,23}");

    private final FeatureDefinitionRepository services;
    private final LivePlanLookup livePlans;
    private final CatalogChangeRecorder changes;
    private final AdminAuditService audit;
    private final ObjectMapper mapper;

    public ServiceService(FeatureDefinitionRepository services, LivePlanLookup livePlans, CatalogChangeRecorder changes, AdminAuditService audit, ObjectMapper mapper) {
        this.services = services;
        this.livePlans = livePlans;
        this.changes = changes;
        this.audit = audit;
        this.mapper = mapper;
    }

    /** Every service in display order, optionally filtered; {@code active} null = both. */
    @Transactional(readOnly = true)
    public List<ServiceDTO> list(String audience, String category, Boolean active, String q) {
        String needle = q == null || q.isBlank() ? null : q.trim().toLowerCase(Locale.ROOT);
        List<ServiceDTO> out = new ArrayList<>();
        for (FeatureDefinition d : services.findAllByOrderBySortOrderAsc()) {
            if (audience != null && !audience.isBlank() && !matchesAudience(d.getAudience(), audience.trim().toUpperCase(Locale.ROOT))) continue;
            if (category != null && !category.isBlank() && !category.trim().equalsIgnoreCase(d.getCategory())) continue;
            if (active != null && !active.equals(d.getActive())) continue;
            if (needle != null && !(d.getFeatureKey().toLowerCase(Locale.ROOT).contains(needle) || d.getName().toLowerCase(Locale.ROOT).contains(needle))) continue;
            out.add(ServiceDTO.from(d, mapper));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public ServiceDTO get(String key) {
        return ServiceDTO.from(require(key), mapper);
    }

    @Transactional
    public ServiceDTO create(ServiceRequest r) {
        if (r == null || r.key() == null || !KEY.matcher(r.key()).matches() || r.key().length() > 60) {
            throw CatalogException.unprocessable("KEY_FORMAT", "A service key is lower-case and dotted, such as ai.resume_tailoring.", Map.of("pattern", KEY.pattern()));
        }
        if (services.findByFeatureKey(r.key()).isPresent()) {
            throw CatalogException.conflict("KEY_EXISTS", "A service with key " + r.key() + " already exists.", Map.of("key", r.key()));
        }
        FeatureDefinition d = new FeatureDefinition();
        d.setFeatureKey(r.key());
        d.setCreatedAt(Instant.now());
        d.setActive(true);
        d.setDemoData(false);
        apply(d, r);
        d = services.save(d);
        ServiceDTO after = ServiceDTO.from(d, mapper);
        changes.record(CatalogChangeRecorder.ENTITY_FEATURE_DEFINITION, d.getFeatureKey(), null, after, r.reason());
        audit.record(AdminAuditService.CATALOG_SERVICE_CREATE, AdminAuditService.TARGET_CATALOG, d.getFeatureKey(), r.reason(), "risk=MEDIUM service=" + d.getFeatureKey() + " audience=" + d.getAudience());
        return after;
    }

    @Transactional
    public ServiceDTO update(String key, ServiceRequest r) {
        FeatureDefinition d = require(key);
        if (r != null && r.key() != null && !r.key().equals(key)) {
            throw CatalogException.unprocessable("KEY_IMMUTABLE", "A service key never changes; retire the service and create a new one.", Map.of("key", key));
        }
        if (!Boolean.TRUE.equals(d.getActive())) {
            throw CatalogException.conflict("SERVICE_RETIRED", "Service " + key + " is retired and cannot be edited.", Map.of("key", key));
        }
        ServiceDTO before = ServiceDTO.from(d, mapper);
        apply(d, r);
        d = services.save(d);
        ServiceDTO after = ServiceDTO.from(d, mapper);
        changes.record(CatalogChangeRecorder.ENTITY_FEATURE_DEFINITION, key, before, after, r == null ? null : r.reason());
        audit.record(AdminAuditService.CATALOG_SERVICE_UPDATE, AdminAuditService.TARGET_CATALOG, key, r == null ? null : r.reason(), "risk=MEDIUM service=" + key);
        return after;
    }

    /** Retire a service (HIGH: a reason of ten characters or more). Refused with the plan keys while a PUBLISHED plan version includes it. */
    @Transactional
    public ServiceDTO retire(String key, String reason) {
        FeatureDefinition d = require(key);
        if (reason == null || reason.trim().length() < CatalogException.REASON_MIN_LENGTH) {
            throw CatalogException.unprocessable("REASON_REQUIRED", "Retiring a service needs a reason of at least " + CatalogException.REASON_MIN_LENGTH + " characters.", Map.of("minLength", CatalogException.REASON_MIN_LENGTH));
        }
        List<String> plans = livePlans.planKeysUsingService(key);
        if (!plans.isEmpty()) {
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("key", key);
            extra.put("planKeys", plans);
            throw CatalogException.conflict("SERVICE_IN_LIVE_PLAN", "Service " + key + " is still included in the published plan(s) " + String.join(", ", plans) + ".", extra);
        }
        if (!Boolean.TRUE.equals(d.getActive())) return ServiceDTO.from(d, mapper); // already retired: idempotent
        ServiceDTO before = ServiceDTO.from(d, mapper);
        d.setActive(false);
        d.setUpdatedAt(Instant.now());
        d.setUpdatedBy(SecurityUtils.getCurrentUserLogin().orElse("system"));
        d = services.save(d);
        ServiceDTO after = ServiceDTO.from(d, mapper);
        changes.record(CatalogChangeRecorder.ENTITY_FEATURE_DEFINITION, key, before, after, reason.trim());
        audit.record(AdminAuditService.CATALOG_SERVICE_RETIRE, AdminAuditService.TARGET_CATALOG, key, reason.trim(), "risk=HIGH service=" + key);
        return after;
    }

    // ---- validation and mapping ------------------------------------------------

    private FeatureDefinition require(String key) {
        return services.findByFeatureKey(key).orElseThrow(() -> CatalogException.notFound("service", String.valueOf(key)));
    }

    private static boolean matchesAudience(String serviceAudience, String wanted) {
        return "BOTH".equals(serviceAudience) || "BOTH".equals(wanted) || serviceAudience.equals(wanted);
    }

    private void apply(FeatureDefinition d, ServiceRequest r) {
        if (r == null) throw CatalogException.unprocessable("INVALID_VALUE", "A service body is required.");
        if (r.name() == null || r.name().isBlank() || r.name().length() > 80) {
            throw CatalogException.unprocessable("NAME_REQUIRED", "A service has a customer-facing name of 1 to 80 characters.", Map.of("field", "name"));
        }
        if (r.description() != null && r.description().length() > 300) throw invalid("description", "at most 300 characters");
        String unit = r.usageUnit() == null || r.usageUnit().isBlank() ? "none" : r.usageUnit().trim();
        if (!UNIT.matcher(unit).matches()) throw invalid("usageUnit", "lower-case letters and underscores, at most 24 characters");
        if (r.defaultAllowance() == null) {
            throw CatalogException.unprocessable("ALLOWANCE_REQUIRED", "Nothing is unlimited: set the allowance (0 only for a service with usageUnit none).", Map.of("field", "defaultAllowance"));
        }
        if (r.defaultAllowance() < 0 || (r.defaultAllowance() == 0 && !"none".equals(unit))) {
            throw CatalogException.unprocessable("ALLOWANCE_REQUIRED", "The allowance must be above 0 (0 is only for a service with usageUnit none).", Map.of("field", "defaultAllowance"));
        }
        String audience = oneOf("audience", r.audience(), AUDIENCES, d.getAudience() == null ? "ORG" : d.getAudience());
        String category = r.category() == null || r.category().isBlank() ? null : oneOf("category", r.category(), CATEGORIES, null);
        String period = oneOf("allowancePeriod", r.allowancePeriod(), PERIODS, "MONTH");
        String pool = oneOf("poolMode", r.poolMode(), POOL_MODES, "PER_CONSULTANT");
        String visibility = oneOf("visibility", r.visibility(), VISIBILITIES, "PUBLIC");
        int ai = r.aiBudgetCents() == null ? 0 : r.aiBudgetCents();
        if (ai < 0 || ai > 100_000) throw invalid("aiBudgetCents", "between 0 and 100000");
        int ttl = r.reserveTtlSeconds() == null ? 900 : r.reserveTtlSeconds();
        if (ttl < 30 || ttl > 86_400) throw invalid("reserveTtlSeconds", "between 30 and 86400");
        boolean stackable = Boolean.TRUE.equals(r.stackable());
        Integer max = r.maxQuantity();
        if (max != null && (max < 1 || max > 1000)) throw invalid("maxQuantity", "between 1 and 1000");
        if (!stackable && max != null && max > 1) throw invalid("maxQuantity", "above 1 only when the service is stackable");
        if (r.limitKey() != null && !r.limitKey().isBlank() && !LIMIT_KEY.matcher(r.limitKey()).matches()) throw invalid("limitKey", "a dotted lower-case limit key such as resumes.max");
        if (Boolean.TRUE.equals(r.additive()) && (r.limitKey() == null || r.limitKey().isBlank())) throw invalid("additive", "an additive service needs a limitKey to add to");
        if (r.sortOrder() != null && (r.sortOrder() < 0 || r.sortOrder() > 32000)) throw invalid("sortOrder", "between 0 and 32000");
        List<String> entitlementKeys = r.entitlementKeys() == null ? List.of() : r.entitlementKeys();
        for (String k : entitlementKeys) {
            if (k == null || !ENTITLEMENT_KEY.matcher(k).matches()) throw invalid("entitlementKeys", "dotted lower-case capability keys such as ai.server");
        }
        if (r.eligibility() != null && !r.eligibility().isNull() && !r.eligibility().isObject()) throw invalid("eligibility", "a JSON object");

        d.setName(r.name().trim());
        d.setDescription(blankToNull(r.description()));
        d.setUsageUnit(unit);
        boolean consumesAi = Boolean.TRUE.equals(r.consumesAi());
        d.setUsageType(r.usageType() != null && !r.usageType().isBlank() ? r.usageType().trim().toUpperCase(Locale.ROOT) : consumesAi || ai > 0 ? "AI_FEATURE" : category != null ? category : "PRODUCTIVITY");
        if (d.getUsageType().length() > 20) throw invalid("usageType", "at most 20 characters");
        d.setDefaultAllowance(r.defaultAllowance());
        d.setAllowancePeriod(period);
        d.setAudience(audience);
        d.setCategory(category);
        d.setPoolMode(pool);
        d.setAiBudgetCents(ai);
        d.setConsumesAi(consumesAi);
        d.setReserveTtlSeconds(ttl);
        d.setStackable(stackable);
        d.setMaxQuantity(max);
        d.setAdditive(Boolean.TRUE.equals(r.additive()));
        d.setEligibilityJson(r.eligibility() == null || r.eligibility().isNull() ? null : write(r.eligibility()));
        d.setEntitlementKeysJson(entitlementKeys.isEmpty() ? null : write(entitlementKeys));
        d.setLimitKey(blankToNull(r.limitKey()));
        d.setVisibility(visibility);
        d.setIconKey(blankToNull(r.iconKey()));
        if (r.sortOrder() != null) d.setSortOrder(r.sortOrder());
        d.setUpdatedAt(Instant.now());
        d.setUpdatedBy(SecurityUtils.getCurrentUserLogin().orElse("system"));
    }

    private static String oneOf(String field, String value, Set<String> allowed, String fallback) {
        if (value == null || value.isBlank()) {
            if (fallback == null) throw invalid(field, "one of " + allowed);
            return fallback;
        }
        String v = value.trim().toUpperCase(Locale.ROOT);
        if (!allowed.contains(v)) throw CatalogException.unprocessable("INVALID_VALUE", field + " must be one of " + allowed, Map.of("field", field, "allowed", List.copyOf(allowed)));
        return v;
    }

    private static CatalogException invalid(String field, String expected) {
        return CatalogException.unprocessable("INVALID_VALUE", field + " must be " + expected + ".", Map.of("field", field));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private String write(Object o) {
        try {
            return mapper.writeValueAsString(o instanceof JsonNode n ? n : o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
