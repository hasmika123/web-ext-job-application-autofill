package com.dossier.api.web.rest.vm;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

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

    /** What the call is for: draft | pick | map | enrich (13.1a). Absent or unknown = draft,
     *  which is what extension builds before 0.60.0 send. */
    @Size(max = 20)
    private String task;

    public String getTask() {
        return task;
    }

    public void setTask(String task) {
        this.task = task;
    }

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
