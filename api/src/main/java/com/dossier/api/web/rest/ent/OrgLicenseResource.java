package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.ent.licenses.OrgLicenseService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consultant licences of one organization (LICENCES-BUILD.md L3): the Consultant Licenses page reads and changes them here. No money moves: a change
 * works at once and is billed by nobody (user decision 2026-11-10). Reads need {@code licenses.view}, writes {@code licenses.manage}; anything else is
 * a 404. Rows are keyed by consultant id.
 */
@RestController("entOrgLicenseResource")
@RequestMapping("/api/orgs/{orgId}/licenses")
@Tag(name = "Organization licences")
public class OrgLicenseResource {

    public record FeaturesVM(List<String> features) {
        Set<String> keys() {
            return features == null ? Set.of() : new LinkedHashSet<>(features);
        }
    }

    public record ReasonVM(String reason) {}

    private final OrgLicenseService licenses;
    private final DemoGuard demoGuard;

    public OrgLicenseResource(OrgLicenseService licenses, DemoGuard demoGuard) {
        this.licenses = licenses;
        this.demoGuard = demoGuard;
    }

    @Operation(summary = "Consultants and their licences", description = "licenses.view. Every active consultant, by name, with status (NONE, ACTIVE, SUSPENDED, ENDING, ENDED), add-ons and the monthly price where the organization has a contract price (null = not set).")
    @GetMapping
    @OrgPermissionRequired
    public List<OrgLicenseService.Row> list(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return licenses.list(me);
    }

    @Operation(summary = "What a licence can carry", description = "licenses.view. The base licence and the add-ons this organization can give, each with its contract price or null (price not set).")
    @GetMapping("/catalog")
    @OrgPermissionRequired
    public OrgLicenseService.Catalog catalog(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return licenses.catalog(me);
    }

    @Operation(summary = "One consultant's licence and its history", description = "licenses.view. 404 for a consultant of another organization or one who is not active.")
    @GetMapping("/{consultantId}")
    @OrgPermissionRequired
    public OrgLicenseService.Detail get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId) {
        return licenses.get(me, consultantId);
    }

    @Operation(summary = "Give a consultant a licence", description = "licenses.manage. Body {features: [keys]} (may be empty: the base licence alone). 409 ALREADY_LICENSED, 422 for an unknown add-on. Works at once; nothing is billed.")
    @PostMapping("/{consultantId}")
    @OrgPermissionRequired
    public OrgLicenseService.Detail give(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId, @RequestBody(required = false) FeaturesVM body) {
        demoGuard.assertNotDemo();
        return licenses.give(me, consultantId, body == null ? Set.of() : body.keys());
    }

    @Operation(summary = "Set a licence's add-ons", description = "licenses.manage. Body {features: [keys]}: the licence carries exactly these afterwards (new ones start now, missing ones stop now). 409 NO_LICENSE.")
    @PutMapping("/{consultantId}/features")
    @OrgPermissionRequired
    public OrgLicenseService.Detail setFeatures(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId, @RequestBody FeaturesVM body) {
        demoGuard.assertNotDemo();
        return licenses.setFeatures(me, consultantId, body == null ? Set.of() : body.keys());
    }

    @Operation(summary = "Suspend a licence", description = "licenses.manage. Body {reason} (3+ characters). Every add-on stops now and comes back on reactivate.")
    @PostMapping("/{consultantId}/suspend")
    @OrgPermissionRequired
    public OrgLicenseService.Detail suspend(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId, @RequestBody ReasonVM body) {
        demoGuard.assertNotDemo();
        return licenses.suspend(me, consultantId, body == null ? null : body.reason());
    }

    @Operation(summary = "Reactivate a suspended licence", description = "licenses.manage. The add-ons it had come back.")
    @PostMapping("/{consultantId}/reactivate")
    @OrgPermissionRequired
    public OrgLicenseService.Detail reactivate(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId) {
        demoGuard.assertNotDemo();
        return licenses.reactivate(me, consultantId);
    }

    @Operation(summary = "End a licence", description = "licenses.manage. Body {reason} (3+ characters). Ends now with its add-ons; a new licence later is a new row.")
    @PostMapping("/{consultantId}/end")
    @OrgPermissionRequired
    public OrgLicenseService.Detail end(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId, @RequestBody ReasonVM body) {
        demoGuard.assertNotDemo();
        return licenses.end(me, consultantId, body == null ? null : body.reason());
    }
}
