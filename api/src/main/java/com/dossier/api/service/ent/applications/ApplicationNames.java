package com.dossier.api.service.ent.applications;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberDirectoryRepository;
import com.dossier.api.service.dto.ent.ApplicationDTO;
import com.dossier.api.service.tracker.ChangeActors;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Names of the people on an application: marketers are org seats (name from the account), consultants and clients come from their own rows. */
@Component("entApplicationNames")
public class ApplicationNames {

    private final OrgMemberDirectoryRepository directory;
    private final UserRepository users;

    public ApplicationNames(OrgMemberDirectoryRepository directory, UserRepository users) {
        this.directory = directory;
        this.users = users;
    }

    /** Seat id to display name, for the seats of {@code orgId} only (an id of another organization yields nothing). */
    public Map<Long, String> memberNames(Long orgId, Collection<Long> memberIds) {
        Set<Long> ids = new HashSet<>(memberIds);
        ids.remove(null);
        Map<Long, String> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        Map<Long, User> usersById = new HashMap<>();
        var seats = directory.findByOrgIdAndIdIn(orgId, ids);
        Set<Long> userIds = new HashSet<>();
        for (OrgMember m : seats) if (m.getUserId() != null) userIds.add(m.getUserId());
        if (!userIds.isEmpty()) for (User u : users.findAllById(userIds)) usersById.put(u.getId(), u);
        for (OrgMember m : seats) out.put(m.getId(), personName(usersById.get(m.getUserId()), m));
        return out;
    }

    public ApplicationDTO.Marketer marketer(Long memberId, Map<Long, String> names) {
        if (memberId == null) return null;
        String name = names.getOrDefault(memberId, ChangeActors.A_MEMBER);
        return new ApplicationDTO.Marketer(memberId, name, initials(name));
    }

    static String personName(User u, OrgMember seat) {
        if (seat != null && seat.getStatus() == OrgMemberStatus.ERASED) return ChangeActors.FORMER_MEMBER;
        if (u != null) {
            String n = ((u.getFirstName() == null ? "" : u.getFirstName().strip()) + " " + (u.getLastName() == null ? "" : u.getLastName().strip())).strip();
            if (!n.isEmpty()) return n;
        }
        if (seat != null && seat.getDisplayLabel() != null && !seat.getDisplayLabel().isBlank()) return seat.getDisplayLabel().strip();
        String email = u != null && u.getEmail() != null && !u.getEmail().isBlank() ? u.getEmail() : seat == null ? null : seat.getInviteEmail();
        if (email != null && !email.isBlank()) return email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
        // no user behind a seat that is not merely invited: the person is gone; otherwise nothing is known (an enterprise login is never a fallback)
        return u == null && seat != null && seat.getStatus() != OrgMemberStatus.INVITED ? ChangeActors.FORMER_MEMBER : ChangeActors.A_MEMBER;
    }

    public static String initials(String name) {
        if (name == null || name.isBlank()) return "?";
        String[] parts = name.strip().split("\\s+");
        String first = parts[0].substring(0, 1);
        String last = parts.length > 1 ? parts[parts.length - 1].substring(0, 1) : parts[0].length() > 1 ? parts[0].substring(1, 2) : "";
        return (first + last).toUpperCase(Locale.ROOT);
    }
}
