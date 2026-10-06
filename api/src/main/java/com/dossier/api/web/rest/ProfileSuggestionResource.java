package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.ProfileSuggestionService;
import com.dossier.api.service.dto.LearnedAnswerDTO;
import com.dossier.api.service.dto.ProfileSuggestionDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Profile suggestions (Phase 10.3c) — Tier C of the self-building profile.
 *
 * <p>The extension {@code POST}s answers it learned while the user applied; the web lists the ones
 * worth showing and the user keeps (optionally editing) or dismisses each. Nothing reaches the
 * profile without that acceptance. Open to Free and Pro alike. The rules live in
 * {@link ProfileSuggestionService}.
 */
@RestController
@RequestMapping("/api/profile/suggestions")
@Tag(name = "profile-suggestions", description = "Suggested profile values learned while applying; reviewed by the user.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ProfileSuggestionResource {

    /** Optional body for accept: the user's edit of the suggested value. */
    public record AcceptVM(String value) {}

    private final ProfileSuggestionService service;

    public ProfileSuggestionResource(ProfileSuggestionService service) {
        this.service = service;
    }

    @Operation(summary = "List my suggestions", description = "Undecided suggestions worth showing now, one per profile field.")
    @GetMapping("")
    public List<ProfileSuggestionDTO> list() {
        return service.listPending();
    }

    @Operation(
        summary = "Report learned answers",
        description = "From the extension. Disallowed or malformed entries are skipped; always 204 for a well-formed body."
    )
    @PostMapping("")
    public ResponseEntity<Void> record(@RequestBody List<LearnedAnswerDTO> answers) {
        service.record(answers);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Keep a suggestion", description = "Writes the value (or the posted edit) into the profile.")
    @PostMapping("/{id}/accept")
    public ResponseEntity<Void> accept(@PathVariable Long id, @RequestBody(required = false) AcceptVM body) {
        service.accept(id, body == null ? null : body.value());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Dismiss a suggestion", description = "The same value is never suggested again.")
    @PostMapping("/{id}/dismiss")
    public ResponseEntity<Void> dismiss(@PathVariable Long id) {
        service.dismiss(id);
        return ResponseEntity.noContent().build();
    }
}
