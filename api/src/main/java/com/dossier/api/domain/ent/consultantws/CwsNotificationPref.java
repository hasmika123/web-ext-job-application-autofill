package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One consultant's notification preference for one category (table {@code cws_notification_pref}). PREFERENCES only: nothing is ever emailed, texted
 * or pushed from here, and {@code sms} is stored but always false (there is no SMS channel and no phone number is stored). {@code inApp} and
 * {@code enabled} decide whether the generator creates new notifications of the category for the consultant.
 */
@Entity
@Table(name = "cws_notification_pref")
public class CwsNotificationPref implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "category", length = 16, nullable = false)
    private String category;

    @Column(name = "email", nullable = false)
    private boolean email = true;

    @Column(name = "in_app", nullable = false)
    private boolean inApp = true;

    @Column(name = "sms", nullable = false)
    private boolean sms = false;

    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public boolean isEmail() { return email; }
    public void setEmail(boolean email) { this.email = email; }
    public boolean isInApp() { return inApp; }
    public void setInApp(boolean inApp) { this.inApp = inApp; }
    public boolean isSms() { return sms; }
    public void setSms(boolean sms) { this.sms = sms; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
