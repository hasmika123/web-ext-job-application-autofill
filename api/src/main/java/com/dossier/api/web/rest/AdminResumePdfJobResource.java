package com.dossier.api.web.rest;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ResumePdfJobService;
import com.dossier.api.service.ResumePdfJobService.Stats;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Queue depth of the async resume-PDF pipeline for the admin dashboard and ops (Resume Builder R3.7, DESIGN 8.5). */
@RestController
@RequestMapping("/api/admin/resume-pdf-jobs")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminResumePdfJobResource {

    private final ResumePdfJobService jobs;

    public AdminResumePdfJobResource(ResumePdfJobService jobs) {
        this.jobs = jobs;
    }

    /** {@code {pending, running, failed, oldestPendingAge}} - the age is in seconds, null when nothing is pending. */
    @GetMapping("/stats")
    public ResponseEntity<Stats> stats() {
        return ResponseEntity.ok(jobs.stats());
    }
}
