package com.dossier.api.service.ent.pipeline;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Runtime guardrails for the optional organization matching scheduler. */
@ConfigurationProperties(prefix = "dossier.ent.matching")
public class OrgMatchJobProperties {

    /** Maximum number of consultant profiles checked in one organization per run. */
    private int checksPerRun = 100;

    public int getChecksPerRun() {
        return checksPerRun;
    }

    public void setChecksPerRun(int checksPerRun) {
        this.checksPerRun = checksPerRun;
    }

    public int boundedChecksPerRun() {
        return Math.max(1, Math.min(1000, checksPerRun));
    }
}
