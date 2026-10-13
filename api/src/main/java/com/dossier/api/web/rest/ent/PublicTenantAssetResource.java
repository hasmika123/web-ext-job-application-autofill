package com.dossier.api.web.rest.ent;

import com.dossier.api.service.ent.OrgBrandingAssets;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.storage.OrgStorageKeys;
import com.dossier.api.web.filter.TenantRateLimiter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * The organization's published logo, favicon and banner, selected by HOST (X2.13): the tenant is the one
 * {@code TenantResolverFilter} derived from the forwarded host, so another organization's file can not be asked for by
 * any parameter. Public, but only for served tenants (the resolver already maps a suspended or closed organization to
 * UNKNOWN, so the next request after a suspension answers 404). Only published keys are read. Everything that is not a
 * published asset of a served tenant is the same generic 404. Rate-limited with the tenant endpoint's limiter.
 * {@code GET} also answers {@code HEAD} (Spring maps it).
 */
@RestController
@Tag(name = "tenant", description = "Public tenant branding for the host a visitor arrived on.")
public class PublicTenantAssetResource {

    static final Duration MAX_AGE = Duration.ofDays(1);

    private final OrgBrandingAssets assets;
    private final TenantRateLimiter limiter;

    public PublicTenantAssetResource(OrgBrandingAssets assets, TenantRateLimiter limiter) {
        this.assets = assets;
        this.limiter = limiter;
    }

    @Operation(
        summary = "A published branding asset of the tenant for the forwarded host",
        description = "kind = logo | favicon | banner. No authentication; the tenant comes from X-Kiwiply-Host only. 404 for a host that is not served, "
            + "an unknown kind or an unset asset. Cache-Control: public, max-age=86400; ETag = the content hash; If-None-Match -> 304; X-Content-Type-Options: nosniff."
    )
    @GetMapping("/api/public/tenant/assets/{kind}")
    public ResponseEntity<byte[]> asset(@PathVariable String kind, HttpServletRequest request) {
        Object attr = request.getAttribute(TenantContextHolder.REQUEST_ATTRIBUTE);
        TenantContext context = attr instanceof TenantContext c ? c : null;
        long retry = limiter.hit(request, context == null ? null : context.host());
        if (retry > 0) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, Long.toString(retry)).build();
        }
        if (context == null || !context.isTenant() || context.orgId() == null || !OrgStorageKeys.BRANDING_KINDS.contains(kind)) {
            throw new OrgNotFoundException();
        }
        String key = assets.publishedKey(context.orgId(), kind).orElseThrow(OrgNotFoundException::new);
        String etag = OrgBrandingAssets.etagOf(key);
        CacheControl cache = CacheControl.maxAge(MAX_AGE).cachePublic();
        String ifNoneMatch = request.getHeader(HttpHeaders.IF_NONE_MATCH);
        if (ifNoneMatch != null && (ifNoneMatch.equals(etag) || ifNoneMatch.equals("W/" + etag))) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(cache).varyBy("X-Kiwiply-Host").build();
        }
        OrgBrandingAssets.Asset asset = assets.read(context.orgId(), kind).orElseThrow(OrgNotFoundException::new);
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(asset.contentType()))
            .eTag(asset.etag())
            .cacheControl(cache)
            .varyBy("X-Kiwiply-Host")
            .header("X-Content-Type-Options", "nosniff")
            .header("Content-Security-Policy", "default-src 'none'; sandbox")
            .body(asset.content());
    }
}
