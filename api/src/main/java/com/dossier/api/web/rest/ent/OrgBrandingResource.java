package com.dossier.api.web.rest.ent;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.OrgBrandingDTO;
import com.dossier.api.service.ent.OrgBrandingService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * An organization's portal branding (X2.5): a draft the editor autosaves into, a publish that makes it live (the public
 * tenant view and asset route only ever read published values), versions, and logo / favicon / banner uploads (raster only).
 * Everything needs {@code org.settings.manage} (OWNER, ADMIN; the dedicated {@code branding.manage} permission arrives with
 * roles-as-data, X1.6). Another organization's id is the usual generic 404.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/branding")
@Tag(name = "org-branding", description = "Organization branding: draft, publish, versions, assets.")
public class OrgBrandingResource {

    private final OrgBrandingService service;
    private final DemoGuard demoGuard;

    public OrgBrandingResource(OrgBrandingService service, DemoGuard demoGuard) {
        this.service = service;
        this.demoGuard = demoGuard;
    }

    @Operation(summary = "Published values, the draft, its version and the publish history")
    @GetMapping
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public OrgBrandingDTO get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.get(me);
    }

    @Operation(
        summary = "Check a colour for the live preview",
        description = "Can white text be read on this colour (WCAG AA 4.5:1)? When not, the nearest colour that can. Query: primary, secondary, accent (each optional)."
    )
    @GetMapping("/preview-theme")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public Map<String, OrgBrandingDTO.ColourCheck> previewTheme(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String primary,
        @RequestParam(required = false) String secondary,
        @RequestParam(required = false) String accent
    ) {
        Map<String, OrgBrandingDTO.ColourCheck> out = new java.util.LinkedHashMap<>();
        if (primary != null) out.put("primary", service.checkColour(primary));
        if (secondary != null) out.put("secondary", service.checkColour(secondary));
        if (accent != null) out.put("accent", service.checkColour(accent));
        return out;
    }

    @Operation(
        summary = "Edit the draft (partial)",
        description = "Body: any of primary, secondary, accent (#rrggbb, white text must reach 4.5:1 -> 422 BRANDING_COLOR_LOW_CONTRAST with a suggestion), theme, "
            + "welcomeTitle, welcomeMessage, supportEmail, terminology, navPrefs; null clears a field. If-Match: the draftVersion the editor last saw (409 BRANDING_DRAFT_CONFLICT when stale)."
    )
    @PatchMapping("/draft")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public OrgBrandingDTO patchDraft(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "If-Match", required = false) String ifMatch,
        @RequestBody Map<String, Object> patch
    ) {
        demoGuard.assertNotDemo();
        return service.patchDraft(me, patch, parseIfMatch(ifMatch));
    }

    @Operation(summary = "Publish the draft", description = "Validates everything, makes the draft live, appends a version, bumps config_version. 409 BRANDING_NOTHING_TO_PUBLISH when the draft equals what is live.")
    @PostMapping("/publish")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public OrgBrandingDTO.Published publish(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        demoGuard.assertNotDemo();
        return service.publish(me);
    }

    @Operation(summary = "Throw the draft away (back to what is live); writes no audit row")
    @PostMapping("/discard")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public OrgBrandingDTO discard(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        demoGuard.assertNotDemo();
        return service.discard(me);
    }

    @Operation(summary = "Copy a published version into the draft (does not publish)")
    @PostMapping("/versions/{versionNo}/restore")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public OrgBrandingDTO restore(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable int versionNo) {
        demoGuard.assertNotDemo();
        return service.restore(me, versionNo);
    }

    @Operation(
        summary = "Upload a logo, favicon or banner into the draft",
        description = "multipart field 'file'. PNG, JPEG or WebP only (magic bytes decide); SVG and anything else -> 415 BRANDING_ASSET_UNSUPPORTED_TYPE; "
            + "over the size cap -> 413 BRANDING_ASSET_TOO_LARGE; too small -> 422 BRANDING_ASSET_TOO_SMALL; not an image or not square (favicon) -> 422. PNG/JPEG are re-encoded (metadata stripped)."
    )
    @PostMapping("/assets/{kind}")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public ResponseEntity<OrgBrandingDTO> upload(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable String kind,
        @RequestParam("file") MultipartFile file
    ) throws IOException {
        demoGuard.assertNotDemo();
        return ResponseEntity.ok(service.uploadAsset(me, kind, file.getBytes()));
    }

    @Operation(summary = "Remove the logo, favicon or banner from the draft")
    @DeleteMapping("/assets/{kind}")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public OrgBrandingDTO removeAsset(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable String kind) {
        demoGuard.assertNotDemo();
        return service.removeAsset(me, kind);
    }

    private static Integer parseIfMatch(String header) {
        if (header == null || header.isBlank()) return null;
        String v = header.strip();
        if (v.startsWith("W/")) v = v.substring(2);
        v = v.replace("\"", "");
        try {
            return Integer.valueOf(v);
        } catch (NumberFormatException e) {
            throw OrgException.invalid("If-Match", "must be the draftVersion");
        }
    }
}
