package com.dossier.api.service.dto;

import com.dossier.api.domain.SalesInquiry;
import com.dossier.api.domain.enumeration.InquiryStatus;
import java.io.Serializable;
import java.time.Instant;

/** Admin view of a "Contact us" request (Phase 15.6). */
public class SalesInquiryDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String topic;
    private String name;
    private String email;
    private String company;
    private String teamSize;
    private String message;
    private String userLogin;
    private InquiryStatus status;
    private String adminNotes;
    private Instant createdDate;

    public SalesInquiryDTO() {}

    public SalesInquiryDTO(SalesInquiry s) {
        this.id = s.getId();
        this.topic = s.getTopic();
        this.name = s.getName();
        this.email = s.getEmail();
        this.company = s.getCompany();
        this.teamSize = s.getTeamSize();
        this.message = s.getMessage();
        this.userLogin = s.getUserLogin();
        this.status = s.getStatus();
        this.adminNotes = s.getAdminNotes();
        this.createdDate = s.getCreatedDate();
    }

    public Long getId() {
        return id;
    }

    public String getTopic() {
        return topic;
    }

    public String getName() {
        return name;
    }

    public String getEmail() {
        return email;
    }

    public String getCompany() {
        return company;
    }

    public String getTeamSize() {
        return teamSize;
    }

    public String getMessage() {
        return message;
    }

    public String getUserLogin() {
        return userLogin;
    }

    public InquiryStatus getStatus() {
        return status;
    }

    public String getAdminNotes() {
        return adminNotes;
    }

    public Instant getCreatedDate() {
        return createdDate;
    }
}
