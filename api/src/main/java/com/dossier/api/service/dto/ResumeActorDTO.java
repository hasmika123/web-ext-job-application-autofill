package com.dossier.api.service.dto;

import java.io.Serializable;

/**
 * Who made or last wrote a resume (R3.9, DESIGN 8.6): the login and a display label (the person's
 * name when the account has one, else the login). Serializable because it rides on {@link ResumeDTO}.
 */
public record ResumeActorDTO(String login, String label) implements Serializable {}
