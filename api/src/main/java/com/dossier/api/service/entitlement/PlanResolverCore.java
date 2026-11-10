package com.dossier.api.service.entitlement;

import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.entitlement.EntitlementSet.AiBudgetWindow;
import com.dossier.api.service.entitlement.EntitlementSet.Grant;
import com.dossier.api.service.entitlement.EntitlementSet.Source;
import com.dossier.api.service.entitlement.EntitlementSet.SubscriptionState;
import com.dossier.api.service.entitlement.PlanData.CompLine;
import com.dossier.api.service.entitlement.PlanData.Component;
import com.dossier.api.service.entitlement.PlanData.FeatureDef;
import com.dossier.api.service.entitlement.PlanData.LicenseFeatureLine;
import com.dossier.api.service.entitlement.PlanData.PlanVersionData;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * The pure core of the entitlement resolver (story K7.1, docs/subscriptions/06-entitlements-and-enforcement.md section 2): plain data in, an
 * {@link EntitlementSet} out. No repository, no clock, no Spring bean, so the whole status x period x interval x add-on matrix is unit-testable without a
 * database. {@link PlanResolver} loads the data and calls this.
 *
 * <p>The personal rules, generalised from {@link EntitlementService#isProFor}: {@code active|trialing} is ACTIVE; {@code past_due|canceled} stay entitled
 * until the period end and then lapse to the Free set; everything else is the Free set immediately. Add-ons add services on top of the plan; a service
 * flagged additive adds to its limit instead of taking the larger value.
 */
public final class PlanResolverCore {

    /** Quarterly AI budgets that are NOT three times the monthly cap (decision E-2): Pro 800 (not 900), Autopilot 1600 (not 1800), in cents. */
    public static final Map<String, Integer> QUARTERLY_AI_CENTS = Map.of("PRO", 800, "AUTOPILOT", 1600);

    public static final String CAP_AI_SERVER = FeatureKeys.Capability.AI_SERVER;

    /** Everything the personal reader needs, already loaded. */
    public record PersonalInputs(
        String login,
        boolean enterpriseAccount,
        String status,
        Instant periodStart,
        Instant periodEnd,
        boolean cancelAtPeriodEnd,
        String interval,
        PlanVersionData subscriptionVersion,
        PlanVersionData freeVersion,
        List<PersonalAddonSource.Addon> addons,
        List<CompLine> comps,
        Map<String, FeatureDef> features,
        Map<String, Integer> quarterlyAiCents
    ) {
        public PersonalInputs {
            addons = addons == null ? List.of() : List.copyOf(addons);
            comps = comps == null ? List.of() : List.copyOf(comps);
            features = features == null ? Map.of() : Map.copyOf(features);
            quarterlyAiCents = quarterlyAiCents == null ? QUARTERLY_AI_CENTS : Map.copyOf(quarterlyAiCents);
        }
    }

    /** Everything the organization reader needs, already loaded. */
    public record OrgInputs(
        long orgId,
        long memberId,
        String licenseStatus,
        Instant licenseStartsAt,
        Instant licenseEndsAt,
        PlanVersionData planVersion,
        List<LicenseFeatureLine> licenseFeatures,
        Map<String, FeatureDef> features
    ) {
        public OrgInputs {
            licenseFeatures = licenseFeatures == null ? List.of() : List.copyOf(licenseFeatures);
            features = features == null ? Map.of() : Map.copyOf(features);
        }
    }

    private PlanResolverCore() {}

    // ------------------------------------------------------------------------------------------------ personal

    /** The subscription state for a Stripe status, the paid period's end and the clock. */
    public static SubscriptionState personalState(String status, Instant periodEnd, boolean cancelAtPeriodEnd, Instant now) {
        if (status == null) return SubscriptionState.NONE;
        String s = status.trim().toLowerCase();
        return switch (s) {
            case "active", "trialing" -> cancelAtPeriodEnd ? SubscriptionState.CANCEL_PENDING : SubscriptionState.ACTIVE;
            case "past_due" -> periodEnd != null && periodEnd.isAfter(now) ? SubscriptionState.PAST_DUE_ENTITLED : SubscriptionState.PAST_DUE_LAPSED;
            case "canceled" -> periodEnd != null && periodEnd.isAfter(now) ? SubscriptionState.CANCEL_PENDING : SubscriptionState.NONE;
            default -> SubscriptionState.NONE;
        };
    }

    /** Resolve a personal account. An enterprise account has no personal plan: 404 (decision O4). */
    public static EntitlementSet resolvePersonal(PersonalInputs in, Instant now) {
        if (in.enterpriseAccount()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found");
        SubscriptionState state = personalState(in.status(), in.periodEnd(), in.cancelAtPeriodEnd(), now);
        boolean entitled = state.entitled() && in.subscriptionVersion() != null;
        PlanVersionData base = entitled ? in.subscriptionVersion() : in.freeVersion();

        Acc acc = new Acc(in.features());
        List<PlanVersionData> versions = new ArrayList<>();
        if (base != null) {
            versions.add(base);
            for (Component c : base.components()) {
                if (c.included()) acc.grant(c, Source.PLAN_INCLUDED, 1, null);
            }
        }
        // comps and referrals: "highest wins" inside the personal context; the sets are merged (a comp can only add), the label is the richest plan
        for (CompLine comp : in.comps()) {
            if (comp.version() == null || !within(comp.startsAt(), comp.endsAt(), now)) continue;
            versions.add(comp.version());
            for (Component c : comp.version().components()) {
                if (c.included()) acc.grant(c, Source.ADMIN_COMP, 1, comp.endsAt());
            }
        }
        // add-ons only apply while the plan they sit on does
        if (entitled) {
            for (PersonalAddonSource.Addon a : in.addons()) {
                if (!within(a.startsAt(), a.endsAt(), now) || a.quantity() <= 0) continue;
                FeatureDef def = in.features().get(a.featureKey());
                if (def == null) continue;
                acc.grantAddon(def, Source.ADDON, a.quantity(), a.endsAt());
            }
        }

        PlanVersionData top = base;
        for (PlanVersionData v : versions) {
            if (top == null || v.includedCount() > top.includedCount()) top = v;
        }

        String interval = entitled ? in.interval() : null;
        AiBudgetWindow window = acc.capabilities.contains(CAP_AI_SERVER)
            ? aiWindow(versions, top, acc, interval, entitled ? in.periodStart() : null, entitled ? in.periodEnd() : null, in.quarterlyAiCents(), now)
            : null;
        return new EntitlementSet(
            top == null ? "FREE" : top.planKey(),
            top == null ? null : top.id(),
            interval,
            entitled ? in.periodStart() : null,
            entitled ? in.periodEnd() : null,
            acc.features,
            acc.capabilities,
            acc.limits(),
            window,
            state
        );
    }

    // ------------------------------------------------------------------------------------------------ organization

    /** Resolve one consultant seat from its license on the organization's plan version (06 section 2, Org). */
    public static EntitlementSet resolveOrg(OrgInputs in, Instant now) {
        SubscriptionState state = orgState(in.licenseStatus(), in.licenseStartsAt(), in.licenseEndsAt(), now);
        Acc acc = new Acc(in.features());
        if (state.entitled()) {
            if (in.planVersion() != null) {
                for (Component c : in.planVersion().components()) {
                    if (c.seatIncluded()) acc.grant(c, Source.SEAT_INCLUDED, 1, in.licenseEndsAt());
                }
            }
            for (LicenseFeatureLine f : in.licenseFeatures()) {
                if (!f.live() || !within(f.startsAt(), f.endsAt(), now)) continue;
                FeatureDef def = in.features().get(f.featureKey());
                if (def == null) continue;
                acc.grantAddon(def, Source.SEAT_ADDON, Math.max(1, f.quantity()), f.endsAt(), f.allowanceOverride());
            }
        }
        PlanVersionData pv = in.planVersion();
        return new EntitlementSet(
            pv == null ? "ORG_STANDARD" : pv.planKey(),
            pv == null ? null : pv.id(),
            null,
            in.licenseStartsAt(),
            in.licenseEndsAt(),
            acc.features,
            acc.capabilities,
            acc.limits(),
            null,
            state
        );
    }

    /** ACTIVE and CANCEL_AT_PERIOD_END licenses grant; SUSPENDED is its own state; everything else grants nothing. */
    static SubscriptionState orgState(String status, Instant startsAt, Instant endsAt, Instant now) {
        if (status == null) return SubscriptionState.NONE;
        if (!within(startsAt, endsAt, now)) return SubscriptionState.NONE;
        return switch (status) {
            case "ACTIVE" -> SubscriptionState.ACTIVE;
            case "CANCEL_AT_PERIOD_END" -> SubscriptionState.CANCEL_PENDING;
            case "SUSPENDED" -> SubscriptionState.SUSPENDED;
            default -> SubscriptionState.NONE;
        };
    }

    // ------------------------------------------------------------------------------------------------ AI window

    /**
     * The AI budget window (06 section 6, decisions E-2 and S-10): monthly cap x 1 on a monthly term; a pooled quarterly budget (explicit per plan:
     * Pro 800, Autopilot 1600) on a quarterly term; a monthly sub-window inside the term on a yearly one. Each add-on credit adds its own cents (75) x quantity
     * x the same factor. Without a usable period end the window is the calendar month, as it has always been.
     */
    static AiBudgetWindow aiWindow(
        List<PlanVersionData> versions,
        PlanVersionData top,
        Acc acc,
        String interval,
        Instant periodStart,
        Instant periodEnd,
        Map<String, Integer> quarterly,
        Instant now
    ) {
        long monthlyCap = versions.stream().mapToLong(PlanVersionData::aiBudgetCapCents).max().orElse(0);
        long credits = acc.addonAiCentsPerMonth;
        boolean quarter = "QUARTER".equals(interval);
        long budget;
        if (quarter) {
            long explicit = top == null ? -1 : quarterly.getOrDefault(top.planKey(), -1);
            budget = (explicit >= 0 ? explicit : monthlyCap * 3) + credits * 3;
        } else {
            budget = monthlyCap + credits;
        }
        String label = interval == null ? "MONTH" : interval;
        if (periodEnd == null || !periodEnd.isAfter(now)) {
            return new AiBudgetWindow(budget, monthStart(now), nextMonthStart(now), label);
        }
        if ("YEAR".equals(interval)) {
            ZonedDateTime end = periodEnd.atZone(ZoneOffset.UTC);
            ZonedDateTime termStart = periodStart != null ? periodStart.atZone(ZoneOffset.UTC) : end.minusMonths(12);
            ZonedDateTime n = now.atZone(ZoneOffset.UTC);
            long k = Math.max(0, java.time.temporal.ChronoUnit.MONTHS.between(termStart, n));
            ZonedDateTime subStart = termStart.plusMonths(k);
            ZonedDateTime subEnd = termStart.plusMonths(k + 1);
            if (subEnd.isAfter(end)) subEnd = end;
            return new AiBudgetWindow(budget, subStart.toInstant(), subEnd.toInstant(), label);
        }
        Instant start = periodStart != null ? periodStart : periodEnd.atZone(ZoneOffset.UTC).minusMonths(quarter ? 3 : 1).toInstant();
        return new AiBudgetWindow(budget, start.isAfter(now) ? now : start, periodEnd, label);
    }

    static Instant monthStart(Instant now) {
        return YearMonth.from(now.atZone(ZoneOffset.UTC)).atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant();
    }

    static Instant nextMonthStart(Instant now) {
        return YearMonth.from(now.atZone(ZoneOffset.UTC)).plusMonths(1).atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant();
    }

    static boolean within(Instant start, Instant end, Instant now) {
        return (start == null || !start.isAfter(now)) && (end == null || end.isAfter(now));
    }

    // ------------------------------------------------------------------------------------------------ accumulator

    /** Collects granted features, capabilities and limits while a set is built. */
    static final class Acc {

        final Map<String, FeatureDef> defs;
        final Map<String, Grant> features = new LinkedHashMap<>();
        final Set<String> capabilities = new HashSet<>();
        final Map<String, Long> maxLimits = new LinkedHashMap<>();
        final Map<String, Long> additiveLimits = new LinkedHashMap<>();
        long addonAiCentsPerMonth = 0;

        Acc(Map<String, FeatureDef> defs) {
            this.defs = defs;
        }

        /** A plan component (included service) with the plan's own numbers. */
        void grant(Component c, Source source, int quantity, Instant endsAt) {
            FeatureDef def = defs.get(c.featureKey());
            if (def == null) return;
            long value = c.allowanceOverride() != null ? c.allowanceOverride() : def.defaultAllowance();
            if (def.limitKey() != null && c.limitOverrides().containsKey(def.limitKey())) value = c.limitOverrides().get(def.limitKey());
            record(def, source, quantity, value, endsAt);
            if (def.limitKey() != null) maxLimits.merge(def.limitKey(), value, Math::max);
            c.limitOverrides().forEach((k, v) -> {
                if (!k.equals(def.limitKey())) maxLimits.merge(k, v, Math::max);
            });
        }

        void grantAddon(FeatureDef def, Source source, int quantity, Instant endsAt) {
            grantAddon(def, source, quantity, endsAt, null);
        }

        /** An add-on or license feature: {@code quantity} units; an additive service adds its allowance x quantity to the limit. */
        void grantAddon(FeatureDef def, Source source, int quantity, Instant endsAt, Long allowanceOverride) {
            long unit = allowanceOverride != null ? allowanceOverride : def.defaultAllowance();
            record(def, source, quantity, unit * quantity, endsAt);
            if (def.limitKey() != null) {
                if (def.additive()) additiveLimits.merge(def.limitKey(), unit * quantity, Long::sum);
                else maxLimits.merge(def.limitKey(), unit, Math::max);
            }
            if (source == Source.ADDON) addonAiCentsPerMonth += (long) def.aiBudgetCents() * quantity;
        }

        private void record(FeatureDef def, Source source, int quantity, long allowance, Instant endsAt) {
            features.putIfAbsent(def.key(), new Grant(source, quantity, allowance, endsAt));
            capabilities.addAll(def.capabilities());
        }

        Map<String, Long> limits() {
            Map<String, Long> out = new LinkedHashMap<>(maxLimits);
            additiveLimits.forEach((k, v) -> out.merge(k, v, Long::sum));
            return out;
        }
    }
}
