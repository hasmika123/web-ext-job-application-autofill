package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.security.AuthoritiesConstants;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The 1.11 multi-tenant leak fix, asserted directly: the raw generated entity-CRUD
 * controllers (Bio/Resume/Application/AiAnswer/FieldCache) are NOT user-scoped, so they
 * are locked to ADMIN. A normal authenticated user must be forbidden (403) from listing
 * any of them — otherwise they could read every user's rows. The user-scoped surface
 * (/api/profile, /api/profile/resumes) stays open and is covered by {@link ProfileResourceIT}.
 */
@IntegrationTest
@AutoConfigureMockMvc
class EntityCrudLockdownIT {

    private static final String[] RAW_CRUD_ENDPOINTS = {
        "/api/bios",
        "/api/resumes",
        "/api/applications",
        "/api/ai-answers",
        "/api/field-caches",
    };

    @Autowired
    private MockMvc mockMvc;

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void normalUserIsForbiddenFromRawEntityCrud() throws Exception {
        for (String path : RAW_CRUD_ENDPOINTS) {
            mockMvc.perform(get(path)).andExpect(status().isForbidden());
        }
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void adminCanReachRawEntityCrud() throws Exception {
        for (String path : RAW_CRUD_ENDPOINTS) {
            mockMvc.perform(get(path)).andExpect(status().isOk());
        }
    }
}
