package com.dossier.api.web.rest.org;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.TokenIssuer;
import com.dossier.api.service.ent.TenantBinding;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.org.JoinAcceptRequest;
import com.dossier.api.service.dto.org.JoinPreviewDTO;
import com.dossier.api.service.dto.org.JoinResultDTO;
import com.dossier.api.service.org.DataShareService.ShareContext;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgJoinService;
import com.dossier.api.web.filter.JoinRateLimiter;
import com.dossier.api.web.filter.RateLimitFilter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.function.Supplier;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Joining an organization from an email invite or a shared link (O2.2; onboarding-invites.md sections 3.1 and 4). The two
 * previews are public (the link is the credential): they show the org, who invited you and what you will be asked, answer
 * one generic 404 for anything that is not a live link, are never cached or indexed, and are rate limited per visitor
 * (misses far tighter, so the code space cannot be walked). Accepting needs a signed-in account and is the consent step.
 * Called by the web app on the visitor's behalf, which forwards their address in {@code X-Forwarded-For}.
 */
@RestController
@RequestMapping("/api/join")
@Tag(name = "org-join", description = "Join an organization from an invite or a join code.")
public class JoinResource {

    private final OrgJoinService joinService;
    private final JoinRateLimiter limiter;
    private final DemoGuard demoGuard;
    private final TokenIssuer tokenIssuer;

    public JoinResource(OrgJoinService joinService, JoinRateLimiter limiter, DemoGuard demoGuard, TokenIssuer tokenIssuer) {
        this.joinService = joinService;
        this.limiter = limiter;
        this.demoGuard = demoGuard;
        this.tokenIssuer = tokenIssuer;
    }

    @Operation(summary = "Preview an emailed invite", description = "No authentication. 404 for anything that is not a live invite, 409 INVITE_EXPIRED once it has run out, 429 over the rate limit.")
    @GetMapping("/{token}")
    @OrgUnscoped
    public ResponseEntity<?> previewInvite(@PathVariable("token") String token, HttpServletRequest request) {
        return guarded(request, () -> joinService.previewInvite(token));
    }

    @Operation(summary = "Preview a shared join link", description = "No authentication. 404 for an unknown or revoked code, 409 INVITE_EXPIRED when it has expired or has no places left.")
    @GetMapping("/code/{code}")
    @OrgUnscoped
    public ResponseEntity<?> previewCode(@PathVariable("code") String code, HttpServletRequest request) {
        return guarded(request, () -> joinService.previewCode(code));
    }

    @Operation(summary = "Accept an emailed invite", description = "Signed in. Becomes a member and records the consent choice (NONE or SUMMARY) with the text version. 409 ALREADY_MEMBER, INVITE_EXPIRED or SEAT_STATE.")
    @PostMapping("/{token}/accept")
    @OrgUnscoped
    public ResponseEntity<?> acceptInvite(@PathVariable("token") String token, @RequestBody JoinAcceptRequest body, HttpServletRequest request) {
        demoGuard.assertNotDemo();
        return guarded(request, () -> withTenantSession(joinService.acceptInvite(token, body, context(request))));
    }

    @Operation(summary = "Join with a shared code", description = "Signed in. Same as accepting an invite, for a join link a cohort shares. Members only.")
    @PostMapping("/code/{code}")
    @OrgUnscoped
    public ResponseEntity<?> acceptCode(@PathVariable("code") String code, @RequestBody JoinAcceptRequest body, HttpServletRequest request) {
        demoGuard.assertNotDemo();
        return guarded(request, () -> withTenantSession(joinService.acceptCode(code, body, context(request))));
    }

    /**
     * Accepting on an organization's own host (X1.8, 12-identity.md section 5): the person signed in BEFORE they held a seat, so
     * their token has no {@code tid}. Now that they are a member the response carries a fresh pair bound to this tenant
     * ({@code tid}, {@code hid}); the web replaces its cookies with it. Anywhere else the result is unchanged.
     */
    private JoinResultDTO withTenantSession(JoinResultDTO result) {
        TenantContext c = TenantContextHolder.current().orElse(null);
        if (c == null || !c.isTenant() || !c.orgId().equals(result.orgId())) return result;
        org.springframework.security.core.Authentication auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        Long userId = SecurityUtils.getCurrentUserId().orElse(null);
        String login = SecurityUtils.getCurrentUserLogin().orElse(null);
        if (auth == null || userId == null || login == null) return result;
        String authorities = auth.getAuthorities().stream().map(org.springframework.security.core.GrantedAuthority::getAuthority).collect(java.util.stream.Collectors.joining(" "));
        return result.withSession(tokenIssuer.issue(login, authorities, userId, new TenantBinding(c.orgId(), c.hostnameId())));
    }

    /** Rate limits the lookup, runs it, and counts a miss against the visitor. Never cached, never indexed. */
    private ResponseEntity<?> guarded(HttpServletRequest request, Supplier<Object> lookup) {
        long retry = limiter.hit(request);
        if (retry > 0) return tooMany(retry);
        try {
            Object body = lookup.get();
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Robots-Tag", "noindex, nofollow").body(body);
        } catch (com.dossier.api.service.org.OrgNotFoundException notFound) {
            long wait = limiter.miss(request);
            if (wait > 0) return tooMany(wait);
            throw notFound;
        }
    }

    private static ShareContext context(HttpServletRequest request) {
        String ua = request.getHeader(HttpHeaders.USER_AGENT);
        return new ShareContext(OrgAuditService.hashIp(RateLimitFilter.clientIp(request)), OrgAuditService.hashIp(ua));
    }

    private static ResponseEntity<?> tooMany(long retryAfterSeconds) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, Long.toString(retryAfterSeconds)).build();
    }
}
