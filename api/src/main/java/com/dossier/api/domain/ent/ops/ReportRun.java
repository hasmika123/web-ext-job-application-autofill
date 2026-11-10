package com.dossier.api.domain.ent.ops;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** One run of a report (History tab, Last Run Summary): status, trigger, who, summary. Table {@code report_run}; see docs/enterprise-v2/ops-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "report_run")
public class ReportRun implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "definition_id", nullable = false)
    private Long definitionId;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "COMPLETED";

    @Column(name = "trigger_kind", length = 20, nullable = false)
    private String triggerKind = "SCHEDULED";

    @Column(name = "run_by_member_id")
    private Long runByMemberId;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "charts_count", nullable = false)
    private Integer chartsCount = 0;

    @Column(name = "tables_count", nullable = false)
    private Integer tablesCount = 0;

    @Column(name = "summary", length = 200)
    private String summary;

    @Column(name = "error_label", length = 160)
    private String errorLabel;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getDefinitionId() { return definitionId; }
    public void setDefinitionId(Long definitionId) { this.definitionId = definitionId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getTriggerKind() { return triggerKind; }
    public void setTriggerKind(String triggerKind) { this.triggerKind = triggerKind; }
    public Long getRunByMemberId() { return runByMemberId; }
    public void setRunByMemberId(Long runByMemberId) { this.runByMemberId = runByMemberId; }
    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    public Instant getFinishedAt() { return finishedAt; }
    public void setFinishedAt(Instant finishedAt) { this.finishedAt = finishedAt; }
    public Integer getChartsCount() { return chartsCount; }
    public void setChartsCount(Integer chartsCount) { this.chartsCount = chartsCount; }
    public Integer getTablesCount() { return tablesCount; }
    public void setTablesCount(Integer tablesCount) { this.tablesCount = tablesCount; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
    public String getErrorLabel() { return errorLabel; }
    public void setErrorLabel(String errorLabel) { this.errorLabel = errorLabel; }
}
