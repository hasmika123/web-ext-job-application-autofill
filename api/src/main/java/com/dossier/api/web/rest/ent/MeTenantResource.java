package com.dossier.api.web.rest.ent;

import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.ent.MeTenantDTO;
import com.dossier.api.service.ent.MeTenantService;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.org.OrgNotFoundException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The tenant session contract (X2.2, 12-identity.md section 3): what the shell on an organization's host needs to draw itself,
 * about the signed-in caller in the organization of that host. The route takes no organization id on purpose: the tenant is the
 * one the API derived from the forwarded host, the token must carry the same {@code tid}, and anything else is a 404 (see
 * {@link MeTenantService}). It is therefore outside the {@code /api/orgs/{orgId}} registry of {@code OrgIsolationIT} (there is no
 * id to substitute); {@code MeTenantResourceIT} carries its cross-tenant cases.
 */
@RestController
@Tag(name = "tenant", description = "The signed-in member's view of the organization on this host.")
public class MeTenantResource {

    private final MeTenantService service;

    public MeTenantResource(MeTenantService service) {
        this.service = service;
    }

    @Operation(
        summary = "The shell's session contract on a tenant host",
        description = "Tenant hosts only, with a token minted for that tenant (tid). Returns the organization, the caller's seat and roles, their permission map, "
            + "the eight module booleans, the workspaces they may open with their navigation (already filtered by their permissions and the organization's modules), "
            + "the landing workspace, their consent scope and licensed features. ETag / If-None-Match supported (304). "
            + "403 MEMBER_SUSPENDED for a suspended member (no organization data); 404 for a platform or unknown host, enterprise off or a non-member; 401 for a token that is not for this tenant (none, personal or another organization's)."
    )
    @GetMapping("/api/me/tenant")
    public ResponseEntity<MeTenantDTO> tenant(HttpServletRequest request) {
        Object attr = request.getAttribute(TenantContextHolder.REQUEST_ATTRIBUTE);
        TenantContext context = attr instanceof TenantContext c ? c : null;
        if (context == null) throw new OrgNotFoundException(); // no resolution ran: enterprise is off
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        Long tid = auth instanceof JwtAuthenticationToken jwt && jwt.getToken().getClaim(SecurityUtils.TENANT_CLAIM) instanceof Number n ? Long.valueOf(n.longValue()) : null;
        MeTenantService.Answer answer = service.forCaller(context, tid);
        String ifNoneMatch = request.getHeader(HttpHeaders.IF_NONE_MATCH);
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(HttpStatus.OK)
            .eTag(answer.etag())
            .cacheControl(CacheControl.noCache().cachePrivate())
            .header(HttpHeaders.VARY, "Authorization, X-Kiwiply-Host");
        if (matches(ifNoneMatch, answer.etag())) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(answer.etag()).cacheControl(CacheControl.noCache().cachePrivate()).header(HttpHeaders.VARY, "Authorization, X-Kiwiply-Host").build();
        }
        return ok.body(answer.body());
    }

    private static boolean matches(String header, String etag) {
        if (header == null || header.isBlank()) return false;
        for (String candidate : header.split(",")) {
            String c = candidate.trim();
            if (c.startsWith("W/")) c = c.substring(2);
            if (c.equals(etag) || c.equals("*")) return true;
        }
        return false;
    }
}
