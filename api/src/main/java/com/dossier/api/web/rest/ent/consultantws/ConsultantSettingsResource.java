package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantSettingsDTO;
import com.dossier.api.service.ent.consultantws.ConsultantSettingsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consultant workspace Settings: the caller's OWN privacy and appearance settings plus read-only account and career summaries. 404 for anyone
 * who is not a consultant of this organization. Every write answers with the fresh page and appends a setting event. No password, token,
 * key or phone number is accepted or returned.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/settings")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantSettingsResource {

    private final ConsultantSettingsService service;

    public ConsultantSettingsResource(ConsultantSettingsService service) {
        this.service = service;
    }

    @Operation(summary = "Settings page", description = "Tiles, account facts and career preferences (read from the profile), privacy and appearance settings (defaults when none are stored), the tool catalog (all NOT_AVAILABLE), the resume count and recent account activity.")
    @GetMapping
    @OrgPermissionRequired
    public ConsultantSettingsDTO.Response page(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.page(me);
    }

    @Operation(summary = "Update privacy and sharing", description = "profileVisibility ORG_ONLY | APPROVED_EMPLOYERS | PRIVATE and three booleans; every field optional (null keeps the value). A change appends an activity event; sending the stored values changes nothing. 422 on an unknown value.")
    @PutMapping("/privacy")
    @OrgPermissionRequired
    public ConsultantSettingsDTO.Response privacy(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) ConsultantSettingsDTO.PrivacyRequest body
    ) {
        return service.setPrivacy(me, body);
    }

    @Operation(summary = "Update appearance, language and time zone", description = "theme LIGHT | DARK | SYSTEM, language (en-US, en-GB, es-ES, fr-FR, de-DE: a label only) and an IANA time zone; every field optional. A change appends an activity event. 422 on an unknown value.")
    @PutMapping("/appearance")
    @OrgPermissionRequired
    public ConsultantSettingsDTO.Response appearance(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) ConsultantSettingsDTO.AppearanceRequest body
    ) {
        return service.setAppearance(me, body);
    }
}
