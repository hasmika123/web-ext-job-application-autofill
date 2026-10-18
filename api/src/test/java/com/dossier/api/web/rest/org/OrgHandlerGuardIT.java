package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * O1.2 acceptance: "a WebMvc test that fails for any /api/orgs/** handler lacking {@code @OrgPermissionRequired}",
 * over the REAL handler mapping, so a handler added in any controller (not only {@code web.rest.org}) is caught the
 * moment it is mapped under {@code /api/orgs}. A handler that names an {@code {orgId}} must use the permission
 * annotation; the few org-less ones must say {@code @OrgUnscoped}.
 */
@IntegrationTest
class OrgHandlerGuardIT {

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping mapping;

    @Test
    void everyHandlerMappedUnderApiOrgsIsGuarded() {
        List<String> problems = new ArrayList<>();
        int seen = 0;
        for (Map.Entry<RequestMappingInfo, HandlerMethod> e : mapping.getHandlerMethods().entrySet()) {
            var patterns = e.getKey().getPathPatternsCondition() == null ? java.util.Set.<String>of() : e.getKey().getPathPatternsCondition().getPatternValues();
            boolean underOrgs = patterns.stream().anyMatch(p -> p.equals("/api/orgs") || p.startsWith("/api/orgs/"));
            if (!underOrgs) continue;
            seen++;
            Method m = e.getValue().getMethod();
            boolean checked = m.isAnnotationPresent(OrgPermissionRequired.class);
            boolean unscoped = m.isAnnotationPresent(OrgUnscoped.class);
            boolean namesOrg = patterns.stream().anyMatch(p -> p.contains("{orgId}"));
            String id = e.getKey() + " -> " + m.getDeclaringClass().getSimpleName() + "#" + m.getName();
            if (!checked && !unscoped) problems.add(id + ": neither @OrgPermissionRequired nor @OrgUnscoped");
            else if (checked && !namesOrg) problems.add(id + ": @OrgPermissionRequired but no {orgId} in the path");
            else if (unscoped && namesOrg) problems.add(id + ": @OrgUnscoped but the path names an {orgId}");
        }
        assertThat(seen).as("org handlers discovered").isGreaterThanOrEqualTo(9);
        assertThat(problems).isEmpty();
    }

    /**
     * The handlers with no {orgId} to scope by. Each one acts on the caller's own person (create an org, list one's own) or
     * on a secret the caller holds (the public join links of O2.2: the token or code IS the credential, and every miss is
     * the same generic 404). Anything added here is a deliberate, reviewed act.
     */
    @Test
    void theOnlyUnscopedHandlersAreTheCallersOwnAndTheJoinLinks() {
        List<String> unscoped = new ArrayList<>();
        for (Map.Entry<RequestMappingInfo, HandlerMethod> e : mapping.getHandlerMethods().entrySet()) {
            Method m = e.getValue().getMethod();
            if (m.isAnnotationPresent(OrgUnscoped.class)) unscoped.add(m.getDeclaringClass().getSimpleName() + "#" + m.getName());
        }
        assertThat(unscoped).containsExactlyInAnyOrder(
            "OrgResource#create",
            "OrgResource#mine",
            "JoinResource#previewInvite",
            "JoinResource#previewCode",
            "JoinResource#acceptInvite",
            "JoinResource#acceptCode"
        );
    }
}
