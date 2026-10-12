package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.DemoGuard;
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

    public record ApplyVM(@Size(max = 40) List<@Size(max = 40) String> keep, @Size(max = 40) Map<@Size(max = 40) String, Integer> alternatives) {}

    private final ResumeAiService service;
    private final DemoGuard demoGuard;

    public ResumeAiResource(ResumeAiService service, DemoGuard demoGuard) {
        this.service = service;
        this.demoGuard = demoGuard;
    }

    @Operation(summary = "Rewrite resume lines with AI", description = "Pro. Up to resume.ai.rewriteMaxRefs lines by ref, in a mode (stronger, shorter, formal, plain, grammar). The answer is a checked proposal; nothing changes until it is applied.")
    @PostMapping("/resumes/{id}/ai/rewrite")
    public ResponseEntity<?> rewrite(@PathVariable("id") Long id, @Valid @RequestBody RewriteVM vm) {
        demoGuard.assertNotDemo();
        return respond(service.rewrite(id, vm.refs(), vm.mode(), vm.consent()));
    }

    @Operation(summary = "Generate a summary with AI", description = "Pro. Up to three variants in a tone (concise, confident, plain), as one proposal with ref 'summary'.")
    @PostMapping("/resumes/{id}/ai/summary")
    public ResponseEntity<?> summary(@PathVariable("id") Long id, @Valid @RequestBody SummaryVM vm) {
        demoGuard.assertNotDemo();
        return respond(service.summary(id, vm.tone(), vm.consent()));
    }

    @Operation(summary = "Open AI proposals of a resume", description = "No AI call. Each proposal says whether the resume has changed since (stale).")
    @GetMapping("/resumes/{id}/ai/proposals")
    public List<ProposalView> proposals(@PathVariable("id") Long id) {
        return service.openProposals(id);
    }

    @Operation(summary = "Apply an AI proposal", description = "Writes the kept changes (by ref; alternatives by index) into the resume: marks cleared, version AI_APPLY. 409 PROPOSAL_STALE when the resume changed, 422 PLACEHOLDER_REMAINS, 400 KEEP_EMPTY.")
    @PostMapping("/ai/proposals/{pid}/apply")
    public ResponseEntity<ResumeDocDTO> apply(@PathVariable("pid") Long pid, @Valid @RequestBody ApplyVM vm) {
        demoGuard.assertNotDemo();
        ResumeDocDTO dto = service.apply(pid, vm.keep(), vm.alternatives());
        return ResponseEntity.ok().header(HttpHeaders.ETAG, "\"" + dto.getDocVersion() + "\"").body(dto);
    }

    @Operation(summary = "Dismiss an AI proposal")
    @PostMapping("/ai/proposals/{pid}/dismiss")
    public ResponseEntity<Void> dismiss(@PathVariable("pid") Long pid) {
        demoGuard.assertNotDemo();
        service.dismiss(pid);
        return ResponseEntity.noContent().build();
    }

    /** 200 with the result, except a provider failure: 502 with an {@code error} message the UI shows. */
    private static ResponseEntity<?> respond(ProposalResult r) {
        if (ProposalResult.ERROR.equals(r.status())) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("status", r.status());
            body.put("error", "Couldn't reach Kiwiply AI right now - try again.");
            if (r.usage() != null) body.put("usage", r.usage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(body);
        }
        return ResponseEntity.ok(r);
    }
}
