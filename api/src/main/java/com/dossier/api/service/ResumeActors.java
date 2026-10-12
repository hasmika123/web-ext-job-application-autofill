package com.dossier.api.service;

import com.dossier.api.domain.User;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.dto.ResumeActorDTO;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns the logins stored on resume rows ({@code created_by_login}, {@code updated_by_login}, version
 * authors) into {@link ResumeActorDTO}s: the person's name when the account has one, else the login.
 * Resolves many logins in one query, so a list of fifty resumes costs one lookup.
 */
@Component
public class ResumeActors {

    private final UserRepository userRepository;

    public ResumeActors(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /** Labels for the given logins (nulls and blanks skipped); an unknown login labels as itself. */
    @Transactional(readOnly = true)
    public Map<String, ResumeActorDTO> resolve(Collection<String> logins) {
        Set<String> wanted = new java.util.HashSet<>();
        for (String l : logins) {
            if (l != null && !l.isBlank()) wanted.add(l);
        }
        Map<String, ResumeActorDTO> out = new HashMap<>();
        if (wanted.isEmpty()) return out;
        for (User u : userRepository.findAllByLoginIn(wanted)) {
            out.put(u.getLogin(), new ResumeActorDTO(u.getLogin(), displayName(u)));
        }
        for (String l : wanted) out.putIfAbsent(l, new ResumeActorDTO(l, l));
        return out;
    }

    /** One actor; {@code null} for a null/blank login. */
    public ResumeActorDTO of(String login) {
        if (login == null || login.isBlank()) return null;
        return resolve(Set.of(login)).get(login);
    }

    static String displayName(User u) {
        String first = u.getFirstName() == null ? "" : u.getFirstName().trim();
        String last = u.getLastName() == null ? "" : u.getLastName().trim();
        String full = (first + " " + last).trim();
        return full.isEmpty() ? u.getLogin() : full;
    }
}
