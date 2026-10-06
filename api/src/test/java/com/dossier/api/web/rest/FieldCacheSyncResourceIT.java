package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.ProSubscriptions;
import com.dossier.api.domain.FieldCache;
import com.dossier.api.domain.User;
import com.dossier.api.repository.FieldCacheRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for {@link FieldCacheSyncResource} — the user-scoped field-cache
 * sync. Runs as the seeded "user"; verifies upsert, last-write-wins on the value,
 * max hitCount, and that another user's cache never leaks in.
 *
 * <p>Cross-device sync is Pro (Phase 12.4), so every merge test seeds a Pro subscription first;
 * {@link #syncIsProOnly} is the test that keeps that gate honest.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
class FieldCacheSyncResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private FieldCacheRepository fieldCacheRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @BeforeEach
    void makeUserPro() {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
    }

    private static Map<String, Object> entry(String key, String ctx, String value, int hits, String updatedAt) {
        return Map.of("fieldKey", key, "contextHash", ctx, "value", value, "hitCount", hits, "updatedAt", updatedAt);
    }

    private String sync(List<Map<String, Object>> entries) throws Exception {
        return mockMvc
            .perform(post("/api/profile/field-caches/sync").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(entries)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    }

    @Test
    @Transactional
    void listIsEmptyForANewUser() throws Exception {
        mockMvc.perform(get("/api/profile/field-caches")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @Transactional
    void syncCreatesEntriesAndReturnsTheMergedSet() throws Exception {
        String body = sync(List.of(entry("country", "abc123", "United States", 3, "2026-06-01T00:00:00Z")));
        assertThat(om.readTree(body).size()).isEqualTo(1);

        mockMvc
            .perform(get("/api/profile/field-caches"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].fieldKey").value("country"))
            .andExpect(jsonPath("$[0].value").value("United States"))
            .andExpect(jsonPath("$[0].hitCount").value(3))
            .andExpect(jsonPath("$[0].user.login").value("user"));
    }

    @Test
    @Transactional
    void valueIsLastWriteWinsByUpdatedAtAndHitCountIsMax() throws Exception {
        sync(List.of(entry("gender", "ctxg", "Prefer not to say", 5, "2026-06-10T00:00:00Z")));

        // Newer updatedAt + lower hitCount: value updates, hitCount keeps the max (5).
        sync(List.of(entry("gender", "ctxg", "Female", 2, "2026-06-20T00:00:00Z")));
        mockMvc
            .perform(get("/api/profile/field-caches"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].value").value("Female"))
            .andExpect(jsonPath("$[0].hitCount").value(5));

        // Older updatedAt: value must NOT regress, hitCount still maxes (8).
        sync(List.of(entry("gender", "ctxg", "Male", 8, "2026-06-05T00:00:00Z")));
        mockMvc
            .perform(get("/api/profile/field-caches"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].value").value("Female"))
            .andExpect(jsonPath("$[0].hitCount").value(8));
    }

    @Test
    @Transactional
    void malformedEntriesAreSkippedNotFatal() throws Exception {
        // Missing contextHash → skipped; the valid one still lands.
        String body = sync(
            List.of(
                Map.of("fieldKey", "ok", "contextHash", "c1", "value", "v", "hitCount", 1, "updatedAt", "2026-06-01T00:00:00Z"),
                Map.of("fieldKey", "bad", "value", "v", "hitCount", 1, "updatedAt", "2026-06-01T00:00:00Z")
            )
        );
        assertThat(om.readTree(body).size()).isEqualTo(1);
    }

    @Test
    @Transactional
    void anotherUsersCacheIsNeverVisibleOrTouched() throws Exception {
        User admin = userRepository.findOneByLogin("admin").orElseThrow();
        FieldCache adminEntry = new FieldCache()
            .fieldKey("secret")
            .contextHash("adminctx")
            .value("admin only")
            .hitCount(1)
            .updatedAt(Instant.ofEpochMilli(0));
        adminEntry.setUser(admin);
        adminEntry = fieldCacheRepository.saveAndFlush(adminEntry);

        // "user" syncs their own entry; the result never includes admin's row.
        String body = sync(List.of(entry("country", "c", "Canada", 1, "2026-06-01T00:00:00Z")));
        assertThat(body).doesNotContain("admin only");
        mockMvc
            .perform(get("/api/profile/field-caches"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.value == 'admin only')]").isEmpty());

        // admin's row is untouched.
        assertThat(fieldCacheRepository.findById(adminEntry.getId()).orElseThrow().getValue()).isEqualTo("admin only");
    }

    // ---- the Pro gate (12.4) ------------------------------------------------

    /**
     * A Free user is refused with 402 {@code PRO_REQUIRED}. The extension treats any failure here
     * as best-effort, so this is silent on the client — the answers it learned stay usable on the
     * device that learned them, they just stop travelling.
     */
    @Test
    @Transactional
    void syncIsProOnly() throws Exception {
        subscriptionRepository.deleteAll();
        mockMvc
            .perform(
                post("/api/profile/field-caches/sync")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(List.of(entry("country", "abc123", "United States", 1, "2026-06-01T00:00:00Z"))))
            )
            .andExpect(status().isPaymentRequired())
            .andExpect(jsonPath("$.code").value("PRO_REQUIRED"));
    }

    /** Reading back what you already own is NOT gated — a downgrade must never hide your data. */
    @Test
    @Transactional
    void listStillWorksOnFree() throws Exception {
        sync(List.of(entry("country", "abc123", "United States", 1, "2026-06-01T00:00:00Z")));
        subscriptionRepository.deleteAll();
        mockMvc.perform(get("/api/profile/field-caches")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
    }
}
