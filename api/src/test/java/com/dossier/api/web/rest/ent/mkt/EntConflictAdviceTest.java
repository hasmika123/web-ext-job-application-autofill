package com.dossier.api.web.rest.ent.mkt;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.rest.ent.EntConflictAdvice;
import com.dossier.api.web.rest.errors.ExceptionTranslator;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The conflict advice without Spring: a controller in the {@code mkt} package gets a 409 with a typed code for a lost unique-key race or a stale
 * {@code @Version}; the rest of the existing error mapping (an {@link OrgException}, the generic 404) is untouched; a controller outside the
 * {@code mkt}/{@code con} packages is not covered (see {@code EntConflictAdviceScopeTest}).
 */
class EntConflictAdviceTest {

    @RestController
    @RequestMapping("/api/orgs/1/mkt/boom")
    static class BoomController {

        @GetMapping("/integrity")
        String integrity() {
            throw new DataIntegrityViolationException("Duplicate entry '1-abc' for key 'uk_req_url'");
        }

        @GetMapping("/null-column")
        String nullColumn() {
            throw new DataIntegrityViolationException("Column 'title' cannot be null");
        }

        @GetMapping("/other-unique")
        String otherUnique() {
            throw new DataIntegrityViolationException("Duplicate entry 'x' for key 'uk_some_other_table_key'");
        }

        @GetMapping("/mysql-1062")
        String mysql1062() {
            throw new DataIntegrityViolationException("could not execute statement", new java.sql.SQLIntegrityConstraintViolationException("Duplicate entry '7-1' for key 'requirement_match.uk_requirement_match_pair'", "23000", 1062));
        }

        @GetMapping("/version")
        String version() {
            throw new ObjectOptimisticLockingFailureException("com.dossier.api.domain.ent.mkt.MktOpportunity", 5L);
        }

        @GetMapping("/org")
        String org() {
            throw OrgException.coded(409, "JOB_NOT_OPEN", "That job is not open.", java.util.Map.of());
        }

        @GetMapping("/missing")
        String missing() {
            throw new OrgNotFoundException();
        }
    }

    private final ExceptionTranslator translator = new ExceptionTranslator(new MockEnvironment());
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new BoomController()).setControllerAdvice(new EntConflictAdvice(translator), translator).build();

    @Test
    void aUniqueKeyConflictIsA409WithCodeConflictAndNoSqlInTheBody() throws Exception {
        String body = mvc.perform(get("/api/orgs/1/mkt/boom/integrity"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("CONFLICT"))
            .andExpect(jsonPath("$.status").value(409))
            .andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("uk_req_url").doesNotContain("Duplicate entry");
    }

    @Test
    void onlyTheKnownUniqueKeyRacesAre409AndEveryOtherViolationKeepsTheUsualMapping() throws Exception {
        mvc.perform(get("/api/orgs/1/mkt/boom/mysql-1062")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONFLICT"));
        for (String other : new String[] { "null-column", "other-unique" }) {
            String body = mvc.perform(get("/api/orgs/1/mkt/boom/" + other)).andReturn().getResponse().getContentAsString();
            int status = mvc.perform(get("/api/orgs/1/mkt/boom/" + other)).andReturn().getResponse().getStatus();
            org.assertj.core.api.Assertions.assertThat(status).as(other).isNotEqualTo(409);
            org.assertj.core.api.Assertions.assertThat(body).as(other).doesNotContain("\"CONFLICT\"");
        }
    }

    @Test
    void everyRaceKeyIsARealUniqueKeyOfTheSchema() throws Exception {
        String all = "";
        for (String f : new java.io.File(EntConflictAdviceTest.class.getResource("/config/liquibase/changelog").toURI()).list()) {
            if (f.endsWith(".xml")) try (java.io.InputStream in = EntConflictAdviceTest.class.getResourceAsStream("/config/liquibase/changelog/" + f)) {
                all += new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            }
        }
        for (String key : EntConflictAdvice.RACE_KEYS) org.assertj.core.api.Assertions.assertThat(all).as(key).contains(key);
    }

    @Test
    void aStaleVersionIsA409WithCodeVersionConflict() throws Exception {
        mvc.perform(get("/api/orgs/1/mkt/boom/version"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"))
            .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    void theExistingMappingOfOrgExceptionsIsNotChanged() throws Exception {
        mvc.perform(get("/api/orgs/1/mkt/boom/org")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("JOB_NOT_OPEN"));
        mvc.perform(get("/api/orgs/1/mkt/boom/missing")).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void theAdviceIsLimitedToTheMktAndConPackages() {
        org.springframework.web.bind.annotation.RestControllerAdvice a = EntConflictAdvice.class.getAnnotation(org.springframework.web.bind.annotation.RestControllerAdvice.class);
        org.assertj.core.api.Assertions.assertThat(a.basePackages()).containsExactlyInAnyOrder("com.dossier.api.web.rest.ent.mkt", "com.dossier.api.web.rest.ent.consultant");
    }
}
