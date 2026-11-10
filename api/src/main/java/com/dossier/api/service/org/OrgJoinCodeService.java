package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgJoinCode;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgJoinCodeRepository;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import java.time.Duration;
import java.time.Instant;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Makes join codes (tenant-model.md section 2.5): the shareable link for a cohort kickoff. A code carries the MEMBER role
 * only, so a leaked code can never mint an admin. Its length and default lifetime are admin settings
 * ({@code org.join.codeLength}, {@code org.join.codeTtlDays}); there is no code that never expires. The admin screen and
 * endpoints for creating and revoking them are O2.4; this is the seam they (and the demo seed) call. Redeeming is
 * {@link OrgJoinService}.
 */
@Service
public class OrgJoinCodeService {

    private final OrgJoinCodeRepository codes;
    private final OrgGroupRepository groups;
    private final ResumeBuilderSettings settings;

    public OrgJoinCodeService(OrgJoinCodeRepository codes, OrgGroupRepository groups, ResumeBuilderSettings settings) {
        this.codes = codes;
        this.groups = groups;
        this.settings = settings;
    }

    /**
     * A new code for the caller's org. {@code expiresInDays} null takes the admin default; {@code maxUses} null means no
     * cap on places (the expiry still applies). A group from another org is a 404. Writes no audit row itself: the endpoint
     * that exposes it (O2.4) records the creation.
     */
    @Transactional
    public OrgJoinCode create(OrgMembership me, Long groupId, Integer maxUses, Integer expiresInDays) {
        if (maxUses != null && maxUses < 1) throw OrgException.invalid("maxUses", "must be at least 1");
        int ttl = expiresInDays == null ? settings.getInt(ResumeBuilderSettingKeys.ORG_JOIN_CODE_TTL_DAYS) : expiresInDays;
        if (ttl < 1 || ttl > 365) throw OrgException.invalid("expiresInDays", "must be between 1 and 365");
        if (groupId != null) groups.findByOrgIdAndId(me.orgId(), groupId).orElseThrow(OrgNotFoundException::new);
        int length = settings.getInt(ResumeBuilderSettingKeys.ORG_JOIN_CODE_LENGTH);
        for (int attempt = 0; attempt < 5; attempt++) {
            OrgJoinCode c = new OrgJoinCode();
            c.setOrgId(me.orgId());
            c.setCode(InviteTokens.newCode(length));
            c.setRole(OrgRole.MEMBER);
            c.setGroupId(groupId);
            c.setMaxUses(maxUses);
            c.setExpiresAt(Instant.now().plus(Duration.ofDays(ttl)));
            c.setCreatedByMemberId(me.memberId());
            try {
                return codes.save(c);
            } catch (DataIntegrityViolationException collision) {
                // the code space is large; a collision just draws again
            }
        }
        throw new IllegalStateException("could not draw a free join code");
    }
}
