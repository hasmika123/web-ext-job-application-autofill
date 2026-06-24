package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.FieldCacheSyncService;
import com.dossier.api.service.dto.FieldCacheDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

/**
 * The user-scoped field-cache sync API consumed by the extension (Phase 4.1). Lives
 * under {@code /api/profile/field-caches} alongside the rest of the per-user sync
 * surface (the bare {@code /api/field-caches} is the generated, ADMIN-locked CRUD).
 *
 * <p>{@code POST /sync} is a batch upsert (dedup on {@code fieldKey}+{@code contextHash},
 * last-write-wins + max {@code hitCount}) that returns the merged set, so a device can
 * push its learned answers and pull everyone else's in one round trip.
 */
@RestController
@RequestMapping("/api/profile/field-caches")
@Tag(name = "field-cache-sync", description = "User-scoped field-cache sync: the authenticated user's learned field answers.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class FieldCacheSyncResource {

    private static final Logger LOG = LoggerFactory.getLogger(FieldCacheSyncResource.class);

    private final FieldCacheSyncService fieldCacheSyncService;

    public FieldCacheSyncResource(FieldCacheSyncService fieldCacheSyncService) {
        this.fieldCacheSyncService = fieldCacheSyncService;
    }

    /** {@code GET /api/profile/field-caches} : the current user's cached field answers. */
    @Operation(summary = "List my field cache", description = "All learned field answers owned by the current user.")
    @GetMapping("")
    public List<FieldCacheDTO> list() {
        LOG.debug("REST request to list the current user's field cache");
        return fieldCacheSyncService.list();
    }

    /**
     * {@code POST /api/profile/field-caches/sync} : merge the posted entries into the
     * current user's server cache (last-write-wins + max hitCount) and return the
     * merged set. Server fills the owning user; createdAt/ids are server-owned.
     */
    @Operation(summary = "Sync my field cache", description = "Batch upsert (dedup on fieldKey+contextHash, last-write-wins) and return the merged set.")
    @PostMapping("/sync")
    public List<FieldCacheDTO> sync(@RequestBody List<FieldCacheDTO> entries) {
        LOG.debug("REST request to sync {} field-cache entries for the current user", entries == null ? 0 : entries.size());
        return fieldCacheSyncService.sync(entries);
    }
}
