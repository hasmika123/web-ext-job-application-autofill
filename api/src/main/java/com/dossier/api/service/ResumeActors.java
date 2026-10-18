package com.dossier.api.service;

import com.dossier.api.config.Constants;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.dto.ResumeActorDTO;
import com.dossier.api.service.ent.resumes.OrgResumeCap;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns the logins stored on resume rows ({@code created_by_login}, {@code updated_by_login}, version
 * authors) into {@link ResumeActorDTO}s: the person's name when the account has one, else a readable fallback.
 * Resolves many logins in one query, so a list of fifty resumes costs one lookup.
 *
 * <p>Inside an organization workspace (a tenant-host request, or a marketer acting for a consultant) a marketer's label carries their role, "Sarah Chen
 * (marketer)", so the person whose resume it is can see at once that someone else changed it. The synthetic enterprise login ({@code ent#...}) is never a
 * label: an account with no name is shown by its e-mail address, else as "Team member".
 */
@Component
public class ResumeActors {

    private final UserRepository userRepository;

    /** Absent in hand-wired unit tests: then no role is appended. */
    @Autowired(required = false)
    private OrgMemberRepository members;

    public ResumeActors(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /** Labels for the given logins (nulls and blanks skipped); an unknown login labels as itself (an enterprise one as "Team member"). */
    @Transactional(readOnly = true)
    public Map<String, ResumeActorDTO> resolve(Collection<String> logins) {
        Set<String> wanted = new java.util.HashSet<>();
        for (String l : logins) {
            if (l != null && !l.isBlank()) wanted.add(l);
        }
        Map<String, ResumeActorDTO> out = new HashMap<>();
        if (wanted.isEmpty()) return out;
        Long orgId = OrgResumeCap.orgOfThisRequest().orElse(null);
        for (User u : userRepository.findAllByLoginIn(wanted)) {
            out.put(u.getLogin(), new ResumeActorDTO(u.getLogin(), withRole(displayName(u), u, orgId)));
        }
        for (String l : wanted) out.putIfAbsent(l, new ResumeActorDTO(l, Constants.isEnterpriseLogin(l) ? "Team member" : l));
        return out;
    }

    /** One actor; {@code null} for a null/blank login. */
    public ResumeActorDTO of(String login) {
        if (login == null || login.isBlank()) return null;
        return resolve(Set.of(login)).get(login);
    }

    /** The name, else (for a name-less account) the e-mail address, else the login: except that an enterprise login is never shown. */
    public static String displayName(User u) {
        String first = u.getFirstName() == null ? "" : u.getFirstName().trim();
        String last = u.getLastName() == null ? "" : u.getLastName().trim();
        String full = (first + " " + last).trim();
        if (!full.isEmpty()) return full;
        if (Constants.isEnterpriseLogin(u.getLogin())) return u.getEmail() != null && !u.getEmail().isBlank() ? u.getEmail().trim() : "Team member";
        return u.getLogin();
    }

    /** "Sarah Chen (marketer)" when, in this organization, the person holds a marketer seat. */
    private String withRole(String name, User u, Long orgId) {
        if (orgId == null || members == null || u.getId() == null) return name;
        List<com.dossier.api.domain.org.OrgMember> seats = members.findByOrgIdAndUserIdAndStatusIn(orgId, u.getId(), List.of(OrgMemberStatus.ACTIVE));
        return seats.stream().anyMatch(s -> s.getRole() == OrgRole.MARKETER) ? name + " (marketer)" : name;
    }
}
