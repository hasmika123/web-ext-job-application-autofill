package com.dossier.api.service.settings;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.AdminSettingsWriter.Risk;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import com.dossier.api.service.ResumeBuilderSettingKeys.Type;
import com.dossier.api.service.ResumeBuilderSettings;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/** The settings registry (A5.1): every key typed, bounded, in an area, with a risk; no duplicates; no secret. */
class SettingDefinitionsTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private static Key key(String name) {
        Key k = SettingDefinitions.find(name);
        assertThat(k).as("key %s", name).isNotNull();
        return k;
    }

    @Test
    void everyKeyHasATypeADescriptionAnAreaAndARiskAndAValidDefault() {
        assertThat(SettingDefinitions.all()).hasSizeGreaterThan(250);
        for (Key k : SettingDefinitions.all()) {
            assertThat(k.type()).as(k.key()).isNotNull();
            assertThat(k.description()).as("description of %s", k.key()).isNotBlank();
            assertThat(k.area()).as("area of %s", k.key()).isNotBlank().isEqualTo(Key.areaOf(k.key()));
            assertThat(k.risk()).as("risk of %s", k.key()).isNotNull();
            assertThat(k.key().length()).as("%s fits the 100-char column", k.key()).isLessThanOrEqualTo(100);
            assertThat(ResumeBuilderSettings.isValid(k, k.defaultValue(), mapper)).as("default of %s is valid", k.key()).isTrue();
            if (k.type() == Type.INT || k.type() == Type.DECIMAL) {
                assertThat(k.min()).as("min of %s", k.key()).isNotNull();
                assertThat(k.max()).as("max of %s", k.key()).isNotNull();
            }
            if (k.type() == Type.ENUM) assertThat(k.allowed()).as("allowed of %s", k.key()).isNotEmpty();
        }
    }

    @Test
    void noKeyIsDeclaredTwiceAcrossTheThreeSources() {
        Set<String> seen = new HashSet<>();
        for (Key k : SettingDefinitions.all()) assertThat(seen.add(k.key())).as("duplicate %s", k.key()).isTrue();
        // the registry is the union: nothing a source declares is missing from it
        for (Key k : ResumeBuilderSettingKeys.all()) assertThat(seen).contains(k.key());
        for (Key k : AdminSettingKeys.all()) assertThat(seen).contains(k.key());
    }

    @Test
    void thePlanTableKeysExistWithTheirDefaultsBoundsAndRisks() {
        assertKey("jobs.match_threshold", "60", 40, 90, Risk.MEDIUM);
        assertKey("jobs.candidates_per_user", "50", 10, 100, Risk.MEDIUM);
        assertKey("jobs.posting_age_hours", "48", 12, 168, Risk.LOW);
        assertKey("jobs.daily_target", "15", 3, 20, Risk.LOW);
        assertKey("jobs.disable_after_failures", "5", 2, 20, Risk.LOW);
        assertKey("inbox.poll_minutes", "15", 5, 120, Risk.MEDIUM);
        assertKey("inbox.retention_days", "365", 30, 730, Risk.HIGH);
        assertKey("ops.error_digest.interval_min", "15", 5, 120, Risk.LOW);
        assertKey("email.daily_send_cap", "250", 50, 10000, Risk.MEDIUM);
        assertKey("ai.daily_cost_cap_cents", "4000", 500, 50000, Risk.HIGH);
        assertKey("ai.monthly_cost_cap_cents", "60000", 5000, 500000, Risk.HIGH);
        assertKey("ai.free_parse_reserved_pct", "10", 0, 50, Risk.HIGH);
        assertKey("admin.comp_max_days.support", "30", 1, 365, Risk.MEDIUM);
        assertKey("admin.comp_max_days.finance", "90", 1, 365, Risk.MEDIUM);
        assertKey("admin.comp_reauth_days", "30", 1, 365, Risk.MEDIUM);
        assertKey("admin.support_access_hours", "24", 1, 72, Risk.MEDIUM);
        assertKey("admin.debug_session_fills", "5", 1, 20, Risk.MEDIUM);
        assertKey("admin.debug_session_hours", "48", 1, 168, Risk.MEDIUM);
        assertKey("security.failed_login_block_threshold", "20", 5, 100, Risk.HIGH);
        assertKey("security.ip_block_hours", "1", 1, 24, Risk.MEDIUM);
        assertKey("security.event_retention_days", "400", 30, 730, Risk.MEDIUM);
        assertKey("analytics.conversion_window_days", "30", 7, 90, Risk.MEDIUM);
        assertKey("catalog.cap_hit_alert_pct", "5", 1, 50, Risk.MEDIUM);
        assertKey("catalog.stripe.pct_bp", "290", 0, 1000, Risk.LOW);
        assertKey("catalog.stripe.fixed_cents", "30", 0, 100, Risk.LOW);
        assertKey("catalog.margin_floor_subscription_pct", "80", 80, 95, Risk.HIGH);
        assertKey("catalog.margin_floor_service_pct", "20", 20, 60, Risk.HIGH);
        assertThat(key("ops.error_digest.to").type()).isEqualTo(Type.STRING);
        assertThat(key("ext.min_version").risk()).isEqualTo(Risk.HIGH);
        assertThat(key("ops.maintenance").risk()).isEqualTo(Risk.HIGH);
    }

    private void assertKey(String name, String def, int min, int max, Risk risk) {
        Key k = key(name);
        assertThat(k.type()).as(name).isEqualTo(Type.INT);
        assertThat(k.defaultValue()).as("default of %s", name).isEqualTo(def);
        assertThat(k.min()).as("min of %s", name).isEqualTo((double) min);
        assertThat(k.max()).as("max of %s", name).isEqualTo((double) max);
        assertThat(k.risk()).as("risk of %s", name).isEqualTo(risk);
    }

    @Test
    void theMarginFloorsCannotGoBelowTheirHardMinimums() {
        assertThat(ResumeBuilderSettings.isValid(key("catalog.margin_floor_subscription_pct"), "79", mapper)).isFalse();
        assertThat(ResumeBuilderSettings.isValid(key("catalog.margin_floor_subscription_pct"), "80", mapper)).isTrue();
        assertThat(ResumeBuilderSettings.isValid(key("catalog.margin_floor_service_pct"), "19", mapper)).isFalse();
        assertThat(ResumeBuilderSettings.isValid(key("catalog.margin_floor_service_pct"), "20", mapper)).isTrue();
    }

    @Test
    void everyRateLimitKeyIsHighWithTheQ3Defaults() {
        List<String> names = List.of("authenticate", "mfa", "google", "refresh", "inquiries", "bug_reports", "newsletter");
        int[] defaults = { 30, 10, 30, 120, 5, 10, 10 };
        for (int i = 0; i < names.size(); i++) {
            Key k = key("ratelimit." + names.get(i) + ".per_hour");
            assertThat(k.risk()).isEqualTo(Risk.HIGH);
            assertThat(k.defaultValue()).isEqualTo(String.valueOf(defaults[i]));
            assertThat(k.min()).isEqualTo(1d);
            assertThat(k.max()).isEqualTo(1000d);
            assertThat(k.area()).isEqualTo("ratelimit");
        }
    }

    @Test
    void everyKillSwitchAndEveryCapOrCostKeyIsHigh() {
        for (Key k : SettingDefinitions.all()) {
            if (k.key().startsWith("ai.")) continue; // the AI keys follow AiSettingKeys.riskOf (checked below)
            if (AdminSettingKeys.find(k.key()) != null) continue; // declared with the risk the plan table names (email.daily_send_cap is MEDIUM)
            if (k.type() == Type.BOOL && k.key().endsWith(".enabled")) assertThat(k.risk()).as(k.key()).isEqualTo(Risk.HIGH);
            if (k.key().matches(".*(^|[._])(cap|caps|cost)([._]|$).*")) assertThat(k.risk()).as(k.key()).isEqualTo(Risk.HIGH);
        }
        for (String family : AdminSettingKeys.EXT_ATS_FAMILIES) assertThat(key("ext.ats." + family + ".enabled").risk()).isEqualTo(Risk.HIGH);
        assertThat(key("feature.resume_builder.enabled").risk()).isEqualTo(Risk.HIGH);
    }

    @Test
    void aKillSwitchNeedsAReasonOnlyWhenTurnedOff() {
        Key k = key("feature.resume_builder.enabled");
        assertThat(SettingDefinitions.riskOf(k, "false")).isEqualTo(Risk.HIGH);
        assertThat(SettingDefinitions.riskOf(k, "true")).isEqualTo(Risk.MEDIUM);
        assertThat(SettingDefinitions.reasonRule(k)).isEqualTo("when_off");
        assertThat(SettingDefinitions.reasonRule(key("inbox.retention_days"))).isEqualTo("required");
        assertThat(SettingDefinitions.reasonRule(key("tracker.list.defaultSize"))).isEqualTo("optional");
        // AI keys follow the AI page's rule so the two surfaces agree
        assertThat(SettingDefinitions.riskOf(key("ai.route.parse.enabled"), "false")).isEqualTo(Risk.HIGH);
        assertThat(SettingDefinitions.riskOf(key("ai.route.parse.enabled"), "true")).isEqualTo(Risk.MEDIUM);
        assertThat(SettingDefinitions.riskOf(key("ai.route.map.max_output_tokens"), "500")).isEqualTo(Risk.LOW);
        assertThat(SettingDefinitions.declaredRisk(key("ai.enabled"))).isEqualTo(Risk.HIGH);
    }

    @Test
    void flagsAreJsonObjectsWithAStrictShape() {
        Key flag = key("flag.autopilot");
        assertThat(SettingDefinitions.typeName(flag)).isEqualTo("FLAG");
        assertThat(SettingDefinitions.typeName(key("ops.maintenance"))).isEqualTo("FLAG");
        assertThat(SettingDefinitions.typeName(key("tracker.list.defaultSize"))).isEqualTo("INT");
        assertThat(flag.defaultValue()).isEqualTo(AdminSettingKeys.FLAG_OFF);
        assertValid(flag, "{\"on\":true,\"pct\":25,\"allow\":[\"alice\"],\"deny\":[]}", true);
        assertValid(flag, "{\"on\":false}", true);
        assertValid(flag, "{\"pct\":25}", false); // on is required
        assertValid(flag, "{\"on\":true,\"pct\":101}", false);
        assertValid(flag, "{\"on\":true,\"pct\":-1}", false);
        assertValid(flag, "{\"on\":\"yes\"}", false);
        assertValid(flag, "{\"on\":true,\"extra\":1}", false);
        assertValid(flag, "{\"on\":true,\"allow\":[\"has space\"]}", false);
        assertValid(flag, "[true]", false);
    }

    @Test
    void theEnterpriseFlagsAreOffJsonFlagsWithOrgIdLists() {
        List<Key> flags = SettingDefinitions.all().stream().filter(k -> k.key().equals("flag.enterprise") || k.key().startsWith("flag.enterprise.")).toList();
        assertThat(flags).extracting(Key::key).containsExactlyInAnyOrder(
            "flag.enterprise", "flag.enterprise.domains", "flag.enterprise.roles", "flag.enterprise.marketing", "flag.enterprise.consultant_jobs"
        );
        for (Key k : flags) {
            assertThat(k.type()).as(k.key()).isEqualTo(Type.JSON);
            assertThat(SettingDefinitions.typeName(k)).as(k.key()).isEqualTo("FLAG");
            assertThat(k.risk()).as(k.key()).isIn(Risk.HIGH, Risk.MEDIUM);
            assertThat(k.defaultValue()).as("fails closed: %s", k.key()).isEqualTo(AdminSettingKeys.FLAG_OFF);
            assertThat(SettingDefinitions.reasonRule(k)).as(k.key()).isEqualTo(k.risk() == Risk.HIGH ? "required" : "optional");
        }
        assertThat(key("flag.enterprise").risk()).isEqualTo(Risk.HIGH);
        Key master = key("flag.enterprise");
        assertValid(master, "{\"on\":true,\"allow\":[12,\"13\"],\"deny\":[7]}", true);
        assertValid(master, "{\"on\":true,\"pct\":25}", true);
        assertValid(master, "{\"on\":false}", true);
        assertValid(master, "{\"pct\":25}", false); // on is required
        assertValid(master, "{\"on\":true,\"allow\":[\"acme\"]}", false); // org ids, not logins
        assertValid(master, "{\"on\":true,\"allow\":[0]}", false);
        assertValid(master, "{\"on\":true,\"allow\":[-3]}", false);
        assertValid(master, "{\"on\":true,\"allow\":[1.5]}", false);
        assertValid(master, "{\"on\":true,\"pct\":101}", false);
        assertValid(master, "{\"on\":true,\"extra\":1}", false);
        assertValid(master, "[true]", false);
        StringBuilder many = new StringBuilder("{\"on\":true,\"allow\":[");
        for (int i = 1; i <= 51; i++) many.append(i == 1 ? "" : ",").append(i);
        assertValid(master, many.append("]}").toString(), false);
    }

    @Test
    void theInviteEmailMatchKeyIsAnAdminBooleanThatDefaultsToOn() {
        Key match = key("org.invite.require_email_match");
        assertThat(match.type()).isEqualTo(Type.BOOL);
        assertThat(match.defaultValue()).as("E7 default (a): an invitation binds to the invited address").isEqualTo("true");
        assertThat(match.risk()).isEqualTo(Risk.MEDIUM);
        assertValid(match, "false", true);
        assertValid(match, "true", true);
        assertValid(match, "\"yes\"", false);
        assertThat(SettingDefinitions.find("org.invite.require_email_match")).as("read by the invite code, so the admin page offers it").isNotNull();
    }

    @Test
    void theEnterpriseTenancyKeysExistWithTheirDefaults() {
        Key hosts = key("enterprise.hosts.platform");
        assertThat(hosts.type()).isEqualTo(Type.JSON);
        assertThat(hosts.risk()).isEqualTo(Risk.HIGH);
        assertThat(hosts.defaultValue()).isEqualTo("[\"kiwiply.com\",\"www.kiwiply.com\",\"app.kiwiply.com\",\"api.kiwiply.com\"]");
        assertThat(key("enterprise.hosts.tenant_base_domains").defaultValue()).as("localhost is never a production default").isEqualTo("[\"kiwiply.com\"]");
        assertValid(hosts, "[\"kiwiply.com\",\"localhost\"]", true);
        assertValid(hosts, "[]", false);
        assertValid(hosts, "[\"Kiwiply.com\"]", false); // lower-case only
        assertValid(hosts, "[\"kiwiply.com/path\"]", false);
        assertValid(hosts, "[\"-bad.com\"]", false);
        assertValid(hosts, "\"kiwiply.com\"", false);
        assertKey("enterprise.tenant.cache_seconds", "60", 0, 600, Risk.LOW);
        assertKey("enterprise.tenant.rate_per_min", "120", 10, 6000, Risk.MEDIUM);
    }

    @Test
    void keysNothingReadsYetAreHiddenFromAdmin() {
        List<String> deferred = EnterpriseSettingKeys.deferred().stream().map(Key::key).toList();
        assertThat(deferred).contains(
            "flag.enterprise.billing", "flag.enterprise.hr_finance", "flag.enterprise.extension_workspaces",
            "enterprise.domains.subdomains_per_day", "enterprise.domains.recheck_hours", "enterprise.domains.grace_hours_before_suspend",
            "org.consent.request_cooldown_days", "enterprise.billing.mode_default", "enterprise.quote.ttl_minutes", "enterprise.usage.retention_months"
        );
        for (String k : deferred) {
            assertThat(SettingDefinitions.find(k)).as("%s must not be offered in admin yet", k).isNull();
            assertThat(EnterpriseSettingKeys.find(k)).isNull();
        }
        for (Key k : EnterpriseSettingKeys.all()) {
            assertThat(k.description()).as(k.key()).doesNotContain("Not enforced yet");
        }
    }

    @Test
    void noEnterpriseKeyIsDeclaredInAnotherRegistryToo() {
        for (Key k : EnterpriseSettingKeys.all()) {
            assertThat(ResumeBuilderSettingKeys.all()).extracting(Key::key).doesNotContain(k.key());
            assertThat(AdminSettingKeys.find(k.key())).as(k.key()).isNull();
            assertThat(SettingDefinitions.find(k.key())).isSameAs(k);
            assertThat(ResumeBuilderSettingKeys.find(k.key())).isSameAs(k); // so ResumeBuilderSettings can read it
        }
    }

    @Test
    void theExtensionAndOpsStringsHaveTheirShapes() {
        assertValid(key("ext.min_version"), "1.4.0", true);
        assertValid(key("ext.min_version"), "1.4", false);
        assertValid(key("ext.min_version"), "", false); // a minimum is always a version; 0.0.0 means none
        assertValid(key("ext.rules_version_hint"), "", true);
        assertValid(key("ext.rules_version_hint"), "2.0.1", true);
        assertValid(key("ext.rules_version_hint"), "latest", false);
        assertValid(key("ops.error_digest.to"), "", true);
        assertValid(key("ops.error_digest.to"), "ops@kiwiply.com", true);
        assertValid(key("ops.error_digest.to"), "not an email", false);
    }

    private void assertValid(Key k, String value, boolean valid) {
        assertThat(ResumeBuilderSettings.isValid(k, value, mapper)).as("%s = %s", k.key(), value).isEqualTo(valid);
    }

    @Test
    void anUnknownKeyIsNotInTheRegistryAndAnAliasResolves() {
        assertThat(SettingDefinitions.find("jobs.nothing")).isNull();
        assertThat(SettingDefinitions.find(null)).isNull();
        assertThat(SettingDefinitions.find("resume.photo.enabled").key()).isEqualTo(ResumeBuilderSettingKeys.FEATURE_PHOTO);
        assertThat(SettingDefinitions.find("ai.price.gemini-2.5-flash.input_per_mtok_micros")).isNotNull();
    }

    @Test
    void noKeyIsNamedLikeASecret() {
        Pattern secret = Pattern.compile("(secret|password|passwd|api[_-]?key|private[_-]?key|credential|bearer|access[_-]?key)", Pattern.CASE_INSENSITIVE);
        Pattern token = Pattern.compile("(^|[._])token([._]|$)", Pattern.CASE_INSENSITIVE);
        for (Key k : SettingDefinitions.all()) {
            assertThat(secret.matcher(k.key()).find()).as("%s looks like a secret", k.key()).isFalse();
            assertThat(token.matcher(k.key()).find()).as("%s looks like a token", k.key()).isFalse();
        }
    }

    @Test
    void theAreasAreTheFirstSegment() {
        Set<String> areas = new HashSet<>();
        for (Key k : SettingDefinitions.all()) areas.add(k.area());
        assertThat(areas).contains(
            "feature", "resume", "profile", "tracker", "ai", "jobs", "inbox", "ratelimit", "ops", "email", "admin", "flag", "ext", "security", "analytics", "catalog"
        );
    }
}
