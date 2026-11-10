package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** The consultant's work preferences that have no other home: work mode, notice period, hourly rate range (record only) and travel willingness. Table {@code cws_work_preference}, one row per consultant. */
@Entity
@Table(name = "cws_work_preference")
public class CwsWorkPreference implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "preferred_work_mode", length = 10)
    private String preferredWorkMode;

    @Column(name = "notice_weeks")
    private Integer noticeWeeks;

    @Column(name = "rate_min_minor")
    private Long rateMinMinor;

    @Column(name = "rate_max_minor")
    private Long rateMaxMinor;

    @Column(name = "rate_note", length = 120)
    private String rateNote;

    @Column(name = "travel_label", length = 12)
    private String travelLabel;

    @Column(name = "travel_percent")
    private Integer travelPercent;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getPreferredWorkMode() { return preferredWorkMode; }
    public void setPreferredWorkMode(String preferredWorkMode) { this.preferredWorkMode = preferredWorkMode; }
    public Integer getNoticeWeeks() { return noticeWeeks; }
    public void setNoticeWeeks(Integer noticeWeeks) { this.noticeWeeks = noticeWeeks; }
    public Long getRateMinMinor() { return rateMinMinor; }
    public void setRateMinMinor(Long rateMinMinor) { this.rateMinMinor = rateMinMinor; }
    public Long getRateMaxMinor() { return rateMaxMinor; }
    public void setRateMaxMinor(Long rateMaxMinor) { this.rateMaxMinor = rateMaxMinor; }
    public String getRateNote() { return rateNote; }
    public void setRateNote(String rateNote) { this.rateNote = rateNote; }
    public String getTravelLabel() { return travelLabel; }
    public void setTravelLabel(String travelLabel) { this.travelLabel = travelLabel; }
    public Integer getTravelPercent() { return travelPercent; }
    public void setTravelPercent(Integer travelPercent) { this.travelPercent = travelPercent; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
