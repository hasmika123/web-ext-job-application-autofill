package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.ProfileItemService;
import com.dossier.api.service.ProfileItemService.CompletenessDTO;
import com.dossier.api.service.ProfileItemService.ImportRequest;
import com.dossier.api.service.ProfileItemService.ImportResult;
import com.dossier.api.service.ProfileItemService.ItemPatch;
import com.dossier.api.service.ProfileItemService.NewItem;
import com.dossier.api.service.ProfileItemService.Reorder;
import com.dossier.api.service.dto.ProfileItemDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * The Common Profile's career lists (Resume Builder R1.1): experience, education, skills, projects,
 * certifications, languages, achievements, volunteering, publications, links and custom entries.
 * Everything is scoped to the authenticated user; another user's item id is a 404 for every verb.
 * A sibling of {@link ProfileResource} under {@code /api/profile}.
 *
 * <p>Refusals carry a {@code code}: 422 {@code SENSITIVE_CONTENT {path, class}} for a value the
 * product never collects (SSN, bank / tax / passport / visa numbers, date of birth), 422
 * {@code ITEM_INVALID}, 413 {@code ITEM_TOO_LARGE}, 422 {@code ITEM_LIMIT}.
 */
@RestController
@RequestMapping("/api/profile")
@Tag(name = "profile-items", description = "Common Profile items: CRUD, reorder, import (merge by title + organisation), completeness.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ProfileItemResource {

    private static final Logger LOG = LoggerFactory.getLogger(ProfileItemResource.class);

    private final ProfileItemService profileItemService;
    private final DemoGuard demoGuard;

    public ProfileItemResource(ProfileItemService profileItemService, DemoGuard demoGuard) {
        this.profileItemService = profileItemService;
        this.demoGuard = demoGuard;
    }

    /** {@code GET /api/profile/items?section=} : the current user's items (hidden included, deleted excluded). */
    @Operation(
        summary = "List my profile items",
        description = "All sections in (section, position) order, or one section. The first call seeds the profile from the default resume."
    )
    @GetMapping("/items")
    public List<ProfileItemDTO> list(@RequestParam(name = "section", required = false) ProfileSection section) {
        LOG.debug("REST request to list profile items (section {})", section);
        return profileItemService.list(section);
    }

    /** {@code POST /api/profile/items} : add an item. */
    @Operation(summary = "Create a profile item", description = "422 SENSITIVE_CONTENT when a value is one the product never collects.")
    @PostMapping("/items")
    public ResponseEntity<ProfileItemDTO> create(@RequestBody NewItem body) {
        demoGuard.assertNotDemo();
        LOG.debug("REST request to create a profile item");
        return ResponseEntity.status(HttpStatus.CREATED).body(profileItemService.create(body));
    }

    /** {@code PUT /api/profile/items/:id} : change the fields sent (data, hidden, position, provenance). */
    @Operation(summary = "Update a profile item", description = "Partial: only the fields sent change. 404 if not owned.")
    @PutMapping("/items/{id}")
    public ProfileItemDTO update(@PathVariable("id") Long id, @RequestBody ItemPatch body) {
        demoGuard.assertNotDemo();
        LOG.debug("REST request to update profile item {}", id);
        return profileItemService.update(id, body);
    }

    /** {@code DELETE /api/profile/items/:id} : soft delete. */
    @Operation(summary = "Delete a profile item", description = "Soft delete; 404 if not owned.")
    @DeleteMapping("/items/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        demoGuard.assertNotDemo();
        LOG.debug("REST request to delete profile item {}", id);
        profileItemService.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** {@code POST /api/profile/items/reorder} : put the listed ids first, in order. */
    @Operation(summary = "Reorder a section", description = "Listed ids first in the given order, unlisted items after them. 404 for an id that is not yours in this section.")
    @PostMapping("/items/reorder")
    public ResponseEntity<Void> reorder(@RequestBody Reorder body) {
        demoGuard.assertNotDemo();
        LOG.debug("REST request to reorder profile items");
        profileItemService.reorder(body);
        return ResponseEntity.noContent().build();
    }

    /** {@code POST /api/profile/items/import} : add parsed / confirmed items (merged with matching ones) and bio values. */
    @Operation(
        summary = "Import profile items",
        description = "One transaction. Items merge by normalised title + organisation (no duplicates); optional flat bio values (identity, contact, links, headline, summary) overwrite with their provenance. Refused as a whole on a never-collected value."
    )
    @PostMapping("/items/import")
    public ImportResult importItems(@RequestBody ImportRequest body) {
        demoGuard.assertNotDemo();
        LOG.debug("REST request to import profile items");
        return profileItemService.importItems(body);
    }

    /** {@code GET /api/profile/completeness} : the meter, its nine parts and the one next action. */
    @Operation(summary = "Profile completeness", description = "Score out of 100, the parts and their weights, and the highest-weight missing part as nextAction.")
    @GetMapping("/completeness")
    public CompletenessDTO completeness() {
        LOG.debug("REST request for the profile completeness");
        return profileItemService.completeness();
    }
}
