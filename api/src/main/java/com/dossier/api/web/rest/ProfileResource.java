package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.ProfileService;
import com.dossier.api.service.dto.BioDTO;
import com.dossier.api.service.dto.ResumeDTO;
import com.dossier.api.service.ent.consultant.ProfileWorkspaces;
import com.dossier.api.service.ent.consultantws.ConsultantExtensionProfile;
import com.dossier.api.web.rest.vm.ProfileVM;
import com.dossier.api.web.rest.vm.ProfileVersionVM;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * The user-scoped sync API consumed by the extension and web app. Everything here
 * operates on the authenticated user's own data — the profile (single bio) and
 * their resumes. Raw id-based CRUD lives in {@code BioResource}/{@code ResumeResource}.
 */
@RestController
@RequestMapping("/api/profile")
@Tag(name = "profile-sync", description = "User-scoped sync API: the authenticated user's bio and resumes.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ProfileResource {

    private static final Logger LOG = LoggerFactory.getLogger(ProfileResource.class);

    private final ProfileService profileService;
    private final EntitlementService entitlementService;
    private final ProfileWorkspaces workspaces;

    public ProfileResource(ProfileService profileService, EntitlementService entitlementService, ProfileWorkspaces workspaces) {
        this.profileService = profileService;
        this.entitlementService = entitlementService;
        this.workspaces = workspaces;
    }

    private ConsultantExtensionProfile consultantProfile;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setConsultantExtensionProfile(ConsultantExtensionProfile consultantProfile) {
        this.consultantProfile = consultantProfile;
    }

    /**
     * The bio an ORGANIZATION CONSULTANT's extension session ({@code ext=1} + {@code tid}) pulls: their workspace "My Career Profile" laid over the account's
     * own bio, in the bio shape. Empty for every other request, which then gets the account's own bio exactly as before.
     */
    private Optional<BioDTO> consultantBio() {
        if (consultantProfile == null || SecurityUtils.currentExtensionTenant().isEmpty()) return Optional.empty();
        try {
            return consultantProfile.overlay(profileService.getProfile());
        } catch (RuntimeException e) {
            LOG.warn("Could not build the consultant profile for the extension: {}", e.toString());
            return Optional.empty();
        }
    }

    /** {@code GET /api/profile} : the current user's bio, or 404 if none yet. */
    @Operation(
        summary = "Get my bio",
        description = "The current user's bio payload, or 404 if none saved yet. For an organization consultant's browser-extension session (ext token bound to the organization) " +
        "the payload is their workspace career profile (name, phone, location, work mode, work-authorization choice, account email) laid over their own bio."
    )
    @GetMapping("")
    public ResponseEntity<BioDTO> getProfile() {
        LOG.debug("REST request to get the current user's profile");
        Optional<BioDTO> bio = consultantBio();
        if (bio.isEmpty()) bio = profileService.getProfile();
        return bio.map(ResponseEntity::ok).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No profile yet"));
    }

    /**
     * {@code GET /api/profile/version} : a fingerprint of the current user's bio + resumes (Phase 11.2).
     * The extension polls this — on an alarm, on window focus, on drawer open — and re-pulls its
     * mirror only when the value differs from the one it last pulled under. Deliberately never 404:
     * a user with no profile yet gets a stable "empty" version, so there is always something to compare.
     *
     * <p>Also carries the current {@code plan} (12.3), so the extension learns about an upgrade or
     * a lapse inside a check it already makes, rather than needing its own poll.
     */
    @Operation(
        summary = "Get my profile version",
        description = "A short fingerprint of the current user's bio + resumes. Changes whenever a pull of either would change. Never 404."
    )
    @GetMapping("/version")
    public ResponseEntity<ProfileVersionVM> getProfileVersion() {
        LOG.debug("REST request to get the current user's profile version");
        ProfileWorkspaces.Account account;
        try {
            account = workspaces.accountOfCurrentUser();
        } catch (RuntimeException e) {
            LOG.warn("Could not resolve the account kind of the current user: {}", e.toString());
            account = ProfileWorkspaces.Account.PERSONAL;
        }
        List<ProfileWorkspaces.Workspace> mine;
        try {
            mine = workspaces.ofCurrentUser();
        } catch (RuntimeException e) {
            // the poll that keeps the extension in sync must never fail because the workspace list could not be built
            LOG.warn("Could not list the workspaces of the current user: {}", e.toString());
            mine = List.of();
        }
        Optional<BioDTO> consultantBio = consultantBio();
        String version = consultantBio.isPresent() ? profileService.profileVersion(consultantBio) : profileService.profileVersion();
        ProfileVersionVM vm = new ProfileVersionVM(version, entitlementService.currentUserPlan().plan(), mine, account);
        try {
            addEntitlements(vm);
        } catch (RuntimeException e) {
            // like the lists above: the poll that keeps the extension in sync must never fail because the entitlement detail could not be built
            LOG.warn("Could not add the entitlement detail to the profile version: {}", e.toString());
        }
        return ResponseEntity.ok(vm);
    }

    private com.dossier.api.service.AiBudgetService aiBudget;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setAiBudgetService(com.dossier.api.service.AiBudgetService aiBudget) {
        this.aiBudget = aiBudget;
    }

    /** K7.4: features[], limits{}, aiPct and periodEnd, from the resolved entitlement set (empty when the resolver is not wired or cannot answer). */
    private void addEntitlements(ProfileVersionVM vm) {
        String login = com.dossier.api.security.SecurityUtils.getCurrentUserLogin().orElse(null);
        if (login == null) return;
        entitlementService
            .entitlementsOf(login)
            .ifPresent(set -> {
                vm.setLimits(set.limits());
                vm.setPeriodEnd(set.periodEnd());
            });
        // R-1: features[] follows the legacy rule while billing.catalog.shadow is on; the resolver is only compared
        entitlementService.featuresOf(login).ifPresent(keys -> vm.setFeatures(List.copyOf(keys)));
        if (aiBudget != null) {
            var usage = aiBudget.usage(login);
            if ("budget".equals(usage.metered())) vm.setAiPct(usage.used());
        }
    }

    /** {@code PUT /api/profile} : create or overwrite the current user's bio. */
    @Operation(summary = "Upsert my bio", description = "Create or overwrite the current user's single bio.")
    @PutMapping("")
    public ResponseEntity<BioDTO> putProfile(@Valid @RequestBody ProfileVM vm) {
        LOG.debug("REST request to upsert the current user's profile");
        return ResponseEntity.ok(profileService.upsertProfile(vm.getPayload()));
    }

    /** {@code GET /api/profile/resumes} : the current user's resumes. */
    @Operation(summary = "List my resumes", description = "All resumes owned by the current user.")
    @GetMapping("/resumes")
    public List<ResumeDTO> listResumes() {
        LOG.debug("REST request to list the current user's resumes");
        return profileService.listResumes();
    }

    // Note: no @Valid on resume create/update — a resume is synced before its file
    // exists, so the DTO's @NotNull r2ObjectKey isn't required here; the service
    // fills server-owned fields (object key, status, createdAt, user).

    /** {@code POST /api/profile/resumes} : create a resume owned by the current user. */
    @Operation(summary = "Create a resume", description = "Create a resume owned by the current user (server fills object key, status, createdAt).")
    @PostMapping("/resumes")
    public ResponseEntity<ResumeDTO> createResume(@RequestBody ResumeDTO resumeDTO) {
        LOG.debug("REST request to create a resume for the current user");
        return ResponseEntity.status(HttpStatus.CREATED).body(profileService.createResume(resumeDTO));
    }

    /** {@code PUT /api/profile/resumes/:id} : update one of the current user's resumes. */
    @Operation(summary = "Update a resume", description = "Update one of the current user's resumes; 404 if not owned.")
    @PutMapping("/resumes/{id}")
    public ResponseEntity<ResumeDTO> updateResume(@PathVariable("id") Long id, @RequestBody ResumeDTO resumeDTO) {
        LOG.debug("REST request to update resume {} for the current user", id);
        return ResponseEntity.ok(profileService.updateResume(id, resumeDTO));
    }

    /** {@code DELETE /api/profile/resumes/:id} : delete one of the current user's resumes. */
    @Operation(summary = "Delete a resume", description = "Delete one of the current user's resumes (and its stored file); 404 if not owned.")
    @DeleteMapping("/resumes/{id}")
    public ResponseEntity<Void> deleteResume(@PathVariable("id") Long id) {
        LOG.debug("REST request to delete resume {} for the current user", id);
        profileService.deleteResume(id);
        return ResponseEntity.noContent().build();
    }
}
