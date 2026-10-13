package com.dossier.api.service;

import com.dossier.api.repository.ResumeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Resume Builder's plan gates behind one seam (DESIGN 15.1), named for the keys B1.2's
 * {@code EntitlementService.has(login, "builder.ai")} / {@code limit(login, "resumes.max")} will
 * answer. Until then they delegate to {@link EntitlementService#isPro} and the existing resume caps in
 * {@link ProfileService}, so no builder code ever asks "is this user Pro" directly.
 */
@Service
@Transactional(readOnly = true)
public class ResumeEntitlements {

    private final EntitlementService entitlementService;
    private final ResumeRepository resumeRepository;

    public ResumeEntitlements(EntitlementService entitlementService, ResumeRepository resumeRepository) {
        this.entitlementService = entitlementService;
        this.resumeRepository = resumeRepository;
    }

    /** Whether the plan includes the builder's AI features (today: Pro, which Autopilot includes). */
    public boolean builderAiAllowed(String login) {
        return entitlementService.isPro(login);
    }

    /** {@code FREE}, {@code PRO} or {@code AUTOPILOT}, as {@link EntitlementService#plan} reports it. */
    public String planName(String login) {
        return entitlementService.plan(login).plan();
    }

    /** The plan's cap on live (non-archived) resumes; the same number {@code POST /resumes} enforces. */
    public int resumesMax(String login) {
        return ProfileService.resumeLimit(entitlementService.isPro(login));
    }

    /** How many live (non-archived) resumes the signed-in user holds - what the cap counts. */
    public int liveResumeCount() {
        return (int) resumeRepository
            .findByUserIsCurrentUser()
            .stream()
            .filter(r -> !Boolean.TRUE.equals(r.getArchived()))
            .count();
    }
}
