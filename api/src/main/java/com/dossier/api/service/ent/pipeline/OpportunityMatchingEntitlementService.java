package com.dossier.api.service.ent.pipeline;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.authz.AuthzDecision;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzReason;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.billing.MatchingUsageLedger;
import com.dossier.api.service.ent.licenses.OrgLicenseGate;
import com.dossier.api.service.entitlement.FeatureKeys;
import com.dossier.api.service.ai.AiCallContext;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import java.util.Collection;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The matching-specific entitlement boundary. Authorization runs first, then beneficiary license,
 * allowance reservation, and finally the FULL pairing consent check. No AI provider is reachable
 * through this class; callers must pass its returned context to {@link OpportunityAiScorer}.
 */
@Service
public class OpportunityMatchingEntitlementService {

    public static final String FEATURE = FeatureKeys.AI_JOB_MATCHING;
    public static final String UNIT = "matches";
    public static final String PERMISSION = "matches.run";
    public static final String REFERENCE_TYPE = "matching_run";

    public record Decision(
        boolean allowed,
        AuthzDecision authorization,
        AuthzReason reason,
        Map<String, Object> details,
        MatchingUsageLedger.Reservation reservation,
        AiCallContext aiContext
    ) {
        public Decision {
            details = details == null ? Map.of() : Map.copyOf(details);
        }

        public boolean newlyReserved() {
            return allowed && reservation != null && reservation.newlyReserved();
        }
    }

    private final AuthorizationService authorization;
    private final ConsultantProfileRepository consultants;
    private final OrgLicenseGate licenses;
    private final FeatureDefinitionRepository definitions;
    private final LicenseFeatureRepository licenseFeatures;
    private final DataShareService dataShare;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final MatchingUsageLedger usage;
    private final MatchingBatchSettings batchSettings;

    public OpportunityMatchingEntitlementService(
        AuthorizationService authorization,
        ConsultantProfileRepository consultants,
        OrgLicenseGate licenses,
        FeatureDefinitionRepository definitions,
        LicenseFeatureRepository licenseFeatures,
        DataShareService dataShare,
        OrgMemberRepository members,
        UserRepository users,
        MatchingUsageLedger usage,
        MatchingBatchSettings batchSettings
    ) {
        this.authorization = authorization;
        this.consultants = consultants;
        this.licenses = licenses;
        this.definitions = definitions;
        this.licenseFeatures = licenseFeatures;
        this.dataShare = dataShare;
        this.members = members;
        this.users = users;
        this.usage = usage;
        this.batchSettings = batchSettings;
    }

    /** Reserve one matching batch after all pre-provider checks pass. */
    @Transactional
    public Decision reserve(OrgMembership actor, Long consultantMemberId, String attemptId, Instant now) {
        if (actor == null || actor.orgId() == null || actor.memberId() == null || consultantMemberId == null || attemptId == null || attemptId.isBlank()) {
            return denied(null, AuthzReason.NOT_MEMBER, Map.of());
        }
        Long orgId = actor.orgId();
        AuthzDecision authz = authorization.authorize(
            new AuthzRequest(
                orgId,
                List.of(PERMISSION),
                Beneficiary.PATH_MEMBER,
                consultantMemberId,
                AuthzOperation.WRITE,
                false,
                null,
                null,
                FEATURE,
                batchSettings.maxFor(orgId),
                actor
            )
        );
        if (!authz.allowed()) return denied(authz, authz.reason(), authz.details());

        ConsultantProfile profile = consultants.findByOrgIdAndMemberId(orgId, consultantMemberId).orElse(null);
        if (profile == null || !licenses.has(orgId, profile.getId(), FEATURE, now)) {
            return denied(AuthzDecision.deny(orgId, AuthzReason.FEATURE_NOT_LICENSED, List.of(FEATURE)), AuthzReason.FEATURE_NOT_LICENSED, Map.of("featureKey", FEATURE));
        }

        if (!samePerson(actor.memberId(), consultantMemberId) && !fullConsentNamesActor(orgId, consultantMemberId, actor.memberId())) {
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("beneficiaryMemberId", consultantMemberId);
            details.put("consentKind", "consent.act_for");
            return denied(AuthzDecision.deny(orgId, AuthzReason.CONSENT_REQUIRED, List.of(FEATURE), details), AuthzReason.CONSENT_REQUIRED, details);
        }

        return reserveUsage(actor, consultantMemberId, attemptId, now, profile, authz);
    }

    /**
     * Reserve a scheduled run for the platform actor. Scheduled matching has no request membership to authorize, so it
     * uses the explicit effective-assignee list as its narrow scope proof and still performs the same license, consent,
     * allowance, and usage reservation checks before the provider can be reached.
     */
    @Transactional
    public Decision reserveSystem(
        OrgMembership actor,
        Long consultantMemberId,
        String attemptId,
        Collection<Long> effectiveAssigneeMemberIds,
        Instant now
    ) {
        if (
            actor == null ||
            actor.orgId() == null ||
            actor.memberId() != null ||
            !OrgAuditService.SYSTEM_ACTOR.equals(actor.login()) ||
            consultantMemberId == null ||
            attemptId == null ||
            attemptId.isBlank()
        ) {
            return denied(null, AuthzReason.NOT_MEMBER, Map.of());
        }

        Long orgId = actor.orgId();
        ConsultantProfile profile = consultants.findByOrgIdAndMemberId(orgId, consultantMemberId).orElse(null);
        if (profile == null) {
            return denied(AuthzDecision.deny(orgId, AuthzReason.NOT_MEMBER, List.of(FEATURE)), AuthzReason.NOT_MEMBER, Map.of());
        }
        if (!licenses.has(orgId, profile.getId(), FEATURE, now)) {
            return denied(AuthzDecision.deny(orgId, AuthzReason.FEATURE_NOT_LICENSED, List.of(FEATURE)), AuthzReason.FEATURE_NOT_LICENSED, Map.of("featureKey", FEATURE));
        }
        if (!fullConsentNamesAnyAssignee(orgId, consultantMemberId, effectiveAssigneeMemberIds)) {
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("beneficiaryMemberId", consultantMemberId);
            details.put("consentKind", "consent.act_for");
            return denied(AuthzDecision.deny(orgId, AuthzReason.CONSENT_REQUIRED, List.of(FEATURE), details), AuthzReason.CONSENT_REQUIRED, details);
        }

        AuthzDecision authorization = AuthzDecision.allow(orgId, actor, consultantMemberId, List.of(PERMISSION), Map.of());
        return reserveUsage(actor, consultantMemberId, attemptId, now, profile, authorization);
    }

    private Decision reserveUsage(
        OrgMembership actor,
        Long consultantMemberId,
        String attemptId,
        Instant now,
        ConsultantProfile profile,
        AuthzDecision authz
    ) {
        Long orgId = actor.orgId();
        FeatureDefinition definition = definitions.findByFeatureKey(FEATURE).orElse(null);
        long allowance = allowance(orgId, profile, definition, now);
        String beneficiaryLogin = loginOf(orgId, consultantMemberId).orElse(null);
        if (beneficiaryLogin == null) {
            return denied(AuthzDecision.deny(orgId, AuthzReason.NOT_MEMBER, List.of(FEATURE)), AuthzReason.NOT_MEMBER, Map.of());
        }

        int batch = batchSettings.maxFor(orgId);
        YearMonth month = YearMonth.from(now.atZone(ZoneOffset.UTC));
        Instant periodStart = month.atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant periodEnd = month.plusMonths(1).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        String idempotencyKey = orgId + ":" + FEATURE + ":" + REFERENCE_TYPE + ":" + consultantMemberId + ":" + attemptId.strip();
        MatchingUsageLedger.Reservation reservation = usage.reserve(
            new MatchingUsageLedger.Request(
                orgId,
                consultantMemberId,
                profile.getId(),
                actor.memberId(),
                actor.login(),
                beneficiaryLogin,
                FEATURE,
                definition == null || definition.getUsageUnit() == null ? UNIT : definition.getUsageUnit(),
                batch,
                allowance,
                "M:" + month,
                periodStart,
                periodEnd,
                idempotencyKey,
                REFERENCE_TYPE,
                consultantMemberId,
                now,
                definition == null || definition.getReserveTtlSeconds() == null ? 900 : Math.max(1, definition.getReserveTtlSeconds())
            )
        );
        if (!reservation.allowed()) {
            Map<String, Object> details = Map.of("featureKey", FEATURE, "requested", batch, "status", reservation.status().name());
            return denied(AuthzDecision.deny(orgId, AuthzReason.FEATURE_ALLOWANCE_EXHAUSTED, List.of(FEATURE), details), AuthzReason.FEATURE_ALLOWANCE_EXHAUSTED, details);
        }

        return new Decision(
            true,
            authz,
            null,
            Map.of("featureKey", FEATURE, "quantity", batch),
            reservation,
            AiCallContext.organization(actor.login(), beneficiaryLogin, orgId, FEATURE, reservation.id())
        );
    }

    public void commit(Decision decision, long actualQuantity, Instant now) {
        if (decision != null && decision.allowed() && decision.reservation() != null && decision.reservation().id() != null) {
            usage.commit(decision.authorization().orgId(), decision.reservation().id(), actualQuantity, now);
        }
    }

    public void release(Decision decision, String reason, Instant now) {
        if (decision != null && decision.allowed() && decision.reservation() != null && decision.reservation().id() != null) {
            usage.release(decision.authorization().orgId(), decision.reservation().id(), reason, now);
        }
    }

    private boolean fullConsentNamesActor(Long orgId, Long consultantMemberId, Long actorMemberId) {
        if (dataShare.scopeOf(orgId, consultantMemberId) != com.dossier.api.domain.enumeration.ShareScope.FULL) return false;
        return dataShare.viewOf(orgId, consultantMemberId).map(DataShareService.ShareView::fullToMemberId).filter(actorMemberId::equals).isPresent();
    }

    private boolean fullConsentNamesAnyAssignee(Long orgId, Long consultantMemberId, Collection<Long> assigneeMemberIds) {
        if (assigneeMemberIds == null || assigneeMemberIds.isEmpty()) return false;
        if (dataShare.scopeOf(orgId, consultantMemberId) != com.dossier.api.domain.enumeration.ShareScope.FULL) return false;
        Long fullTo = dataShare.viewOf(orgId, consultantMemberId).map(DataShareService.ShareView::fullToMemberId).orElse(null);
        return fullTo != null && assigneeMemberIds.stream().anyMatch(fullTo::equals);
    }

    private long allowance(Long orgId, ConsultantProfile profile, FeatureDefinition definition, Instant now) {
        if (definition == null || definition.getDefaultAllowance() == null) return 0;
        Optional<ConsultantLicense> license = licenses.liveLicense(orgId, profile.getId(), now);
        if (license.isEmpty()) return 0;
        for (LicenseFeature row : licenseFeatures.findByOrgIdAndLicenseIdOrderByIdAsc(orgId, license.get().getId())) {
            if (!FEATURE.equals(row.getFeatureKey()) || !Boolean.TRUE.equals(row.getLive())) continue;
            if (row.getStartsAt() != null && row.getStartsAt().isAfter(now)) continue;
            if (row.getEndsAt() != null && !row.getEndsAt().isAfter(now)) continue;
            if (row.getAllowanceOverride() != null) return Math.max(0, row.getAllowanceOverride());
            long quantity = row.getQuantity() == null ? 1 : Math.max(1, row.getQuantity());
            return Math.max(0, definition.getDefaultAllowance()) * quantity;
        }
        return 0;
    }

    private Optional<String> loginOf(Long orgId, Long memberId) {
        return members.findByOrgIdAndId(orgId, memberId).map(m -> m.getUserId()).flatMap(id -> id == null ? Optional.empty() : users.findById(id)).map(u -> u.getLogin());
    }

    private static boolean samePerson(Long actorMemberId, Long consultantMemberId) {
        return actorMemberId != null && actorMemberId.equals(consultantMemberId);
    }

    private static Decision denied(AuthzDecision authorization, AuthzReason reason, Map<String, Object> details) {
        return new Decision(false, authorization, reason, details, null, null);
    }
}
