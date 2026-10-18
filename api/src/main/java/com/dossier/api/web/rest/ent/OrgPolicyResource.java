package com.dossier.api.web.rest.ent;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.PolicyDTOs;
import com.dossier.api.service.ent.OrgPolicyService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * An organization's policy pages, Org Admin side (docs/enterprise-v2/62): draft, start from the template, request a review,
 * withdraw. Everything needs {@code org.settings.manage} (OWNER, ADMIN; the same gate as branding). Publishing is not here: a
 * Kiwiply reviewer does it (or the review request itself, when the admin setting {@code enterprise.policies.require_review} is off).
 * Another organization's id, or a kind that is not configured, is the usual generic 404.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/policies")
@Tag(name = "org-policies", description = "Organization policy pages: draft, template, request review, withdraw.")
public class OrgPolicyResource {

    private final OrgPolicyService service;
    private final DemoGuard demoGuard;

    public OrgPolicyResource(OrgPolicyService service, DemoGuard demoGuard) {
        this.service = service;
        this.demoGuard = demoGuard;
    }

    @Operation(summary = "Every configured policy kind with its state and what is live")
    @GetMapping
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public PolicyDTOs.ListView list(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.list(me);
    }

    @Operation(summary = "One policy: the draft, the live text and the history")
    @GetMapping("/{policyKind}")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public PolicyDTOs.Detail get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable("policyKind") String kind) {
        return service.get(me, kind);
    }

    @Operation(
        summary = "Save the draft",
        description = "Body: {body}. A small Markdown subset; HTML, images and unsafe links are refused (422 POLICY_BODY_INVALID). "
            + "If-Match: the draftVersion the editor last saw (409 POLICY_DRAFT_CONFLICT when stale). 409 POLICY_STATE while in review."
    )
    @PutMapping("/{policyKind}/draft")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public PolicyDTOs.Detail saveDraft(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable("policyKind") String kind,
        @RequestHeader(value = "If-Match", required = false) String ifMatch,
        @RequestBody Map<String, Object> request
    ) {
        demoGuard.assertNotDemo();
        Object body = request.get("body");
        if (!(body instanceof String text)) throw OrgException.invalid("body", "must be text");
        return service.saveDraft(me, kind, text, parseIfMatch(ifMatch));
    }

    @Operation(summary = "Replace the draft with the neutral template (the organization's name and support contact merged in)")
    @PostMapping("/{policyKind}/template")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public PolicyDTOs.Detail template(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable("policyKind") String kind) {
        demoGuard.assertNotDemo();
        return service.startFromTemplate(me, kind);
    }

    @Operation(summary = "Send the draft to a Kiwiply reviewer", description = "409 POLICY_STATE unless DRAFT or CHANGES_REQUESTED; 409 POLICY_NOTHING_TO_SEND when it equals the live text.")
    @PostMapping("/{policyKind}/request-review")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public PolicyDTOs.Detail requestReview(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable("policyKind") String kind) {
        demoGuard.assertNotDemo();
        return service.requestReview(me, kind);
    }

    @Operation(summary = "Take an in-review submission back to the draft")
    @PostMapping("/{policyKind}/withdraw")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public PolicyDTOs.Detail withdraw(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable("policyKind") String kind) {
        demoGuard.assertNotDemo();
        return service.withdraw(me, kind);
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
