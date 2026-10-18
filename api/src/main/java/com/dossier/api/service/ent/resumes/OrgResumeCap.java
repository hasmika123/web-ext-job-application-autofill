package com.dossier.api.service.ent.resumes;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.resume.ResumeActAs;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * The Resume Builder's resume cap inside an organization workspace (Enterprise V2, doc 19 section 3.1 and doc 24: the organization license, not the
 * personal Free / Pro / Autopilot plan, decides how many resumes an enterprise account keeps). It sits behind the one existing cap check
 * ({@code ProfileService.enforceResumeLimit}): when the request is for an organization (taken from the host the visitor arrived on, never
 * from anything the client sends, or from the organization an act-for call was authorised against) the cap is the organization's value of
 * {@link EnterpriseSettingKeys#ORG_LICENSE_RESUMES_MAX}; any other request is the personal product and this class answers empty, so a personal
 * account's behaviour is exactly what it always was.
 *
 * <p>Resolution: the organization's own {@code org_setting} row, else the global admin value, else the registry default; a malformed or
 * out-of-range override is ignored (the global value applies), like the other {@code org.*} rules.
 */
@Service
public class OrgResumeCap {

    /** The cap that applies to this request: the organization it is for and how many live resumes one consultant may keep. */
    public record Limit(Long orgId, int max) {}

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public OrgResumeCap(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    /** The organization an org route has already authorised for this thread ({@link #inOrg}); never set by anything a client sends. */
    private static final ThreadLocal<Long> ORG_OVERRIDE = new ThreadLocal<>();

    /**
     * Runs {@code body} as work done INSIDE organization {@code orgId}: an org route (which has already resolved the caller's seat in that
     * organization from the host) uses it so the license cap and the directory link apply even when a call carries no tenant host of its own.
     */
    public static <T> T inOrg(Long orgId, java.util.function.Supplier<T> body) {
        Long before = ORG_OVERRIDE.get();
        ORG_OVERRIDE.set(orgId);
        try {
            return body.get();
        } finally {
            if (before == null) ORG_OVERRIDE.remove();
            else ORG_OVERRIDE.set(before);
        }
    }

    /** The organization this request works in, or empty (the personal product). */
    public static Optional<Long> orgOfThisRequest() {
        Optional<Long> acting = ResumeActAs.current().map(ResumeActAs.Scope::orgId);
        if (acting.isPresent()) return acting;
        if (ORG_OVERRIDE.get() != null) return Optional.of(ORG_OVERRIDE.get());
        return TenantContextHolder.current().filter(TenantContext::isTenant).map(TenantContext::orgId);
    }

    /** The cap for this request, empty when the request is not for an organization. */
    public Optional<Limit> forThisRequest() {
        return orgOfThisRequest().map(orgId -> new Limit(orgId, max(orgId)));
    }

    /** One consultant's cap in {@code orgId}. */
    public int max(Long orgId) {
        String key = EnterpriseSettingKeys.ORG_LICENSE_RESUMES_MAX;
        int global = settings.getInt(key);
        if (orgId == null) return global;
        var def = EnterpriseSettingKeys.find(key);
        return orgSettings
            .findByOrgIdAndSettingKey(orgId, key)
            .map(OrgSetting::getValueJson)
            .map(v -> {
                try {
                    int n = Integer.parseInt(v.strip());
                    boolean inRange = def == null || ((def.min() == null || n >= def.min()) && (def.max() == null || n <= def.max()));
                    return inRange ? n : global;
                } catch (NumberFormatException e) {
                    return global;
                }
            })
            .orElse(global);
    }
}
