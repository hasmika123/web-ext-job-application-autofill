package com.dossier.api.web.rest.org;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import java.time.Instant;

/**
 * Test seeding for the org tenant model: real users and real org / seat rows, written through the repositories (the
 * production create path is covered by {@code OrgResourceIT}). Reused by {@code OrgIsolationIT} (O1.5).
 */
public final class OrgFixtures {

    private final UserRepository users;
    private final OrganizationRepository orgs;
    private final OrgMemberRepository members;

    public OrgFixtures(UserRepository users, OrganizationRepository orgs, OrgMemberRepository members) {
        this.users = users;
        this.orgs = orgs;
        this.members = members;
    }

    /** An activated account with this login (created once; later calls return it). */
    public User user(String login) {
        return users
            .findOneByLogin(login)
            .orElseGet(() -> {
                User u = new User();
                u.setLogin(login);
                u.setPassword("x".repeat(60));
                u.setActivated(true);
                u.setEmail(login + "@example.com");
                u.setLangKey("en");
                return users.saveAndFlush(u);
            });
    }

    /** An organization with no members. */
    public Organization org(String slug, OrgStatus status) {
        Organization o = new Organization();
        o.setSlug(slug);
        o.setName("Org " + slug);
        o.setType(OrgType.BOOTCAMP);
        o.setStatus(status);
        return orgs.saveAndFlush(o);
    }

    /** An ACTIVE (or other-state) seat for {@code login} in {@code org}. */
    public OrgMember seat(Organization org, String login, OrgRole role, OrgMemberStatus status) {
        OrgMember m = new OrgMember();
        m.setOrgId(org.getId());
        m.setUserId(user(login).getId());
        m.setRole(role);
        m.setStatus(status);
        m.setJoinedAt(Instant.now());
        return members.saveAndFlush(m);
    }

    public OrgMember active(Organization org, String login, OrgRole role) {
        return seat(org, login, role, OrgMemberStatus.ACTIVE);
    }
}
