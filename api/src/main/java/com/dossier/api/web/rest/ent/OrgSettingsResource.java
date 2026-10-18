package com.dossier.api.web.rest.ent;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.OrgSettingsDTO;
import com.dossier.api.service.ent.settings.OrgSettingsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Organization Settings, General and Security (X2.9). Needs {@code org.settings.manage} (OWNER, ADMIN). The organization is the one in the path,
 * authorised against the caller's seat; another organization's id is the usual generic 404. The legal name is not editable here.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/org-settings")
@Tag(name = "org-settings", description = "Organization Settings: general (display name, time zone, language, contact e-mail) and security (idle session timeout, password minimum).")
public class OrgSettingsResource {

    private final OrgSettingsService service;
    private final DemoGuard demoGuard;

    public OrgSettingsResource(OrgSettingsService service, DemoGuard demoGuard) {
        this.service = service;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "The General and Security settings with the bounds the platform allows",
        description = "{general:{legalName (read only), displayName, timeZone, locale, contactEmail}, security:{sessionTimeoutMinutes, passwordMinLength (null = platform behaviour), bounds, reasonMinChars}, locales:[...]}."
    )
    @GetMapping
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public ResponseEntity<OrgSettingsDTO> get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(me));
    }

    @Operation(
        summary = "Change the general settings",
        description = "Partial body {displayName?, timeZone?, locale?, contactEmail?}: an absent field is left alone, null or empty clears it. 422 ORG_INVALID names a bad field (time zone must be IANA, locale from the allowed list). One ORG_SETTINGS audit row naming the fields."
    )
    @PutMapping("/general")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public ResponseEntity<OrgSettingsDTO> putGeneral(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody JsonNode body) {
        demoGuard.assertNotDemo();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.saveGeneral(me, body));
    }

    @Operation(
        summary = "Change the security settings (a reason is required)",
        description = "Partial body {sessionTimeoutMinutes?, passwordMinLength?, reason}: null clears a value back to the platform behaviour. Values must sit inside the bounds from GET (422 ORG_INVALID otherwise). " +
            "400 REASON_REQUIRED without a reason of at least reasonMinChars when anything changes. One ORG_SETTINGS audit row with old value, new value and the reason."
    )
    @PutMapping("/security")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public ResponseEntity<OrgSettingsDTO> putSecurity(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody JsonNode body) {
        demoGuard.assertNotDemo();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.saveSecurity(me, body));
    }
}
