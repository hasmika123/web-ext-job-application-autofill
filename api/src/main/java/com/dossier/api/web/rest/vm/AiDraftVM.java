package com.dossier.api.web.rest.vm;

import jakarta.validation.constraints.NotBlank;

/**
 * Request body for {@code POST /api/ai/draft}: an open-ended application question plus
 * the candidate background to ground the answer, and the user's explicit {@code consent}
 * to send it to the configured AI provider (opt-in; see the privacy policy).
 */
public class AiDraftVM {

    @NotBlank
    private String question;

    private String context;

    /** Must be true — the user opted into server-side AI drafting. */
    private boolean consent;

    public String getQuestion() {
        return question;
    }

    public void setQuestion(String question) {
        this.question = question;
    }

    public String getContext() {
        return context;
    }

    public void setContext(String context) {
        this.context = context;
    }

    public boolean isConsent() {
        return consent;
    }

    public void setConsent(boolean consent) {
        this.consent = consent;
    }
}
