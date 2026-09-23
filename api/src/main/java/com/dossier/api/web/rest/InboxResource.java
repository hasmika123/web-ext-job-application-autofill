package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.inbox.InboxService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * The user's connected inbox (Phase 14.1).
 *
 * <ul>
 *   <li>{@code GET /api/profile/inbox} → {@code {available, connected, address, status, connectedAt,
 *       lastCheckedAt, lastError}}. The app password is never returned, in any form.</li>
 *   <li>{@code POST /api/profile/inbox} {@code {address, appPassword}} → the view once Gmail has
 *       accepted them; otherwise {@code {code, message}} with 400 (not a Gmail address / not an app
 *       password), 422 (Gmail refused — which way, in {@code code}), 429 (too many tries), 502
 *       (couldn't reach Gmail) or 503 (inbox unavailable). 402 {@code PRO_REQUIRED} on Free.</li>
 *   <li>{@code DELETE /api/profile/inbox} — disconnect: the connection and its password are deleted.</li>
 *   <li>{@code PUT /api/profile/inbox/notify} {@code {email}} — emails about interviews and offers on
 *       or off (14.6).</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/profile/inbox")
@Tag(name = "inbox", description = "Connect a dedicated Gmail so applications update themselves (Pro).")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class InboxResource {

    public record ConnectVM(String address, String appPassword) {}

    public record NotifyVM(Boolean email) {}

    private final InboxService service;

    public InboxResource(InboxService service) {
        this.service = service;
    }

    @Operation(summary = "The connected inbox, if any")
    @GetMapping
    public InboxService.View mine() {
        return service.mine();
    }

    @Operation(summary = "Connect a Gmail with an app password", description = "Checked against Gmail before anything is stored.")
    @PostMapping
    public ResponseEntity<?> connect(@RequestBody ConnectVM vm) {
        InboxService.ConnectResult r = service.connect(vm.address(), vm.appPassword());
        if (r.refusal() != null) {
            return ResponseEntity.status(r.refusal().status()).body(Map.of("code", r.refusal().code(), "message", r.refusal().message()));
        }
        return ResponseEntity.ok(r.view());
    }

    @Operation(summary = "Switch emails about interviews and offers on or off")
    @PutMapping("/notify")
    public InboxService.View notify(@RequestBody NotifyVM vm) {
        return service.setNotifyEmail(vm.email() == null || vm.email());
    }

    @Operation(summary = "Disconnect the inbox")
    @DeleteMapping
    public Map<String, Object> disconnect() {
        service.disconnect();
        return Map.of("ok", true);
    }
}
