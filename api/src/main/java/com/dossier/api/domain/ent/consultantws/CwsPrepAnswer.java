package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;

/** The self-score of one question in a practice session. Table {@code cws_prep_answer}; the question text is copied from the in-code catalog. */
@Entity
@Table(name = "cws_prep_answer")
public class CwsPrepAnswer implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    @Column(name = "position", nullable = false)
    private int position;

    @Column(name = "question", nullable = false, length = 300)
    private String question;

    @Column(name = "score", nullable = false)
    private int score;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }
    public String getQuestion() { return question; }
    public void setQuestion(String question) { this.question = question; }
    public int getScore() { return score; }
    public void setScore(int score) { this.score = score; }
}
