package com.dossier.api.web.rest;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.dto.ent.PolicyDTOs;
import com.dossier.api.service.ent.PolicyReviewService;
import com.dossier.api.service.org.OrgException;
import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Platform admin: Policy reviews (docs/enterprise-v2/62). A Kiwiply admin reads the policies organizations submitted, compares each
 * with the live text, and approves (publishes) or sends it back with a comment. {@code ROLE_ADMIN} only; enterprise accounts
 * never hold that authority, so a tenant host cannot reach it.
 */
@RestController
@RequestMapping("/api/admin/org-policies")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminPolicyReviewResource {

    private final PolicyReviewService service;

    public AdminPolicyReviewResource(PolicyReviewService service) {
        this.service = service;
    }

    /** {@code status}: IN_REVIEW (default), PUBLISHED, REJECTED, WITHDRAWN or SUPERSEDED. */
    @GetMapping
    public List<PolicyDTOs.QueueRow> queue(@RequestParam(name = "status", required = false) String status) {
        return service.queue(status);
    }

    @GetMapping("/{id}")
    public PolicyDTOs.ReviewDetail detail(@PathVariable("id") Long id) {
        return service.detail(id);
    }

    /** Body: {comment?}. Publishes the submission; the previous live version is superseded. */
    @PostMapping("/{id}/approve")
    public PolicyDTOs.ReviewDetail approve(@PathVariable("id") Long id, @RequestBody(required = false) Map<String, Object> body) {
        return service.approve(id, text(body));
    }

    /** Body: {comment} (required). Sends the submission back to the organization. */
    @PostMapping("/{id}/request-changes")
    public PolicyDTOs.ReviewDetail requestChanges(@PathVariable("id") Long id, @RequestBody(required = false) Map<String, Object> body) {
        return service.requestChanges(id, text(body));
    }

    private static String text(Map<String, Object> body) {
        Object c = body == null ? null : body.get("comment");
        if (c != null && !(c instanceof String)) throw OrgException.invalid("comment", "must be text");
        return (String) c;
    }
}
