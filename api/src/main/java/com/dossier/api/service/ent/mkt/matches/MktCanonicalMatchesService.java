package com.dossier.api.service.ent.mkt.matches;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.pipeline.OpportunityMatchLifecycleService;
import com.dossier.api.service.ent.pipeline.OrgMatchQueryService;
import com.dossier.api.service.ent.pipeline.OrgMatchViews;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Compatibility boundary for the marketer workspace while its older board is still backed by {@code requirement_match}.
 * The canonical query service remains the owner of tenant, dynamic permission, and consultant-scope filtering.
 */
@Service
public class MktCanonicalMatchesService {

    private final MktScope scope;
    private final OrgMatchQueryService canonical;
    private final OpportunityMatchLifecycleService lifecycle;
    private final ConsultantProfileRepository consultants;
    private final ConsultantSkillRepository skills;

    public MktCanonicalMatchesService(
        MktScope scope,
        OrgMatchQueryService canonical,
        OpportunityMatchLifecycleService lifecycle,
        ConsultantProfileRepository consultants,
        ConsultantSkillRepository skills
    ) {
        this.scope = scope;
        this.canonical = canonical;
        this.lifecycle = lifecycle;
        this.consultants = consultants;
        this.skills = skills;
    }

    @Transactional(readOnly = true)
    public MktCanonicalMatchesDto.Response list(OrgMembership actor, OrgMatchViews.Query query) {
        MktScope.View view = scope.resolve(actor, MktMatchesService.PAGE_KEY);
        OrgMatchViews.Response response = canonical.list(actor, query == null ? new OrgMatchViews.Query(null, null) : query);
        List<MktCanonicalMatchesDto.Item> items = response.items().stream().map(row -> itemOrNull(actor, view, row)).filter(java.util.Objects::nonNull).toList();
        return new MktCanonicalMatchesDto.Response(MktCanonicalMatchesDto.SOURCE, items, items.size());
    }

    @Transactional(readOnly = true)
    public MktCanonicalMatchesDto.Item detail(OrgMembership actor, Long matchId) {
        MktScope.View view = scope.resolve(actor, MktMatchesService.PAGE_KEY);
        return item(actor, view, canonical.get(actor, matchId));
    }

    @Transactional
    public MktCanonicalMatchesDto.Item assign(OrgMembership actor, Long matchId) {
        MktScope.View view = scope.resolve(actor, MktMatchesService.PAGE_KEY);
        item(actor, view, canonical.get(actor, matchId));
        return item(actor, view, canonical.row(lifecycle.assign(actor, matchId)));
    }

    @Transactional
    public MktCanonicalMatchesDto.Item dismiss(OrgMembership actor, Long matchId) {
        MktScope.View view = scope.resolve(actor, MktMatchesService.PAGE_KEY);
        item(actor, view, canonical.get(actor, matchId));
        return item(actor, view, canonical.row(lifecycle.dismiss(actor, matchId)));
    }

    private MktCanonicalMatchesDto.Item item(OrgMembership actor, MktScope.View view, OrgMatchViews.Row row) {
        MktCanonicalMatchesDto.Item item = itemOrNull(actor, view, row);
        if (item == null) throw new OrgNotFoundException();
        return item;
    }

    private MktCanonicalMatchesDto.Item itemOrNull(OrgMembership actor, MktScope.View view, OrgMatchViews.Row row) {
        if (row == null || row.consultantMemberId() == null) return null;
        Optional<ConsultantProfile> profile = consultants.findByOrgIdAndMemberId(actor.orgId(), row.consultantMemberId());
        if (profile.isEmpty()) return null;
        ConsultantProfile c = profile.get();
        if (view != null && (!view.sees(c.getId()) || !view.consentScope(c.getId()).atLeast(ShareScope.FULL))) return null;
        List<ConsultantSkill> consultantSkills = skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(actor.orgId(), c.getId());
        String primarySkill = consultantSkills.stream()
            .sorted(Comparator.comparing((ConsultantSkill s) -> !s.isPrimarySkill()).thenComparing(s -> s.getSortOrder() == null ? 0 : s.getSortOrder()))
            .map(ConsultantSkill::getSkill)
            .filter(s -> s != null && !s.isBlank())
            .findFirst()
            .orElse(null);
        return new MktCanonicalMatchesDto.Item(
            MktCanonicalMatchesDto.SOURCE,
            row,
            new MktCanonicalMatchesDto.Consultant(c.getMemberId(), c.getDisplayName(), c.getJobTitle(), primarySkill, c.getAvailabilityStatus(), c.getAvailableFrom())
        );
    }
}
