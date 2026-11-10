package com.dossier.api.service.ent;

import com.dossier.api.domain.ent.OrgPolicy;
import com.dossier.api.domain.ent.OrgPolicyVersion;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgPolicyVersionRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.dto.ent.PolicyDTOs;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Kiwiply reviewer's side of the tenant policy pages (docs/enterprise-v2/62): the queue of submissions across organizations,
 * one submission against the live text, approve (publishes) and request changes (a comment is required). Only the platform admin
 * resource ({@code ROLE_ADMIN}) reaches this class; an organization's own admins can never publish while review is on. Every decision
 * writes an admin audit row and a row in the organization's own trail (actor = the reviewer's login), and tells the organization's
 * owners and admins.
 */
@Service
public class PolicyReviewService {

    static final int COMMENT_MAX = 1000;

    private final OrgPolicyVersionRepository versions;
    private final OrganizationRepository orgs;
    private final OrgPolicyService policies;
    private final OrgAuditService orgAudit;
    private final AdminAuditService adminAudit;
    private final PolicyNotices notices;

    public PolicyReviewService(
        OrgPolicyVersionRepository versions,
        OrganizationRepository orgs,
        OrgPolicyService policies,
        OrgAuditService orgAudit,
        AdminAuditService adminAudit,
        PolicyNotices notices
    ) {
        this.versions = versions;
        this.orgs = orgs;
        this.policies = policies;
        this.orgAudit = orgAudit;
        this.adminAudit = adminAudit;
        this.notices = notices;
    }

    /** Submissions waiting for a reviewer (status IN_REVIEW), oldest first. */
    @Transactional(readOnly = true)
    public List<PolicyDTOs.QueueRow> queue(String status) {
        String s = status == null || status.isBlank() ? OrgPolicyVersion.IN_REVIEW : status.strip().toUpperCase(java.util.Locale.ROOT);
        return versions.findByStatusOldestFirst(s).stream().map(v -> {
            Organization org = orgs.findByOrgId(v.getOrgId()).orElse(null);
            return new PolicyDTOs.QueueRow(
                v.getId(), v.getOrgId(), org == null ? "?" : OrgPolicyService.displayName(org), v.getKind(), PolicyKinds.title(v.getKind()),
                v.getVersionNo(), v.getStatus(), v.getSubmittedAt(), versions.findPublished(v.getOrgId(), v.getKind()).isPresent()
            );
        }).toList();
    }

    @Transactional(readOnly = true)
    public PolicyDTOs.ReviewDetail detail(Long id) {
        OrgPolicyVersion v = versions.findOneById(id).orElseThrow(OrgNotFoundException::new);
        Organization org = orgs.findByOrgId(v.getOrgId()).orElseThrow(OrgNotFoundException::new);
        OrgPolicyVersion live = versions.findPublished(v.getOrgId(), v.getKind()).filter(l -> !l.getId().equals(v.getId())).orElse(null);
        return new PolicyDTOs.ReviewDetail(
            v.getId(), v.getOrgId(), OrgPolicyService.displayName(org), v.getKind(), PolicyKinds.title(v.getKind()), v.getVersionNo(),
            v.getStatus(), v.getSubmittedAt(), v.getBody(), live == null ? null : live.getBody(), live == null ? null : live.getVersionNo(), v.getReviewComment()
        );
    }

    @Transactional
    public PolicyDTOs.ReviewDetail approve(Long id, String comment) {
        OrgPolicyVersion v = inReview(id);
        String note = comment(comment, false);
        OrgPolicy p = policies.workingCopy(v.getOrgId(), v.getKind());
        String reviewer = SecurityUtils.getCurrentUserLogin().orElse("system");
        policies.publish(p, v, reviewer, note);
        record(v, OrgAuditService.POLICY_APPROVE, "version " + v.getVersionNo() + " approved and published" + (note == null ? "" : ": " + note));
        notices.approved(v.getOrgId(), PolicyKinds.title(v.getKind()), note);
        return detail(id);
    }

    @Transactional
    public PolicyDTOs.ReviewDetail requestChanges(Long id, String comment) {
        OrgPolicyVersion v = inReview(id);
        String note = comment(comment, true);
        OrgPolicy p = policies.workingCopy(v.getOrgId(), v.getKind());
        String reviewer = SecurityUtils.getCurrentUserLogin().orElse("system");
        policies.requestChanges(p, v, reviewer, note);
        record(v, OrgAuditService.POLICY_REQUEST_CHANGES, "version " + v.getVersionNo() + " sent back: " + note);
        notices.changesRequested(v.getOrgId(), PolicyKinds.title(v.getKind()), note);
        return detail(id);
    }

    private OrgPolicyVersion inReview(Long id) {
        OrgPolicyVersion v = versions.findOneById(id).orElseThrow(OrgNotFoundException::new);
        if (!OrgPolicyVersion.IN_REVIEW.equals(v.getStatus())) {
            throw OrgException.coded(409, OrgPolicyService.CODE_STATE, "This submission is no longer waiting for review (it was withdrawn or already decided).", Map.of());
        }
        return v;
    }

    private static String comment(String raw, boolean required) {
        String t = raw == null ? "" : raw.strip();
        if (t.isEmpty()) {
            if (required) throw OrgException.invalid("comment", "tell the organization what to change");
            return null;
        }
        if (t.length() > COMMENT_MAX) throw OrgException.invalid("comment", "must be at most " + COMMENT_MAX + " characters");
        if (t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid("comment", "must be plain text");
        return t;
    }

    private void record(OrgPolicyVersion v, String action, String details) {
        String actor = SecurityUtils.getCurrentUserLogin().orElse("system");
        orgAudit.record(v.getOrgId(), actor, null, action, OrgAuditService.TARGET_POLICY, null, v.getKind(), details, null, null, null, "MEDIUM");
        adminAudit.record(action, "ORG_POLICY", String.valueOf(v.getId()), null, "org " + v.getOrgId() + " " + v.getKind() + " " + details);
    }
}
