package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.Response;
import com.dossier.api.service.ent.consultantws.ConsultantProfileService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Consultant workspace "My Career Profile": the caller's OWN profile, skills, certifications, preferences and availability.
 * Gate = {@code ConsultantHomeService.requireSelf} (opportunities.respond + own consultant_profile); 404 for everyone else. No path
 * or body ever names a consultant. Every write answers with the fresh profile view.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/profile")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantProfileResource {

    private final ConsultantProfileService service;

    public ConsultantProfileResource(ConsultantProfileService service) {
        this.service = service;
    }

    public record StatusBody(String status) {}

    public record TextBody(String text) {}

    public record ChoiceBody(String value) {}

    public record SkillBody(String skill) {}

    public record CertificationBody(String name, String issuer, String issuedOn) {}

    public record PrefBody(String kind, String value) {}

    public record TypesBody(List<String> values) {}

    @Operation(summary = "My career profile", description = "Identity, strength with the missing details, summary, skills, certifications, experience highlights, preferences, work-authorization choice and career goals, all for the caller's own consultant record. 404 for everyone else.")
    @GetMapping
    @OrgPermissionRequired
    public Response get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.profile(me);
    }

    @Operation(summary = "Set availability", description = "status: AVAILABLE, ON_PROJECT, NOTICE or UNAVAILABLE.")
    @PutMapping("/availability")
    @OrgPermissionRequired
    public Response availability(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody StatusBody body) {
        return service.setAvailability(me, body.status());
    }

    @Operation(summary = "Edit the professional summary", description = "Saved on the primary resume, or on the profile while the consultant has no resume. Blank clears it. PII-scanned.")
    @PutMapping("/summary")
    @OrgPermissionRequired
    public Response summary(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody TextBody body) {
        return service.setSummary(me, body.text());
    }

    @Operation(summary = "Edit career goals", description = "Free text, at most 1000 characters, PII-scanned. Blank clears it.")
    @PutMapping("/career-goals")
    @OrgPermissionRequired
    public Response careerGoals(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody TextBody body) {
        return service.setCareerGoals(me, body.text());
    }

    @Operation(summary = "Set the work-authorization choice", description = "A status choice only (AUTHORIZED_NO_SPONSORSHIP, AUTHORIZED_NEEDS_SPONSORSHIP, NOT_AUTHORIZED); null clears it. Never a document or visa number.")
    @PutMapping("/work-authorization")
    @OrgPermissionRequired
    public Response workAuthorization(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody ChoiceBody body) {
        return service.setWorkAuthorization(me, body.value());
    }

    @Operation(summary = "Set preferred employment types", description = "values: any of CONTRACT, CONTRACT_TO_HIRE, FULL_TIME, PART_TIME (replaces the set).")
    @PutMapping("/employment-types")
    @OrgPermissionRequired
    public Response employmentTypes(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody TypesBody body) {
        return service.setEmploymentTypes(me, body.values());
    }

    @Operation(summary = "Add a skill")
    @PostMapping("/skills")
    @OrgPermissionRequired
    public Response addSkill(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody SkillBody body) {
        return service.addSkill(me, body.skill());
    }

    @Operation(summary = "Remove a skill", description = "404 when the skill is not the caller's.")
    @DeleteMapping("/skills/{skillId}")
    @OrgPermissionRequired
    public Response removeSkill(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long skillId) {
        return service.removeSkill(me, skillId);
    }

    @Operation(summary = "Add a certification", description = "name, optional issuer and optional issuedOn (yyyy-MM, a past month).")
    @PostMapping("/certifications")
    @OrgPermissionRequired
    public Response addCertification(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody CertificationBody body) {
        return service.addCertification(me, body.name(), body.issuer(), body.issuedOn());
    }

    @Operation(summary = "Remove a certification", description = "404 when the certification is not the caller's.")
    @DeleteMapping("/certifications/{certId}")
    @OrgPermissionRequired
    public Response removeCertification(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long certId) {
        return service.removeCertification(me, certId);
    }

    @Operation(summary = "Add a preferred role or location", description = "kind ROLE or LOCATION; duplicates (any case) are ignored.")
    @PostMapping("/prefs")
    @OrgPermissionRequired
    public Response addPref(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody PrefBody body) {
        return service.addPref(me, body.kind(), body.value());
    }

    @Operation(summary = "Remove a preferred role or location", description = "404 when the entry is not the caller's.")
    @DeleteMapping("/prefs/{prefId}")
    @OrgPermissionRequired
    public Response removePref(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long prefId) {
        return service.removePref(me, prefId);
    }
}
