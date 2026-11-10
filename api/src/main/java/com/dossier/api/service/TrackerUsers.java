package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who is asking, and whether this row is theirs - for the tracker's services (applications, notes,
 * interviews). The tracker is keyed by the account's id: the signed-in user is resolved from the token's
 * subject, and every row is looked up by id AND owner, so another user's application, note or interview is
 * "not found" (404, never 403) and nothing about it leaks.
 */
@Component
public class TrackerUsers {

    private final UserRepository users;
    private final ApplicationRepository applications;
    private final ResumeRepository resumes;

    public TrackerUsers(UserRepository users, ApplicationRepository applications, ResumeRepository resumes) {
        this.users = users;
        this.applications = applications;
        this.resumes = resumes;
    }

    /** The signed-in user; 401 when there is none. */
    public User current() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return users.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }

    /** One of {@code user}'s applications; 404 when the id is unknown or someone else's. */
    public Application application(User user, Long id) {
        return applications
            .findOneByIdAndUserId(id, user.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Application not found"));
    }

    /** One of {@code user}'s resumes, for linking to an application; 404 otherwise. */
    public Resume resume(User user, Long id) {
        return resumes
            .findById(id)
            .filter(r -> r.getUser() != null && user.getId().equals(r.getUser().getId()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume not found"));
    }
}
