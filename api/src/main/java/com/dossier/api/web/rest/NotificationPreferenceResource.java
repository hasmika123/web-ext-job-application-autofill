package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.NotificationPreferenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

/**
 * Notification preferences (E2E-U7.0). {@code GET /api/profile/notification-preferences} → {@code {matrix:
 * {KIND: {inapp, email: off|now}}, quietStart, quietEnd, tz, stored, emailEnabled, quietDefaults, kinds[]}};
 * {@code PUT} takes {@code {matrix, quietStart, quietEnd, tz}} (kinds left out keep their switches; no quiet
 * times = none). Always the signed-in user's own: there is no id in the path to point at anyone else's.
 * 422 for an unknown kind, a bad time or zone; billing and security stay on whatever is sent.
 */
@RestController
@RequestMapping("/api/profile/notification-preferences")
@Tag(name = "notification-preferences", description = "Which notifications reach me, by kind and channel; quiet hours; time zone.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class NotificationPreferenceResource {

    private final NotificationPreferenceService service;
    private final DemoGuard demoGuard;

    public NotificationPreferenceResource(NotificationPreferenceService service, DemoGuard demoGuard) {
        this.service = service;
        this.demoGuard = demoGuard;
    }

    @Operation(summary = "My notification preferences", description = "Defaults (admin-configured) until the first save; stored=false says which.")
    @GetMapping
    public NotificationPreferenceService.View mine() {
        return service.mine();
    }

    @Operation(summary = "Save my notification preferences", description = "Autosave target: send the whole panel; 422 on an unknown kind, time or zone.")
    @PutMapping
    public NotificationPreferenceService.View update(@RequestBody NotificationPreferenceService.Update body) {
        demoGuard.assertNotDemo();
        return service.update(body);
    }
}
