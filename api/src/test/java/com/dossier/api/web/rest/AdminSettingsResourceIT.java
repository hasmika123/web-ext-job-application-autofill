package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AdminAuditEvent;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.AppSettingHistory;
import com.dossier.api.repository.AdminAuditEventRepository;
import com.dossier.api.repository.AppSettingHistoryRepository;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ai.AiRuntimeSettings;
import com.dossier.api.service.ai.AiTask;
import com.dossier.api.service.settings.SettingDefinitions;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * The generic admin settings API end to end (A5.1): auth, the registry list, a write that changes real behaviour on
 * the very next read with no restart, history and revert, the reason and bounds rules, the audit row, and that no
 * secret is ever in a response.
 *
 * <p>Not {@code @Transactional}: the commit is what drops the cache, so a request must be seen to take effect on the
 * next one. That needs more than the test pool's single connection.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = { "spring.datasource.hikari.maximum-pool-size=4" })
class AdminSettingsResourceIT {

    private static final String BASE = "/api/admin/settings";
    private static final String TRACKER_LIST = "/api/profile/applications";
    private static final String ADMIN = "settings-admin";

    private static final RequestPostProcessor ADMIN_USER = user(ADMIN).authorities(new SimpleGrantedAuthority(AuthoritiesConstants.ADMIN));
    private static final RequestPostProcessor NORMAL_USER = user("user").authorities(new SimpleGrantedAuthority(AuthoritiesConstants.USER));

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper mapper;

    @Autowired
    private AppSettingRepository rows;

    @Autowired
    private AppSettingHistoryRepository history;

    @Autowired
    private AdminAuditEventRepository auditEvents;

    @Autowired
    private ResumeBuilderSettings cache;

    @Autowired
    private AiRuntimeSettings aiRuntime;

    @BeforeEach
    @AfterEach
    void sweep() {
        for (AppSetting s : rows.findAll()) if (ADMIN.equals(s.getUpdatedBy())) rows.delete(s);
        for (AppSettingHistory h : history.findAll()) if (ADMIN.equals(h.getActorLogin())) history.delete(h);
        cache.invalidate();
    }

    private ResultActions send(MockHttpServletRequestBuilder b, RequestPostProcessor who, String json) throws Exception {
        MockHttpServletRequestBuilder req = b.with(who);
        if (json != null) req = req.contentType(MediaType.APPLICATION_JSON).content(json);
        return mockMvc.perform(req);
    }

    private ResultActions patchSetting(String key, String json) throws Exception {
        return send(patch(BASE + "/" + key), ADMIN_USER, json);
    }

    private int trackerPageSize() throws Exception {
        String body = send(get(TRACKER_LIST).param("page", "0"), NORMAL_USER, null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(body).get("size").asInt();
    }

    private List<AdminAuditEvent> myAudit() {
        return auditEvents.findAll().stream().filter(e -> ADMIN.equals(e.getActorLogin()) && "SETTING_CHANGE".equals(e.getAction())).toList();
    }

    // ---- auth -----------------------------------------------------------------

    @Test
    void aNormalUserIsForbiddenEverywhere() throws Exception {
        send(get(BASE), NORMAL_USER, null).andExpect(status().isForbidden());
        send(get(BASE + "/tracker.list.defaultSize"), NORMAL_USER, null).andExpect(status().isForbidden());
        send(patch(BASE + "/tracker.list.defaultSize"), NORMAL_USER, "{\"value\":30}").andExpect(status().isForbidden());
        send(put(BASE + "/tracker.list.defaultSize"), NORMAL_USER, "{\"value\":30}").andExpect(status().isForbidden());
        send(delete(BASE + "/tracker.list.defaultSize"), NORMAL_USER, null).andExpect(status().isForbidden());
        send(get(BASE + "/tracker.list.defaultSize/history"), NORMAL_USER, null).andExpect(status().isForbidden());
        send(post(BASE + "/tracker.list.defaultSize/revert"), NORMAL_USER, "{\"historyId\":1}").andExpect(status().isForbidden());
        assertThat(rows.findAll()).noneMatch(s -> "tracker.list.defaultSize".equals(s.getKey()));
    }

    @Test
    void anAnonymousCallerIsUnauthorized() throws Exception {
        mockMvc.perform(get(BASE)).andExpect(status().isUnauthorized());
        mockMvc.perform(patch(BASE + "/tracker.list.defaultSize").contentType(MediaType.APPLICATION_JSON).content("{\"value\":30}")).andExpect(status().isUnauthorized());
    }

    // ---- list -----------------------------------------------------------------

    @Test
    void theListIsGroupedByAreaAndEveryItemCarriesItsProvenanceBoundsAndRisk() throws Exception {
        send(get(BASE), ADMIN_USER, null)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.areas[?(@.area=='tracker')].count").isNotEmpty())
            .andExpect(jsonPath("$.areas[?(@.area=='ratelimit')].highCount").value(7))
            .andExpect(jsonPath("$.items[?(@.key=='tracker.list.defaultSize')].value").value(20))
            .andExpect(jsonPath("$.items[?(@.key=='tracker.list.defaultSize')].source").value("default"))
            .andExpect(jsonPath("$.items[?(@.key=='tracker.list.defaultSize')].codeDefault").value(20))
            .andExpect(jsonPath("$.items[?(@.key=='tracker.list.defaultSize')].type").value("INT"))
            .andExpect(jsonPath("$.items[?(@.key=='tracker.list.defaultSize')].area").value("tracker"))
            .andExpect(jsonPath("$.items[?(@.key=='tracker.list.defaultSize')].risk").value("MEDIUM"))
            .andExpect(jsonPath("$.items[?(@.key=='inbox.retention_days')].risk").value("HIGH"))
            .andExpect(jsonPath("$.items[?(@.key=='inbox.retention_days')].reasonRule").value("required"))
            .andExpect(jsonPath("$.items[?(@.key=='inbox.retention_days')].min").value(30))
            .andExpect(jsonPath("$.items[?(@.key=='inbox.retention_days')].max").value(730))
            .andExpect(jsonPath("$.items[?(@.key=='feature.resume_builder.enabled')].reasonRule").value("when_off"))
            .andExpect(jsonPath("$.items[?(@.key=='flag.autopilot')].type").value("FLAG"))
            .andExpect(jsonPath("$.items[?(@.key=='flag.autopilot')].value.on").value(false))
            .andExpect(jsonPath("$.items[?(@.key=='ai.route.parse.model')].source").value("env"))
            .andExpect(jsonPath("$.items[?(@.key=='resume.templates.default')].allowed").isNotEmpty());
    }

    @Test
    void theListFiltersByAreaAndSearch() throws Exception {
        String byArea = send(get(BASE).param("area", "jobs"), ADMIN_USER, null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode items = mapper.readTree(byArea).get("items");
        // every registered key of the area (U4.0 added the jobs.search.* keys after A5.1 first pinned five)
        assertThat(items).hasSize((int) SettingDefinitions.all().stream().filter(k -> "jobs".equals(k.area())).count());
        items.forEach(i -> assertThat(i.get("area").asText()).isEqualTo("jobs"));
        assertThat(mapper.readTree(byArea).get("areas").size()).as("the rail keeps every area").isGreaterThan(8);

        send(get(BASE).param("q", "RETENTION"), ADMIN_USER, null)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[?(@.key=='inbox.retention_days')]").isNotEmpty())
            .andExpect(jsonPath("$.items[?(@.key=='jobs.daily_target')]").isEmpty());
    }

    @Test
    void noResponseEverCarriesASecret() throws Exception {
        String list = send(get(BASE), ADMIN_USER, null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(list).doesNotContainIgnoringCase("secret").doesNotContainIgnoringCase("password").doesNotContainIgnoringCase("apikey").doesNotContainIgnoringCase("api_key");
        assertThat(list).doesNotContain("AIza").doesNotContain("sk_live").doesNotContain("sk_test");
        for (JsonNode item : mapper.readTree(list).get("items")) {
            assertThat(item.get("key").asText()).doesNotContainIgnoringCase("secret").doesNotContainIgnoringCase("password");
        }
    }

    // ---- a write changes behaviour with no restart -----------------------------

    @Test
    void aPatchChangesRealBehaviourOnTheNextReadAndAResetGoesBack() throws Exception {
        assertThat(trackerPageSize()).as("tracker.list.defaultSize code default").isEqualTo(20);

        patchSetting("tracker.list.defaultSize", "{\"value\":35}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.key").value("tracker.list.defaultSize"))
            .andExpect(jsonPath("$.value").value(35))
            .andExpect(jsonPath("$.source").value("db"))
            .andExpect(jsonPath("$.codeDefault").value(20))
            .andExpect(jsonPath("$.updatedBy").value(ADMIN))
            .andExpect(jsonPath("$.updatedAt").isNotEmpty());

        // the very next request - a different user, a different resource - sees it: no restart, no 60 s wait
        assertThat(trackerPageSize()).isEqualTo(35);
        assertThat(rows.findById("tracker.list.defaultSize")).get().extracting(AppSetting::getValue).isEqualTo("35");

        // PUT is the same operation
        send(put(BASE + "/tracker.list.defaultSize"), ADMIN_USER, "{\"value\":25,\"reason\":\"smaller pages on mobile\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.value").value(25))
            .andExpect(jsonPath("$.lastReason").value("smaller pages on mobile"));
        assertThat(trackerPageSize()).isEqualTo(25);

        // reset: the row is gone and the code default applies again
        send(delete(BASE + "/tracker.list.defaultSize"), ADMIN_USER, null)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.value").value(20))
            .andExpect(jsonPath("$.source").value("default"))
            .andExpect(jsonPath("$.updatedBy").doesNotExist());
        assertThat(rows.findById("tracker.list.defaultSize")).isEmpty();
        assertThat(trackerPageSize()).isEqualTo(20);
    }

    @Test
    void anAiKeyWrittenHereIsSeenByTheAiRuntimeAtOnce() throws Exception {
        String before = aiRuntime.route(AiTask.MAP).model();
        patchSetting("ai.route.map.model", "{\"value\":\"gemini-9.9-test\"}").andExpect(status().isOk()).andExpect(jsonPath("$.source").value("db"));
        assertThat(aiRuntime.route(AiTask.MAP).model()).isEqualTo("gemini-9.9-test");
        send(delete(BASE + "/ai.route.map.model"), ADMIN_USER, null).andExpect(status().isOk()).andExpect(jsonPath("$.source").value(before.isEmpty() ? "default" : "env"));
        assertThat(aiRuntime.route(AiTask.MAP).model()).isEqualTo(before);
    }

    // ---- history, revert, audit ------------------------------------------------

    @Test
    void everyWriteAppendsHistoryAndAnAuditRowWithTheArea() throws Exception {
        long auditBefore = myAudit().size();
        patchSetting("jobs.match_threshold", "{\"value\":70}").andExpect(status().isOk());
        patchSetting("jobs.match_threshold", "{\"value\":75,\"reason\":\"fewer, better matches\"}").andExpect(status().isOk());
        patchSetting("jobs.match_threshold", "{\"value\":75}").andExpect(status().isOk()); // no change: no new row

        send(get(BASE + "/jobs.match_threshold/history"), ADMIN_USER, null)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].key").value("jobs.match_threshold"))
            .andExpect(jsonPath("$[0].oldValue").value("70"))
            .andExpect(jsonPath("$[0].newValue").value("75"))
            .andExpect(jsonPath("$[0].actorLogin").value(ADMIN))
            .andExpect(jsonPath("$[0].reason").value("fewer, better matches"))
            .andExpect(jsonPath("$[0].changedAt").isNotEmpty())
            .andExpect(jsonPath("$[1].oldValue").doesNotExist())
            .andExpect(jsonPath("$[1].newValue").value("70"));

        List<AdminAuditEvent> events = myAudit();
        assertThat(events).hasSize((int) auditBefore + 2);
        AdminAuditEvent last = events.get(events.size() - 1);
        assertThat(last.getTargetType()).isEqualTo("SETTING");
        assertThat(last.getTargetId()).isEqualTo("jobs.match_threshold");
        assertThat(last.getReason()).isEqualTo("fewer, better matches");
        assertThat(last.getDetails()).contains("area=jobs").contains("risk=MEDIUM").contains("old=70").contains("new=75");
        // the AI page's audit action is not used by the generic endpoint
        assertThat(auditEvents.findAll().stream().filter(e -> ADMIN.equals(e.getActorLogin()) && "AI_CONFIG_CHANGE".equals(e.getAction()))).isEmpty();
    }

    @Test
    void revertRestoresTheValueBeforeThatChangeAsANewHistoryRow() throws Exception {
        patchSetting("jobs.daily_target", "{\"value\":10}").andExpect(status().isOk());
        patchSetting("jobs.daily_target", "{\"value\":12}").andExpect(status().isOk());
        List<AppSettingHistory> rowsBefore = history.findByKeyOrderByIdDesc("jobs.daily_target", PageRequest.of(0, 10));
        assertThat(rowsBefore).hasSize(2);
        AppSettingHistory second = rowsBefore.get(0);
        AppSettingHistory first = rowsBefore.get(1);

        send(post(BASE + "/jobs.daily_target/revert"), ADMIN_USER, "{\"historyId\":" + second.getId() + "}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.value").value(10))
            .andExpect(jsonPath("$.source").value("db"));

        List<AppSettingHistory> after = history.findByKeyOrderByIdDesc("jobs.daily_target", PageRequest.of(0, 10));
        assertThat(after).hasSize(3);
        assertThat(after.get(0).getOldValue()).isEqualTo("12");
        assertThat(after.get(0).getNewValue()).isEqualTo("10");
        assertThat(history.findById(first.getId())).get().extracting(AppSettingHistory::getNewValue).as("history is never edited").isEqualTo("10");
        assertThat(history.findById(second.getId())).get().extracting(AppSettingHistory::getNewValue).isEqualTo("12");
        assertThat(myAudit()).anySatisfy(e -> assertThat(e.getDetails()).contains("revert=" + second.getId()));

        // reverting the first change ever (there was no row) deletes the row: back to the default
        send(post(BASE + "/jobs.daily_target/revert"), ADMIN_USER, "{\"historyId\":" + first.getId() + "}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.value").value(15))
            .andExpect(jsonPath("$.source").value("default"));
        assertThat(rows.findById("jobs.daily_target")).isEmpty();
    }

    @Test
    void aRevertOfAnotherKeysHistoryRowOrAMissingOneIs404() throws Exception {
        patchSetting("jobs.daily_target", "{\"value\":10}").andExpect(status().isOk());
        Long id = history.findByKeyOrderByIdDesc("jobs.daily_target", PageRequest.of(0, 1)).get(0).getId();
        send(post(BASE + "/jobs.posting_age_hours/revert"), ADMIN_USER, "{\"historyId\":" + id + "}")
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("SETTING_HISTORY_NOT_FOUND"));
        send(post(BASE + "/jobs.daily_target/revert"), ADMIN_USER, "{\"historyId\":999999999}").andExpect(status().isNotFound());
        send(post(BASE + "/jobs.daily_target/revert"), ADMIN_USER, "{}").andExpect(status().isNotFound());
    }

    // ---- refusals ---------------------------------------------------------------

    @Test
    void aHighRiskChangeWithoutAReasonIs400AndLeavesNothingBehind() throws Exception {
        long auditBefore = myAudit().size();
        patchSetting("inbox.retention_days", "{\"value\":90}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SETTING_REASON_REQUIRED"))
            .andExpect(jsonPath("$.key").value("inbox.retention_days"))
            .andExpect(jsonPath("$.minLength").value(10));
        patchSetting("inbox.retention_days", "{\"value\":90,\"reason\":\"short\"}").andExpect(status().isBadRequest());
        assertThat(rows.findById("inbox.retention_days")).isEmpty();
        assertThat(history.findByKeyOrderByIdDesc("inbox.retention_days", PageRequest.of(0, 5))).isEmpty();
        assertThat(myAudit()).hasSize((int) auditBefore);

        patchSetting("inbox.retention_days", "{\"value\":90,\"reason\":\"GDPR review: ninety days\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.value").value(90))
            .andExpect(jsonPath("$.lastReason").value("GDPR review: ninety days"));
        assertThat(history.findByKeyOrderByIdDesc("inbox.retention_days", PageRequest.of(0, 5))).hasSize(1);
        assertThat(myAudit().get(myAudit().size() - 1).getReason()).isEqualTo("GDPR review: ninety days");

        // reset of a HIGH key needs a reason too (query parameter or body)
        send(delete(BASE + "/inbox.retention_days"), ADMIN_USER, null).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SETTING_REASON_REQUIRED"));
        send(delete(BASE + "/inbox.retention_days").param("reason", "back to the standard window"), ADMIN_USER, null).andExpect(status().isOk()).andExpect(jsonPath("$.source").value("default"));
    }

    @Test
    void aKillSwitchNeedsAReasonOnlyToTurnItOff() throws Exception {
        patchSetting("feature.resume_builder.enabled", "{\"value\":false}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SETTING_REASON_REQUIRED"));
        patchSetting("feature.resume_builder.enabled", "{\"value\":false,\"reason\":\"paused for the hotfix\"}").andExpect(status().isOk()).andExpect(jsonPath("$.value").value(false));
        patchSetting("feature.resume_builder.enabled", "{\"value\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.value").value(true));
    }

    @Test
    void outOfBoundsUnknownAndWrongTypedValuesAre400WithTheirCodes() throws Exception {
        long historyBefore = history.count();
        patchSetting("jobs.match_threshold", "{\"value\":99}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SETTING_OUT_OF_BOUNDS"))
            .andExpect(jsonPath("$.key").value("jobs.match_threshold"))
            .andExpect(jsonPath("$.min").value(40))
            .andExpect(jsonPath("$.max").value(90))
            .andExpect(jsonPath("$.detail").isNotEmpty());
        patchSetting("jobs.match_threshold", "{\"value\":\"lots\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SETTING_OUT_OF_BOUNDS"));
        patchSetting("jobs.match_threshold", "{\"value\":true}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SETTING_OUT_OF_BOUNDS"));
        patchSetting("jobs.match_threshold", "{}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SETTING_OUT_OF_BOUNDS"));
        patchSetting("catalog.margin_floor_subscription_pct", "{\"value\":79,\"reason\":\"trying to undercut the floor\"}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SETTING_OUT_OF_BOUNDS"))
            .andExpect(jsonPath("$.min").value(80));
        patchSetting("resume.templates.default", "{\"value\":\"nope\"}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SETTING_OUT_OF_BOUNDS"))
            .andExpect(jsonPath("$.allowed").isNotEmpty());
        patchSetting("flag.autopilot", "{\"value\":{\"on\":true,\"pct\":500}}").andExpect(status().isBadRequest());
        patchSetting("ext.min_version", "{\"value\":\"soon\",\"reason\":\"not a version\"}").andExpect(status().isBadRequest());
        patchSetting("jobs.nothing", "{\"value\":1}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SETTING_UNKNOWN_KEY"));
        send(delete(BASE + "/jobs.nothing"), ADMIN_USER, null).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SETTING_UNKNOWN_KEY"));
        send(get(BASE + "/jobs.nothing/history"), ADMIN_USER, null).andExpect(status().isBadRequest());
        assertThat(history.count()).isEqualTo(historyBefore);
    }

    @Test
    void jsonFlagsAreStoredAndReturnedAsObjects() throws Exception {
        patchSetting("flag.autopilot", "{\"value\":{\"on\":true,\"pct\":25,\"allow\":[\"alice\"],\"deny\":[]}}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.type").value("FLAG"))
            .andExpect(jsonPath("$.value.on").value(true))
            .andExpect(jsonPath("$.value.pct").value(25))
            .andExpect(jsonPath("$.value.allow[0]").value("alice"))
            .andExpect(jsonPath("$.source").value("db"))
            .andExpect(jsonPath("$.codeDefault.on").value(false));
        assertThat(rows.findById("flag.autopilot").orElseThrow().getValue()).contains("\"pct\":25");
        // a JSON document sent as text (a textarea) is accepted too
        patchSetting("flag.autopilot", "{\"value\":\"{\\\"on\\\":false}\"}").andExpect(status().isOk()).andExpect(jsonPath("$.value.on").value(false));
    }

    @Test
    void aBareWordIsNotAKeySoTheDemoSwitchesOwnEndpointKeepsItsShape() throws Exception {
        // /api/admin/settings/demo belongs to AdminDemoResource (read-only + /reset); the generic API must not answer it
        send(put(BASE + "/demo"), ADMIN_USER, "{\"value\":true}").andExpect(status().isMethodNotAllowed());
        send(delete(BASE + "/demo"), ADMIN_USER, null).andExpect(status().isMethodNotAllowed());
        send(get(BASE + "/demo"), ADMIN_USER, null).andExpect(status().isOk()).andExpect(jsonPath("$.enabled").exists());
    }

    @Test
    void anAliasIsAddressedByItsCanonicalKey() throws Exception {
        patchSetting("resume.photo.enabled", "{\"value\":false,\"reason\":\"photos paused for a fix\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.key").value("feature.resume_photo.enabled"));
    }
}
