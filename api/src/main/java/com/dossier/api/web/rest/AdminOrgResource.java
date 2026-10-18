package com.dossier.api.web.rest;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.dto.AdminOrgDTOs.Created;
import com.dossier.api.service.dto.AdminOrgDTOs.CreateRequest;
import com.dossier.api.service.dto.AdminOrgDTOs.Detail;
import com.dossier.api.service.dto.AdminOrgDTOs.EnterpriseRequest;
import com.dossier.api.service.dto.AdminOrgDTOs.LabelCheck;
import com.dossier.api.service.dto.AdminOrgDTOs.ModuleRequest;
import com.dossier.api.service.dto.AdminOrgDTOs.OrgRow;
import com.dossier.api.service.dto.AdminOrgDTOs.ReasonRequest;
import com.dossier.api.service.dto.AdminOrgDTOs.ResetResult;
import com.dossier.api.service.dto.AdminOrgDTOs.SubdomainRequest;
import com.dossier.api.service.dto.AdminOrgDTOs.Summary;
import com.dossier.api.service.ent.AdminOrgService;
import com.dossier.api.service.org.OrgException;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.PaginationUtil;

/**
 * Platform admin: Organizations and hostnames (Enterprise V2, X1.11). The start of enterprise onboarding: list organizations,
 * open one, provision its subdomain, turn enterprise on for it, suspend or resume a hostname, and create an organization with its
 * owner invited. {@code ROLE_ADMIN} only (the same admin session as every other {@code /api/admin} endpoint); every mutation
 * writes an admin audit row and a HIGH row in the organization's own trail. No member data leaves here, only counts.
 */
@RestController
@RequestMapping("/api/admin/orgs")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminOrgResource {

    private final AdminOrgService service;

    public AdminOrgResource(AdminOrgService service) {
        this.service = service;
    }

    /** {@code status}: an organization status; {@code type}: an organization type; {@code enterprise}: true / false = switched on / off for the organization. */
    @GetMapping
    public ResponseEntity<List<OrgRow>> list(
        @RequestParam(name = "search", required = false) String search,
        @RequestParam(name = "status", required = false) String status,
        @RequestParam(name = "type", required = false) String type,
        @RequestParam(name = "enterprise", required = false) Boolean enterprise,
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        Page<OrgRow> page = service.list(search, status, type, enterprise, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return new ResponseEntity<>(page.getContent(), headers, HttpStatus.OK);
    }

    @GetMapping("/summary")
    public Summary summary() {
        return service.summary();
    }

    /** The provision dialog's live check. {@code orgId} is the organization the label is for; omit it when creating one. */
    @GetMapping("/label-check")
    public LabelCheck labelCheck(@RequestParam(name = "label", required = false) String label, @RequestParam(name = "orgId", required = false) Long orgId) {
        return service.checkLabel(orgId, label);
    }

    @GetMapping("/{id}")
    public Detail detail(@PathVariable("id") Long id) {
        return service.detail(id);
    }

    @PostMapping
    public ResponseEntity<Created> create(@RequestBody CreateRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(req));
    }

    @PostMapping("/{id}/hostnames/subdomain")
    public Detail provision(@PathVariable("id") Long id, @RequestBody SubdomainRequest req) {
        if (req == null) throw OrgException.invalid("label", "is required");
        return service.provisionSubdomain(id, req.label());
    }

    @PostMapping("/{id}/enterprise")
    public Detail enterprise(@PathVariable("id") Long id, @RequestBody EnterpriseRequest req) {
        if (req == null || req.on() == null) throw OrgException.invalid("on", "is required");
        return service.setEnterprise(id, req.on(), req.reason());
    }

    /** A new temporary password for an owner who has not yet set their own; returned once. */
    @PostMapping("/{id}/owner/reset-password")
    public ResetResult resetOwnerPassword(@PathVariable("id") Long id, @RequestBody ReasonRequest req) {
        return service.resetOwnerPassword(id, req == null ? null : req.reason());
    }

    @PostMapping("/{id}/modules")
    public Detail module(@PathVariable("id") Long id, @RequestBody ModuleRequest req) {
        if (req == null || req.on() == null) throw OrgException.invalid("on", "is required");
        return service.setModule(id, req.key(), req.on(), req.reason());
    }

    @PostMapping("/{id}/hostnames/{hid}/suspend")
    public Detail suspend(@PathVariable("id") Long id, @PathVariable("hid") Long hid, @RequestBody ReasonRequest req) {
        return service.suspendHostname(id, hid, req == null ? null : req.reason());
    }

    @PostMapping("/{id}/hostnames/{hid}/resume")
    public Detail resume(@PathVariable("id") Long id, @PathVariable("hid") Long hid, @RequestBody ReasonRequest req) {
        return service.resumeHostname(id, hid, req == null ? null : req.reason());
    }
}
