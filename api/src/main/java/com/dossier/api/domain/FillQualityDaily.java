package com.dossier.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.io.Serializable;
import java.time.LocalDate;

/** One idempotent daily, count-only fill-quality rollup. No user, page, label, or answer data. */
@Entity
@Table(
    name = "fill_quality_daily",
    uniqueConstraints = @UniqueConstraint(name = "ux_fill_quality_daily_key", columnNames = { "day", "ats", "adapter", "ext_version" })
)
public class FillQualityDaily implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "day", nullable = false)
    private LocalDate day;

    @Column(name = "ats", nullable = false, length = 40)
    private String ats;

    @Column(name = "adapter", nullable = false, length = 40)
    private String adapter;

    /** Empty string means the extension did not provide a valid version. */
    @Column(name = "ext_version", nullable = false, length = 20)
    private String extVersion = "";

    @Column(name = "fills", nullable = false)
    private long fills;

    @Column(name = "fields_found", nullable = false)
    private long fieldsFound;

    @Column(name = "fields_filled", nullable = false)
    private long fieldsFilled;

    @Column(name = "fills_with_required_gaps", nullable = false)
    private long fillsWithRequiredGaps;

    @Column(name = "fill_rate_bp", nullable = false)
    private int fillRateBp;

    @Column(name = "gap_rate_bp", nullable = false)
    private int gapRateBp;

    public Long getId() { return id; }
    public LocalDate getDay() { return day; }
    public void setDay(LocalDate day) { this.day = day; }
    public String getAts() { return ats; }
    public void setAts(String ats) { this.ats = ats; }
    public String getAdapter() { return adapter; }
    public void setAdapter(String adapter) { this.adapter = adapter; }
    public String getExtVersion() { return extVersion; }
    public void setExtVersion(String extVersion) { this.extVersion = extVersion == null ? "" : extVersion; }
    public long getFills() { return fills; }
    public void setFills(long fills) { this.fills = fills; }
    public long getFieldsFound() { return fieldsFound; }
    public void setFieldsFound(long fieldsFound) { this.fieldsFound = fieldsFound; }
    public long getFieldsFilled() { return fieldsFilled; }
    public void setFieldsFilled(long fieldsFilled) { this.fieldsFilled = fieldsFilled; }
    public long getFillsWithRequiredGaps() { return fillsWithRequiredGaps; }
    public void setFillsWithRequiredGaps(long fillsWithRequiredGaps) { this.fillsWithRequiredGaps = fillsWithRequiredGaps; }
    public int getFillRateBp() { return fillRateBp; }
    public void setFillRateBp(int fillRateBp) { this.fillRateBp = fillRateBp; }
    public int getGapRateBp() { return gapRateBp; }
    public void setGapRateBp(int gapRateBp) { this.gapRateBp = gapRateBp; }
}
