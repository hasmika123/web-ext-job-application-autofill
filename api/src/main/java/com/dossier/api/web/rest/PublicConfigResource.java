package com.dossier.api.web.rest;

import com.dossier.api.service.DemoAccountService;
import com.dossier.api.service.dto.PublicConfigDTO;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.org.OrgFeatureFlag;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The few switches the web needs before anyone signs in (E2E-O1.9): is the org area on, is the demo on. No auth, cached
 * for five minutes by every proxy, so the body is the same for every visitor and carries nothing else
 * ({@link PublicConfigDTO} is booleans only). A5.9 later folds the rest of the public flags into this endpoint.
 */
@RestController
@Tag(name = "config", description = "Public, cacheable feature switches.")
public class PublicConfigResource {

    static final Duration MAX_AGE = Duration.ofMinutes(5);

    private final OrgFeatureFlag orgFeatureFlag;
    private final DemoAccountService demoAccountService;
    private final EnterpriseFeatureFlag enterpriseFeatureFlag;

    public PublicConfigResource(OrgFeatureFlag orgFeatureFlag, DemoAccountService demoAccountService, EnterpriseFeatureFlag enterpriseFeatureFlag) {
        this.enterpriseFeatureFlag = enterpriseFeatureFlag;
        this.orgFeatureFlag = orgFeatureFlag;
        this.demoAccountService = demoAccountService;
    }

    @Operation(summary = "Public feature switches", description = "{orgs, demo, enterprise}: whether organization features, the demo accounts and the enterprise master flag are on. No authentication; cached for 5 minutes; never per-user.")
    @GetMapping("/api/config/public")
    public ResponseEntity<PublicConfigDTO> publicConfig() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(MAX_AGE).cachePublic()).body(new PublicConfigDTO(orgFeatureFlag.isEnabled(), demoAccountService.isEnabled(), enterpriseFeatureFlag.isEnabled()));
    }
}
