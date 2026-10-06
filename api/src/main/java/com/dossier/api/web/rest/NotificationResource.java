package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

/**
 * In-app notifications (Phase 14.6). {@code GET /api/profile/notifications} → {@code {unread,
 * items:[{id, title, body, link, createdAt, read}]}} (the latest 30); {@code POST /read-all};
 * {@code POST /{id}/read} (404 for someone else's).
 */
@RestController
@RequestMapping("/api/profile/notifications")
@Tag(name = "notifications", description = "In-app notifications.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class NotificationResource {

    private final NotificationService service;

    public NotificationResource(NotificationService service) {
        this.service = service;
    }

    @Operation(summary = "The latest notifications and how many are unread")
    @GetMapping
    public NotificationService.Inbox mine() {
        return service.mine();
    }

    @Operation(summary = "Mark every notification read")
    @PostMapping("/read-all")
    public Map<String, Object> readAll() {
        service.markAllRead();
        return Map.of("ok", true);
    }

    @Operation(summary = "Mark one notification read")
    @PostMapping("/{id}/read")
    public Map<String, Object> read(@PathVariable Long id) {
        service.markRead(id);
        return Map.of("ok", true);
    }
}
