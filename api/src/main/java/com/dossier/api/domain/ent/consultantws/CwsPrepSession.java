package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** One self-scored practice session of a consultant. Table {@code cws_prep_session}; only that consultant reads or writes it. */
@Entity
@Table(name = "cws_prep_session")
public class CwsPrepSession implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String TECHNICAL = "TECHNICAL";
    public static final String BEHAVIORAL = "BEHAVIORAL";
    public static final String COMPANY = "COMPANY";
    public static final String QUESTION_BANK = "QUESTION_BANK";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "kind", nullable = false, length = 20)
    private String kind;

    @Column(name = "score", nullable = false)
    private int score;

    @Column(name = "duration_minutes", nullable = false)
    private int durationMinutes;

    @Column(name = "notes", length = 1000)
    private String notes;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public int getScore() { return score; }
    public void setScore(int score) { this.score = score; }
    public int getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(int durationMinutes) { this.durationMinutes = durationMinutes; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
