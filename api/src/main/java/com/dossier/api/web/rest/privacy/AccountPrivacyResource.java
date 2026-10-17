package com.dossier.api.web.rest.privacy;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.domain.User;
import com.dossier.api.service.AccountDeletionService;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.TrackerUsers;
import com.dossier.api.service.privacy.AccountDeletionRequestService;
import com.dossier.api.service.privacy.DataExportService;
import com.dossier.api.service.privacy.TermsAcceptanceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/**
 * The signed-in person's own privacy controls (sprint 2, B2): the undo window for account deletion, the asynchronous data export, and the record of
 * terms acceptance. Every route works on the caller's own account only; there is no id of an account in any path or body, and an export job id that
 * belongs to somebody else is the generic 404. Demo accounts are read-only here like the rest of the account surface.
 */
@RestController
@RequestMapping("/api/account")
@Tag(name = "account-privacy", description = "Account deletion with an undo window, asynchronous data export, and terms acceptance.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class AccountPrivacyResource {

    public record TermsRequest(String document, String version, String source) {}

    private final TrackerUsers current;
    private final DemoGuard demoGuard;
    private final AccountDeletionRequestService deletionRequests;
    private final AccountDeletionService deletion;
    private final DataExportService exports;
    private final TermsAcceptanceService terms;

    public AccountPrivacyResource(
        TrackerUsers current,
        DemoGuard demoGuard,
        AccountDeletionRequestService deletionRequests,
        AccountDeletionService deletion,
        DataExportService exports,
        TermsAcceptanceService terms
    ) {
        this.current = current;
        this.demoGuard = demoGuard;
        this.deletionRequests = deletionRequests;
        this.deletion = deletion;
        this.exports = exports;
        this.terms = terms;
    }

    // ---- account deletion with an undo window ----------------------------------------------------------------------------------------------

    @Operation(summary = "Ask for my account to be deleted after the undo window", description = "Schedules the erasure for privacy.deletion.grace_hours from now (default 24). Until then the account works as usual and the request can be withdrawn. With a grace of 0 the account is erased at once and the answer is status DELETED.")
    @PostMapping("/deletion-request")
    public ResponseEntity<Map<String, Object>> requestDeletion() {
        demoGuard.assertNotDemo();
        User me = current.current();
        if (deletionRequests.graceHours() == 0) {
            deletion.deleteCurrentUserAccount();
            return ResponseEntity.ok(Map.of("status", "DELETED", "graceHours", 0, "canUndo", false));
        }
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(asMap(deletionRequests.request(me.getId(), "SELF", Instant.now())));
    }

    @Operation(summary = "Is a deletion of my account pending?")
    @GetMapping("/deletion-request")
    public Map<String, Object> deletionStatus() {
        return asMap(deletionRequests.status(current.current().getId()));
    }

    @Operation(summary = "Withdraw my pending deletion request (undo)")
    @DeleteMapping("/deletion-request")
    public Map<String, Object> cancelDeletion() {
        demoGuard.assertNotDemo();
        return asMap(deletionRequests.cancel(current.current().getId(), Instant.now()));
    }

    private static Map<String, Object> asMap(AccountDeletionRequestService.View v) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("status", v.status());
        m.put("requestedAt", v.requestedAt());
        m.put("purgeAfter", v.purgeAfter());
        m.put("graceHours", v.graceHours());
        m.put("canUndo", v.canUndo());
        return m;
    }

    // ---- asynchronous data export -------------------------------------------------------------------------------------------------------------

    @Operation(summary = "Start an asynchronous export of all my data", description = "Queues a job that builds a ZIP (the JSON export plus my stored files, size-capped). Poll the job; when READY it carries a signed, expiring download path. One active job at a time; a daily limit applies.")
    @PostMapping("/exports")
    public ResponseEntity<DataExportService.View> requestExport() {
        demoGuard.assertNotDemo();
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(exports.request(current.current().getId(), Instant.now()));
    }

    @Operation(summary = "My recent data exports")
    @GetMapping("/exports")
    public List<DataExportService.View> listExports() {
        return exports.list(current.current().getId(), Instant.now());
    }

    @Operation(summary = "One of my data exports")
    @GetMapping("/exports/{id}")
    public DataExportService.View getExport(@PathVariable("id") Long id) {
        return exports.get(current.current().getId(), id, Instant.now());
    }

    @Operation(summary = "Download a finished data export (signed link)")
    @GetMapping("/exports/{id}/file")
    public ResponseEntity<StreamingResponseBody> downloadExport(
        @PathVariable("id") Long id,
        @RequestParam(name = "exp", defaultValue = "0") long exp,
        @RequestParam(name = "sig", required = false) String sig
    ) {
        demoGuard.assertNotDemo();
        DataExportService.Download d = exports.download(current.current().getId(), id, exp, sig, Instant.now());
        StreamingResponseBody body = out -> {
            try (var in = d.stream()) {
                in.transferTo(out);
            }
        };
        ResponseEntity.BodyBuilder b = ResponseEntity
            .ok()
            .contentType(MediaType.parseMediaType("application/zip"))
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + d.fileName() + "\"")
            .header(HttpHeaders.CACHE_CONTROL, "private, no-store");
        if (d.length() >= 0) b.contentLength(d.length());
        return b.body(body);
    }

    // ---- terms acceptance ----------------------------------------------------------------------------------------------------------------------

    @Operation(summary = "Which terms and privacy-notice versions are in force, and which I accepted")
    @GetMapping("/terms-acceptance")
    public Map<String, Object> termsStatus() {
        return terms.status(current.current().getId());
    }

    @Operation(summary = "Record that I accepted the terms or the privacy notice at the version in force", description = "document is TERMS or PRIVACY; version must be the one currently in force (legal.terms_version / legal.privacy_version). Repeating it is a no-op that returns the first timestamp.")
    @PostMapping("/terms-acceptance")
    public ResponseEntity<Map<String, Object>> acceptTerms(@RequestBody TermsRequest request) {
        demoGuard.assertNotDemo();
        User me = current.current();
        terms.accept(me.getId(), request.document(), request.version(), request.source(), Instant.now());
        return ResponseEntity.status(HttpStatus.CREATED).body(terms.status(me.getId()));
    }
}
