package com.dossier.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.lang.reflect.Method;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Rule 3 of {@link NoSubmitSurfaceTest} (doc 60 sections 0.6 and 5): the marketer's {@code POST .../mkt/opportunities/from-extension} never accepts
 * {@code state} or {@code appliedAt} (a marketer can not mark a consultant's job applied) and rejects every unknown field with a 400.
 *
 * <p>The endpoint is built by WP2 on its own branch and is not on this one, so the assertion is written here, exactly, and DISABLED. Enable it by removing
 * {@code @Disabled} in the merge that brings {@code from-extension}; until then {@code NoSubmitSurfaceTest} runs without it. The check finds the handler by
 * its mapping (no compile-time reference to WP2's classes), then asserts on its {@code @RequestBody} type: no {@code state}, {@code appliedAt} or {@code status}
 * component, and a strict mapper (the one the application configures: fail on unknown properties) refuses a body that carries them.
 */
@Disabled("enable after WP2 merge (the from-extension endpoint is not on this branch)")
class NoSubmitFromExtensionTest {

    private static final List<String> FORBIDDEN = List.of("state", "appliedAt", "status", "applied", "closedAt");

    private static Class<?> requestBodyOfFromExtension() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        List<Class<?>> found = new ArrayList<>();
        for (BeanDefinition bd : scanner.findCandidateComponents("com.dossier.api.web.rest.ent.mkt")) {
            Class<?> c = Class.forName(bd.getBeanClassName());
            RequestMapping base = AnnotatedElementUtils.findMergedAnnotation(c, RequestMapping.class);
            if (base == null || base.path().length == 0 || !base.path()[0].endsWith("/mkt/opportunities")) continue;
            for (Method m : c.getDeclaredMethods()) {
                PostMapping post = m.getAnnotation(PostMapping.class);
                if (post == null || post.value().length == 0 || !"/from-extension".equals(post.value()[0])) continue;
                for (var p : m.getParameters()) if (p.isAnnotationPresent(RequestBody.class)) found.add(p.getType());
            }
        }
        assertThat(found).as("POST .../mkt/opportunities/from-extension with a @RequestBody").hasSize(1);
        return found.get(0);
    }

    @Test
    void theRequestHasNoStateOrAppliedAtAndRefusesThemAsUnknownFields() throws Exception {
        Class<?> body = requestBodyOfFromExtension();
        assertThat(body.isRecord()).as("the request is a record").isTrue();
        List<String> names = new ArrayList<>();
        for (RecordComponent rc : body.getRecordComponents()) names.add(rc.getName());
        assertThat(names).doesNotContainAnyElementsOf(FORBIDDEN);
        assertThat(names).contains("jobUrl", "title", "company", "keyInfo", "consultantIds");

        ObjectMapper strict = new ObjectMapper().registerModule(new JavaTimeModule()).enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        for (String extra : List.of("\"state\":\"APPLIED\"", "\"appliedAt\":\"2026-10-13T10:00:00Z\"", "\"jobDescription\":\"the whole posting\"")) {
            String json = "{\"jobUrl\":\"https://boards.greenhouse.io/acme/jobs/1\",\"title\":\"Java Developer\",\"company\":\"Acme\",\"keyInfo\":\"why\",\"consultantIds\":[1]," + extra + "}";
            assertThatThrownBy(() -> strict.readValue(json, body)).as(extra).isInstanceOf(UnrecognizedPropertyException.class);
        }
    }
}
