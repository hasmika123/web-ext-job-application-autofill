package com.dossier.api.web.rest;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ent.domains.AdminExtensionPackageService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * Platform admin: the settings of an organization's own extension build (CUSTOM-DOMAINS-BUILD.md A6). {@code ROLE_ADMIN} only. The admin downloads them
 * from the organization's page and runs {@code node web/scripts/package-org-extension.mjs --config <file>}, which makes the zip for its unlisted
 * Chrome Web Store item. {@code 409 NO_LIVE_DOMAIN} until the organization has a live custom domain.
 */
@RestController
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminExtensionPackageResource {

    private final AdminExtensionPackageService packages;

    public AdminExtensionPackageResource(AdminExtensionPackageService packages) {
        this.packages = packages;
    }

    @GetMapping("/api/admin/orgs/{id}/extension-package")
    public AdminExtensionPackageService.Package get(@PathVariable("id") Long id) {
        return packages.forOrg(id);
    }
}
