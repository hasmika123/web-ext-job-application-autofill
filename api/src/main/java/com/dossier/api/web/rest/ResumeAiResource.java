package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.ai.engines.ProposalListResult;
import com.dossier.api.service.ai.engines.ProposalResult;
import com.dossier.api.service.ai.engines.ProposalResult.ProposalView;
import com.dossier.api.service.ai.engines.ResumeAiService;
import com.dossier.api.service.dto.ResumeDocDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * The Resume Builder's AI (Pro, R4.1; DESIGN 9.5): checked proposals against a built resume, applied by ref.
 *
 * <p>{@code POST /api/profile/resumes/{id}/ai/rewrite} {@code {refs, mode, consent}} and {@code .../ai/summary}
 * {@code {tone, consent}} answer a {@link ProposalResult}: 200 with a {@code status} (ok, cached, disabled,
 * consentRequired, quotaExceeded, nothingToChange), 402 {@code PRO_REQUIRED} for Free, 429 {@code RATE_LIMITED},
 * 502 when the provider failed. {@code POST /api/profile/ai/proposals/{pid}/apply} {@code {keep, alternatives}}
 * answers the updated document with its {@code ETag} (409 {@code PROPOSAL_STALE}, 400 {@code KEEP_EMPTY},
 * 422 {@code PLACEHOLDER_REMAINS}); the client names refs, never text.
 */
@RestController
@RequestMapping("/api/profile")
@Tag(name = "resume-ai", description = "Resume Builder AI: rewrite lines, generate a summary, apply or dismiss a checked proposal (Pro).")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ResumeAiResource {

    public record RewriteVM(@Size(max = 40) List<@Size(max = 40) String> refs, @Size(max = 16) String mode, boolean consent) {}

    public record SummaryVM(@Size(max = 16) String tone, boolean consent) {}

    public record SuggestVM(boolean consent, boolean refresh) {}

    public record ApplyVM(@Size(max = 40) List<@Size(max = 40) String> keep, @Size(max = 40) Map<@Size(max = 40) String, Integer> alternatives) {}

    private final ResumeAiService service;

    public ResumeAiResource(ResumeAiService service) {
        this.service = service;
    }

    @Operation(summary = "Rewrite resume lines with AI", description = "Pro. Up to resume.ai.rewriteMaxRefs lines by ref, in a mode (stronger, shorter, formal, plain, grammar). The answer is a checked proposal; nothing changes until it is applied.")
    @PostMapping("/resumes/{id}/ai/rewrite")
    public ResponseEntity<?> rewrite(@PathVariable("id") Long id, @Valid @RequestBody RewriteVM vm) {
        return respond(service.rewrite(id, vm.refs(), vm.mode(), vm.consent()));
    }

    @Operation(summary = "Generate a summary with AI", description = "Pro. Up to three variants in a tone (concise, confident, plain), as one proposal with ref 'summary'.")
    @PostMapping("/resumes/{id}/ai/summary")
    public ResponseEntity<?> summary(@PathVariable("id") Long id, @Valid @RequestBody SummaryVM vm) {
        return respond(service.summary(id, vm.tone(), vm.consent()));
    }

    @Operation(
        summary = "Get AI suggestion cards",
        description = "Pro. Up to resume.ai.suggestMax improvement cards (kind, title, body, checked changes) for the document as it is now. The answer for the same document is the stored one at zero cost; refresh=true asks again. Nothing changes until a card is applied."
    )
    @PostMapping("/resumes/{id}/ai/suggestions")
    public ResponseEntity<?> suggest(@PathVariable("id") Long id, @Valid @RequestBody SuggestVM vm) {
        return respond(service.suggest(id, vm.consent(), vm.refresh()));
    }

    @Operation(summary = "Open AI suggestion cards of a resume", description = "No AI call. Cards in carousel order, each marked stale when the resume has changed since; staleAt is when a refresh is due.")
    @GetMapping("/resumes/{id}/ai/suggestions")
    public ProposalListResult suggestions(@PathVariable("id") Long id) {
        return service.suggestions(id);
    }

    @Operation(summary = "Open AI proposals of a resume", description = "No AI call. Each proposal says whether the resume has changed since (stale).")
    @GetMapping("/resumes/{id}/ai/proposals")
    public List<ProposalView> proposals(@PathVariable("id") Long id) {
        return service.openProposals(id);
    }

    @Operation(summary = "Apply an AI proposal", description = "Writes the kept changes (by ref; alternatives by index) into the resume: marks cleared, version AI_APPLY. 409 PROPOSAL_STALE when the resume changed, 422 PLACEHOLDER_REMAINS, 400 KEEP_EMPTY.")
    @PostMapping("/ai/proposals/{pid}/apply")
    public ResponseEntity<ResumeDocDTO> apply(@PathVariable("pid") Long pid, @Valid @RequestBody ApplyVM vm) {
        ResumeDocDTO dto = service.apply(pid, vm.keep(), vm.alternatives());
        return ResponseEntity.ok().header(HttpHeaders.ETAG, "\"" + dto.getDocVersion() + "\"").body(dto);
    }

    @Operation(summary = "Dismiss an AI proposal")
    @PostMapping("/ai/proposals/{pid}/dismiss")
    public ResponseEntity<Void> dismiss(@PathVariable("pid") Long pid) {
        service.dismiss(pid);
        return ResponseEntity.noContent().build();
    }

    /** 200 with the result, except a provider failure: 502 with an {@code error} message the UI shows. */
    private static ResponseEntity<?> respond(ProposalResult r) {
        return ProposalResult.ERROR.equals(r.status()) ? providerFailure(r.status(), r.usage()) : ResponseEntity.ok(r);
    }

    private static ResponseEntity<?> respond(ProposalListResult r) {
        return ProposalResult.ERROR.equals(r.status()) ? providerFailure(r.status(), r.usage()) : ResponseEntity.ok(r);
    }

    private static ResponseEntity<?> providerFailure(String status, Object usage) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", status);
        body.put("error", "Couldn't reach Kiwiply AI right now - try again.");
        if (usage != null) body.put("usage", usage);
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(body);
    }
}
