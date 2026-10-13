package com.dossier.api.service.ent;

import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashSet;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Whether Enterprise V2 is switched on, globally or for one organization (ADR-023, X1.1). The switches are the registry
 * keys {@code flag.enterprise} (master) and {@code flag.enterprise.*} (one per phase), each a FLAG
 * {@code {on, pct, allow, deny}} whose lists hold organization ids. Evaluation, in order:
 *
 * <ol>
 *   <li>{@code on} is false: off for everyone (the master kill switch; a stored allow list does not revive it);</li>
 *   <li>the organization is in {@code deny}: off (deny always wins);</li>
 *   <li>{@code allow} is not empty: on only for the organizations listed (a pilot, e.g. the demo org);</li>
 *   <li>{@code pct} between 1 and 99: on for that percent of organizations, chosen by a fixed hash of the id, so an
 *       organization never flips between requests;</li>
 *   <li>otherwise: on for every organization.</li>
 * </ol>
 *
 * A sub-flag is effective only when the master flag is also effective for the organization. <b>Fails closed</b>: a
 * settings read that throws, a value of the wrong shape, an unknown key, or a missing organization id where one is needed
 * all answer false (the {@code OrgFeatureFlag} pattern), so an outage in settings never switches enterprise features on.
 *
 * <p>With nothing stored every flag is off ({@link EnterpriseSettingKeys}), which is why a deployment that never touches
 * these settings behaves exactly as before Enterprise V2.
 */
@Service
public class EnterpriseFeatureFlag {

    private static final Logger LOG = LoggerFactory.getLogger(EnterpriseFeatureFlag.class);

    private final ResumeBuilderSettings settings;

    public EnterpriseFeatureFlag(ResumeBuilderSettings settings) {
        this.settings = settings;
    }

    /** True when the master flag is on for at least some organization: the cheap, org-less gate used before authentication. */
    public boolean isEnabled() {
        return rule(EnterpriseSettingKeys.FLAG_ENTERPRISE).on();
    }

    /** True when enterprise features are on for {@code orgId} (the master flag). */
    public boolean isEnabled(Long orgId) {
        return rule(EnterpriseSettingKeys.FLAG_ENTERPRISE).appliesTo(orgId);
    }

    /** True when the master flag AND the sub-flag {@code flagKey} (for example {@code flag.enterprise.domains}) are on for {@code orgId}. */
    public boolean isEnabled(String flagKey, Long orgId) {
        if (flagKey == null || !flagKey.startsWith(EnterpriseSettingKeys.FLAG_ENTERPRISE)) return false;
        return isEnabled(orgId) && rule(flagKey).appliesTo(orgId);
    }

    /** True when the sub-flag {@code flagKey} is on for at least some organization (the master flag must be on too). */
    public boolean isEnabledAnywhere(String flagKey) {
        if (flagKey == null || !flagKey.startsWith(EnterpriseSettingKeys.FLAG_ENTERPRISE)) return false;
        return isEnabled() && rule(flagKey).on();
    }

    private Rule rule(String key) {
        try {
            JsonNode n = settings.getJson(key, JsonNode.class);
            return Rule.parse(n);
        } catch (RuntimeException e) {
            LOG.warn("Enterprise flag {} could not be read ({}); treating it as off", key, e.getClass().getSimpleName());
            return Rule.OFF;
        }
    }

    /** A parsed FLAG value. Package-private so the evaluation is unit-testable without settings. */
    record Rule(boolean on, int pct, Set<Long> allow, Set<Long> deny) {
        static final Rule OFF = new Rule(false, 0, Set.of(), Set.of());

        static Rule parse(JsonNode n) {
            if (n == null || !n.isObject() || !n.has("on") || !n.get("on").isBoolean()) return OFF;
            JsonNode pct = n.get("pct");
            int p = pct != null && pct.isInt() ? pct.intValue() : 0;
            if (p < 0 || p > 100) return OFF; // a malformed percentage is not guessed at
            Set<Long> allow = ids(n.get("allow"));
            Set<Long> deny = ids(n.get("deny"));
            if (allow == null || deny == null) return OFF;
            return new Rule(n.get("on").booleanValue(), p, allow, deny);
        }

        /** The organization ids in a list; null when an entry is not an id (the whole flag then fails closed). */
        private static Set<Long> ids(JsonNode list) {
            if (list == null || list.isNull()) return Set.of();
            if (!list.isArray()) return null;
            Set<Long> out = new HashSet<>();
            for (JsonNode e : list) {
                Long id = null;
                if (e.isIntegralNumber() && e.canConvertToLong()) id = e.longValue();
                else if (e.isTextual()) {
                    try {
                        id = Long.valueOf(e.textValue().trim());
                    } catch (NumberFormatException ignored) {
                        // falls through to the null check
                    }
                }
                if (id == null || id <= 0) return null;
                out.add(id);
            }
            return out;
        }

        boolean appliesTo(Long orgId) {
            if (!on) return false;
            if (orgId != null && deny.contains(orgId)) return false;
            if (!allow.isEmpty()) return orgId != null && allow.contains(orgId);
            if (pct > 0 && pct < 100) return orgId != null && bucket(orgId) < pct;
            return true;
        }

        /** A stable 0..99 bucket for an organization id (a multiplicative hash so consecutive ids spread out). */
        static int bucket(long orgId) {
            long h = orgId * 0x9E3779B97F4A7C15L;
            return (int) Long.remainderUnsigned(h ^ (h >>> 32), 100);
        }
    }
}
