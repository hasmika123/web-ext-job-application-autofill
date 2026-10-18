package com.dossier.api.service.ent;

import com.dossier.api.service.privacy.SensitiveContent;
import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.domain.ent.OrgPolicy;
import com.dossier.api.domain.ent.OrgPolicyVersion;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.repository.ent.OrgPolicyRepository;
import com.dossier.api.repository.ent.OrgPolicyVersionRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.dto.ent.PolicyDTOs;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * An organization's policy pages (docs/enterprise-v2/62-tenant-policy-pages.md): the Org Admin's draft / submit / withdraw
 * workflow, and the anonymous read the tenant host serves.
 *
 * <ul>
 *   <li>The organization always comes from the caller's resolved membership (admin side) or from the host's
 *       {@link TenantContext} (public side); nothing else selects a row, so another organization's policy is the generic 404.</li>
 *   <li>The public view reads ONLY the PUBLISHED version, else the neutral template. A draft, an in-review body, a rejected one
 *       or a reviewer comment never leaves the admin API.</li>
 *   <li>Publishing is {@link #publish}: with {@code enterprise.policies.require_review} on (default) only
 *       {@link PolicyReviewService} (a Kiwiply admin) calls it; with it off {@link #submit} publishes at once.</li>
 * </ul>
 */
@Service
public class OrgPolicyService {

    static final String CODE_STATE = "POLICY_STATE";
    static final String CODE_CONFLICT = "POLICY_DRAFT_CONFLICT";
    static final String CODE_NOTHING = "POLICY_NOTHING_TO_SEND";

    private final OrganizationRepository orgs;
    private final OrgBrandingRepository brandings;
    private final OrgPolicyRepository policies;
    private final OrgPolicyVersionRepository versions;
    private final OrgAuditService audit;
    private final SettingsService settings;
    private final com.dossier.api.service.ent.settings.OrgSettingsService orgSettings;

    public OrgPolicyService(
        OrganizationRepository orgs,
        OrgBrandingRepository brandings,
        OrgPolicyRepository policies,
        OrgPolicyVersionRepository versions,
        OrgAuditService audit,
        SettingsService settings,
        com.dossier.api.service.ent.settings.OrgSettingsService orgSettings
    ) {
        this.orgs = orgs;
        this.brandings = brandings;
        this.policies = policies;
        this.versions = versions;
        this.audit = audit;
        this.settings = settings;
        this.orgSettings = orgSettings;
    }

    // ---- settings --------------------------------------------------------------------------------------------------

    /** The configured kinds (admin setting), in order. */
    public List<String> kinds() {
        String[] raw = settings.getJson(EnterpriseSettingKeys.POLICIES_KINDS, String[].class);
        return List.of(raw);
    }

    boolean requireReview() {
        return settings.getBool(EnterpriseSettingKeys.POLICIES_REQUIRE_REVIEW);
    }

    int maxChars() {
        return settings.getInt(EnterpriseSettingKeys.POLICIES_MAX_CHARS);
    }

    private String kindOrNotFound(String raw) {
        return PolicyKinds.resolve(raw, kinds()).orElseThrow(OrgNotFoundException::new);
    }

    // ---- org admin: reads ------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public PolicyDTOs.ListView list(OrgMembership me) {
        orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        Map<String, OrgPolicy> byKind = new java.util.HashMap<>();
        for (OrgPolicy p : policies.findAllByOrgId(me.orgId())) byKind.put(p.getKind(), p);
        List<PolicyDTOs.Row> rows = new ArrayList<>();
        for (String kind : kinds()) {
            OrgPolicy p = byKind.get(kind);
            OrgPolicyVersion live = versions.findPublished(me.orgId(), kind).orElse(null);
            PolicyKinds.Meta meta = PolicyKinds.meta(kind);
            rows.add(new PolicyDTOs.Row(
                kind, meta.title(), meta.path(),
                p == null ? OrgPolicy.DRAFT : p.getState(),
                live == null ? null : live.getVersionNo(),
                live == null ? null : live.getPublishedAt(),
                p == null ? null : p.getReviewComment(),
                p == null ? null : p.getUpdatedAt()
            ));
        }
        return new PolicyDTOs.ListView(requireReview(), maxChars(), rows);
    }

    @Transactional(readOnly = true)
    public PolicyDTOs.Detail get(OrgMembership me, String rawKind) {
        String kind = kindOrNotFound(rawKind);
        orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        return detail(me.orgId(), kind, policies.findByOrgIdAndKind(me.orgId(), kind).orElse(null));
    }

    // ---- org admin: edit -------------------------------------------------------------------------------------------

    /** Save the draft. {@code ifMatch} (the draft version the editor last saw), when given, must be current. */
    @Transactional
    public PolicyDTOs.Detail saveDraft(OrgMembership me, String rawKind, String body, Integer ifMatch) {
        String kind = kindOrNotFound(rawKind);
        loadEditableOrg(me);
        String clean = PolicyBodySanitizer.sanitize(body, maxChars());
        SensitiveContent.check("body", "body", clean); // X11.7: a policy the organization writes never carries a never-collected value
        OrgPolicy p = rowForWrite(me.orgId(), kind);
        requireEditable(p);
        if (ifMatch != null && ifMatch != p.getDraftVersion()) {
            throw OrgException.coded(409, CODE_CONFLICT, "The policy changed in another tab; reload to continue.", Map.of("draftVersion", p.getDraftVersion()));
        }
        setDraft(p, clean, me);
        audit.record(me, OrgAuditService.POLICY_DRAFT_SAVE, OrgAuditService.TARGET_POLICY, null, kind, "draft saved (" + clean.length() + " characters)");
        return detail(me.orgId(), kind, p);
    }

    /** Replace the draft with the neutral template (the organization's name and support contact merged in). */
    @Transactional
    public PolicyDTOs.Detail startFromTemplate(OrgMembership me, String rawKind) {
        String kind = kindOrNotFound(rawKind);
        Organization org = loadEditableOrg(me);
        OrgPolicy p = rowForWrite(me.orgId(), kind);
        requireEditable(p);
        setDraft(p, templateFor(org, kind), me);
        audit.record(me, OrgAuditService.POLICY_TEMPLATE, OrgAuditService.TARGET_POLICY, null, kind, "draft replaced by the template");
        return detail(me.orgId(), kind, p);
    }

    /** Send the draft for review (or publish it at once when review is switched off). */
    @Transactional
    public PolicyDTOs.Detail requestReview(OrgMembership me, String rawKind) {
        String kind = kindOrNotFound(rawKind);
        loadEditableOrg(me);
        OrgPolicy p = policies.findByOrgIdAndKind(me.orgId(), kind).orElseThrow(() -> state("There is no draft to submit."));
        if (!OrgPolicy.DRAFT.equals(p.getState()) && !OrgPolicy.CHANGES_REQUESTED.equals(p.getState())) {
            throw state(OrgPolicy.IN_REVIEW.equals(p.getState()) ? "This policy is already in review." : "There are no changes to submit.");
        }
        String body = PolicyBodySanitizer.sanitize(p.getDraftBody(), maxChars());
        OrgPolicyVersion live = versions.findPublished(me.orgId(), kind).orElse(null);
        if (live != null && live.getBody().equals(body)) {
            throw OrgException.coded(409, CODE_NOTHING, "The draft equals the published policy; there is nothing to send.", Map.of());
        }
        OrgPolicyVersion v = new OrgPolicyVersion();
        v.setOrgId(me.orgId());
        v.setKind(kind);
        v.setVersionNo(versions.maxVersionNo(me.orgId(), kind) + 1);
        v.setBody(body);
        v.setStatus(OrgPolicyVersion.IN_REVIEW);
        v.setSubmittedAt(Instant.now());
        v.setSubmittedByMemberId(me.memberId());
        versions.saveAndFlush(v);
        p.setState(OrgPolicy.IN_REVIEW);
        p.setReviewComment(null);
        p.setUpdatedByMemberId(me.memberId());
        p.setUpdatedAt(Instant.now());
        policies.saveAndFlush(p);
        audit.record(me, OrgAuditService.POLICY_SUBMIT, OrgAuditService.TARGET_POLICY, null, kind, "version " + v.getVersionNo() + " submitted for review");
        if (!requireReview()) {
            publish(p, v, me.login(), null);
            audit.record(me, OrgAuditService.POLICY_APPROVE, OrgAuditService.TARGET_POLICY, null, kind, "version " + v.getVersionNo() + " published (review is switched off)");
        }
        return detail(me.orgId(), kind, p);
    }

    /** Take an in-review submission back to the draft. */
    @Transactional
    public PolicyDTOs.Detail withdraw(OrgMembership me, String rawKind) {
        String kind = kindOrNotFound(rawKind);
        loadEditableOrg(me);
        OrgPolicy p = policies.findByOrgIdAndKind(me.orgId(), kind).orElseThrow(() -> state("Nothing is in review."));
        if (!OrgPolicy.IN_REVIEW.equals(p.getState())) throw state("Only a policy that is in review can be withdrawn.");
        OrgPolicyVersion v = versions.findInReview(me.orgId(), kind).orElseThrow(() -> state("Nothing is in review."));
        v.setStatus(OrgPolicyVersion.WITHDRAWN);
        v.setReviewedAt(Instant.now());
        versions.saveAndFlush(v);
        p.setState(OrgPolicy.DRAFT);
        p.setUpdatedByMemberId(me.memberId());
        p.setUpdatedAt(Instant.now());
        policies.saveAndFlush(p);
        audit.record(me, OrgAuditService.POLICY_WITHDRAW, OrgAuditService.TARGET_POLICY, null, kind, "version " + v.getVersionNo() + " withdrawn");
        return detail(me.orgId(), kind, p);
    }

    // ---- publishing (called by the reviewer, or by submit when review is off) --------------------------------------

    /**
     * Make {@code v} the one live version: the previous one becomes SUPERSEDED, the working copy reads PUBLISHED. The caller has
     * checked who may do this and writes the audit rows.
     */
    void publish(OrgPolicy p, OrgPolicyVersion v, String reviewerLogin, String comment) {
        Instant now = Instant.now();
        versions.findPublished(v.getOrgId(), v.getKind()).filter(old -> !old.getId().equals(v.getId())).ifPresent(old -> {
            old.setStatus(OrgPolicyVersion.SUPERSEDED);
            versions.saveAndFlush(old);
        });
        v.setStatus(OrgPolicyVersion.PUBLISHED);
        v.setPublishedAt(now);
        v.setReviewedAt(now);
        v.setReviewedByLogin(reviewerLogin == null ? null : reviewerLogin.length() > 50 ? reviewerLogin.substring(0, 50) : reviewerLogin);
        v.setReviewComment(comment);
        versions.saveAndFlush(v);
        p.setState(OrgPolicy.PUBLISHED);
        p.setLiveVersionNo(v.getVersionNo());
        p.setReviewComment(comment);
        p.setUpdatedAt(now);
        policies.saveAndFlush(p);
    }

    /** Send the submission back with a comment: the working copy reads CHANGES_REQUESTED, the version REJECTED. */
    void requestChanges(OrgPolicy p, OrgPolicyVersion v, String reviewerLogin, String comment) {
        Instant now = Instant.now();
        v.setStatus(OrgPolicyVersion.REJECTED);
        v.setReviewedAt(now);
        v.setReviewedByLogin(reviewerLogin == null ? null : reviewerLogin.length() > 50 ? reviewerLogin.substring(0, 50) : reviewerLogin);
        v.setReviewComment(comment);
        versions.saveAndFlush(v);
        p.setState(OrgPolicy.CHANGES_REQUESTED);
        p.setReviewComment(comment);
        p.setUpdatedAt(now);
        policies.saveAndFlush(p);
    }

    OrgPolicy workingCopy(Long orgId, String kind) {
        return policies.findByOrgIdAndKind(orgId, kind).orElseThrow(OrgNotFoundException::new);
    }

    // ---- public (the tenant host) ----------------------------------------------------------------------------------

    /** The kinds this host offers, for the footers. Empty when the context is not a served tenant. */
    @Transactional(readOnly = true)
    public Optional<List<PolicyDTOs.KindLink>> publicKinds(TenantContext context) {
        if (!servedTenant(context)) return Optional.empty();
        if (orgs.findByOrgId(context.orgId()).isEmpty()) return Optional.empty();
        return Optional.of(kinds().stream().map(k -> new PolicyDTOs.KindLink(k, PolicyKinds.title(k), PolicyKinds.path(k))).toList());
    }

    /** The published policy of the host's organization, else the neutral template. Never a draft. */
    @Transactional(readOnly = true)
    public Optional<PolicyDTOs.PublicPolicy> publicPolicy(TenantContext context, String rawKind) {
        if (!servedTenant(context)) return Optional.empty();
        Organization org = orgs.findByOrgId(context.orgId()).orElse(null);
        Optional<String> kind = PolicyKinds.resolve(rawKind, kinds());
        if (org == null || kind.isEmpty()) return Optional.empty();
        String k = kind.get();
        String name = displayName(org);
        String support = supportEmail(org.getId());
        OrgPolicyVersion live = versions.findPublished(org.getId(), k).orElse(null);
        if (live != null) {
            return Optional.of(new PolicyDTOs.PublicPolicy(k, PolicyKinds.title(k), live.getBody(), "PUBLISHED", live.getVersionNo(), live.getPublishedAt(), name, support));
        }
        return Optional.of(new PolicyDTOs.PublicPolicy(k, PolicyKinds.title(k), PolicyTemplates.render(k, name, support), "TEMPLATE", null, null, name, support));
    }

    private static boolean servedTenant(TenantContext context) {
        return context != null && context.isTenant() && context.orgId() != null;
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------

    private PolicyDTOs.Detail detail(Long orgId, String kind, OrgPolicy p) {
        PolicyKinds.Meta meta = PolicyKinds.meta(kind);
        OrgPolicyVersion live = versions.findPublished(orgId, kind).orElse(null);
        List<PolicyDTOs.VersionRow> history = versions.findAllByOrgIdAndKindNewestFirst(orgId, kind).stream()
            .map(v -> new PolicyDTOs.VersionRow(v.getVersionNo(), v.getStatus(), v.getSubmittedAt(), v.getReviewedAt(), v.getReviewComment(), v.getPublishedAt()))
            .toList();
        return new PolicyDTOs.Detail(
            kind, meta.title(), meta.path(),
            p == null ? OrgPolicy.DRAFT : p.getState(),
            p == null ? 0 : p.getDraftVersion(),
            p == null ? null : p.getDraftBody(),
            live == null ? null : live.getBody(),
            live == null ? null : live.getVersionNo(),
            p == null ? null : p.getReviewComment(),
            requireReview(),
            maxChars(),
            history
        );
    }

    private void setDraft(OrgPolicy p, String body, OrgMembership me) {
        p.setDraftBody(body);
        p.setDraftVersion(p.getDraftVersion() + 1);
        if (OrgPolicy.PUBLISHED.equals(p.getState())) p.setState(OrgPolicy.DRAFT); // a new draft over a live policy; the live text stays public
        p.setUpdatedByMemberId(me.memberId());
        p.setUpdatedAt(Instant.now());
        policies.saveAndFlush(p);
    }

    private void requireEditable(OrgPolicy p) {
        if (OrgPolicy.IN_REVIEW.equals(p.getState())) throw state("This policy is in review. Withdraw it to edit.");
    }

    private static OrgException state(String message) {
        return OrgException.coded(409, CODE_STATE, message, Map.of());
    }

    private OrgPolicy rowForWrite(Long orgId, String kind) {
        return policies.findByOrgIdAndKind(orgId, kind).orElseGet(() -> {
            OrgPolicy p = new OrgPolicy();
            p.setOrgId(orgId);
            p.setKind(kind);
            return policies.saveAndFlush(p);
        });
    }

    private Organization loadEditableOrg(OrgMembership me) {
        Organization org = orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        if (org.getStatus() == OrgStatus.CLOSED) throw OrgException.notEditable("A closed organization's policies can not be changed.");
        return org;
    }

    String templateFor(Organization org, String kind) {
        return PolicyTemplates.render(kind, displayName(org), supportEmail(org.getId()));
    }

    private String supportEmail(Long orgId) {
        String own = orgSettings.contactEmail(orgId); // the Settings page contact wins; the published branding support e-mail is the fallback
        if (own != null) return own;
        return brandings.findByOrgId(orgId).filter(b -> b.getPublishedAt() != null).map(OrgBranding::getSupportEmail).orElse(null);
    }

    static String displayName(Organization org) {
        return org.getDisplayName() != null && !org.getDisplayName().isBlank() ? org.getDisplayName() : org.getName();
    }
}
