package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.ent.domains.OrgDomainService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * An organization's own domains (docs/enterprise-v2/CUSTOM-DOMAINS-BUILD.md, gap A4; 10-domain-routing.md). Module {@code domains}, permission
 * {@code domains.manage}; anything else is the generic 404. The Domains page in Org Admin reads and changes them here.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/hostnames")
@Tag(name = "Organization domains")
public class OrgDomainResource {

    private final OrgDomainService domains;
    private final DemoGuard demoGuard;

    public OrgDomainResource(OrgDomainService domains, DemoGuard demoGuard) {
        this.domains = domains;
        this.demoGuard = demoGuard;
    }

    @Operation(summary = "The organization's domains", description = "domains.manage. Its Kiwiply subdomain (read-only) and its own domains (not removed), with status, last check and certificate state, plus the cap and the edge targets.")
    @GetMapping
    @OrgPermissionRequired
    public OrgDomainService.Overview list(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return domains.list(me);
    }

    @Operation(summary = "Add a domain", description = "domains.manage. Body {hostname}. 422 HOSTNAME_INVALID (a Kiwiply or platform name, localhost, an IP, a bare suffix), 409 HOSTNAME_TAKEN, 422 ORG_LIMIT_REACHED (enterprise.domains.max_custom). PENDING with its ownership token. Audit DOMAIN_ADD.")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @OrgPermissionRequired
    public OrgDomainService.Domain add(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody OrgDomainService.AddRequest body) {
        demoGuard.assertNotDemo();
        return domains.add(me, body);
    }

    @Operation(summary = "The DNS records to add", description = "domains.manage. The ownership TXT record and the routing CNAME (or A record for an apex), built by the server.")
    @GetMapping("/{hostnameId}/instructions")
    @OrgPermissionRequired
    public OrgDomainService.Instructions instructions(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long hostnameId) {
        return domains.instructions(me, hostnameId);
    }

    @Operation(summary = "Check DNS now", description = "domains.manage. Passing makes it VERIFIED, and live at once when enterprise.domains.auto_activate is on; failing keeps it waiting with the reason in lastCheckResult. 429 CHECK_TOO_SOON within a minute of the last check; 409 for a live or suspended domain.")
    @PostMapping("/{hostnameId}/verify")
    @OrgPermissionRequired
    public OrgDomainService.Domain verify(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long hostnameId) {
        demoGuard.assertNotDemo();
        return domains.verify(me, hostnameId);
    }

    @Operation(summary = "Make a verified domain live", description = "domains.manage. When auto-activate is off. Re-checks DNS first: 409 CHECK_FAILED. Audit DOMAIN_ACTIVATED.")
    @PostMapping("/{hostnameId}/activate")
    @OrgPermissionRequired
    public OrgDomainService.Domain activate(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long hostnameId) {
        demoGuard.assertNotDemo();
        return domains.activate(me, hostnameId);
    }

    @Operation(summary = "Suspend a live domain", description = "domains.manage. Body {reason}. It stops answering at once. 409 for the main address. Audit DOMAIN_SUSPENDED.")
    @PostMapping("/{hostnameId}/suspend")
    @OrgPermissionRequired
    public OrgDomainService.Domain suspend(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long hostnameId, @RequestBody OrgDomainService.ReasonRequest body) {
        demoGuard.assertNotDemo();
        return domains.suspend(me, hostnameId, body);
    }

    @Operation(summary = "Resume a suspended domain", description = "domains.manage. Re-checks DNS now: 409 CHECK_FAILED when it doesn't pass. Audit DOMAIN_RESUMED.")
    @PostMapping("/{hostnameId}/resume")
    @OrgPermissionRequired
    public OrgDomainService.Domain resume(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long hostnameId) {
        demoGuard.assertNotDemo();
        return domains.resume(me, hostnameId);
    }

    @Operation(summary = "Remove a domain", description = "domains.manage. Body {confirm}: the domain typed exactly. 409 SUBDOMAIN_MANAGED (Kiwiply's address), 409 PRIMARY_REQUIRED (the main address). The name can be added again later. Audit DOMAIN_REMOVED.")
    @PostMapping("/{hostnameId}/remove")
    @OrgPermissionRequired
    public OrgDomainService.Domain remove(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long hostnameId, @RequestBody OrgDomainService.RemoveRequest body) {
        demoGuard.assertNotDemo();
        return domains.remove(me, hostnameId, body);
    }
}
