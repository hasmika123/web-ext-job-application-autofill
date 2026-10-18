package com.dossier.api.service.dto;

/** The result of creating a built resume: the mirror row and its document (Resume Builder DESIGN 6.2). */
public record BuiltResumeDTO(ResumeDTO resume, ResumeDocDTO doc) {}
