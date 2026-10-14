package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.dossier.api.web.rest.errors.ExceptionTranslator;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The conflict advice does not reach controllers outside the {@code mkt} and {@code con} packages: their errors keep today's mapping. */
class EntConflictAdviceScopeTest {

    @RestController
    @RequestMapping("/api/orgs/1/elsewhere")
    static class ElsewhereController {

        @GetMapping
        String boom() {
            throw new DataIntegrityViolationException("Duplicate entry");
        }
    }

    @Test
    void aControllerOutsideTheMktAndConPackagesIsNotAdvised() {
        ExceptionTranslator translator = new ExceptionTranslator(new MockEnvironment());
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ElsewhereController()).setControllerAdvice(new EntConflictAdvice(translator)).build();
        // no handler applies, so the exception is not turned into a 409 by this advice (the servlet container would answer, here it propagates)
        assertThatThrownBy(() -> mvc.perform(get("/api/orgs/1/elsewhere"))).hasRootCauseInstanceOf(DataIntegrityViolationException.class);
    }
}
