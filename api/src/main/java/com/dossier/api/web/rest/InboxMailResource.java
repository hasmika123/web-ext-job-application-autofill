package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.inbox.InboxMailService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

/**
 * The inbox on the board (Phase 14.4b).
 *
 * <ul>
 *   <li>{@code GET /api/profile/inbox/suggestions} — jobs the mail shows that the board doesn't track:
 *       {@code [{id, company, role, category, subject, fromName, fromAddress, sentAt}]}.</li>
 *   <li>{@code POST /api/profile/inbox/suggestions/{id}/accept} {@code {company?, roleTitle?}} — add it
 *       to the board at the stage the mail showed; returns {@code {applicationId}}. 400 without a
 *       company or role, 409 if already handled.</li>
 *   <li>{@code POST /api/profile/inbox/suggestions/{id}/dismiss} — hide it (and the company's others).</li>
 *   <li>{@code GET /api/profile/applications/{id}/mail} — the emails about one application, newest
 *       first: {@code [{id, direction, subject, fromName, fromAddress, sentAt, category, statusChange,
 *       classifiedBy, snippet}]}. 404 for someone else's application.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/profile")
@Tag(name = "inbox-mail", description = "Suggested applications from mail, and each application's emails.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class InboxMailResource {

    public record AcceptVM(String company, String roleTitle) {}

    private final InboxMailService service;

    public InboxMailResource(InboxMailService service) {
        this.service = service;
    }

    @Operation(summary = "Jobs the mail shows that the board doesn't track")
    @GetMapping("/inbox/suggestions")
    public List<InboxMailService.SuggestionView> suggestions() {
        return service.suggestions();
    }

    @Operation(summary = "Add a suggested job to the board")
    @PostMapping("/inbox/suggestions/{id}/accept")
    public Map<String, Object> accept(@PathVariable Long id, @RequestBody(required = false) AcceptVM vm) {
        return Map.of("applicationId", service.accept(id, vm == null ? null : vm.company(), vm == null ? null : vm.roleTitle()));
    }

    @Operation(summary = "Hide a suggested job")
    @PostMapping("/inbox/suggestions/{id}/dismiss")
    public Map<String, Object> dismiss(@PathVariable Long id) {
        service.dismiss(id);
        return Map.of("ok", true);
    }

    @Operation(summary = "The emails about one application")
    @GetMapping("/applications/{id}/mail")
    public List<InboxMailService.MailView> mail(@PathVariable Long id) {
        return service.forApplication(id);
    }
}
