package com.dossier.api.web.rest.admin;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.catalog.DependencyService;
import com.dossier.api.service.catalog.PresetService;
import com.dossier.api.service.catalog.VolumeTierService;
import com.dossier.api.service.catalog.dto.CatalogRulesDTOs.DependenciesRequest;
import com.dossier.api.service.catalog.dto.CatalogRulesDTOs.DependencyDTO;
import com.dossier.api.service.catalog.dto.CatalogRulesDTOs.PresetDTO;
import com.dossier.api.service.catalog.dto.CatalogRulesDTOs.PresetRequest;
import com.dossier.api.service.catalog.dto.CatalogRulesDTOs.VolumeTierDTO;
import com.dossier.api.service.catalog.dto.CatalogRulesDTOs.VolumeTierRequest;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Platform admin: the catalog's rule tables (docs/subscriptions/09-apis.md section 1; story K1.2): service dependencies (full replacement, cycles refused),
 * presets and volume tiers. {@code ROLE_ADMIN} only; platform routes, not organization-scoped ones.
 */
@RestController
@RequestMapping("/api/admin/catalog")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminCatalogRulesResource {

    private final DependencyService dependencies;
    private final PresetService presets;
    private final VolumeTierService tiers;

    public AdminCatalogRulesResource(DependencyService dependencies, PresetService presets, VolumeTierService tiers) {
        this.dependencies = dependencies;
        this.presets = presets;
        this.tiers = tiers;
    }

    @GetMapping("/services/{key}/dependencies")
    public List<DependencyDTO> dependencies(@PathVariable("key") String key) {
        return dependencies.get(key);
    }

    /** Replaces every dependency of the service with the list in the body. 422 DEPENDENCY_CYCLE when the result would loop. */
    @PutMapping("/services/{key}/dependencies")
    public List<DependencyDTO> setDependencies(@PathVariable("key") String key, @RequestBody DependenciesRequest body) {
        return dependencies.replace(key, body);
    }

    @GetMapping("/presets")
    public List<PresetDTO> presets() {
        return presets.list();
    }

    @PostMapping("/presets")
    public ResponseEntity<PresetDTO> createPreset(@RequestBody PresetRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(presets.create(body));
    }

    @PutMapping("/presets/{key}")
    public PresetDTO updatePreset(@PathVariable("key") String key, @RequestBody PresetRequest body) {
        return presets.update(key, body);
    }

    @GetMapping("/volume-tiers")
    public List<VolumeTierDTO> volumeTiers() {
        return tiers.list();
    }

    @PostMapping("/volume-tiers")
    public ResponseEntity<VolumeTierDTO> createVolumeTier(@RequestBody VolumeTierRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(tiers.create(body));
    }

    @PutMapping("/volume-tiers/{id}")
    public VolumeTierDTO updateVolumeTier(@PathVariable("id") Long id, @RequestBody VolumeTierRequest body) {
        return tiers.update(id, body);
    }
}
