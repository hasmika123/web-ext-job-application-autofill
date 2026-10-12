package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrgDomainRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.dto.org.OrgOnboardingDTO;
import com.dossier.api.service.dto.org.OrgOnboardingDTO.Item;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The admin activation checklist (onboarding-invites.md section 5, O2.7): what an org has done to get going and what is
 * next, computed from the data so it can never drift from reality. Live counts only; nothing here is stored.
 *
 * <p>{@link #AVAILABLE} lists the rows whose action exists in this build. The others are still returned (the web shows them
 * as "soon", honestly) and the story that builds their action adds the key here: invites (O2.2), co-admin invites (O2.2),
 * the org profile form (O13.1), plans (billing wave), support owners (O5.4), domains (O2.6).
 */
@Service
public class OrgOnboardingService {

    /** The checklist rows whose action can be taken today. */
    static final Set<String> AVAILABLE = Set.of("activate", "groups");

    private final OrganizationRepository orgs;
    private final OrgMemberRepository members;
    private final OrgGroupRepository groups;
    private final OrgDomainRepository domains;

    public OrgOnboardingService(OrganizationRepository orgs, OrgMemberRepository members, OrgGroupRepository groups, OrgDomainRepository domains) {
        this.orgs = orgs;
        this.members = members;
        this.groups = groups;
        this.domains = domains;
    }

    @Transactional(readOnly = true)
    public OrgOnboardingDTO checklist(OrgMembership me) {
        Long orgId = me.orgId();
        Organization org = orgs.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);

        long adminsJoined = members.countByOrgIdAndRoleAndStatus(orgId, OrgRole.ADMIN, OrgMemberStatus.ACTIVE);
        long adminsInvited = members.countByOrgIdAndRoleAndStatus(orgId, OrgRole.ADMIN, OrgMemberStatus.INVITED);
        long peopleJoined = members.countByOrgIdAndRoleAndStatus(orgId, OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        long peopleInvited = members.countByOrgIdAndRoleAndStatus(orgId, OrgRole.MEMBER, OrgMemberStatus.INVITED);
        long groupCount = groups.countByOrgId(orgId);
        long domainsVerified = domains.findByOrgIdOrderByDomain(orgId).stream().filter(d -> d.getVerifiedAt() != null).count();

        List<Item> items = new ArrayList<>();
        items.add(item("activate", org.getStatus() == OrgStatus.ACTIVE || org.getStatus() == OrgStatus.PAST_DUE, null, null, "/org/billing", false));
        items.add(item("groups", groupCount >= 1, (int) groupCount, null, "/org", false));
        items.add(item("profile", org.getWebsite() != null && !org.getWebsite().isBlank(), null, null, "/org/settings", false));
        items.add(item("admins", adminsJoined >= 1, (int) adminsJoined, (int) (adminsJoined + adminsInvited), "/org/team", false));
        items.add(item("invite", peopleJoined >= 1, (int) peopleJoined, (int) (peopleJoined + peopleInvited), "/org/team", false));
        items.add(item("plans", false, null, null, "/org/billing", false));
        items.add(item("owners", false, null, null, "/org/team", false));
        items.add(item("domain", domainsVerified >= 1, (int) domainsVerified, null, "/org/settings", true));

        int total = (int) items.stream().filter(i -> !i.optional()).count();
        int done = (int) items.stream().filter(i -> !i.optional() && i.done()).count();
        return new OrgOnboardingDTO(List.copyOf(items), done, total, done == total);
    }

    private static Item item(String key, boolean done, Integer count, Integer total, String href, boolean optional) {
        return new Item(key, done, count, total, href, AVAILABLE.contains(key), optional);
    }
}
