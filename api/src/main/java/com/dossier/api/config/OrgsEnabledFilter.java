package com.dossier.api.config;

import com.dossier.api.service.org.OrgFeatureFlag;
import com.dossier.api.web.rest.errors.ErrorConstants;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Makes the organization API disappear while the org feature flag is off (E2E-O1.9): every request under
 * {@code /api/orgs}, {@code /api/join} and {@code /api/me/orgs} answers the same 404 body as an org that does not exist,
 * before authentication, so a signed-out probe learns nothing either. Registered ahead of the security chain by
 * {@code OrgWebConfiguration}. The path is normalised first (path parameters, repeated slashes, dot segments) so a
 * decorated URL cannot slip past a prefix check; {@code OrgPermissionInterceptor} checks the flag again for the handlers.
 */
public class OrgsEnabledFilter extends OncePerRequestFilter {

    static final String[] PREFIXES = { "/api/orgs", "/api/join", "/api/me/orgs" };

    private static final ObjectMapper JSON = new ObjectMapper();

    /** The same problem body the translator renders for an org that does not exist (see OrgProblemException and ExceptionTranslator). */
    static String body(String path) {
        ObjectNode n = JSON.createObjectNode();
        n.put("type", ErrorConstants.DEFAULT_TYPE.toString());
        n.put("title", "Not Found");
        n.put("status", 404);
        n.put("detail", "Not found");
        n.put("instance", path);
        n.put("code", "NOT_FOUND");
        n.put("message", "error.org");
        n.put("path", path);
        return n.toString();
    }

    private final OrgFeatureFlag flag;

    public OrgsEnabledFilter(OrgFeatureFlag flag) {
        this.flag = flag;
    }

    /** True for a request path (without the context path) that belongs to the org API. */
    static boolean isOrgPath(String rawPath) {
        if (rawPath == null) return false;
        String path = normalise(rawPath);
        for (String prefix : PREFIXES) {
            if (path.equals(prefix) || path.startsWith(prefix + "/")) return true;
        }
        return false;
    }

    /** The request path without the servlet context path: the one place filters and the interceptor read it from. */
    static String pathOf(HttpServletRequest request) {
        String path = request.getRequestURI();
        String context = request.getContextPath();
        return context != null && !context.isEmpty() && path.startsWith(context) ? path.substring(context.length()) : path;
    }

    static String normalise(String raw) {
        StringBuilder out = new StringBuilder();
        for (String segment : raw.split("/")) {
            int semi = segment.indexOf(';');
            String s = semi >= 0 ? segment.substring(0, semi) : segment;
            if (s.isEmpty() || s.equals(".")) continue;
            if (s.equals("..")) {
                int cut = out.lastIndexOf("/");
                out.setLength(Math.max(cut, 0));
                continue;
            }
            out.append('/').append(s);
        }
        return out.length() == 0 ? "/" : out.toString();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String path = pathOf(request);
        if (isOrgPath(path) && !flag.isEnabled()) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.setContentType("application/problem+json");
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(body(request.getRequestURI()));
            return;
        }
        chain.doFilter(request, response);
    }
}
