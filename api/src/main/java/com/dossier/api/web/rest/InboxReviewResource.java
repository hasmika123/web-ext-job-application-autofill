package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.inbox.InboxReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Seeing and reversing what the inbox did (inbox-safety), for the signed-in person:
 *
 * <ul>
 *   <li>{@code GET /api/inbox/review} - what the inbox held for review: {@code {items, count}}.</li>
 *   <li>{@code POST /api/inbox/review/{id}/accept} {@code {applicationId?}} - apply the held change; idempotent.</li>
 *   <li>{@code POST /api/inbox/review/{id}/dismiss} - 204, idempotent; the same mail never asks again.</li>
 *   <li>{@code POST /api/applications/{applicationId}/inbox-undo/{eventId}} - restore the previous status; 409 {@code UNDO_EXPIRED} after the window.</li>
 *   <li>{@code GET|PUT /api/inbox/settings} - {@code {applyRejectionsAutomatically}}, default off.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api")
@Tag(name = "inbox-review", description = "What the inbox held for review, and undo for what it applied.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class InboxReviewResource {

    public record AcceptVM(Long applicationId) {}

    public record SettingsVM(boolean applyRejectionsAutomatically) {}

    private final InboxReviewService service;

    public InboxReviewResource(InboxReviewService service) {
        this.service = service;
    }

    @Operation(summary = "Changes the inbox held for the person's review")
    @GetMapping("/inbox/review")
    public InboxReviewService.ReviewList review() {
        return service.listMine();
    }

    @Operation(summary = "Apply a held change")
    @PostMapping("/inbox/review/{id}/accept")
    public InboxReviewService.Applied accept(@PathVariable Long id, @RequestBody(required = false) AcceptVM body) {
        return service.acceptMine(id, body == null ? null : body.applicationId());
    }

    @Operation(summary = "Dismiss a held change; the same email never asks again")
    @PostMapping("/inbox/review/{id}/dismiss")
    public ResponseEntity<Void> dismiss(@PathVariable Long id) {
        service.dismissMine(id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Undo a status change the inbox made", description = "409 UNDO_EXPIRED after inbox.undo_window_days; 409 CHANGED_SINCE when the status was changed meanwhile.")
    @PostMapping("/applications/{applicationId}/inbox-undo/{eventId}")
    public InboxReviewService.Applied undo(@PathVariable Long applicationId, @PathVariable Long eventId) {
        return service.undoMine(applicationId, eventId);
    }

    @Operation(summary = "The inbox safety settings")
    @GetMapping("/inbox/settings")
    public InboxReviewService.Settings settings() {
        return service.settingsMine();
    }

    @Operation(summary = "Apply rejections automatically, on or off")
    @PutMapping("/inbox/settings")
    public InboxReviewService.Settings setSettings(@RequestBody SettingsVM body) {
        return service.setSettingsMine(body.applyRejectionsAutomatically());
    }
}
