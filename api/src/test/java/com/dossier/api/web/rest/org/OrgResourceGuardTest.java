package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.OrgPermission;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * O1.2 / tenant-model.md section 4: no org handler can forget the access check. Every request-mapped method of every
 * controller in {@code web.rest.org} carries {@link OrgPermissionRequired} or {@link OrgUnscoped}; a handler with an
 * {@code {orgId}} in its path must use the former. The checker is itself tested against a violating fixture so the
 * rule cannot silently turn vacuous.
 */
class OrgResourceGuardTest {

    /** The offending "Class#method" entries among {@code controllers}. */
    static List<String> violations(Collection<Class<?>> controllers) {
        List<String> out = new ArrayList<>();
        for (Class<?> c : controllers) {
            for (Method m : c.getDeclaredMethods()) {
                if (!AnnotatedElementUtils.hasAnnotation(m, RequestMapping.class)) continue;
                String id = c.getSimpleName() + "#" + m.getName();
                boolean checked = m.isAnnotationPresent(OrgPermissionRequired.class);
                boolean unscoped = m.isAnnotationPresent(OrgUnscoped.class);
                if (!checked && !unscoped) {
                    out.add(id + " has neither @OrgPermissionRequired nor @OrgUnscoped");
                } else if (checked && unscoped) {
                    out.add(id + " has both @OrgPermissionRequired and @OrgUnscoped");
                } else if (unscoped && pathsOf(c, m).stream().anyMatch(p -> p.contains("{orgId}"))) {
                    out.add(id + " is @OrgUnscoped but has an {orgId} in its path");
                } else if (checked && pathsOf(c, m).stream().noneMatch(p -> p.contains("{orgId}"))) {
                    out.add(id + " is @OrgPermissionRequired but has no {orgId} in its path");
                }
            }
        }
        return out;
    }

    private static List<String> pathsOf(Class<?> c, Method m) {
        List<String> base = new ArrayList<>();
        RequestMapping cm = AnnotatedElementUtils.findMergedAnnotation(c, RequestMapping.class);
        if (cm != null && cm.path().length > 0) base.addAll(List.of(cm.path()));
        if (base.isEmpty()) base.add("");
        RequestMapping mm = AnnotatedElementUtils.findMergedAnnotation(m, RequestMapping.class);
        List<String> out = new ArrayList<>();
        String[] sub = mm == null || mm.path().length == 0 ? new String[] { "" } : mm.path();
        for (String b : base) for (String s : sub) out.add(b + s);
        return out;
    }

    private static List<Class<?>> orgControllers() throws ClassNotFoundException {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        List<Class<?>> out = new ArrayList<>();
        for (BeanDefinition bd : scanner.findCandidateComponents("com.dossier.api.web.rest.org")) {
            if (bd.getBeanClassName().contains("Test$")) continue; // this file's own fixtures
            out.add(Class.forName(bd.getBeanClassName()));
        }
        return out;
    }

    @Test
    void everyRealOrgHandlerIsGuarded() throws Exception {
        assertThat(violations(orgControllers())).isEmpty();
    }

    // ---- the checker itself ---------------------------------------------------------------------------------

    @RestController
    @RequestMapping("/api/orgs")
    static class GoodFixture {

        @GetMapping("/{orgId}/things")
        @OrgPermissionRequired(OrgPermission.REPORTS_VIEW)
        public String scoped() {
            return "";
        }

        @GetMapping("/{orgId}")
        @OrgPermissionRequired
        public String anyMember() {
            return "";
        }

        @PostMapping
        @OrgUnscoped
        public String create() {
            return "";
        }
    }

    @RestController
    @RequestMapping("/api/orgs")
    static class BadFixture {

        @GetMapping("/{orgId}/forgot")
        public String forgot() {
            return "";
        }

        @GetMapping("/{orgId}/unscoped-but-has-org")
        @OrgUnscoped
        public String unscopedWithOrg() {
            return "";
        }

        @GetMapping("/mine")
        @OrgPermissionRequired
        public String checkedWithoutOrg() {
            return "";
        }

        @GetMapping("/{orgId}/both")
        @OrgPermissionRequired
        @OrgUnscoped
        public String both() {
            return "";
        }
    }

    @Test
    void theCheckerAcceptsACompliantControllerAndCatchesEveryKindOfViolation() {
        assertThat(violations(List.of(GoodFixture.class))).isEmpty();
        List<String> bad = violations(List.of(BadFixture.class));
        assertThat(bad).hasSize(4);
        assertThat(bad).anyMatch(s -> s.contains("forgot"));
        assertThat(bad).anyMatch(s -> s.contains("unscopedWithOrg"));
        assertThat(bad).anyMatch(s -> s.contains("checkedWithoutOrg"));
        assertThat(bad).anyMatch(s -> s.contains("both"));
    }
}
