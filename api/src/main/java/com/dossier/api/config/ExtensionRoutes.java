package com.dossier.api.config;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The routes an ENTERPRISE account's extension token ({@code ext=1}, decision O4, docs/enterprise-v2/19 sections 6.2 and 6.3) may reach, and nothing
 * else. It is the list of the endpoints the browser extension really calls (job-autofill/src/lib/tracking.js and the service worker), plus the
 * workspace routes of the token's own organization. A pure, dependency-free class so a unit test pins the list in both directions.
 *
 * <p>Organization routes are matched against the token's own {@code tid} only: another organization's id is not on the list.
 */
public final class ExtensionRoutes {

    private record Rule(Set<String> methods, Pattern path) {}

    private static final Set<String> ANY = Set.of("GET", "POST", "PUT", "PATCH", "DELETE");

    private static Rule rule(String methods, String regex) {
        return new Rule("*".equals(methods) ? ANY : Set.of(methods.split(",")), Pattern.compile("^" + regex + "$"));
    }

    /** The organization-independent routes. */
    private static final List<Rule> PLATFORM = List.of(
        rule("GET,PUT", "/api/profile"),
        rule("GET", "/api/profile/version"),
        rule("GET,POST", "/api/profile/resumes"),
        rule("PUT,DELETE", "/api/profile/resumes/[0-9]+"),
        rule("GET,POST", "/api/profile/applications"),
        rule("PUT,DELETE", "/api/profile/applications/[0-9]+"),
        rule("POST", "/api/profile/applications/[0-9]+/attachment"),
        rule("POST", "/api/profile/field-caches/sync"),
        rule("POST", "/api/profile/suggestions"),
        rule("POST", "/api/resumes/[0-9]+/file"),
        rule("GET", "/api/ai/usage"),
        rule("POST", "/api/ai/(draft|job-fit|parse-resume|resume-match)"),
        rule("POST", "/api/telemetry/fills"),
        rule("POST", "/api/telemetry/fills/[^/]+/correction"),
        rule("POST", "/api/bug-reports"),
        rule("POST", "/api/refresh"),
        rule("POST", "/api/logout")
    );

    /** Routes under {@code /api/orgs/{tid}} (the part after the organization id). The id in the path must be the token's own {@code tid}. */
    private static final List<Rule> OF_OWN_ORG = List.of(
        rule("*", "/me-workspace(/.*)?"),
        rule("GET", "/con/opportunities"),
        rule("GET", "/con/opportunities/[0-9]+"),
        rule("POST", "/con/opportunities/[0-9]+/(viewed|interest|decline|request-info|applied|link|unlink)"),
        // Prepare selected openings (docs/enterprise-v2/63): the two POSTs of the contract (plan a batch, report progress on one opening). The status and
        // session reads belong to the web page and are not on this list.
        rule("POST", "/con/prepare"),
        rule("POST", "/con/prepare/[0-9]+/events"),
        rule("GET", "/mkt/opportunities/options"),
        rule("POST", "/mkt/opportunities/from-extension")
    );

    private static final Pattern ORG_PATH = Pattern.compile("^/api/orgs/([0-9]+)(/.*)?$");

    private ExtensionRoutes() {}

    /** Whether an extension token bound to {@code tid} may call {@code method} {@code path} (the path without the context path, normalised). */
    public static boolean allows(String method, String path, Long tid) {
        if (method == null || path == null) return false;
        String m = method.toUpperCase(Locale.ROOT);
        for (Rule r : PLATFORM) if (r.methods().contains(m) && r.path().matcher(path).matches()) return true;
        Matcher org = ORG_PATH.matcher(path);
        if (org.matches() && tid != null && org.group(2) != null && tid.toString().equals(org.group(1))) {
            for (Rule r : OF_OWN_ORG) if (r.methods().contains(m) && r.path().matcher(org.group(2)).matches()) return true;
        }
        return false;
    }
}
